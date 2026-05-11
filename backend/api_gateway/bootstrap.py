"""启动时的自举：把内置默认模型写入 registry

幂等：仅当 registry 中不存在对应 model id 时才写入，不覆盖 admin 手工配置。

内置默认模型（基于原 ai_config.json 的映射）：
  gpt-image-2       → adapter=ttapi-image, per_call=1
  gpt-image-2-vip   → adapter=ttapi-image, tiered_pixels
  gpt-image-2-pro   → adapter=ttapi-image, per_image=2
  midjourney        → adapter=ttapi-mj, by_mode={relax:2, fast:3, turbo:5}
  gpt-image-2-via-tuzi → adapter=tuzi-image, tiered_pixels (供 /api/create 动态覆盖 upstream_model)
  veo3.1-4k         → adapter=tuzi-video, per_call=5
"""
from __future__ import annotations

from typing import Any, Dict, List

from . import storage


def _ensure(model_id: str, payload: Dict[str, Any]) -> bool:
    existing = storage.get_model(model_id)
    if existing:
        # 已存在：一次性补齐新加的字段（display_name / channel），不动已有的其他字段
        patch = {}
        if not existing.get("display_name") and payload.get("display_name"):
            patch["display_name"] = payload["display_name"]
        if not existing.get("channel") and payload.get("channel"):
            patch["channel"] = payload["channel"]
        if patch:
            storage.upsert_model(model_id, patch, admin="system-migration")
        return False
    storage.upsert_model(model_id, payload, admin="system")
    return True


def seed_defaults(*, tt_api_key: str, tuzi_api_key: str) -> List[str]:
    """把默认模型幂等地写入 registry；返回本次新增的 model id 列表"""
    created: List[str] = []

    def maybe(mid: str, payload: Dict[str, Any]):
        if _ensure(mid, payload):
            created.append(mid)

    # TTAPI 系列
    if tt_api_key:
        maybe("gpt-image-2", {
            "adapter_type": "ttapi-image",
            "upstream_api_key": tt_api_key,
            "display_name": "GPT Image 2",
            "channel": "ttapi",
            "description": "TTAPI GPT Image 2（基础生图）",
            "enabled": True,
            "supports": {"image": True},
            "pricing": {"mode": "per_call", "cost": 1},
            "config": {"upstream_model": "gpt-image-2"},
        })
        maybe("gpt-image-2-vip", {
            "adapter_type": "ttapi-image",
            "upstream_api_key": tt_api_key,
            "display_name": "GPT Image 2 High",
            "channel": "ttapi",
            "description": "TTAPI GPT Image 2 VIP（4K 时加价）",
            "enabled": True,
            "supports": {"image": True},
            "pricing": {
                "mode": "tiered_pixels",
                "tiers": [
                    {"max_pixels": 4500000, "cost": 1},
                    {"max_pixels": 0, "cost": 2},
                ],
            },
            "config": {"upstream_model": "gpt-image-2-vip"},
        })
        maybe("gpt-image-2-pro", {
            "adapter_type": "ttapi-image",
            "upstream_api_key": tt_api_key,
            "display_name": "GPT Image 2 Pro",
            "channel": "ttapi",
            "description": "TTAPI GPT Image 2 Pro（非官转异步）",
            "enabled": True,
            "supports": {"image": True},
            "pricing": {"mode": "per_image", "cost": 2},
            "config": {"upstream_model": "gpt-image-2-plus"},
        })
        maybe("midjourney", {
            "adapter_type": "ttapi-mj",
            "upstream_api_key": tt_api_key,
            "display_name": "Midjourney",
            "channel": "ttapi",
            "description": "TTAPI Midjourney（每次 4 张子图）",
            "enabled": True,
            "supports": {"image": True},
            "pricing": {
                "mode": "by_mode",
                "by_mode": {"relax": 2, "fast": 3, "turbo": 5},
            },
            "config": {
                "mode": "fast",
                "poll_timeout": 1200,
                "max_images": 4,
            },
        })

    # Tuzi 系列（/api/create 的占位 + 视频）
    tuzi_or_tt = tuzi_api_key or tt_api_key
    if tuzi_or_tt:
        maybe("gpt-image-2-via-tuzi", {
            "adapter_type": "tuzi-image",
            "upstream_api_key": tuzi_or_tt,
            "display_name": "GPT Image 2 (Tuzi)",
            "channel": "tuzi-default",
            "description": "Tuzi /v1/images/generations（OpenAI 兼容，供 /api/create 动态使用）",
            "enabled": True,
            "supports": {"image": True},
            "pricing": {
                "mode": "tiered_pixels",
                "tiers": [
                    {"max_pixels": 4500000, "cost": 1},
                    {"max_pixels": 0, "cost": 2},
                ],
            },
            "config": {"upstream_model": "gpt-image-2", "concurrent_n": True},
        })
        maybe("veo3.1-4k", {
            "adapter_type": "tuzi-video",
            "upstream_api_key": tuzi_or_tt,
            "display_name": "Veo 3.1 (4K)",
            "channel": "tuzi-default",
            "description": "Tuzi 视频生成（异步）",
            "enabled": True,
            "supports": {"video": True},
            "pricing": {"mode": "per_call", "cost": 5},
            "config": {"upstream_model": "veo3.1-4k", "use_multipart": True},
        })

    return created


# 向后兼容的别名（Phase 2 时 main.py 调过 seed_from_env_and_config）
def seed_from_env_and_config(ai_config, *, tt_api_key: str, tuzi_api_key: str) -> List[str]:
    return seed_defaults(tt_api_key=tt_api_key, tuzi_api_key=tuzi_api_key)
