"""启动时的自举：把内置默认模型写入 registry

幂等：仅当 registry 中不存在对应 model id 时才写入，不覆盖 admin 手工配置。
对已存在的老记录，会一次性补齐新字段（display_name / channel / visible）。

默认对外开放 4 个模型：
  gpt-image-2        → GPT Image 2       (ttapi-image, per_call=1)
  gpt-image-2-high   → GPT Image 2 High  (ttapi-image, tiered_pixels)
  gpt-image-2-pro    → GPT Image 2 Pro   (ttapi-image, per_image=2)
  midjourney         → Midjourney        (ttapi-mj, by_mode)
"""
from __future__ import annotations

from typing import Any, Dict, List

from . import storage


def _ensure(model_id: str, payload: Dict[str, Any]) -> bool:
    existing = storage.get_model(model_id)
    if existing:
        # 已存在：一次性补齐新加的字段（display_name / channel / visible / params_schema），不动已有的其他字段
        patch = {}
        if not existing.get("display_name") and payload.get("display_name"):
            patch["display_name"] = payload["display_name"]
        if not existing.get("channel") and payload.get("channel"):
            patch["channel"] = payload["channel"]
        if "visible" not in existing and "visible" in payload:
            patch["visible"] = payload["visible"]
        if not existing.get("params_schema") and payload.get("params_schema"):
            patch["params_schema"] = payload["params_schema"]
        if patch:
            storage.upsert_model(model_id, patch, admin="system-migration")
        return False
    storage.upsert_model(model_id, payload, admin="system")
    return True


def _migrate_rename(old_id: str, new_id: str) -> bool:
    """把 old_id 记录重命名为 new_id；若 new_id 已存在则不覆盖"""
    old = storage.get_model(old_id)
    if not old:
        return False
    if storage.get_model(new_id):
        # 新 id 已存在：不迁移，但删掉旧的以保持干净
        storage.delete_model(old_id)
        return False
    data = {k: v for k, v in old.items() if k not in ("id", "created_at", "updated_at")}
    storage.upsert_model(new_id, data, admin="system-migration")
    storage.delete_model(old_id)
    return True


def seed_defaults(*, tt_api_key: str, tuzi_api_key: str) -> List[str]:
    """把默认模型幂等地写入 registry；返回本次新增的 model id 列表"""
    created: List[str] = []

    # 清理不再对外的老模型：标记为不可见
    _hide_legacy = ["gpt-image-2-via-tuzi", "veo3.1-4k"]
    for old_id in _hide_legacy:
        old = storage.get_model(old_id)
        if old and old.get("visible") is not False:
            storage.upsert_model(old_id, {"visible": False}, admin="system-migration")

    # 更新老描述（去掉 TTAPI/Tuzi 字样）
    _desc_updates = {
        "gpt-image-2": "基础生图模型，支持图生图与多尺寸输出",
        "gpt-image-2-high": "高清生图模型，4K 以上尺寸自动加价",
        "gpt-image-2-pro": "Pro 专业级生图模型（异步，支持任意尺寸）",
        "midjourney": "Midjourney 图像生成，每次输出 4 张子图",
    }
    for mid, desc in _desc_updates.items():
        m = storage.get_model(mid)
        if m and m.get("description", "").startswith("TTAPI"):
            storage.upsert_model(mid, {"description": desc}, admin="system-migration")

    # 迁移：老的 gpt-image-2-vip → gpt-image-2-high
    _migrate_rename("gpt-image-2-vip", "gpt-image-2-high")

    # 迁移：2026-05 按官方建议积分消耗更新定价
    # 把老版本的便宜定价（per_call=1 等）一次性升级到新价格。
    # 判定条件：仅当当前 pricing.cost 或各 tier/mode 仍为老值时才覆盖，避免 admin 手工调过后被重置
    _PRICING_MIGRATIONS = {
        "gpt-image-2": {
            "new": {"mode": "per_image", "cost": 7},
            "stale_if": lambda p: (p.get("mode") in ("per_call", "per_image")) and int(p.get("cost", 0)) <= 2,
        },
        "gpt-image-2-high": {
            "new": {"mode": "per_image", "cost": 13},
            # 老 tiered_pixels 结构：1K=1, 4K=2；如果还是这个形状就升级
            "stale_if": lambda p: (
                p.get("mode") == "tiered_pixels"
                and any(int(t.get("cost", 0)) <= 2 for t in (p.get("tiers") or []))
            ) or (p.get("mode") in ("per_call", "per_image") and int(p.get("cost", 0)) < 13),
        },
        "gpt-image-2-pro": {
            "new": {"mode": "per_image", "cost": 22},
            "stale_if": lambda p: (p.get("mode") in ("per_call", "per_image")) and int(p.get("cost", 0)) < 22,
        },
        "midjourney": {
            "new": {"mode": "by_mode", "by_mode": {"relax": 22, "fast": 42, "turbo": 62}},
            "stale_if": lambda p: (
                p.get("mode") == "by_mode"
                and any(int(v) < 22 for v in (p.get("by_mode") or {}).values())
            ),
        },
    }
    for mid, spec in _PRICING_MIGRATIONS.items():
        existing = storage.get_model(mid)
        if not existing:
            continue
        cur_pricing = existing.get("pricing") or {}
        try:
            if spec["stale_if"](cur_pricing):
                storage.upsert_model(mid, {"pricing": spec["new"]}, admin="system-migration")
        except Exception:
            pass

    def maybe(mid: str, payload: Dict[str, Any]):
        if _ensure(mid, payload):
            created.append(mid)

    if not tt_api_key:
        return created  # 没有 TT key 就不 seed（admin 需要去填）

    maybe("gpt-image-2", {
        "adapter_type": "ttapi-image",
        "upstream_api_key": tt_api_key,
        "display_name": "GPT Image 2",
        "channel": "ttapi",
        "visible": True,
        "description": "基础生图模型，支持图生图与多尺寸输出",
        "enabled": True,
        "supports": {"image": True},
        "pricing": {"mode": "per_image", "cost": 7},
        "config": {"upstream_model": "gpt-image-2"},
        "params_schema": [
            {"name": "model", "type": "string", "required": True,
             "description": "模型 ID（使用卡片上显示的值）"},
            {"name": "prompt", "type": "string", "required": True,
             "description": "文本提示词，描述你想生成的内容",
             "example": "一只猫坐在书上，影棚灯光"},
            {"name": "image", "type": "string[] | string", "required": False,
             "description": "参考图 URL（支持传入 1 张或多张 HTTPS 链接，用于图生图）"},
            {"name": "size", "type": "string", "required": False,
             "description": "输出尺寸。该模型仅支持 1K 分辨率，如 1024x1024、1536x1024 等（总像素不超过约 1M）。",
             "example": "1024x1024"},
            {"name": "n", "type": "number", "required": False, "default": 1,
             "description": "生成数量（1-10），每张独立计费"},
        ],
    })
    maybe("gpt-image-2-high", {
        "adapter_type": "ttapi-image",
        "upstream_api_key": tt_api_key,
        "display_name": "GPT Image 2 High",
        "channel": "ttapi",
        "visible": True,
        "description": "高清生图模型，支持 2K/4K 输出",
        "enabled": True,
        "supports": {"image": True},
        "pricing": {"mode": "per_image", "cost": 13},
        "config": {"upstream_model": "gpt-image-2-vip"},
    })
    maybe("gpt-image-2-pro", {
        "adapter_type": "ttapi-image",
        "upstream_api_key": tt_api_key,
        "display_name": "GPT Image 2 Pro",
        "channel": "ttapi",
        "visible": True,
        "description": "Pro 专业级生图模型（异步，支持任意尺寸）",
        "enabled": True,
        "supports": {"image": True},
        "pricing": {"mode": "per_image", "cost": 22},
        "config": {"upstream_model": "gpt-image-2-plus"},
    })
    maybe("midjourney", {
        "adapter_type": "ttapi-mj",
        "upstream_api_key": tt_api_key,
        "display_name": "Midjourney",
        "channel": "ttapi",
        "visible": True,
        "description": "Midjourney 图像生成，每次输出 4 张子图",
        "enabled": True,
        "supports": {"image": True},
        "pricing": {
            "mode": "by_mode",
            "by_mode": {"relax": 22, "fast": 42, "turbo": 62},
        },
        "config": {"mode": "fast", "poll_timeout": 1200, "max_images": 4},
    })

    # ---------- Nano Banana 2（Gemini 3.1 Flash Image Preview via Tuzi）----------
    # 三档分辨率对应三个模型 id，但上游其实是同一个 model（只是 quality 不同）。
    # 统一 30 积分/张。
    if tuzi_api_key:
        nb2_params_schema = [
            {"name": "model", "type": "string", "required": True,
             "description": "模型 ID（使用卡片上显示的值）"},
            {"name": "prompt", "type": "string", "required": True,
             "description": "文本提示词，最长 1000 字符",
             "example": "一只猫坐在书上，影棚灯光"},
            {"name": "image", "type": "string[] | string", "required": False,
             "description": "参考图 URL（支持传入 1 张或多张 HTTPS 链接，用于图生图）"},
            {"name": "size", "type": "string", "required": False,
             "description": "画幅比例。可传 1x1 / 16x9 / 9x16 / 3x4 / 4x3 等；"
                            "也可传 WxH 像素尺寸，服务端会就近转换为比例",
             "example": "1x1"},
            {"name": "n", "type": "number", "required": False, "default": 1,
             "description": "生成数量（1-10），每张独立计费（30 积分/张）"},
        ]
        nb2_pricing = {"mode": "per_image", "cost": 30}

        maybe("nano-banana-2", {
            "adapter_type": "tuzi-image",
            "upstream_api_key": tuzi_api_key,
            "display_name": "Nano Banana 2 (1K)",
            "channel": "tuzi-default",
            "visible": True,
            "description": "Gemini 3.1 Flash Image Preview · 1K 标清输出（30 积分/张）",
            "enabled": True,
            "supports": {"image": True},
            "pricing": nb2_pricing,
            "config": {
                "upstream_model": "gemini-3.1-flash-image-preview",
                "fixed_quality": "1k",
                "size_as_ratio": True,
                "concurrent_n": True,
            },
            "params_schema": nb2_params_schema,
        })
        maybe("nano-banana-2-2k", {
            "adapter_type": "tuzi-image",
            "upstream_api_key": tuzi_api_key,
            "display_name": "Nano Banana 2 (2K)",
            "channel": "tuzi-default",
            "visible": True,
            "description": "Gemini 3.1 Flash Image Preview · 2K 高清输出（30 积分/张）",
            "enabled": True,
            "supports": {"image": True},
            "pricing": nb2_pricing,
            "config": {
                "upstream_model": "gemini-3.1-flash-image-preview",
                "fixed_quality": "2k",
                "size_as_ratio": True,
                "concurrent_n": True,
            },
            "params_schema": nb2_params_schema,
        })
        maybe("nano-banana-2-4k", {
            "adapter_type": "tuzi-image",
            "upstream_api_key": tuzi_api_key,
            "display_name": "Nano Banana 2 (4K)",
            "channel": "tuzi-default",
            "visible": True,
            "description": "Gemini 3.1 Flash Image Preview · 4K 超清输出（30 积分/张）",
            "enabled": True,
            "supports": {"image": True},
            "pricing": nb2_pricing,
            "config": {
                "upstream_model": "gemini-3.1-flash-image-preview",
                "fixed_quality": "4k",
                "size_as_ratio": True,
                "concurrent_n": True,
            },
            "params_schema": nb2_params_schema,
        })

    return created


# 向后兼容的别名
def seed_from_env_and_config(ai_config, *, tt_api_key: str, tuzi_api_key: str) -> List[str]:
    return seed_defaults(tt_api_key=tt_api_key, tuzi_api_key=tuzi_api_key)
