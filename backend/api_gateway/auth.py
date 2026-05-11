"""API Key 认证（FastAPI 依赖）"""
from __future__ import annotations

import time
from typing import Any, Dict, Optional

from fastapi import Header, HTTPException

from . import deps, storage
from .keys import hash_key, parse_auth_header


class AuthedKey:
    """请求上下文里的 API key 身份"""
    def __init__(self, key_record: Dict[str, Any]):
        self.id: str = key_record["id"]
        self.username: str = key_record.get("username", "")
        self.allowed_models = key_record.get("allowed_models") or []
        self.quota_limit = key_record.get("quota_limit")
        self.quota_used = int(key_record.get("quota_used", 0))
        self.disabled = bool(key_record.get("disabled", False))
        self.name = key_record.get("name", "")

    def can_use_model(self, model_id: str) -> bool:
        if not self.allowed_models:
            return True  # 空白名单 = 允许所有启用的模型
        return model_id in self.allowed_models

    def remaining_key_quota(self) -> Optional[int]:
        if self.quota_limit is None:
            return None
        return max(0, int(self.quota_limit) - self.quota_used)


async def require_api_key(authorization: Optional[str] = Header(default=None)) -> AuthedKey:
    """FastAPI 依赖：从 Authorization 头验证 sk-xxx"""
    raw = parse_auth_header(authorization)
    if not raw:
        raise HTTPException(401, "missing or invalid API key; expected 'Bearer sk-...'")
    key_hash = hash_key(raw)
    rec = storage.find_api_key_by_hash(key_hash)
    if not rec:
        raise HTTPException(401, "invalid API key")
    if rec.get("disabled"):
        raise HTTPException(403, "API key disabled")

    # key 级配额硬上限
    quota_limit = rec.get("quota_limit")
    quota_used = int(rec.get("quota_used", 0))
    if quota_limit is not None and quota_used >= int(quota_limit):
        raise HTTPException(402, "API key quota exhausted")

    return AuthedKey(rec)
