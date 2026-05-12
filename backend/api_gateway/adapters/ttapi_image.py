"""TTAPI 图像 adapter（gpt-image-2 / gpt-image-2-vip / gpt-image-2-pro 系列）

上游协议：
  POST {endpoint}          -> { "status": "SUCCESS", "data": {"jobId": "..."} }
  GET  {fetch}?jobId=xxx   -> { "status": "SUCCESS|ON_QUEUE|FAILED", "data": {"imageUrl": "..."} }
  认证：TT-API-KEY: <api_key>
"""
from __future__ import annotations

import time
from typing import Any, Dict

import requests

from .base import AdapterContext, AdapterError, AdapterResult, BaseAdapter


class TTAPIImageAdapter(BaseAdapter):
    is_async = False  # 同步语义，但内部会轮询

    DEFAULT_ENDPOINT = "https://api.ttapi.io/openai/gpt/generations"
    DEFAULT_FETCH = "https://api.ttapi.io/openai/gpt/fetch"
    DEFAULT_POLL_TIMEOUT = 300
    DEFAULT_POLL_INTERVAL = 3

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        return {
            "display_name": "TTAPI Image (gpt-image-2 series)",
            "supports": {"image": True, "video": False, "async": False},
            "config_fields": [
                {"key": "upstream_model", "type": "string", "required": True,
                 "default": "gpt-image-2",
                 "help": "上游实际模型名，如 gpt-image-2 / gpt-image-2-plus"},
                {"key": "endpoint", "type": "string", "required": False,
                 "default": cls.DEFAULT_ENDPOINT},
                {"key": "fetch_endpoint", "type": "string", "required": False,
                 "default": cls.DEFAULT_FETCH},
                {"key": "poll_timeout", "type": "number", "required": False,
                 "default": cls.DEFAULT_POLL_TIMEOUT,
                 "help": "轮询最大秒数"},
            ],
        }

    @classmethod
    def params_schema(cls) -> list:
        return [
            {"name": "model", "type": "string", "required": True,
             "description": "模型 ID（使用卡片上显示的值）"},
            {"name": "prompt", "type": "string", "required": True,
             "description": "文本提示词，描述你想生成的内容",
             "example": "一只猫坐在书上，影棚灯光"},
            {"name": "image", "type": "string[] | string", "required": False,
             "description": "参考图 URL（支持传入 1 张或多张 HTTPS 链接，用于图生图）"},
            {"name": "size", "type": "string", "required": False,
             "description": "输出尺寸，格式 WxH。限制：最大边长 ≤ 3840px；宽高必须是 16 的整数倍；长短边比例 ≤ 3:1；总像素 655,360 ~ 8,294,400。gpt-image-2 仅支持 1K（如 1024x1024）。",
             "example": "1024x1024"},
            {"name": "n", "type": "number", "required": False, "default": 1,
             "description": "生成数量（1-10），每张独立计费"},
        ]

    def generate(self, ctx: AdapterContext) -> AdapterResult:
        cfg = ctx.config or {}
        upstream_model = cfg.get("upstream_model") or "gpt-image-2"
        endpoint = cfg.get("endpoint") or self.DEFAULT_ENDPOINT
        fetch = cfg.get("fetch_endpoint") or self.DEFAULT_FETCH
        poll_timeout = int(cfg.get("poll_timeout") or self.DEFAULT_POLL_TIMEOUT)

        if not ctx.api_key:
            raise AdapterError("missing TTAPI api_key", status_code=500)

        headers = {
            "TT-API-KEY": ctx.api_key,
            "Content-Type": "application/json",
            "Connection": "close",
        }
        payload: Dict[str, Any] = {
            "prompt": ctx.prompt,
            "model": upstream_model,
        }
        if ctx.size:
            payload["size"] = ctx.size
        if ctx.image:
            payload["referImages"] = ctx.image
        # TTAPI 不支持原生 n；上层需要多张应自己循环调用

        try:
            resp = requests.post(endpoint, headers=headers, json=payload, timeout=30,
                                 proxies={"http": None, "https": None})
        except Exception as e:
            raise AdapterError(f"TTAPI request failed: {e}") from e

        if resp.status_code != 200:
            raise AdapterError(f"TTAPI HTTP {resp.status_code}: {resp.text[:200]}")

        res = resp.json()
        if res.get("status") != "SUCCESS":
            raise AdapterError(f"TTAPI submit failed: {res.get('message')}")

        data = res.get("data") or {}
        job_id = data.get("jobId") or data.get("job_id")
        if not job_id:
            raise AdapterError("TTAPI returned no jobId")

        url = self._poll(fetch, job_id, headers, poll_timeout)
        return AdapterResult(images=[url], extra={"job_id": job_id})

    def _poll(self, fetch: str, job_id: str, headers: Dict[str, str], timeout: int) -> str:
        start = time.time()
        while True:
            if time.time() - start > timeout:
                raise AdapterError("TTAPI poll timeout", status_code=504)
            try:
                resp = requests.get(f"{fetch}?jobId={job_id}", headers=headers, timeout=10,
                                    proxies={"http": None, "https": None})
                if resp.status_code == 200:
                    res = resp.json()
                    status = res.get("status")
                    if status == "SUCCESS":
                        url = (res.get("data") or {}).get("imageUrl")
                        if not url:
                            raise AdapterError("TTAPI success without imageUrl")
                        return url
                    if status == "FAILED":
                        raise AdapterError(f"TTAPI job failed: {res.get('message')}")
                # ON_QUEUE / 其他：继续
            except AdapterError:
                raise
            except Exception:
                # 网络抖动，继续轮询
                pass
            time.sleep(self.DEFAULT_POLL_INTERVAL)
