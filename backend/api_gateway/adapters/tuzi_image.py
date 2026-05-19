"""Tuzi 图像 adapter（/v1/images/generations，OpenAI 兼容，同步）

上游协议：
  POST {endpoint} (OpenAI 兼容)
    body: {model, prompt, image?, size?, n?, quality?}
    resp: {data: [{url: "..."}]}
  认证：Authorization: Bearer <api_key>
"""
from __future__ import annotations

import random
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from math import gcd
from typing import Any, Dict, List, Optional

import requests

from .base import AdapterContext, AdapterError, AdapterResult, BaseAdapter


class TuziImageAdapter(BaseAdapter):
    is_async = False

    DEFAULT_ENDPOINT = "https://api.tu-zi.com/v1/images/generations"
    DEFAULT_TIMEOUT = 600

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        return {
            "display_name": "Tuzi Image (OpenAI compatible)",
            "display_name_zh": "Tuzi 图像（OpenAI 兼容）",
            "description_zh": "调用 Tuzi /v1/images/generations 端点的 OpenAI 兼容图像模型（如 nano-banana、gpt-image-2 等），同步返回。",
            "supports": {"image": True, "video": False, "async": False},
            "config_fields": [
                {"key": "upstream_model", "type": "string", "required": True,
                 "default": "gpt-image-2",
                 "label_zh": "上游模型名",
                 "help_zh": "上游实际调用的模型 ID，透传到 Tuzi（如 gpt-image-2 / nano-banana-2）",
                 "placeholder": "gpt-image-2", "group": "upstream"},
                {"key": "endpoint", "type": "string", "required": False,
                 "default": cls.DEFAULT_ENDPOINT,
                 "label_zh": "请求地址",
                 "help_zh": "图像生成端点 URL，默认为 Tuzi 官方地址",
                 "group": "upstream"},
                {"key": "timeout", "type": "number", "required": False,
                 "default": cls.DEFAULT_TIMEOUT,
                 "label_zh": "请求超时（秒）",
                 "help_zh": "HTTP 请求的最长等待时间",
                 "group": "advanced"},
                {"key": "concurrent_n", "type": "boolean", "required": False,
                 "default": True,
                 "label_zh": "并发多张",
                 "help_zh": "n>1 时是否拆成多次并发 n=1 的请求；开启可避免长连接被 LB 中断",
                 "group": "advanced"},
                {"key": "fixed_quality", "type": "string", "required": False,
                 "label_zh": "强制 quality",
                 "help_zh": "固定写死 quality 参数（如 nano-banana-2 的 1k/2k/4k），设置后忽略用户入参",
                 "placeholder": "1k / 2k / 4k（可留空）",
                 "group": "size"},
                {"key": "size_as_ratio", "type": "boolean", "required": False,
                 "default": False,
                 "label_zh": "尺寸转比例",
                 "help_zh": "把 WxH 像素尺寸（如 1344x768）自动转换为最简比例（16x9），适用于 nano-banana-2 这类按比例+quality 决定实际分辨率的模型",
                 "group": "size"},
            ],
        }

    @classmethod
    def params_schema(cls) -> list:
        return [
            {"name": "model", "type": "string", "required": True,
             "description": "Model id (as shown on the card)."},
            {"name": "prompt", "type": "string", "required": True,
             "description": "Text prompt.",
             "example": "a cat sitting on a book, studio lighting"},
            {"name": "image", "type": "string[] | string", "required": False,
             "description": "Reference image URL(s) for image-to-image."},
            {"name": "size", "type": "string", "required": False,
             "description": "Output size. Larger than 4.5M px will trigger tier-2 pricing if tiered.",
             "example": "1024x1024"},
            {"name": "n", "type": "number", "required": False, "default": 1,
             "description": "Number of images (1-10). Each is billed individually."},
            {"name": "quality", "type": "string", "required": False,
             "description": "Optional quality hint, passed through to upstream."},
        ]

    def generate(self, ctx: AdapterContext) -> AdapterResult:
        cfg = ctx.config or {}
        upstream_model = cfg.get("upstream_model") or "gpt-image-2"
        endpoint = cfg.get("endpoint") or self.DEFAULT_ENDPOINT
        timeout = int(cfg.get("timeout") or self.DEFAULT_TIMEOUT)
        concurrent_n = bool(cfg.get("concurrent_n", True))
        fixed_quality = cfg.get("fixed_quality")
        size_as_ratio = bool(cfg.get("size_as_ratio", False))

        if not ctx.api_key:
            raise AdapterError("missing Tuzi api_key", status_code=500)

        headers = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Content-Type": "application/json",
            "Connection": "close",
        }
        base_payload: Dict[str, Any] = {
            "prompt": ctx.prompt,
            "model": upstream_model,
        }

        # size：nano-banana-2 这类模型只接受比例形式（如 1x1、16x9、3x4），
        # 不接受具体像素尺寸；这里把 1344x768 这种转成 16x9。
        # 若客户端传了 "auto" 或没传 size，则默认 1x1。
        size_value = ctx.size
        if size_as_ratio:
            ratio = _size_to_ratio(size_value) if size_value else None
            size_value = ratio or "1x1"
        if size_value:
            base_payload["size"] = size_value

        if ctx.image:
            base_payload["image"] = ctx.image

        # quality：若模型在 config 里固定了 quality（如 nano-banana-2-4k 固定传 "4k"），
        # 以 config 为准；否则透传客户端的 quality
        if fixed_quality:
            base_payload["quality"] = fixed_quality
        elif ctx.quality:
            base_payload["quality"] = ctx.quality

        actual_n = max(1, min(10, int(ctx.n or 1)))

        if actual_n == 1 or not concurrent_n:
            # 直接一次请求，让上游处理 n
            base_payload["n"] = actual_n
            url = self._single(endpoint, headers, base_payload, timeout)
            return AdapterResult(images=[url] if actual_n == 1 else self._parse_many(url))

        # n > 1 且 concurrent 模式：拆成 N 次 n=1
        def _run(i: int) -> str:
            if i > 0:
                time.sleep(random.uniform(1.0, 2.0) * i)
            per = {**base_payload, "n": 1}
            return self._single(endpoint, headers, per, timeout)

        urls: List[str] = []
        errors: List[str] = []
        with ThreadPoolExecutor(max_workers=actual_n) as pool:
            futures = [pool.submit(_run, i) for i in range(actual_n)]
            for fut in as_completed(futures):
                try:
                    urls.append(fut.result())
                except Exception as e:
                    errors.append(str(e))
        if not urls:
            raise AdapterError(f"Tuzi all {actual_n} requests failed: {errors[:1]}")
        return AdapterResult(images=urls, extra={"failed": len(errors)})

    def _single(self, endpoint: str, headers: Dict[str, str], payload: Dict[str, Any], timeout: int) -> str:
        try:
            resp = requests.post(endpoint, headers=headers, json=payload,
                                 timeout=(10, timeout), proxies={"http": None, "https": None})
        except Exception as e:
            raise AdapterError(f"Tuzi request failed: {e}") from e
        if resp.status_code != 200:
            raise AdapterError(f"Tuzi HTTP {resp.status_code}: {resp.text[:200]}")
        res = resp.json()
        data = res.get("data") or []
        if not isinstance(data, list) or not data:
            raise AdapterError(f"Tuzi empty data: {res}")
        first = data[0]
        if not isinstance(first, dict):
            raise AdapterError(f"Tuzi unexpected data[0]: {first}")
        url = first.get("url")
        if not url:
            raise AdapterError("Tuzi missing url")
        return url

    @staticmethod
    def _parse_many(first_url: str) -> List[str]:
        # 目前 _single 只取 data[0]，若未来需要从一次响应取所有 url 可在此扩展
        return [first_url]


# ---------------- helpers ----------------

# 常见画幅 → 文档里 nano-banana-2 支持的比例 token 的就近映射
_RATIO_TOKENS = [
    (1, 1, "1x1"),
    (2, 3, "2x3"),
    (3, 2, "3x2"),
    (3, 4, "3x4"),
    (4, 3, "4x3"),
    (4, 5, "4x5"),
    (5, 4, "5x4"),
    (9, 16, "9x16"),
    (16, 9, "16x9"),
    (21, 9, "21x9"),
    (1, 8, "1x8"),
    (3, 8, "3x8"),
    (8, 3, "8x3"),
    (4, 11, "4x11"),
    (11, 4, "11x4"),
    (4, 8, "4x8"),
    (8, 4, "8x4"),
    (8, 11, "8x11"),
    (11, 8, "11x8"),
    (6, 11, "6x11"),
]


def _size_to_ratio(size: str) -> Optional[str]:
    """把 '1344x768' 这类像素尺寸就近映射为 nano-banana-2 支持的比例 token（如 '16x9'）。

    - 若 size 已经像 'NxM' 且 N、M ≤ 32，则原样返回（视作客户端直接传了比例）。
    - 先做最简分数化，命中 _RATIO_TOKENS 则直接返回。
    - 否则按宽高比与候选做最近邻匹配。
    """
    if not size:
        return None
    s = size.lower().replace("×", "x").strip()
    if "x" not in s:
        return None
    try:
        w_str, h_str = s.split("x", 1)
        w = int(w_str)
        h = int(h_str)
    except Exception:
        return None
    if w <= 0 or h <= 0:
        return None

    # 视作已是比例：N/M 都比较小，直接透传
    if w <= 32 and h <= 32:
        return f"{w}x{h}"

    # 最简分数命中
    g = gcd(w, h)
    rw, rh = w // g, h // g
    for a, b, token in _RATIO_TOKENS:
        if a == rw and b == rh:
            return token

    # 最近邻：按宽高比差找最接近的候选
    target = w / h
    best = None
    best_diff = 1e9
    for a, b, token in _RATIO_TOKENS:
        diff = abs((a / b) - target)
        if diff < best_diff:
            best_diff = diff
            best = token
    return best
