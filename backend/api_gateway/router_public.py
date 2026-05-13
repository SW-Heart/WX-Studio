"""对外公开的 OpenAI 兼容端点：用 sk-xxx 认证

- POST /v1/images/generations     文生图 / 图生图（通过 image 字段）
- POST /v1/images/edits           显式图生图（multipart 或 json）
- POST /v1/videos                 视频生成（异步，内部已轮询）
- GET  /v1/models                 列出启用的模型

返回一律 OpenAI 风格：{ created, data:[{url:"..."}], usage: {...} }
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
import json
import httpx
import uuid
import time

from fastapi import APIRouter, Body, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse

from . import storage
from .auth import AuthedKey, require_api_key
from .service import ServiceError, call_image_model

try:
    from backend.rate_limiter import limiter, get_client_ip, API_KEY_LIMIT, API_IP_LIMIT
except ImportError:
    try:
        from rate_limiter import limiter, get_client_ip, API_KEY_LIMIT, API_IP_LIMIT
    except ImportError:
        # Fallback: 限流器未安装时不阻塞启动
        limiter = None
        get_client_ip = lambda r: "unknown"
        API_KEY_LIMIT = (30, 60)
        API_IP_LIMIT = (60, 60)


router = APIRouter(prefix="/v1", tags=["api-gateway"])


# ---------- /v1/models ----------

@router.get("/models")
def list_models(authed: AuthedKey = Depends(require_api_key)):
    models = storage.list_models(include_disabled=False)
    data = []
    for m in models:
        # 按 allowed_models 过滤
        if not authed.can_use_model(m["id"]):
            continue
        data.append({
            "id": m["id"],
            "object": "model",
            "created": int(m.get("created_at") or 0),
            "owned_by": "ogai",
            "adapter_type": m.get("adapter_type"),
            "supports": m.get("supports") or {},
            "pricing": m.get("pricing") or {},
            "description": m.get("description", ""),
        })
    return {"object": "list", "data": data}


# ---------- helpers ----------

def _ensure_model_allowed(authed: AuthedKey, model_id: str) -> None:
    if not authed.can_use_model(model_id):
        raise HTTPException(403, f"API key not permitted for model '{model_id}'")


def _as_list(image_field) -> List[str]:
    if image_field is None:
        return []
    if isinstance(image_field, str):
        return [image_field] if image_field else []
    if isinstance(image_field, list):
        return [x for x in image_field if isinstance(x, str) and x]
    return []


def _call(authed: AuthedKey, body: Dict[str, Any], request: Request = None):
    model_id = body.get("model")
    if not model_id:
        raise HTTPException(400, "missing 'model'")
    _ensure_model_allowed(authed, model_id)

    # API 限流：按 API Key + IP 双维度
    if limiter and request:
        client_ip = get_client_ip(request)
        limiter.check("api_key", authed.id, *API_KEY_LIMIT, "API requests too frequent")
        limiter.check("api_ip", client_ip, *API_IP_LIMIT, "API requests too frequent")

    prompt = body.get("prompt") or ""
    if not prompt:
        raise HTTPException(400, "missing 'prompt'")

    try:
        return call_image_model(
            model_id=model_id,
            prompt=prompt,
            image=_as_list(body.get("image")),
            size=body.get("size"),
            n=int(body.get("n") or 1),
            quality=body.get("quality"),
            mode=body.get("mode"),
            extra={k: v for k, v in body.items()
                   if k not in ("model", "prompt", "image", "size", "n", "quality", "mode")},
            username=authed.username,
            key_id=authed.id,
            source="api",
        )
    except ServiceError as e:
        raise HTTPException(e.status_code, str(e))


# ---------- /v1/images/generations ----------

@router.post("/images/generations")
def images_generations(request: Request, body: Dict[str, Any] = Body(...), authed: AuthedKey = Depends(require_api_key)):
    return _call(authed, body, request)


# ---------- /v1/images/edits ----------
# 为了简单：只支持 JSON 模式（image 字段传 URL 列表）。
# 如需支持 multipart 上传，前端可以先走 /api/upload 拿到 URL 再调用此端点。

@router.post("/images/edits")
def images_edits(request: Request, body: Dict[str, Any] = Body(...), authed: AuthedKey = Depends(require_api_key)):
    # 等价于 /images/generations 但要求至少一张参考图
    if not _as_list(body.get("image")):
        raise HTTPException(400, "'image' is required for /images/edits")
    return _call(authed, body, request)


# ---------- /v1/videos ----------

@router.post("/videos")
def videos(request: Request, body: Dict[str, Any] = Body(...), authed: AuthedKey = Depends(require_api_key)):
    return _call(authed, body, request)


# ---------- /v1/chat/completions ----------

@router.post("/chat/completions")
async def chat_completions(
    request: Request,
    background_tasks: BackgroundTasks,
    body: Dict[str, Any] = Body(...),
    authed: AuthedKey = Depends(require_api_key)
):
    model_id = body.get("model")
    if not model_id:
        raise HTTPException(400, "missing 'model'")
    _ensure_model_allowed(authed, model_id)

    if limiter and request:
        client_ip = get_client_ip(request)
        limiter.check("api_key", authed.id, *API_KEY_LIMIT, "API requests too frequent")
        limiter.check("api_ip", client_ip, *API_IP_LIMIT, "API requests too frequent")

    model = storage.get_model(model_id)
    if not model or not model.get("enabled", True):
        raise HTTPException(404, f"model '{model_id}' not found or disabled")

    upstream_key = model.get("upstream_api_key") or ""
    config = model.get("config") or {}
    # 默认调用 OpenAI 官方接口，也可通过 config 配置上游 proxy (如 tuzi)
    endpoint = config.get("endpoint", "https://api.openai.com/v1/chat/completions")
    upstream_model = config.get("upstream_model") or model_id
    
    body["model"] = upstream_model
    pricing = model.get("pricing") or {"mode": "per_token", "cost": 1}

    headers = {
        "Authorization": f"Bearer {upstream_key}",
        "Content-Type": "application/json",
    }
    
    from .pricing import compute_token_cost
    from . import deps

    start_t = time.time()

    def finalize_usage(usage_data: dict, status: str = "success", error_msg: str = ""):
        cost = 0
        if usage_data:
            cost = compute_token_cost(pricing, usage_data)
            if cost > 0:
                try:
                    token_info = f" ({usage_data.get('total_tokens', 0)} Tk)" if usage_data.get("total_tokens") else ""
                    deps.deduct_quota(authed.username, cost, model=model_id, reason=f"API调用消耗{token_info}")
                    storage.record_key_usage(authed.id, cost)
                except Exception as e:
                    print(f"Chat completion cost deduct failed: {e}")
        
        # 提取 prompt 用于日志展示
        messages = body.get("messages", [])
        prompt_text = "chat completion"
        if messages and isinstance(messages, list):
            last_msg = messages[-1]
            if isinstance(last_msg, dict) and "content" in last_msg:
                content = last_msg["content"]
                if isinstance(content, str):
                    prompt_text = content[:200]
                elif isinstance(content, list):
                    prompt_text = "multimodal input"

        # 记录 API log
        log_entry = {
            "id": uuid.uuid4().hex,
            "username": authed.username,
            "key_id": authed.id,
            "model_id": model_id,
            "source": "api",
            "prompt": prompt_text,
            "quota_cost": cost,
            "usage": usage_data,
            "status": status,
            "error_msg": error_msg,
            "created_at": time.time(),
            "duration": round(time.time() - start_t, 3)
        }
        storage.append_log(log_entry)

    is_stream = body.get("stream", False)
    if is_stream:
        # 要求流式返回提供 usage 数据（兼容部分现代上游）
        body["stream_options"] = {"include_usage": True}

    client = httpx.AsyncClient(timeout=300.0)

    if not is_stream:
        try:
            resp = await client.post(endpoint, json=body, headers=headers)
        except Exception as e:
            finalize_usage(None, status="failed", error_msg=str(e))
            raise HTTPException(502, f"Upstream error: {e}")
            
        if resp.status_code != 200:
            err = resp.text
            finalize_usage(None, status="failed", error_msg=err)
            raise HTTPException(resp.status_code, err)
            
        data = resp.json()
        usage = data.get("usage")
        background_tasks.add_task(finalize_usage, usage)
        return JSONResponse(content=data)
        
    else:
        async def stream_generator():
            usage_data = None
            try:
                async with client.stream("POST", endpoint, json=body, headers=headers) as resp:
                    if resp.status_code != 200:
                        text = await resp.aread()
                        finalize_usage(None, status="failed", error_msg=text.decode())
                        yield f"data: {json.dumps({'error': text.decode()})}\n\n"
                        return

                    async for chunk in resp.aiter_lines():
                        if chunk:
                            yield chunk + "\n"
                            if chunk.startswith("data: ") and chunk != "data: [DONE]":
                                try:
                                    chunk_data = json.loads(chunk[6:])
                                    if "usage" in chunk_data and chunk_data["usage"]:
                                        usage_data = chunk_data["usage"]
                                except Exception:
                                    pass
            except Exception as e:
                finalize_usage(None, status="failed", error_msg=str(e))
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return
            finally:
                await client.aclose()
                if usage_data:
                    finalize_usage(usage_data)
                elif usage_data is None:
                    # 如果正常结束但没拿到 usage_data，我们没法计费，但我们依然记录一条日志
                    # 我们判断如果之前没有异常跳出，那就算 success
                    finalize_usage(None)

        return StreamingResponse(stream_generator(), media_type="text/event-stream")
