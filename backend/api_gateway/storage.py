"""数据存储层

封装对 wx_data.json 的读写，新增三个顶层 key：
- api_keys: {key_id: {...}}        # 用户生成的 API Key
- api_logs: [{...}]                # 每次 API 调用的记录（最多保留最近 N 条）
- models_registry: {model_id: {...}} # Admin 可配置的模型注册表

注意：本模块不直接引入 main.py 的 load_db/save_db，而是通过 set_db_io
在 main.py 启动时注入，避免循环依赖。
"""
from __future__ import annotations

import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

# --- 由 main.py 注入的 IO 函数 ---
_db_lock: Optional[threading.Lock] = None
_load_db: Optional[Callable[[], Dict[str, Any]]] = None
_save_db: Optional[Callable[[Dict[str, Any]], None]] = None

# 限制日志增长，超过则从头裁剪
MAX_API_LOGS = 5000


def set_db_io(lock: threading.Lock, load_fn: Callable, save_fn: Callable) -> None:
    global _db_lock, _load_db, _save_db
    _db_lock = lock
    _load_db = load_fn
    _save_db = save_fn


def _ensure_wired() -> None:
    if _db_lock is None or _load_db is None or _save_db is None:
        raise RuntimeError("api_gateway.storage 未初始化，请先调用 set_db_io()")


def _ensure_tables(db: Dict[str, Any]) -> None:
    if "api_keys" not in db:
        db["api_keys"] = {}
    if "api_logs" not in db:
        db["api_logs"] = []
    if "models_registry" not in db:
        db["models_registry"] = {}


# ========== API Keys ==========

def list_api_keys(username: str) -> List[Dict[str, Any]]:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        keys = []
        for kid, kdata in db["api_keys"].items():
            if kdata.get("username") != username:
                continue
            keys.append({
                "id": kid,
                "name": kdata.get("name", ""),
                "prefix": kdata.get("prefix", ""),
                "allowed_models": kdata.get("allowed_models", []),
                "quota_limit": kdata.get("quota_limit"),
                "quota_used": kdata.get("quota_used", 0),
                "disabled": kdata.get("disabled", False),
                "created_at": kdata.get("created_at"),
                "last_used_at": kdata.get("last_used_at"),
                "total_calls": kdata.get("total_calls", 0),
            })
        keys.sort(key=lambda x: x.get("created_at") or 0, reverse=True)
        return keys


def list_all_api_keys() -> List[Dict[str, Any]]:
    """admin 用"""
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        keys = []
        for kid, kdata in db["api_keys"].items():
            keys.append({
                "id": kid,
                "username": kdata.get("username"),
                "name": kdata.get("name", ""),
                "prefix": kdata.get("prefix", ""),
                "allowed_models": kdata.get("allowed_models", []),
                "quota_limit": kdata.get("quota_limit"),
                "quota_used": kdata.get("quota_used", 0),
                "disabled": kdata.get("disabled", False),
                "created_at": kdata.get("created_at"),
                "last_used_at": kdata.get("last_used_at"),
                "total_calls": kdata.get("total_calls", 0),
            })
        keys.sort(key=lambda x: x.get("created_at") or 0, reverse=True)
        return keys


def create_api_key(
    username: str,
    name: str,
    key_hash: str,
    prefix: str,
    allowed_models: Optional[List[str]] = None,
    quota_limit: Optional[int] = None,
) -> str:
    """返回 key_id（数据库主键，不是 sk-xxx 本身）"""
    _ensure_wired()
    kid = uuid.uuid4().hex
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        db["api_keys"][kid] = {
            "username": username,
            "name": name or "unnamed",
            "key_hash": key_hash,
            "prefix": prefix,
            "allowed_models": allowed_models or [],  # [] 表示允许所有启用的模型
            "quota_limit": quota_limit,  # None 表示不限（只受用户余额限制）
            "quota_used": 0,
            "disabled": False,
            "created_at": time.time(),
            "last_used_at": None,
            "total_calls": 0,
        }
        _save_db(db)
    return kid


def find_api_key_by_hash(key_hash: str) -> Optional[Dict[str, Any]]:
    """通过 hash 查找完整 key 记录（含 id），用于认证"""
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        for kid, kdata in db["api_keys"].items():
            if kdata.get("key_hash") == key_hash:
                return {"id": kid, **kdata}
    return None


def update_api_key(key_id: str, owner: str, patch: Dict[str, Any]) -> Dict[str, Any]:
    """只允许更新指定字段，越权时抛异常"""
    _ensure_wired()
    ALLOWED = {"name", "allowed_models", "quota_limit", "disabled"}
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        kdata = db["api_keys"].get(key_id)
        if not kdata:
            raise KeyError("key not found")
        if owner and kdata.get("username") != owner:
            raise PermissionError("not your key")
        for k, v in patch.items():
            if k in ALLOWED:
                kdata[k] = v
        _save_db(db)
        return kdata


def delete_api_key(key_id: str, owner: str) -> None:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        kdata = db["api_keys"].get(key_id)
        if not kdata:
            raise KeyError("key not found")
        if owner and kdata.get("username") != owner:
            raise PermissionError("not your key")
        del db["api_keys"][key_id]
        _save_db(db)


def record_key_usage(key_id: str, amount: int) -> None:
    """某次调用完成后累加用量（调用方已扣用户余额）"""
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        kdata = db["api_keys"].get(key_id)
        if not kdata:
            return
        kdata["quota_used"] = int(kdata.get("quota_used", 0)) + int(amount)
        kdata["last_used_at"] = time.time()
        kdata["total_calls"] = int(kdata.get("total_calls", 0)) + 1
        _save_db(db)


# ========== API Logs ==========

def append_log(entry: Dict[str, Any]) -> None:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        db["api_logs"].append(entry)
        # 裁剪
        if len(db["api_logs"]) > MAX_API_LOGS:
            db["api_logs"] = db["api_logs"][-MAX_API_LOGS:]
        _save_db(db)


def list_logs(username: Optional[str] = None, key_id: Optional[str] = None,
              limit: int = 100) -> List[Dict[str, Any]]:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        logs = list(db["api_logs"])
    # 倒序
    logs.reverse()
    out = []
    for log in logs:
        if username and log.get("username") != username:
            continue
        if key_id and log.get("key_id") != key_id:
            continue
        out.append(log)
        if len(out) >= limit:
            break
    return out


# ========== Models Registry ==========

def list_models(include_disabled: bool = False) -> List[Dict[str, Any]]:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        models = []
        for mid, mdata in db["models_registry"].items():
            if not include_disabled and not mdata.get("enabled", True):
                continue
            models.append({"id": mid, **mdata})
        models.sort(key=lambda x: x.get("created_at") or 0)
        return models


def get_model(model_id: str) -> Optional[Dict[str, Any]]:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        m = db["models_registry"].get(model_id)
        if not m:
            return None
        return {"id": model_id, **m}


def upsert_model(model_id: str, data: Dict[str, Any], admin: str) -> Dict[str, Any]:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        existing = db["models_registry"].get(model_id) or {}
        merged = {
            **existing,
            **data,
            "updated_at": time.time(),
            "updated_by": admin,
        }
        merged.setdefault("created_at", time.time())
        merged.setdefault("created_by", admin)
        merged.setdefault("enabled", True)
        db["models_registry"][model_id] = merged
        _save_db(db)
        return {"id": model_id, **merged}


def delete_model(model_id: str) -> None:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_tables(db)
        if model_id in db["models_registry"]:
            del db["models_registry"][model_id]
            _save_db(db)
