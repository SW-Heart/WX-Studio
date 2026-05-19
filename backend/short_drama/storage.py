"""短剧任务持久化（复用 wx_data.json 主库）

为什么不另开 SQLite/Postgres：当前后端就是 wx_data.json + 单机锁的简单架构，
保持一致；后续如果要扩到多实例再升级。

数据结构：
    db["drama_jobs"] = {
        job_id: {
            id, username, created_at, updated_at,
            status, progress, current_step,
            inputs: {idea, user_requirement, style},
            quota_reserved, quota_charged,
            artifacts: {
                script: "...",
                characters: [...],
                portraits: {identifier: {url, description}},
                storyboard: [...],
                shots: [...],
                final_video_url: "...",
            },
            error: "..." | None,
            preview_urls: [...],   # 用户可在过程中预览的关键中间产物
        }
    }
"""

import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional

# 与 api_gateway.storage 用同一组注入函数（main.py 只调用一次 set_db_io）
_db_lock: Optional[threading.Lock] = None
_load_db: Optional[Callable] = None
_save_db: Optional[Callable] = None

MAX_JOBS_PER_USER_HISTORY = 200  # 每个用户保留的历史任务数上限


def set_db_io(lock: threading.Lock, load_fn: Callable, save_fn: Callable) -> None:
    global _db_lock, _load_db, _save_db
    _db_lock = lock
    _load_db = load_fn
    _save_db = save_fn


def _ensure_wired() -> None:
    if _db_lock is None or _load_db is None or _save_db is None:
        raise RuntimeError("short_drama.storage 未初始化，请先调用 set_db_io()")


def _ensure_table(db: Dict[str, Any]) -> None:
    if "drama_jobs" not in db:
        db["drama_jobs"] = {}


# ---- CRUD ----

def create_job(*, username: str, idea: str, user_requirement: str, style: str,
               mode: str = "auto", aspect_ratio: str = "9:16", shot_count: int = 8,
               quota_reserved: int = 0) -> Dict[str, Any]:
    _ensure_wired()
    jid = uuid.uuid4().hex
    now = time.time()
    job = {
        "id": jid,
        "username": username,
        "created_at": now,
        "updated_at": now,
        "status": "queued",
        "progress": 0,
        "current_step": "queued",
        "inputs": {
            "idea": idea,
            "user_requirement": user_requirement,
            "style": style,
            "mode": mode,
            "aspect_ratio": aspect_ratio,
            "shot_count": shot_count,
        },
        "quota_reserved": int(quota_reserved),
        "quota_charged": 0,
        "artifacts": {
            "script": None,
            "characters": [],
            "portraits": {},
            "storyboard": [],
            "shots": [],
            "final_video_url": None,
        },
        "preview_urls": [],
        "error": None,
    }
    with _db_lock:
        db = _load_db()
        _ensure_table(db)
        db["drama_jobs"][jid] = job
        _save_db(db)
    return dict(job)


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_table(db)
        j = db["drama_jobs"].get(job_id)
        return dict(j) if j else None


def list_jobs(username: Optional[str] = None, *,
              limit: int = 50,
              status: Optional[str] = None) -> List[Dict[str, Any]]:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_table(db)
        items: List[Dict[str, Any]] = []
        for jid, j in db["drama_jobs"].items():
            if username and j.get("username") != username:
                continue
            if status and j.get("status") != status:
                continue
            items.append(dict(j))
    items.sort(key=lambda x: x.get("created_at") or 0, reverse=True)
    return items[:limit]


def list_all_jobs(*, limit: int = 200) -> List[Dict[str, Any]]:
    return list_jobs(username=None, limit=limit)


def update_job(job_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """局部更新；patch 中的 artifacts 会做浅合并而不是覆盖"""
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_table(db)
        j = db["drama_jobs"].get(job_id)
        if not j:
            return None
        for k, v in patch.items():
            if k == "artifacts" and isinstance(v, dict):
                cur = j.setdefault("artifacts", {})
                cur.update(v)
            else:
                j[k] = v
        j["updated_at"] = time.time()
        _save_db(db)
        return dict(j)


def append_preview(job_id: str, url: str) -> None:
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_table(db)
        j = db["drama_jobs"].get(job_id)
        if not j:
            return
        previews = j.setdefault("preview_urls", [])
        previews.append({"url": url, "ts": time.time()})
        j["updated_at"] = time.time()
        _save_db(db)


def cancel_job(job_id: str, owner: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """把任务标记为 canceled。worker 会在下一个检查点退出。"""
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_table(db)
        j = db["drama_jobs"].get(job_id)
        if not j:
            return None
        if owner and j.get("username") != owner:
            raise PermissionError("not your job")
        if j.get("status") in ("done", "failed", "canceled"):
            return dict(j)
        j["status"] = "canceled"
        j["updated_at"] = time.time()
        _save_db(db)
        return dict(j)


def is_canceled(job_id: str) -> bool:
    j = get_job(job_id)
    return bool(j and j.get("status") == "canceled")


def count_running_jobs(username: Optional[str] = None) -> int:
    _ensure_wired()
    running_states = {"queued", "writing", "casting", "storyboarding",
                      "decomposing", "framing", "filming", "composing"}
    with _db_lock:
        db = _load_db()
        _ensure_table(db)
        n = 0
        for j in db["drama_jobs"].values():
            if username and j.get("username") != username:
                continue
            if j.get("status") in running_states:
                n += 1
        return n


def gc_user_history(username: str) -> None:
    """单个用户最多保留 MAX_JOBS_PER_USER_HISTORY 条；超过的从最早的开始删"""
    _ensure_wired()
    with _db_lock:
        db = _load_db()
        _ensure_table(db)
        items = [(jid, j) for jid, j in db["drama_jobs"].items()
                 if j.get("username") == username]
        if len(items) <= MAX_JOBS_PER_USER_HISTORY:
            return
        items.sort(key=lambda x: x[1].get("created_at") or 0)
        to_delete = items[: len(items) - MAX_JOBS_PER_USER_HISTORY]
        for jid, _ in to_delete:
            db["drama_jobs"].pop(jid, None)
        _save_db(db)
