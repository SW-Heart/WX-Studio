"""对外公开的 OpenAI 兼容端点：用 sk-xxx 认证

- POST /v1/images/generations     文生图 / 图生图（通过 image 字段）
- POST /v1/images/edits           显式图生图（multipart 或 json）
- POST /v1/videos                 视频生成（异步，内部已轮询）
- GET  /v1/models                 列出启用的模型

返回一律 OpenAI 风格：{ created, data:[{url:"..."}], usage: {...} }
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request

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
