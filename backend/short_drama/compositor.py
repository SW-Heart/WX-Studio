"""ffmpeg 拼接器

把多个短视频片段拼成最终成片，最终上传 OSS。
不依赖 moviepy；直接调系统 ffmpeg。

输入：本地 mp4 路径列表（按时间顺序）
输出：本地 mp4 路径
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import List

from .config import CFG

logger = logging.getLogger(__name__)


class CompositorError(Exception):
    pass


async def concat_videos(input_paths: List[str], output_path: str) -> str:
    """用 ffmpeg concat demuxer 拼接，不重新编码（速度快）

    所有输入需要相同编码/分辨率。我们后续若引入字幕/转场，再改用 -filter_complex。
    """
    if not input_paths:
        raise CompositorError("no input videos to concat")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    list_file = output_path + ".list.txt"
    with open(list_file, "w", encoding="utf-8") as f:
        for p in input_paths:
            if not os.path.exists(p):
                raise CompositorError(f"input video missing: {p}")
            # ffmpeg concat 需要绝对路径并 escape 单引号
            ap = os.path.abspath(p).replace("'", "'\\''")
            f.write(f"file '{ap}'\n")

    cmd = [
        CFG.ffmpeg_bin,
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", list_file,
        "-c", "copy",
        output_path,
    ]
    logger.info("ffmpeg concat: %s", " ".join(cmd))
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    try:
        os.remove(list_file)
    except OSError:
        pass

    if proc.returncode != 0:
        # concat copy 失败时，回退到重编码（解决编码不一致）
        logger.warning("ffmpeg concat copy failed (rc=%s), falling back to re-encode: %s",
                       proc.returncode, stderr.decode("utf-8", errors="ignore")[-400:])
        return await _concat_reencode(input_paths, output_path)

    return output_path


async def _concat_reencode(input_paths: List[str], output_path: str) -> str:
    """fallback：重编码拼接（兼容性最高，速度较慢）"""
    inputs_args: List[str] = []
    for p in input_paths:
        inputs_args.extend(["-i", p])

    n = len(input_paths)
    filter_lines = [f"[{i}:v:0][{i}:a:0?]" for i in range(n)]
    filter_str = "".join(filter_lines) + f"concat=n={n}:v=1:a=1[outv][outa]"

    cmd = [
        CFG.ffmpeg_bin,
        "-y",
        *inputs_args,
        "-filter_complex", filter_str,
        "-map", "[outv]",
        "-map", "[outa]",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "128k",
        output_path,
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise CompositorError(
            f"ffmpeg re-encode concat failed: {stderr.decode('utf-8', errors='ignore')[-500:]}"
        )
    return output_path
