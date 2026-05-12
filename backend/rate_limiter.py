"""内存滑动窗口限流器

零外部依赖，适合单进程部署。
后续迁移 Redis 时只需替换 _SlidingWindow 的存储后端。

用法：
    from rate_limiter import limiter

    # 在路由中
    limiter.check("login", key=client_ip, limit=5, window=60)
    # 超限会抛 HTTPException 429
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from typing import Dict, Optional, Tuple

from fastapi import HTTPException, Request


class _SlidingWindow:
    """基于滑动窗口的计数器（线程安全）"""

    def __init__(self):
        self._lock = threading.Lock()
        # key -> list of timestamps
        self._windows: Dict[str, list] = defaultdict(list)
        self._last_cleanup = time.time()

    def hit(self, key: str, limit: int, window_seconds: int) -> Tuple[bool, int, int]:
        """
        记录一次请求并检查是否超限。

        Returns:
            (allowed, remaining, retry_after_seconds)
        """
        now = time.time()
        cutoff = now - window_seconds

        with self._lock:
            # 清理过期记录
            timestamps = self._windows[key]
            self._windows[key] = [t for t in timestamps if t > cutoff]

            current_count = len(self._windows[key])

            if current_count >= limit:
                # 超限：计算最早记录过期时间
                oldest = self._windows[key][0] if self._windows[key] else now
                retry_after = max(1, int(oldest + window_seconds - now))
                return False, 0, retry_after

            # 未超限：记录本次
            self._windows[key].append(now)
            remaining = limit - current_count - 1
            return True, remaining, 0

    def cleanup(self, max_age: int = 3600):
        """定期清理超过 max_age 的过期窗口，防止内存泄漏"""
        now = time.time()
        if now - self._last_cleanup < 60:  # 最多每分钟清理一次
            return

        with self._lock:
            self._last_cleanup = now
            stale_keys = []
            for key, timestamps in self._windows.items():
                if not timestamps or timestamps[-1] < now - max_age:
                    stale_keys.append(key)
            for key in stale_keys:
                del self._windows[key]


class RateLimiter:
    """应用级限流器

    支持多个命名空间（login、sms、api 等），每个命名空间独立计数。
    """

    def __init__(self):
        self._windows: Dict[str, _SlidingWindow] = defaultdict(_SlidingWindow)

    def check(
        self,
        namespace: str,
        key: str,
        limit: int,
        window: int,
        error_message: str = "请求过于频繁，请稍后再试",
    ) -> Tuple[int, int]:
        """
        检查是否超限，超限直接抛 HTTPException 429。

        Args:
            namespace: 限流类别（如 "login", "sms", "api"）
            key: 限流维度键（如 IP 地址、用户名、API key）
            limit: 窗口内允许的最大请求数
            window: 时间窗口（秒）
            error_message: 超限时返回的错误信息

        Returns:
            (remaining, retry_after) — remaining: 剩余配额; retry_after: 0 表示未超限
        """
        sw = self._windows[namespace]
        allowed, remaining, retry_after = sw.hit(f"{namespace}:{key}", limit, window)

        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"{error_message}（{retry_after}秒后可重试）",
                headers={"Retry-After": str(retry_after)},
            )

        # 顺便清理
        sw.cleanup()

        return remaining, retry_after

    def check_multiple(
        self,
        checks: list,
        error_message: str = "请求过于频繁，请稍后再试",
    ):
        """
        同时检查多个维度的限流规则（如 IP + 用户名），任一超限即拒绝。

        Args:
            checks: [(namespace, key, limit, window), ...]
        """
        for namespace, key, limit, window in checks:
            self.check(namespace, key, limit, window, error_message)


def get_client_ip(request: Request) -> str:
    """从请求中获取客户端 IP（支持代理头）"""
    # X-Forwarded-For 优先（Nginx/CDN 代理场景）
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # 取第一个 IP（最接近客户端的）
        return forwarded.split(",")[0].strip()
    # X-Real-IP 次之
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    # 直连
    return request.client.host if request.client else "unknown"


# ========== 全局单例 ==========
limiter = RateLimiter()


# ========== 预设的限流规则 ==========

# 登录接口：每个 IP 每分钟最多 10 次，每个用户名每分钟最多 5 次
LOGIN_IP_LIMIT = (10, 60)           # (次数, 窗口秒)
LOGIN_USER_LIMIT = (5, 60)

# 短信发送：每个 IP 每小时最多 10 次，每个手机号每小时最多 5 次
SMS_IP_LIMIT = (10, 3600)
SMS_PHONE_LIMIT = (5, 3600)

# 验证码验证：每个 IP 每分钟最多 10 次
VERIFY_IP_LIMIT = (10, 60)

# 创作接口（/api/create, /api/create/pro, /api/create/mj, /api/video）
# 每个用户每分钟最多 10 次，每个 IP 每分钟最多 20 次
CREATE_USER_LIMIT = (10, 60)
CREATE_IP_LIMIT = (20, 60)

# OpenAI 兼容 API（/v1/*）
# 每个 API Key 每分钟最多 30 次，每个 IP 每分钟最多 60 次
API_KEY_LIMIT = (30, 60)
API_IP_LIMIT = (60, 60)

# 上传接口
UPLOAD_USER_LIMIT = (20, 60)
UPLOAD_IP_LIMIT = (30, 60)

# 反馈接口：防刷
FEEDBACK_IP_LIMIT = (3, 300)

# 管理接口：适当放宽但也要限
ADMIN_IP_LIMIT = (60, 60)
