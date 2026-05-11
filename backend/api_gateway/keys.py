"""API Key 工具

- generate_key() 生成 "sk-xxxx" 格式
- hash_key() 用 SHA-256（配合随机后缀，存储不可逆）
- parse_auth_header() 从 Authorization 头解析
"""
from __future__ import annotations

import hashlib
import secrets
from typing import Optional, Tuple

KEY_PREFIX = "sk-"
KEY_BODY_BYTES = 32  # 随机主体长度
PREFIX_SHOW = 8      # 展示前 8 位给用户分辨，例如 sk-AbCdEfG...（含 "sk-"）


def generate_key() -> Tuple[str, str, str]:
    """返回 (完整 key, 展示 prefix, key_hash)"""
    body = secrets.token_urlsafe(KEY_BODY_BYTES).replace("_", "").replace("-", "")[: KEY_BODY_BYTES]
    key = f"{KEY_PREFIX}{body}"
    return key, key[:PREFIX_SHOW], hash_key(key)


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def parse_auth_header(header: Optional[str]) -> Optional[str]:
    """从 'Bearer sk-xxx' 或直接 'sk-xxx' 中提取 key"""
    if not header:
        return None
    h = header.strip()
    if h.lower().startswith("bearer "):
        h = h[7:].strip()
    if not h.startswith(KEY_PREFIX):
        return None
    return h
