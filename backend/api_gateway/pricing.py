"""计费策略

每个 model 在 models_registry 中存一条 pricing 配置：

pricing = {
  "mode": "per_call" | "per_image" | "tiered_pixels" | "by_mode",
  "cost": 1,                               # mode=per_call / per_image 时的单价
  "tiers": [                               # mode=tiered_pixels
      {"max_pixels": 4500000, "cost": 1},
      {"max_pixels": 0,       "cost": 2}   # max_pixels=0 代表兜底
  ],
  "by_mode": {                             # mode=by_mode（MJ relax/fast/turbo）
      "relax": 2, "fast": 3, "turbo": 5
  },
  "images_per_call": 1                     # 每次 API 调用输出张数（MJ=4，其余=1）
}
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from . import storage


def compute_cost(pricing: Dict[str, Any], *, n: int = 1, size: Optional[str] = None,
                 mode: Optional[str] = None) -> int:
    """计算本次调用总积分

    - n 是 OpenAI n（希望产出 N 张，由客户端传入）
    - 对 MJ（images_per_call=4）上游调用 1 次就产 4 张，这里 n 通常固定为 1
    """
    mode_str = (pricing or {}).get("mode", "per_call")

    if mode_str == "per_call":
        return int(pricing.get("cost", 1))

    if mode_str == "per_image":
        unit = int(pricing.get("cost", 1))
        return unit * max(1, int(n or 1))

    if mode_str == "tiered_pixels":
        unit = _pick_tier_unit(pricing, size)
        return unit * max(1, int(n or 1))

    if mode_str == "by_mode":
        by = pricing.get("by_mode") or {}
        m = (mode or pricing.get("default_mode") or "").lower()
        if not m:
            m = min(by.keys(), key=lambda k: by[k]) if by else "fast"
        unit = int(by.get(m, 0) or pricing.get("cost", 1))
        return unit * max(1, int(n or 1))

    return int(pricing.get("cost", 1))


def resolve_model_cost(model_id: str, *, n: int = 1, size: Optional[str] = None,
                       mode: Optional[str] = None, default: int = 1) -> int:
    """handler 的便利方法：查 registry 后算价；模型不存在时返回 default"""
    m = storage.get_model(model_id)
    if not m:
        return max(1, int(default))
    pricing = m.get("pricing") or {"mode": "per_call", "cost": default}
    cost = compute_cost(pricing, n=n, size=size, mode=mode)
    return max(1, int(cost))


def resolve_model_config(model_id: str) -> Dict[str, Any]:
    """handler 的便利方法：返回 registry 中模型的 config 字典（供 poll_timeout 等读取）"""
    m = storage.get_model(model_id)
    if not m:
        return {}
    return dict(m.get("config") or {})


def _pick_tier_unit(pricing: Dict[str, Any], size: Optional[str]) -> int:
    tiers = pricing.get("tiers") or []
    if not tiers:
        return int(pricing.get("cost", 1))
    pixels = _parse_pixels(size)
    for t in tiers:
        mp = int(t.get("max_pixels", 0))
        if mp > 0 and pixels and pixels <= mp:
            return int(t.get("cost", 1))
    for t in tiers:
        if int(t.get("max_pixels", 0)) == 0:
            return int(t.get("cost", 1))
    return int(tiers[-1].get("cost", 1))


def _parse_pixels(size: Optional[str]) -> int:
    if not size or "x" not in size:
        return 0
    try:
        w, h = size.lower().split("x")
        return int(w) * int(h)
    except Exception:
        return 0
