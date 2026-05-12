"""统一调用流水线

输入：model_id + OpenAI 风格参数 + 身份(username, key_id)
输出：OpenAI 风格响应（data: [{url}], usage: {quota_cost, ...}）

负责：
1. 在 models_registry 里查模型 + 校验 enabled
2. 根据 pricing 计算预扣积分
3. deduct_quota_atomic 扣用户配额
4. 实例化 adapter 调用上游
5. 可选：把结果图下载后转存 OSS
6. 成功：record_key_usage + append_log；失败：refund_quota + 记录失败日志

说明：call_image_model 是对外的 OpenAI 兼容入口（包含扣分/退分/日志/OSS）。
产品 handler 若希望自己管扣分/退分（比如并发多次调用共享一次扣分），
应使用 run_model_raw，它只跑 adapter + 可选 OSS + 写日志，不动用户配额。
"""
from __future__ import annotations

import time
import traceback
import uuid
from typing import Any, Dict, List, Optional

import requests

from . import deps, storage
from .adapters import get_adapter
from .adapters.base import AdapterContext, AdapterError
from .concurrency import UpstreamBusyError, upstream_slot


class ServiceError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


# --------- 低层：只跑 adapter，不碰用户配额 ---------

def run_model_raw(
    *,
    model_id: str,
    prompt: str,
    image: Optional[List[str]] = None,
    size: Optional[str] = None,
    n: int = 1,
    quality: Optional[str] = None,
    mode: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
    config_override: Optional[Dict[str, Any]] = None,
    # 仅用于日志记录（可选）
    username: Optional[str] = None,
    source: str = "product",
    mirror_to_oss: bool = True,
    record_log: bool = True,
) -> Dict[str, Any]:
    """只做：查模型 → 调 adapter → 可选 OSS → 写日志；不扣/退用户配额。

    config_override: 临时覆盖 registry 中 model.config 的部分字段
      （典型用法：/api/create 里用户选择 upstream_model）

    返回 {"images": [...], "model": ..., "extra": {...}, "latency": float}
    失败抛 ServiceError（调用方自己决定是否退分）。
    """
    started_at = time.time()
    model = storage.get_model(model_id)
    if not model:
        raise ServiceError(f"model '{model_id}' not found", 404)
    if not model.get("enabled", True):
        raise ServiceError(f"model '{model_id}' is not available", 403)
    adapter_type = model.get("adapter_type")
    if not adapter_type:
        raise ServiceError("model misconfigured: adapter_type missing", 500)

    try:
        adapter_cls = get_adapter(adapter_type)
    except Exception as e:
        raise ServiceError(str(e), 500)

    merged_config = dict(model.get("config") or {})
    if config_override:
        merged_config.update(config_override)

    ctx = AdapterContext(
        api_key=model.get("upstream_api_key") or "",
        config=merged_config,
        prompt=prompt,
        image=list(image or []),
        size=size,
        n=n,
        quality=quality,
        mode=mode,
        extra=extra or {},
    )

    log_base: Dict[str, Any] = {
        "id": uuid.uuid4().hex,
        "username": username,
        "key_id": None,
        "source": source,
        "model": model_id,
        "prompt_preview": (prompt or "")[:200],
        "size": size,
        "n": n,
        "mode": mode,
        "started_at": started_at,
    }

    try:
        with upstream_slot():
            result = adapter_cls().generate(ctx)
    except UpstreamBusyError as be:
        if record_log:
            storage.append_log({**log_base, "status": "rejected", "error": str(be),
                                "http_status": be.status_code,
                                "finished_at": time.time()})
        raise ServiceError(str(be), be.status_code)
    except AdapterError as ae:
        if record_log:
            storage.append_log({**log_base, "status": "failed", "error": str(ae),
                                "http_status": getattr(ae, "status_code", 500),
                                "finished_at": time.time()})
        raise ServiceError(str(ae), getattr(ae, "status_code", 502))
    except Exception as e:
        if record_log:
            storage.append_log({**log_base, "status": "error", "error": str(e),
                                "trace": traceback.format_exc()[-2000:],
                                "finished_at": time.time()})
        raise ServiceError(f"internal error: {e}", 500)

    final_urls: List[str] = []
    for u in result.images:
        if mirror_to_oss:
            mirrored = _try_mirror(u)
            final_urls.append(mirrored or u)
        else:
            final_urls.append(u)

    if record_log:
        storage.append_log({
            **log_base,
            "status": "success",
            "image_count": len(final_urls),
            "urls": final_urls[:10],
            "upstream_extra": result.extra,
            "finished_at": time.time(),
            "latency": round(time.time() - started_at, 3),
        })

    return {
        "model": model_id,
        "images": final_urls,
        "extra": result.extra,
        "latency": round(time.time() - started_at, 3),
    }


# --------- 高层：完整 OpenAI 流水线（扣分 + 调 adapter + 退分 + 日志） ---------

def call_image_model(
    *,
    model_id: str,
    prompt: str,
    image: Optional[List[str]] = None,
    size: Optional[str] = None,
    n: int = 1,
    quality: Optional[str] = None,
    mode: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
    username: str,
    key_id: Optional[str] = None,
    source: str = "api",  # "api" or "product"
) -> Dict[str, Any]:
    from .pricing import compute_cost  # 局部 import 避免循环

    started_at = time.time()
    log_entry: Dict[str, Any] = {
        "id": uuid.uuid4().hex,
        "username": username,
        "key_id": key_id,
        "source": source,
        "model": model_id,
        "prompt_preview": (prompt or "")[:200],
        "size": size,
        "n": n,
        "mode": mode,
        "status": "pending",
        "started_at": started_at,
    }

    model = storage.get_model(model_id)
    if not model:
        log_entry.update(status="rejected", error=f"model not found: {model_id}",
                         finished_at=time.time())
        storage.append_log(log_entry)
        raise ServiceError(f"model '{model_id}' not found", 404)
    if not model.get("enabled", True):
        log_entry.update(status="rejected", error="model disabled",
                         finished_at=time.time())
        storage.append_log(log_entry)
        raise ServiceError(f"model '{model_id}' is not available", 403)

    adapter_type = model.get("adapter_type")
    if not adapter_type:
        log_entry.update(status="rejected", error="adapter_type missing",
                         finished_at=time.time())
        storage.append_log(log_entry)
        raise ServiceError("model misconfigured: adapter_type missing", 500)

    pricing = model.get("pricing") or {"mode": "per_call", "cost": 1}
    cost = compute_cost(pricing, n=n, size=size, mode=mode)
    if cost <= 0:
        cost = 1
    log_entry["quota_cost"] = cost

    try:
        remaining = deps.deduct_quota(username, cost)
    except Exception as e:
        status_code = getattr(e, "status_code", 402)
        detail = getattr(e, "detail", str(e))
        log_entry.update(status="rejected", error=f"quota: {detail}",
                         finished_at=time.time())
        storage.append_log(log_entry)
        raise ServiceError(str(detail), status_code)

    log_entry["quota_remaining_after_deduct"] = remaining

    try:
        adapter_cls = get_adapter(adapter_type)
    except Exception as e:
        deps.refund_quota(username, cost)
        log_entry.update(status="error", error=str(e), finished_at=time.time())
        storage.append_log(log_entry)
        raise ServiceError(str(e), 500)

    ctx = AdapterContext(
        api_key=model.get("upstream_api_key") or "",
        config=model.get("config") or {},
        prompt=prompt,
        image=list(image or []),
        size=size,
        n=n,
        quality=quality,
        mode=mode,
        extra=extra or {},
    )

    try:
        # 扣费已成功；此处限制同时打给上游的并发数
        with upstream_slot():
            result = adapter_cls().generate(ctx)
    except UpstreamBusyError as be:
        deps.refund_quota(username, cost)
        log_entry.update(status="rejected", error=str(be),
                         http_status=be.status_code,
                         finished_at=time.time())
        storage.append_log(log_entry)
        raise ServiceError(str(be), be.status_code)
    except AdapterError as ae:
        deps.refund_quota(username, cost)
        log_entry.update(status="failed", error=str(ae),
                         http_status=getattr(ae, "status_code", 500),
                         finished_at=time.time())
        storage.append_log(log_entry)
        raise ServiceError(str(ae), getattr(ae, "status_code", 502))
    except Exception as e:
        deps.refund_quota(username, cost)
        log_entry.update(status="error", error=str(e),
                         trace=traceback.format_exc()[-2000:],
                         finished_at=time.time())
        storage.append_log(log_entry)
        raise ServiceError(f"internal error: {e}", 500)

    mirror = (model.get("config") or {}).get("mirror_to_oss", True)
    final_urls: List[str] = []
    for u in result.images:
        if mirror:
            mirrored = _try_mirror(u)
            final_urls.append(mirrored or u)
        else:
            final_urls.append(u)

    if key_id:
        try:
            storage.record_key_usage(key_id, cost)
        except Exception:
            pass

    log_entry.update(
        status="success",
        image_count=len(final_urls),
        urls=final_urls[:10],
        upstream_extra=result.extra,
        finished_at=time.time(),
        latency=round(time.time() - started_at, 3),
    )
    storage.append_log(log_entry)

    return {
        "created": int(time.time()),
        "model": model_id,
        "data": [{"url": u} for u in final_urls],
        "usage": {
            "quota_cost": cost,
            "quota_remaining": remaining,
        },
    }


# --------- OSS 镜像辅助 ---------

def _try_mirror(src_url: str) -> Optional[str]:
    if not src_url or not src_url.startswith(("http://", "https://")):
        return None
    try:
        r = requests.get(src_url, timeout=60)
        if r.status_code != 200:
            return None
        ext = _guess_ext(src_url, r.headers.get("Content-Type", ""))
        return deps.upload_bytes_to_oss(r.content, ext)
    except Exception:
        return None


def _guess_ext(url: str, content_type: str) -> str:
    url_low = url.lower().split("?")[0]
    for e in (".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov"):
        if url_low.endswith(e):
            return e
    ct = (content_type or "").lower()
    if "png" in ct:
        return ".png"
    if "jpeg" in ct or "jpg" in ct:
        return ".jpg"
    if "webp" in ct:
        return ".webp"
    if "mp4" in ct or "video" in ct:
        return ".mp4"
    return ".png"
