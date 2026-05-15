"""Adapter 注册表

Adapter 的职责：把 OpenAI 风格的请求（model + prompt + image + size + n）
转成某个上游 API 的调用，并把返回归一化为 OpenAI 格式。

已实现的 adapter：
- ttapi-image    TTAPI 同步/轮询图像（gpt-image-2 系列）
- ttapi-mj       TTAPI Midjourney（输出 4 张子图，按 mode 计费）
- tuzi-image     Tuzi OpenAI 兼容图像（/v1/images/generations）
- tuzi-video     Tuzi 异步视频（veo3.1-4k 等，需要轮询）
- openai-compat  任意 OpenAI 兼容（同步）

Admin 在后台新建模型时选一个 adapter_type，按 schema 填 config 即可。
如果上游协议与以上都不同，需新增 adapter 类并在这里注册。
"""
from typing import Dict, Type

from .base import BaseAdapter, AdapterContext, AdapterResult
from .alias import AliasAdapter
from .ttapi_image import TTAPIImageAdapter
from .ttapi_mj import TTAPIMidjourneyAdapter
from .tuzi_image import TuziImageAdapter
from .tuzi_video import TuziVideoAdapter
from .openai_compat import OpenAICompatAdapter


REGISTRY: Dict[str, Type[BaseAdapter]] = {
    "alias": AliasAdapter,
    "ttapi-image": TTAPIImageAdapter,
    "ttapi-mj": TTAPIMidjourneyAdapter,
    "tuzi-image": TuziImageAdapter,
    "tuzi-video": TuziVideoAdapter,
    "openai-compat": OpenAICompatAdapter,
}


def get_adapter(adapter_type: str) -> Type[BaseAdapter]:
    if adapter_type not in REGISTRY:
        raise ValueError(f"unknown adapter_type: {adapter_type}")
    return REGISTRY[adapter_type]


def list_adapter_types() -> Dict[str, Dict]:
    """供 admin UI 展示每种 adapter 需要哪些配置字段"""
    return {k: cls.describe() for k, cls in REGISTRY.items()}


__all__ = [
    "BaseAdapter",
    "AdapterContext",
    "AdapterResult",
    "REGISTRY",
    "get_adapter",
    "list_adapter_types",
]
