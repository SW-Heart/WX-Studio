"""全局上游调用并发限制

设计原则：
1. 用户积分必须"先扣费成功"才允许进入上游调用。
2. 整个进程对上游 AI 的并发上限固定（默认 10），通过一把 BoundedSemaphore 实现。
3. 请求到达时若信号量满，调用方进入排队，最多等待 ACQUIRE_TIMEOUT 秒；
   超时则抛 UpstreamBusyError，调用方负责回滚已扣积分（service.py 已经处理）。

为什么放这里而不是 nginx/uvicorn 层：
- nginx limit_conn 无法识别"扣费之前"与"调用上游中"，会让 200ms 的 /api/status 轮询
  也占并发槽。
- uvicorn workers/threads 是整体处理并发，不能区分"请求 AI"与"查库"。
- 在 service.adapter_cls().generate(ctx) 外面套一层信号量，既不影响查询/登录，
  又能精确限定"同一时刻打给上游的请求数"。
"""
from __future__ import annotations

import os
import threading
from contextlib import contextmanager

# 可通过环境变量调整，默认 10
_UPSTREAM_MAX_CONCURRENCY = max(1, int(os.getenv("UPSTREAM_MAX_CONCURRENCY", "10")))
# 排队获取信号量的最长等待时间，默认 300 秒（5 分钟）
_ACQUIRE_TIMEOUT = max(5, int(os.getenv("UPSTREAM_ACQUIRE_TIMEOUT", "300")))

_upstream_sem = threading.BoundedSemaphore(_UPSTREAM_MAX_CONCURRENCY)
_inflight_lock = threading.Lock()
_inflight = 0  # 当前正在发给上游的请求数（统计用）


class UpstreamBusyError(Exception):
    """上游并发满额，排队超时"""
    status_code = 503

    def __init__(self, message: str = "上游服务繁忙，请稍后再试"):
        super().__init__(message)


def get_capacity() -> int:
    return _UPSTREAM_MAX_CONCURRENCY


def get_inflight() -> int:
    with _inflight_lock:
        return _inflight


@contextmanager
def upstream_slot(timeout: float = None):
    """在 with 块内，视作一次"打给上游"的并发占用。

    - 如果进不去，抛 UpstreamBusyError（status_code=503）。
    - 调用方应在其上层处理：若已预扣积分，需要 refund。
    """
    global _inflight
    wait = _ACQUIRE_TIMEOUT if timeout is None else float(timeout)
    got = _upstream_sem.acquire(blocking=True, timeout=wait)
    if not got:
        raise UpstreamBusyError(
            f"上游并发已满（上限 {_UPSTREAM_MAX_CONCURRENCY}），排队 {int(wait)}s 超时"
        )
    with _inflight_lock:
        _inflight += 1
    try:
        yield
    finally:
        with _inflight_lock:
            _inflight -= 1
        _upstream_sem.release()
