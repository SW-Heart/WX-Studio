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
from typing import Any, Dict, List

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
            "supports": {"image": True, "video": False, "async": False},
            "config_fields": [
                {"key": "upstream_model", "type": "string", "required": True,
                 "default": "gpt-image-2"},
                {"key": "endpoint", "type": "string", "required": False,
                 "default": cls.DEFAULT_ENDPOINT},
                {"key": "timeout", "type": "number", "required": False,
                 "default": cls.DEFAULT_TIMEOUT},
                {"key": "concurrent_n", "type": "boolean", "required": False,
                 "default": True,
                 "help": "n>1 时是否拆成并发多次单张请求（避免长连接被 LB 切断）"},
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
        if ctx.size:
            base_payload["size"] = ctx.size
        if ctx.image:
            base_payload["image"] = ctx.image
        if ctx.quality:
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
                                 timeout=timeout, proxies={"http": None, "https": None})
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
