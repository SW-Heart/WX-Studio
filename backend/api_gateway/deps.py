"""依赖注入：由 main.py 在启动时注入所需能力

这些能力在 main.py 中已经实现，我们只需拿到引用：
- deduct_quota_atomic(username, amount) -> remaining
- refund_quota(username, amount)
- upload_bytes_to_oss(bytes, ext) -> url
- get_current_user / get_admin_user（JWT 网页登录）
- pwd_context（密码哈希，这里暂用不上）

API Key 认证在本模块内实现（keys.py + storage.py）。
"""
from __future__ import annotations

from typing import Any, Callable, Dict, Optional

# 这些引用由 main.py 在启动时 set_deps() 注入
_deduct_quota: Optional[Callable] = None
_refund_quota: Optional[Callable[[str, int], None]] = None
_upload_bytes_to_oss: Optional[Callable[[bytes, str], str]] = None
_get_user_quota: Optional[Callable[[str], int]] = None

# 可选：JWT 网页登录依赖（用于 /api/keys、/api/admin/models 这类后台接口）
get_current_user: Optional[Callable] = None
get_admin_user: Optional[Callable] = None


def set_deps(*,
             deduct_quota: Callable[[str, int], int],
             refund_quota: Callable[[str, int], None],
             upload_bytes_to_oss: Callable[[bytes, str], str],
             get_user_quota: Callable[[str], int],
             get_current_user_dep: Callable,
             get_admin_user_dep: Callable) -> None:
    global _deduct_quota, _refund_quota, _upload_bytes_to_oss, _get_user_quota
    global get_current_user, get_admin_user
    _deduct_quota = deduct_quota
    _refund_quota = refund_quota
    _upload_bytes_to_oss = upload_bytes_to_oss
    _get_user_quota = get_user_quota
    get_current_user = get_current_user_dep
    get_admin_user = get_admin_user_dep


def deduct_quota(username: str, amount: int, model: str = None, reason: str = None) -> int:
    if _deduct_quota is None:
        raise RuntimeError("api_gateway.deps not initialized")
    return _deduct_quota(username, amount, source="api", model=model, reason_override=reason)


def refund_quota(username: str, amount: int) -> None:
    if _refund_quota is None:
        raise RuntimeError("api_gateway.deps not initialized")
    _refund_quota(username, amount)


def upload_bytes_to_oss(data: bytes, ext: str) -> str:
    if _upload_bytes_to_oss is None:
        raise RuntimeError("api_gateway.deps not initialized")
    return _upload_bytes_to_oss(data, ext)


def get_user_quota(username: str) -> int:
    if _get_user_quota is None:
        raise RuntimeError("api_gateway.deps not initialized")
    return _get_user_quota(username)
