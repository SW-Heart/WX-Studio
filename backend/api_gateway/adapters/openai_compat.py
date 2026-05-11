"""通用 OpenAI 兼容 adapter

适用于任何同步 /v1/images/generations 兼容的上游。
与 tuzi-image 的区别是更"裸"：不做拆分并发、不做字段猜测，
严格按 OpenAI 规范发出请求。
"""
from __future__ import annotations

from typing import Any, Dict

import requests

from .base import AdapterContext, AdapterError, AdapterResult, BaseAdapter


class OpenAICompatAdapter(BaseAdapter):
    is_async = False

    DEFAULT_ENDPOINT = "https://api.openai.com/v1/images/generations"
    DEFAULT_TIMEOUT = 300

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        return {
            "display_name": "OpenAI-compatible /images/generations",
            "supports": {"image": True, "video": False, "async": False},
            "config_fields": [
                {"key": "upstream_model", "type": "string", "required": True,
                 "default": "gpt-image-1"},
                {"key": "endpoint", "type": "string", "required": True,
                 "default": cls.DEFAULT_ENDPOINT},
                {"key": "timeout", "type": "number", "required": False,
                 "default": cls.DEFAULT_TIMEOUT},
            ],
        }

    @classmethod
    def params_schema(cls) -> list:
        return [
            {"name": "model", "type": "string", "required": True,
             "description": "Model id (as shown on the card)."},
            {"name": "prompt", "type": "string", "required": True,
             "description": "Text prompt."},
            {"name": "size", "type": "string", "required": False,
             "description": "Output size, e.g. 1024x1024."},
            {"name": "n", "type": "number", "required": False, "default": 1,
             "description": "Number of images (upstream handles natively)."},
            {"name": "quality", "type": "string", "required": False,
             "description": "Optional quality hint."},
        ]

    def generate(self, ctx: AdapterContext) -> AdapterResult:
        cfg = ctx.config or {}
        upstream_model = cfg.get("upstream_model") or "gpt-image-1"
        endpoint = cfg.get("endpoint") or self.DEFAULT_ENDPOINT
        timeout = int(cfg.get("timeout") or self.DEFAULT_TIMEOUT)

        if not ctx.api_key:
            raise AdapterError("missing upstream api_key", status_code=500)

        headers = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {
            "prompt": ctx.prompt,
            "model": upstream_model,
            "n": max(1, int(ctx.n or 1)),
        }
        if ctx.size:
            payload["size"] = ctx.size
        if ctx.quality:
            payload["quality"] = ctx.quality
        # image 字段在 /images/generations 中不存在；图生图用 /images/edits（另一个 adapter/配置）

        try:
            resp = requests.post(endpoint, headers=headers, json=payload,
                                 timeout=timeout, proxies={"http": None, "https": None})
        except Exception as e:
            raise AdapterError(f"upstream request failed: {e}") from e

        if resp.status_code != 200:
            raise AdapterError(f"upstream HTTP {resp.status_code}: {resp.text[:200]}")

        res = resp.json()
        data = res.get("data") or []
        urls = []
        for item in data:
            if isinstance(item, dict):
                u = item.get("url")
                if u:
                    urls.append(u)
        if not urls:
            raise AdapterError(f"upstream returned no urls: {res}")
        return AdapterResult(images=urls)
