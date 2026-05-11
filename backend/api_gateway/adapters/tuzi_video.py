"""Tuzi 视频 adapter（异步）

上游协议：
  POST {endpoint}              -> {"id": "<job_id>"} 或 {"job_id": "..."}
  GET  {endpoint}/{job_id}     -> {"status": "completed", "video_url": "..."}
  认证：Authorization: Bearer <api_key>
"""
from __future__ import annotations

import time
from typing import Any, Dict

import requests

from .base import AdapterContext, AdapterError, AdapterResult, BaseAdapter


class TuziVideoAdapter(BaseAdapter):
    is_async = True

    DEFAULT_ENDPOINT = "https://api.tu-zi.com/v1/videos"
    DEFAULT_POLL_TIMEOUT = 600
    DEFAULT_POLL_INTERVAL = 5

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        return {
            "display_name": "Tuzi Video (async)",
            "supports": {"image": False, "video": True, "async": True},
            "config_fields": [
                {"key": "upstream_model", "type": "string", "required": True,
                 "default": "veo3.1-4k"},
                {"key": "endpoint", "type": "string", "required": False,
                 "default": cls.DEFAULT_ENDPOINT},
                {"key": "poll_timeout", "type": "number", "required": False,
                 "default": cls.DEFAULT_POLL_TIMEOUT},
                {"key": "use_multipart", "type": "boolean", "required": False,
                 "default": True,
                 "help": "用 multipart/form-data 提交；image 会被下载后作为文件上传"},
            ],
        }

    @classmethod
    def params_schema(cls) -> list:
        return [
            {"name": "model", "type": "string", "required": True,
             "description": "Model id (as shown on the card)."},
            {"name": "prompt", "type": "string", "required": True,
             "description": "Text prompt describing the video scene.",
             "example": "a cat jumps over a book, cinematic"},
            {"name": "image", "type": "string", "required": False,
             "description": "Optional first-frame image URL."},
        ]

    def generate(self, ctx: AdapterContext) -> AdapterResult:
        cfg = ctx.config or {}
        upstream_model = cfg.get("upstream_model") or "veo3.1-4k"
        endpoint = cfg.get("endpoint") or self.DEFAULT_ENDPOINT
        timeout = int(cfg.get("poll_timeout") or self.DEFAULT_POLL_TIMEOUT)
        use_multipart = bool(cfg.get("use_multipart", True))

        if not ctx.api_key:
            raise AdapterError("missing Tuzi api_key", status_code=500)

        headers_auth = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Connection": "close",
        }

        try:
            if use_multipart:
                files = {
                    "model": (None, upstream_model),
                    "prompt": (None, ctx.prompt),
                }
                # 首帧图：下载后附加为文件
                first_img = ctx.image[0] if ctx.image else None
                if first_img:
                    try:
                        img_resp = requests.get(first_img, timeout=30)
                        if img_resp.status_code == 200:
                            files["image"] = ("image.png", img_resp.content, "image/png")
                    except Exception:
                        pass
                resp = requests.post(endpoint, headers=headers_auth, files=files,
                                     timeout=30, proxies={"http": None, "https": None})
            else:
                payload: Dict[str, Any] = {
                    "prompt": ctx.prompt,
                    "model": upstream_model,
                }
                if ctx.image:
                    payload["image"] = ctx.image[0] if len(ctx.image) == 1 else ctx.image
                if ctx.size:
                    payload["size"] = ctx.size
                resp = requests.post(endpoint, headers={**headers_auth, "Content-Type": "application/json"},
                                     json=payload, timeout=30,
                                     proxies={"http": None, "https": None})
        except Exception as e:
            raise AdapterError(f"Tuzi video submit failed: {e}") from e

        if resp.status_code != 200:
            raise AdapterError(f"Tuzi video HTTP {resp.status_code}: {resp.text[:200]}")
        res = resp.json()
        job_id = res.get("id") or res.get("job_id") or (res.get("data") or {}).get("id")
        if not job_id:
            raise AdapterError(f"Tuzi video no job id: {res}")

        url = self._poll(endpoint, job_id, headers_auth, timeout)
        return AdapterResult(images=[url], extra={"job_id": job_id})

    def _poll(self, endpoint: str, job_id: str, headers: Dict[str, str], timeout: int) -> str:
        start = time.time()
        while True:
            if time.time() - start > timeout:
                raise AdapterError("Tuzi video poll timeout", status_code=504)
            try:
                resp = requests.get(f"{endpoint}/{job_id}", headers=headers, timeout=10,
                                    proxies={"http": None, "https": None})
                if resp.status_code == 200:
                    res = resp.json()
                    status = (res.get("status") or "").lower()
                    if status == "completed":
                        url = res.get("video_url") or res.get("url")
                        if not url:
                            raise AdapterError("Tuzi video completed without url")
                        return url
                    if status in ("failed", "error"):
                        raise AdapterError(f"Tuzi video failed: {res}")
            except AdapterError:
                raise
            except Exception:
                pass
            time.sleep(self.DEFAULT_POLL_INTERVAL)
