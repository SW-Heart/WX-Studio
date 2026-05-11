"""TTAPI Midjourney adapter

上游协议（midjourney-proxy 风格的 TTAPI 异步）：
  POST https://api.ttapi.io/midjourney/v1/imagine
       body: {prompt, mode}  -> {status:"SUCCESS", data:{jobId:"..."}}
  GET  https://api.ttapi.io/midjourney/v1/fetch?jobId=xxx
       resp: {status:"SUCCESS|ON_QUEUE|FAILED", data:{images:[...], cdnImage:"...", progress:"N%"}}
  认证：TT-API-KEY

约定：
- handler 层负责把 image URL / --ar / --v 等拼进 prompt（MJ 原生语法）；
  adapter 只 forward prompt 和 mode。
- 一次 imagine 通常返回 4 张子图（data.images），若只有合成图则回落为单张。
"""
from __future__ import annotations

import time
from typing import Any, Dict, List

import requests

from .base import AdapterContext, AdapterError, AdapterResult, BaseAdapter


class TTAPIMidjourneyAdapter(BaseAdapter):
    is_async = True

    DEFAULT_ENDPOINT = "https://api.ttapi.io/midjourney/v1/imagine"
    DEFAULT_FETCH = "https://api.ttapi.io/midjourney/v1/fetch"
    DEFAULT_POLL_TIMEOUT = 1200
    DEFAULT_POLL_INTERVAL = 5

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        return {
            "display_name": "TTAPI Midjourney",
            "supports": {"image": True, "video": False, "async": True},
            "config_fields": [
                {"key": "endpoint", "type": "string", "required": False,
                 "default": cls.DEFAULT_ENDPOINT},
                {"key": "fetch_endpoint", "type": "string", "required": False,
                 "default": cls.DEFAULT_FETCH},
                {"key": "mode", "type": "enum",
                 "options": ["relax", "fast", "turbo"],
                 "default": "fast",
                 "required": False,
                 "help": "默认 mode；调用时可通过 mode 参数覆盖"},
                {"key": "poll_timeout", "type": "number", "required": False,
                 "default": cls.DEFAULT_POLL_TIMEOUT},
                {"key": "max_images", "type": "number", "required": False,
                 "default": 4,
                 "help": "一次 imagine 最多返回几张（通常 4）"},
            ],
        }

    @classmethod
    def params_schema(cls) -> list:
        return [
            {"name": "model", "type": "string", "required": True,
             "description": "Model id (as shown on the card)."},
            {"name": "prompt", "type": "string", "required": True,
             "description": "Midjourney prompt. URLs at the very start are treated as reference images (--cref/iw usage). Midjourney flags like --ar 16:9 / --v 8.1 are supported.",
             "example": "a cat on a book --ar 1:1 --v 8.1"},
            {"name": "mode", "type": "enum", "required": False,
             "values": ["relax", "fast", "turbo"], "default": "fast",
             "description": "Speed tier. Affects price (see card)."},
        ]

    def generate(self, ctx: AdapterContext) -> AdapterResult:
        cfg = ctx.config or {}
        endpoint = cfg.get("endpoint") or self.DEFAULT_ENDPOINT
        fetch = cfg.get("fetch_endpoint") or self.DEFAULT_FETCH
        mode = (ctx.mode or cfg.get("mode") or "fast").lower()
        if mode not in ("relax", "fast", "turbo"):
            raise AdapterError(f"invalid MJ mode: {mode}", status_code=400)
        if not ctx.api_key:
            raise AdapterError("missing TTAPI api_key", status_code=500)

        headers = {
            "TT-API-KEY": ctx.api_key,
            "Content-Type": "application/json",
            "Connection": "close",
        }
        payload: Dict[str, Any] = {
            "prompt": ctx.prompt,  # handler 已拼好 --ar / --v / image URL
            "mode": mode,
        }
        # TTAPI MJ 不支持 referImages 字段；image 只能通过 prompt 顶部 URL 实现

        try:
            resp = requests.post(endpoint, headers=headers, json=payload, timeout=30,
                                 proxies={"http": None, "https": None})
        except Exception as e:
            raise AdapterError(f"TTAPI MJ request failed: {e}") from e
        if resp.status_code != 200:
            raise AdapterError(f"TTAPI MJ HTTP {resp.status_code}: {resp.text[:200]}")
        res = resp.json()
        if res.get("status") != "SUCCESS":
            raise AdapterError(f"TTAPI MJ submit failed: {res.get('message')}")

        data = res.get("data") or {}
        job_id = data.get("jobId") or data.get("job_id")
        if not job_id:
            raise AdapterError("TTAPI MJ returned no jobId")

        poll_timeout = int(cfg.get("poll_timeout") or self.DEFAULT_POLL_TIMEOUT)
        max_images = int(cfg.get("max_images") or 4)
        urls = self._poll(fetch, job_id, headers, poll_timeout, max_images)
        return AdapterResult(images=urls, extra={"job_id": job_id, "mode": mode})

    def _poll(self, fetch: str, job_id: str, headers: Dict[str, str],
              timeout: int, max_images: int) -> List[str]:
        start = time.time()
        while True:
            if time.time() - start > timeout:
                raise AdapterError("TTAPI MJ poll timeout", status_code=504)
            try:
                resp = requests.get(fetch, headers=headers, params={"jobId": job_id},
                                    timeout=15, proxies={"http": None, "https": None})
                if resp.status_code == 200:
                    res = resp.json()
                    status = res.get("status")
                    data = res.get("data") or {}
                    if status == "SUCCESS":
                        urls = data.get("images") or data.get("imgUrls") or []
                        if not urls:
                            cdn = data.get("cdnImage") or data.get("discordImage")
                            if cdn:
                                urls = [cdn]
                        if not urls:
                            raise AdapterError("TTAPI MJ success without urls")
                        return list(urls)[:max_images]
                    if status == "FAILED":
                        raise AdapterError(
                            f"TTAPI MJ failed: {res.get('message') or data.get('error')}")
            except AdapterError:
                raise
            except Exception:
                pass
            time.sleep(self.DEFAULT_POLL_INTERVAL)
