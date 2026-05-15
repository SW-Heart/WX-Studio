"""迁移脚本：把 nano-banana-2 / -2k / -4k 三条真实记录隐藏，
新建一个聚合模型占用 nano-banana-2 这个 id，按 quality 路由到三个真实记录。

产物：
- 三条原真实记录（拷贝）：
    nano-banana-2-1k    visible=False, fixed_quality=1k
    nano-banana-2-2k    visible=False
    nano-banana-2-4k    visible=False
- 新增聚合模型：
    id=nano-banana-2, adapter_type=alias, route_by=quality,
    route_map={'1k':'nano-banana-2-1k', '2k':'nano-banana-2-2k', '4k':'nano-banana-2-4k'},
    default_target='nano-banana-2-1k',
    pricing per_image 30, supports image
- 老的 nano-banana-2 记录数据保留为 nano-banana-2-1k

Run:
    cd backend && python3 migrate_nano_banana_alias.py
"""
from __future__ import annotations

import copy
import json
import os
import shutil
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "wx_data.json")


def main() -> None:
    if not os.path.exists(DB_PATH):
        print(f"❌ 未找到 {DB_PATH}")
        return

    backup = f"{DB_PATH}.bak_{int(time.time())}"
    shutil.copy2(DB_PATH, backup)
    print(f"✅ 已备份到 {backup}")

    with open(DB_PATH, "r", encoding="utf-8") as f:
        db = json.load(f)

    registry = db.get("models_registry") or {}
    head_orig = registry.get("nano-banana-2")
    if not head_orig:
        print("⚠️  没有找到 nano-banana-2 记录，跳过")
        return

    # 已经迁移过的检测（聚合模型 adapter_type=alias 时跳过）
    if head_orig.get("adapter_type") == "alias":
        print("ℹ️  聚合迁移已经做过了，幂等返回")
        return

    # 1) 拷贝原 nano-banana-2 → nano-banana-2-1k（保留所有上游配置）
    one_k = copy.deepcopy(head_orig)
    one_k["display_name"] = "Nano Banana 2 (1K) [internal]"
    one_k["visible"] = False
    one_k["updated_at"] = time.time()
    one_k["updated_by"] = "migrate-alias"
    # 1K 这条本来 fixed_quality=1k 就保留；保险起见兜底
    cfg = one_k.get("config") or {}
    cfg.setdefault("fixed_quality", "1k")
    one_k["config"] = cfg
    registry["nano-banana-2-1k"] = one_k

    # 2) 把 -2k / -4k 标 visible=false
    for alias in ("nano-banana-2-2k", "nano-banana-2-4k"):
        if alias in registry:
            r = registry[alias]
            r["display_name"] = f"{r.get('display_name', alias)} [internal]"
            r["visible"] = False
            r["updated_at"] = time.time()
            r["updated_by"] = "migrate-alias"

    # 3) 替换 nano-banana-2 为聚合模型
    aggregated = {
        "adapter_type": "alias",
        "display_name": "Nano Banana 2",
        "logo_url": head_orig.get("logo_url") or "",
        "channel": head_orig.get("channel") or "tuzi-default",
        "visible": True,
        "published_to": head_orig.get("published_to") or ["plaza", "quick_create", "canvas"],
        "description": "Gemini 3.1 Flash Image Preview · 支持 1K / 2K / 4K 三档分辨率",
        "enabled": True,
        "supports": {"image": True},
        "pricing": {"mode": "per_image", "cost": 30},
        "config": {
            "route_by": "quality",
            "route_map": {
                "1k": "nano-banana-2-1k",
                "2k": "nano-banana-2-2k",
                "4k": "nano-banana-2-4k",
            },
            "default_target": "nano-banana-2-1k",
        },
        "params_schema": [
            {"name": "model", "type": "string", "required": True,
             "description": "模型 ID（使用卡片上显示的值）"},
            {"name": "prompt", "type": "string", "required": True,
             "description": "文本提示词，最长 1000 字符",
             "example": "一只猫坐在书上，影棚灯光"},
            {"name": "image", "type": "string[] | string", "required": False,
             "description": "参考图 URL（支持传入 1 张或多张 HTTPS 链接，用于图生图）"},
            {"name": "size", "type": "string", "required": False,
             "description": "画幅比例，例如 1x1 / 16x9 / 9x16 / 3x4 / 4x3；也可传 WxH 像素，服务端会就近转换",
             "example": "1x1"},
            {"name": "n", "type": "number", "required": False, "default": 1,
             "description": "生成数量（1-10），每张独立计费（30 积分/张）"},
            {"name": "quality", "type": "enum", "required": False,
             "values": ["1k", "2k", "4k"], "default": "1k",
             "description": "输出分辨率档位：1k / 2k / 4k（路由到不同上游模型）"},
        ],
        "created_at": head_orig.get("created_at") or time.time(),
        "created_by": head_orig.get("created_by") or "system",
        "updated_at": time.time(),
        "updated_by": "migrate-alias",
        "order": head_orig.get("order", 4),
    }
    registry["nano-banana-2"] = aggregated

    db["models_registry"] = registry

    with open(DB_PATH, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

    print("✅ 迁移完成")
    print("   原 nano-banana-2 数据 → 拷贝到 nano-banana-2-1k（visible=false）")
    print("   nano-banana-2-2k / -4k → visible=false")
    print("   nano-banana-2 → 聚合模型（adapter_type=alias），按 quality 路由")


if __name__ == "__main__":
    main()
