"""Adapter 基类"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class AdapterContext:
    """每次调用的上下文：上游凭据 + 用户入参"""
    # 上游凭据（保存在模型配置里的 api_key，由 /v1 路由转成这个结构传入）
    api_key: str
    config: Dict[str, Any] = field(default_factory=dict)
    # 归一化后的请求参数（OpenAI 风格）
    prompt: str = ""
    image: List[str] = field(default_factory=list)
    size: Optional[str] = None
    n: int = 1
    quality: Optional[str] = None
    mode: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AdapterResult:
    """adapter 的统一返回

    images: 若干条图像/视频的 URL
    extra: 额外透传给响应的字段（比如 job_id、seed）
    """
    images: List[str] = field(default_factory=list)
    extra: Dict[str, Any] = field(default_factory=dict)


class AdapterError(Exception):
    """上游不可用或返回异常；调用方应退还积分"""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


class BaseAdapter:
    """adapter 接口

    子类需要实现：
    - generate(ctx) -> AdapterResult
    - describe() -> dict      （供 admin UI 展示所需 config 字段）
    - params_schema() -> list （供模型广场展示给 API 用户看的调用参数）

    约定：
    - 抛 AdapterError 表示需要回滚积分
    - 轮询逻辑在 generate 内部处理，外部是同步语义
    - 不负责 OSS 转存（上层统一处理）
    """

    #: 声明该 adapter 是否适合异步（长耗时）场景
    is_async = False

    def generate(self, ctx: AdapterContext) -> AdapterResult:
        raise NotImplementedError

    # ---------- schema ----------

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        """admin 用：该 adapter 需要的 config 字段"""
        return {
            "display_name": cls.__name__,
            "supports": {"image": False, "video": False, "async": cls.is_async},
            "config_fields": [],
        }

    @classmethod
    def params_schema(cls) -> list:
        """API 用户用：在 /v1 请求 body 里可以传哪些字段

        每条格式：{
            "name": "prompt",
            "type": "string",
            "required": True,
            "description": "文本提示词",
            "default": None,           # 可选
            "values": ["fast", ...],   # 可选（枚举）
            "min": 1, "max": 10,       # 可选（数字）
            "example": "...",           # 可选
        }
        """
        return [
            {"name": "model", "type": "string", "required": True,
             "description": "Model id to invoke (use the value shown on the card)."},
            {"name": "prompt", "type": "string", "required": True,
             "description": "Text prompt describing what to generate.",
             "example": "a cat sitting on a book, studio lighting"},
        ]
