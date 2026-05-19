from __future__ import annotations
"""异步任务 worker

- asyncio.Queue + N 个 worker coroutine
- 导演模式：维护 confirm_events dict，router 调 confirm() 时 set event
- 失败/取消时退还预扣积分
"""

import asyncio
import logging
import os
from typing import Dict, List, Optional

from . import storage as drama_storage
from .config import CFG
from .interfaces import JobStatus
from .pipeline import CanceledError, PipelineError, ShortDramaPipeline

logger = logging.getLogger(__name__)


class _WorkerState:
    started: bool = False
    queue: Optional[asyncio.Queue] = None
    workers: List[asyncio.Task] = []
    llm_api_key: str = ""
    # job_id -> asyncio.Event，导演模式暂停/恢复用
    confirm_events: Dict[str, asyncio.Event] = {}


_state = _WorkerState()


# ============== 启动 / 停止 ==============

def configure(*, llm_api_key: str) -> None:
    _state.llm_api_key = llm_api_key
    os.makedirs(CFG.working_root, exist_ok=True)


async def start_workers() -> None:
    if _state.started:
        return
    if not _state.llm_api_key:
        logger.warning("short_drama worker NOT started: missing llm_api_key")
        return

    _state.queue = asyncio.Queue()
    _state.workers = []
    _state.confirm_events = {}

    n = max(1, int(CFG.max_concurrent_jobs_total))
    for i in range(n):
        t = asyncio.create_task(_worker_loop(i), name=f"drama-worker-{i}")
        _state.workers.append(t)
    _state.started = True
    logger.info("short_drama: %d worker(s) started", n)
    _resume_orphaned_jobs()


async def stop_workers() -> None:
    if not _state.started:
        return
    for t in _state.workers:
        t.cancel()
    for t in _state.workers:
        try:
            await t
        except asyncio.CancelledError:
            pass
    _state.workers = []
    _state.queue = None
    _state.confirm_events = {}
    _state.started = False
    logger.info("short_drama: workers stopped")


# ============== 提交 / 确认 / 取消 ==============

def enqueue(job_id: str) -> None:
    if not _state.queue:
        raise RuntimeError("short_drama worker not started")
    _state.queue.put_nowait(job_id)


def confirm_job(job_id: str, action: str = "continue", feedback: str = "") -> None:
    """用户确认继续或要求重新生成（导演模式）

    action: "continue" | "regenerate"
    feedback: 用户的修改意见（regenerate 时传入）
    """
    # 把 action + feedback 存到 job 里，pipeline 读取后决定行为
    drama_storage.update_job(job_id, {
        "confirm_action": action,
        "confirm_feedback": feedback,
    })
    event = _state.confirm_events.get(job_id)
    if event:
        event.set()
    else:
        ev = asyncio.Event()
        ev.set()
        _state.confirm_events[job_id] = ev


# ============== worker 主循环 ==============

async def _worker_loop(worker_idx: int) -> None:
    logger.info("worker %d running", worker_idx)
    while True:
        try:
            job_id = await _state.queue.get()
        except asyncio.CancelledError:
            return
        try:
            await _run_job(job_id)
        except Exception as e:
            logger.exception("worker %d unexpected error on job %s: %s", worker_idx, job_id, e)
        finally:
            _state.queue.task_done()
            # 清理 confirm event
            _state.confirm_events.pop(job_id, None)


async def _run_job(job_id: str) -> None:
    job = drama_storage.get_job(job_id)
    if not job:
        logger.warning("job %s vanished", job_id)
        return
    if job.get("status") in JobStatus.TERMINAL:
        return

    pipeline = ShortDramaPipeline(llm_api_key=_state.llm_api_key)
    username = job.get("username", "")

    try:
        await pipeline.run(job, _state.confirm_events)
    except CanceledError:
        logger.info("job %s canceled", job_id)
        _refund_reserved(job_id, username)
    except PipelineError as e:
        logger.error("job %s failed: %s", job_id, e)
        drama_storage.update_job(job_id, {
            "status": JobStatus.FAILED,
            "error": str(e)[:500],
            "current_step": "failed",
        })
        _refund_reserved(job_id, username)
    except Exception as e:
        logger.exception("job %s crashed: %s", job_id, e)
        drama_storage.update_job(job_id, {
            "status": JobStatus.FAILED,
            "error": f"internal error: {e}"[:500],
            "current_step": "failed",
        })
        _refund_reserved(job_id, username)


def _refund_reserved(job_id: str, username: str) -> None:
    """退还预扣积分"""
    j = drama_storage.get_job(job_id)
    reserved = int((j or {}).get("quota_reserved", 0))
    if reserved <= 0:
        return
    try:
        try:
            from backend.api_gateway import deps
        except ImportError:
            from api_gateway import deps
        deps.refund_quota(username, reserved)
        drama_storage.update_job(job_id, {"quota_reserved": 0})
        logger.info("refunded %d to %s for job %s", reserved, username, job_id)
    except Exception as e:
        logger.error("refund failed for job %s: %s", job_id, e)


def _resume_orphaned_jobs() -> None:
    """启动时把 running 状态的任务标记为 failed + 退款"""
    for j in drama_storage.list_all_jobs(limit=500):
        if j.get("status") in JobStatus.ALL_RUNNING:
            drama_storage.update_job(j["id"], {
                "status": JobStatus.FAILED,
                "error": "service restarted while running",
                "current_step": "failed",
            })
            _refund_reserved(j["id"], j.get("username", ""))
