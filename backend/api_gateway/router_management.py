"""API 管理端点（网页登录用 JWT）

用户：
- POST   /api/keys              创建 key（返回完整 sk-xxx 一次）
- GET    /api/keys              列出自己的 key
- PATCH  /api/keys/{id}         改名字/白名单/配额上限/禁用
- DELETE /api/keys/{id}         删除
- GET    /api/keys/logs         自己的调用日志
- GET    /api/models/public     列出所有启用的模型（用于客户端下拉选择）

管理员：
- GET    /api/admin/models         列出所有（含禁用）
- POST   /api/admin/models         创建/更新模型（按 adapter 类型填 config）
- PATCH  /api/admin/models/{id}    部分更新
- DELETE /api/admin/models/{id}    删除
- GET    /api/admin/adapter-types  拿到 adapter 可选类型及其字段 schema
- GET    /api/admin/api-keys       所有用户的 key
- GET    /api/admin/api-logs       所有调用日志
"""
from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from . import storage
from .adapters import list_adapter_types
from .keys import generate_key


# ---------- 入参模型 ----------

class CreateKeyReq(BaseModel):
    name: Optional[str] = "unnamed"
    allowed_models: Optional[List[str]] = None  # None/[] 允许所有启用模型
    quota_limit: Optional[int] = None           # None 表示不限


class UpdateKeyReq(BaseModel):
    name: Optional[str] = None
    allowed_models: Optional[List[str]] = None
    quota_limit: Optional[int] = None
    disabled: Optional[bool] = None


class UpsertModelReq(BaseModel):
    id: str
    adapter_type: str
    upstream_api_key: Optional[str] = None
    display_name: Optional[str] = None
    channel: Optional[str] = None
    visible: Optional[bool] = True
    description: Optional[str] = ""
    enabled: Optional[bool] = True
    supports: Optional[Dict[str, bool]] = None
    pricing: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None


class PatchModelReq(BaseModel):
    adapter_type: Optional[str] = None
    upstream_api_key: Optional[str] = None
    display_name: Optional[str] = None
    channel: Optional[str] = None
    visible: Optional[bool] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    supports: Optional[Dict[str, bool]] = None
    pricing: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None


# ---------- 工厂：接受 JWT 依赖并返回 APIRouter ----------

def build_router(
    *,
    get_current_user: Callable[..., str],
    get_admin_user: Callable[..., str],
) -> APIRouter:
    """get_current_user / get_admin_user 必须是合法的 FastAPI 依赖函数"""
    router = APIRouter(tags=["api-gateway-management"])

    # ---- 用户：API Key ----

    @router.post("/api/keys")
    def create_key(req: CreateKeyReq, u: str = Depends(get_current_user)):
        full, prefix, key_hash = generate_key()
        kid = storage.create_api_key(
            username=u,
            name=req.name or "unnamed",
            key_hash=key_hash,
            prefix=prefix,
            allowed_models=req.allowed_models,
            quota_limit=req.quota_limit,
        )
        # 明文 key 只返回这一次
        return {
            "id": kid,
            "key": full,
            "prefix": prefix,
            "name": req.name or "unnamed",
            "allowed_models": req.allowed_models or [],
            "quota_limit": req.quota_limit,
            "message": "The full key is shown only once; store it now.",
        }

    @router.get("/api/keys")
    def list_keys(u: str = Depends(get_current_user)):
        return {"keys": storage.list_api_keys(u)}

    @router.patch("/api/keys/{key_id}")
    def update_key(key_id: str, req: UpdateKeyReq, u: str = Depends(get_current_user)):
        patch = {k: v for k, v in req.dict().items() if v is not None}
        try:
            storage.update_api_key(key_id, owner=u, patch=patch)
        except KeyError:
            raise HTTPException(404, "key not found")
        except PermissionError:
            raise HTTPException(403, "not your key")
        return {"ok": True}

    @router.delete("/api/keys/{key_id}")
    def delete_key(key_id: str, u: str = Depends(get_current_user)):
        try:
            storage.delete_api_key(key_id, owner=u)
        except KeyError:
            raise HTTPException(404, "key not found")
        except PermissionError:
            raise HTTPException(403, "not your key")
        return {"ok": True}

    @router.get("/api/keys/logs")
    def list_my_logs(u: str = Depends(get_current_user),
                     key_id: Optional[str] = None, limit: int = 100):
        return {"logs": storage.list_logs(username=u, key_id=key_id, limit=min(500, max(1, limit)))}

    @router.get("/api/models/public")
    def list_public_models(u: str = Depends(get_current_user)):
        """供 API 管理页 / 模型广场展示可选模型（不含敏感字段，不暴露 adapter 类型/渠道）

        只返回 enabled=True 且 visible!=False 的模型。
        如果模型自身有 params_schema 字段则优先使用（admin 可自定义），否则回落到 adapter 默认。
        """
        from .adapters import get_adapter
        from .config import get_public_api_base
        out = []
        for m in storage.list_models(include_disabled=False):
            if m.get("visible") is False:
                continue
            # 优先用模型自身的 params_schema（admin 可在模型管理里自定义）
            params = m.get("params_schema")
            if not params:
                try:
                    params = get_adapter(m.get("adapter_type") or "").params_schema()
                except Exception:
                    params = []
            out.append({
                "id": m["id"],
                "display_name": m.get("display_name") or m["id"],
                "description": m.get("description", ""),
                "supports": m.get("supports") or {},
                "pricing": m.get("pricing") or {},
                "params_schema": params,
            })
        return {"models": out, "api_base": get_public_api_base()}

    # ---- Admin：模型管理 ----

    @router.get("/api/admin/adapter-types")
    def admin_adapter_types(admin: str = Depends(get_admin_user)):
        return {"types": list_adapter_types()}

    @router.get("/api/admin/models")
    def admin_list_models(admin: str = Depends(get_admin_user)):
        return {"models": storage.list_models(include_disabled=True)}

    @router.post("/api/admin/models")
    def admin_upsert_model(req: UpsertModelReq, admin: str = Depends(get_admin_user)):
        data = req.dict(exclude_none=True)
        model_id = data.pop("id")
        saved = storage.upsert_model(model_id, data, admin=admin)
        return {"model": saved}

    @router.patch("/api/admin/models/{model_id}")
    def admin_patch_model(model_id: str, req: PatchModelReq, admin: str = Depends(get_admin_user)):
        data = {k: v for k, v in req.dict().items() if v is not None}
        if not data:
            raise HTTPException(400, "empty patch")
        saved = storage.upsert_model(model_id, data, admin=admin)
        return {"model": saved}

    @router.delete("/api/admin/models/{model_id}")
    def admin_delete_model(model_id: str, admin: str = Depends(get_admin_user)):
        storage.delete_model(model_id)
        return {"ok": True}

    @router.get("/api/admin/api-keys")
    def admin_list_keys(admin: str = Depends(get_admin_user)):
        return {"keys": storage.list_all_api_keys()}

    @router.get("/api/admin/api-logs")
    def admin_list_logs(admin: str = Depends(get_admin_user),
                        username: Optional[str] = None,
                        key_id: Optional[str] = None,
                        limit: int = 200):
        return {"logs": storage.list_logs(username=username, key_id=key_id,
                                          limit=min(1000, max(1, limit)))}

    @router.get("/api/admin/concurrency")
    def admin_concurrency(admin: str = Depends(get_admin_user)):
        """上游并发槽位监控"""
        from .concurrency import get_capacity, get_inflight
        cap = get_capacity()
        inflight = get_inflight()
        return {
            "capacity": cap,
            "inflight": inflight,
            "available": max(0, cap - inflight),
        }

    return router
