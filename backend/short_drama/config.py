"""Short Drama 模块配置

集中管理：模型 ID、并发数、各阶段安全上限、超时等。
所有可调参数都从环境变量读取，提供合理默认值。
"""
from __future__ import annotations

import os
from dataclasses import dataclass

# 画幅预设：用户选择 → (image_size, video_size)
ASPECT_RATIO_PRESETS = {
    "9:16": {"frame_size": "1024x1536", "video_size": "720x1280", "label_zh": "竖屏 9:16", "label_en": "Portrait 9:16"},
    "16:9": {"frame_size": "1536x1024", "video_size": "1280x720", "label_zh": "横屏 16:9", "label_en": "Landscape 16:9"},
    "1:1":  {"frame_size": "1024x1024", "video_size": "1280x720", "label_zh": "方形 1:1", "label_en": "Square 1:1"},
}
DEFAULT_ASPECT_RATIO = "9:16"


@dataclass(frozen=True)
class ShortDramaConfig:
    # ---- LLM (chat) ----
    chat_model_id: str = os.getenv("DRAMA_CHAT_MODEL", "claude-sonnet-4-6")
    chat_endpoint: str = os.getenv("DRAMA_CHAT_ENDPOINT", "https://api.tu-zi.com/v1/chat/completions")
    chat_timeout: int = int(os.getenv("DRAMA_CHAT_TIMEOUT", "180"))
    chat_max_retries: int = int(os.getenv("DRAMA_CHAT_RETRIES", "3"))

    # ---- 图像生成（走主网关 model_id）----
    image_model_id: str = os.getenv("DRAMA_IMAGE_MODEL", "gpt-image-2")
    portrait_size: str = os.getenv("DRAMA_PORTRAIT_SIZE", "1024x1024")
    # frame_size / video_size 由 aspect_ratio 动态决定，这里是 fallback
    frame_size: str = os.getenv("DRAMA_FRAME_SIZE", "1024x1536")

    # ---- 视频生成 ----
    video_model_id: str = os.getenv("DRAMA_VIDEO_MODEL", "veo3.1-4k-drama")
    video_size: str = os.getenv("DRAMA_VIDEO_SIZE", "720x1280")
    video_seconds: int = int(os.getenv("DRAMA_VIDEO_SECONDS", "8"))

    # ---- 安全上限 ----
    max_characters: int = int(os.getenv("DRAMA_MAX_CHARACTERS", "6"))
    max_shots: int = int(os.getenv("DRAMA_MAX_SHOTS", "12"))
    max_concurrent_jobs_per_user: int = int(os.getenv("DRAMA_MAX_CONCURRENT_PER_USER", "1"))
    max_concurrent_jobs_total: int = int(os.getenv("DRAMA_MAX_CONCURRENT_TOTAL", "3"))
    max_inflight_per_job: int = int(os.getenv("DRAMA_MAX_INFLIGHT_PER_JOB", "3"))

    # ---- 重试 ----
    max_retries_render: int = int(os.getenv("DRAMA_MAX_RETRIES_RENDER", "3"))

    # ---- 积分单价（用于预估和实时扣费）----
    # LLM 每次调用扣多少积分（screenwriter/extractor/storyboard/decompose/selector 各一次）
    llm_cost_per_call: int = int(os.getenv("DRAMA_LLM_COST", "2"))
    # 图片每张积分（走 gpt-image-2 的 pricing，这里做预估用）
    image_cost_per_call: int = int(os.getenv("DRAMA_IMAGE_COST", "7"))
    # 视频每段积分（走 veo3.1-4k-drama 的 pricing）
    video_cost_per_call: int = int(os.getenv("DRAMA_VIDEO_COST", "200"))

    # ---- 导演模式等待超时（秒）----
    confirm_timeout: int = int(os.getenv("DRAMA_CONFIRM_TIMEOUT", "3600"))  # 1 小时

    # ---- 工作目录 ----
    working_root: str = os.getenv("DRAMA_WORKING_DIR",
                                   os.path.join(os.path.dirname(os.path.abspath(__file__)), ".working"))

    # ---- ffmpeg ----
    ffmpeg_bin: str = os.getenv("DRAMA_FFMPEG", "ffmpeg")


CFG = ShortDramaConfig()
