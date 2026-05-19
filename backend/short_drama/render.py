"""图像 / 视频生成的薄封装（带 3 次重试）

把 ViMax agent 期望的 `generate_single_image / generate_single_video` 协议，
翻译成对 `backend.api_gateway.service.run_model_raw` 的调用。

收益：
- 自动复用网关的 OSS 镜像、统一日志、上游限流（upstream_slot）
- 不持有任何上游 key（key 在 model registry 里）
- 图/视频均支持 max_retries_render 次重试（默认 3 次）
"""

import asyncio
import logging
import os
from dataclasses import dataclass
from typing import List, Optional

import httpx

try:
    from backend.api_gateway.service import ServiceError, run_model_raw
except ImportError:
    from api_gateway.service import ServiceError, run_model_raw

from .config import CFG

logger = logging.getLogger(__name__)


class RenderError(Exception):
    pass


@dataclass
class RenderResult:
    """统一渲染结果。url 一定是 OSS URL（已镜像）。"""
    url: str
    upstream_extra: dict


async def _run_in_thread(func, *args, **kwargs):
    """兼容 Python 3.8 的 asyncio.to_thread 替代"""
    loop = asyncio.get_event_loop()
    import functools
    return await loop.run_in_executor(None, functools.partial(func, *args, **kwargs))


# -------- 图像（带重试）--------

async def generate_image(
    prompt: str,
    *,
    reference_image_paths: Optional[List[str]] = None,
    size: Optional[str] = None,
    model_id: Optional[str] = None,
    username: Optional[str] = None,
    job_id: Optional[str] = None,
    max_retries: Optional[int] = None,
) -> RenderResult:
    """生成单张图片，OSS URL 返回。失败自动重试。"""
    image_urls = _resolve_refs(reference_image_paths)
    retries = max_retries if max_retries is not None else CFG.max_retries_render
    last_err: Optional[Exception] = None

    for attempt in range(retries):
        try:
            result = await _run_in_thread(
                run_model_raw,
                model_id=model_id or CFG.image_model_id,
                prompt=prompt,
                image=image_urls or None,
                size=size or CFG.frame_size,
                n=1,
                username=username,
                source=f"drama:{job_id or 'unknown'}",
                mirror_to_oss=True,
                record_log=True,
            )
            images = result.get("images") or []
            if images:
                return RenderResult(url=images[0], upstream_extra=result.get("extra") or {})
            raise RenderError("image generate returned no urls")
        except (ServiceError, RenderError) as e:
            last_err = e
            logger.warning("image gen attempt %d/%d failed: %s", attempt + 1, retries, e)
            if attempt < retries - 1:
                await asyncio.sleep(10 * (attempt + 1))  # 10s, 20s, 30s

    raise RenderError(f"image generate failed after {retries} retries: {last_err}")


# -------- 视频（带重试）--------

async def generate_video(
    prompt: str,
    *,
    reference_image_paths: Optional[List[str]] = None,
    size: Optional[str] = None,
    seconds: Optional[int] = None,
    model_id: Optional[str] = None,
    username: Optional[str] = None,
    job_id: Optional[str] = None,
    max_retries: Optional[int] = None,
) -> RenderResult:
    """生成视频片段，返回 OSS URL。失败自动重试。"""
    image_urls = _resolve_refs(reference_image_paths)
    retries = max_retries if max_retries is not None else CFG.max_retries_render
    last_err: Optional[Exception] = None

    for attempt in range(retries):
        try:
            result = await _run_in_thread(
                run_model_raw,
                model_id=model_id or CFG.video_model_id,
                prompt=prompt,
                image=image_urls or None,
                size=size or CFG.video_size,
                n=1,
                extra={"seconds": seconds or CFG.video_seconds},
                username=username,
                source=f"drama:{job_id or 'unknown'}",
                mirror_to_oss=True,
                record_log=True,
            )
            videos = result.get("images") or []
            if videos:
                return RenderResult(url=videos[0], upstream_extra=result.get("extra") or {})
            raise RenderError("video generate returned no urls")
        except (ServiceError, RenderError) as e:
            last_err = e
            logger.warning("video gen attempt %d/%d failed: %s", attempt + 1, retries, e)
            if attempt < retries - 1:
                await asyncio.sleep(15 * (attempt + 1))  # 15s, 30s, 45s

    raise RenderError(f"video generate failed after {retries} retries: {last_err}")


# -------- 工具 --------

def _resolve_refs(paths: Optional[List[str]]) -> List[str]:
    """把本地路径转 OSS URL，HTTPS 直接保留"""
    if not paths:
        return []
    out: List[str] = []
    for p in paths:
        if not p:
            continue
        if p.startswith(("http://", "https://")):
            out.append(p)
        else:
            out.append(_local_to_oss(p))
    return out


def _local_to_oss(local_path: str) -> str:
    try:
        from backend.api_gateway import deps as _deps
    except ImportError:
        from api_gateway import deps as _deps
    if not os.path.exists(local_path):
        raise RenderError(f"local file not found: {local_path}")
    ext = os.path.splitext(local_path)[1] or ".png"
    with open(local_path, "rb") as f:
        data = f.read()
    return _deps.upload_bytes_to_oss(data, ext)


async def download_to(url: str, dest_path: str) -> str:
    """把 url 内容下载到本地 dest_path"""
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise RenderError(f"download {url} HTTP {resp.status_code}")
        with open(dest_path, "wb") as f:
            f.write(resp.content)
    return dest_path
