"""Tuzi 视频 adapter（异步）

上游协议：
  POST {endpoint}              -> {"id": "<job_id>"} 或 {"job_id": "..."}
  GET  {endpoint}/{job_id}     -> {"status": "completed", "video_url": "..."}
  认证：Authorization: Bearer <api_key>
"""
from __future__ import annotations

import time
from typing import Any, Dict, List

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
            "display_name_zh": "Tuzi 视频（异步）",
            "description_zh": "调用 Tuzi 的 /v1/videos 异步视频生成（如 veo3.1-4k），内部轮询获取视频 URL。",
            "supports": {"image": False, "video": True, "async": True},
            "config_fields": [
                {"key": "upstream_model", "type": "string", "required": True,
                 "default": "veo3.1-4k",
                 "label_zh": "上游模型名",
                 "help_zh": "上游视频模型 ID，如 veo3.1-4k",
                 "placeholder": "veo3.1-4k", "group": "upstream"},
                {"key": "endpoint", "type": "string", "required": False,
                 "default": cls.DEFAULT_ENDPOINT,
                 "label_zh": "请求地址",
                 "help_zh": "视频生成端点 URL",
                 "group": "upstream"},
                {"key": "poll_timeout", "type": "number", "required": False,
                 "default": cls.DEFAULT_POLL_TIMEOUT,
                 "label_zh": "轮询超时（秒）",
                 "help_zh": "视频生成通常耗时较长，建议 ≥ 600",
                 "group": "advanced"},
                {"key": "use_multipart", "type": "boolean", "required": False,
                 "default": True,
                 "label_zh": "multipart 提交",
                 "help_zh": "使用 multipart/form-data 提交；首帧图会被下载后作为文件上传",
                 "group": "advanced"},
                {"key": "input_field_name", "type": "string", "required": False,
                 "default": "image",
                 "label_zh": "首帧字段名",
                 "help_zh": "multipart 表单中首帧/参考图字段名。"
                            "veo3.1-4k 系列填 input_reference，旧接口填 image。",
                 "group": "advanced"},
                {"key": "max_input_refs", "type": "number", "required": False,
                 "default": 1,
                 "label_zh": "参考图最大数量",
                 "help_zh": "veo3.1-components 系列支持 3 张；veo3.1-4k 支持首/尾帧 2 张",
                 "group": "advanced"},
                {"key": "default_size", "type": "string", "required": False,
                 "label_zh": "默认 size",
                 "help_zh": "客户端未传 size 时的默认值。竖屏 720x1280，横屏 1280x720",
                 "placeholder": "720x1280",
                 "group": "advanced"},
                {"key": "default_seconds", "type": "string", "required": False,
                 "default": "8",
                 "label_zh": "默认时长（秒）",
                 "help_zh": "veo3.1 系列目前固定 8 秒",
                 "group": "advanced"},
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
        input_field = cfg.get("input_field_name") or "image"
        max_refs = int(cfg.get("max_input_refs") or 1)
        default_size = cfg.get("default_size")
        default_seconds = cfg.get("default_seconds")

        if not ctx.api_key:
            raise AdapterError("missing Tuzi api_key", status_code=500)

        headers_auth = {
            "Authorization": f"Bearer {ctx.api_key}",
            "Connection": "close",
        }

        # 解析 size / seconds（seconds 走 ctx.extra）
        size_value = ctx.size or default_size
        seconds_value = None
        if isinstance(ctx.extra, dict):
            seconds_value = ctx.extra.get("seconds")
        if seconds_value is None and default_seconds is not None:
            seconds_value = default_seconds

        try:
            if use_multipart:
                # multipart/form-data
                # files 用列表形式以支持多张同名字段（input_reference）
                multipart_fields: List[Any] = [
                    ("model", (None, upstream_model)),
                    ("prompt", (None, ctx.prompt)),
                ]
                if size_value:
                    multipart_fields.append(("size", (None, str(size_value))))
                if seconds_value is not None:
                    multipart_fields.append(("seconds", (None, str(seconds_value))))

                # 参考图（首帧 / 尾帧 / components）：下载后作为文件上传
                refs = (ctx.image or [])[:max_refs]
                for i, ref_url in enumerate(refs):
                    try:
                        img_resp = requests.get(ref_url, timeout=30)
                        if img_resp.status_code == 200:
                            ext = ".png" if ".png" in ref_url.lower() else ".jpg"
                            multipart_fields.append((
                                input_field,
                                (f"ref_{i}{ext}", img_resp.content,
                                 "image/png" if ext == ".png" else "image/jpeg"),
                            ))
                    except Exception:
                        # 单张参考图下载失败不致命，继续；但如果都失败上游会自己拒
                        pass

                resp = requests.post(endpoint, headers=headers_auth, files=multipart_fields,
                                     timeout=30, proxies={"http": None, "https": None})
            else:
                payload: Dict[str, Any] = {
                    "prompt": ctx.prompt,
                    "model": upstream_model,
                }
                if ctx.image:
                    payload[input_field] = ctx.image[0] if len(ctx.image) == 1 else ctx.image[:max_refs]
                if size_value:
                    payload["size"] = size_value
                if seconds_value is not None:
                    payload["seconds"] = str(seconds_value)
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
