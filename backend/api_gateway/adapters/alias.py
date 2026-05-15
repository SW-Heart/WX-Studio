"""聚合 / 路由型 adapter

把对外的一个"聚合模型"按入参路由到 registry 里另一条"真实模型"上：
- 计费、日志、积分扣减都按聚合模型的 pricing 走（外层 service 已经处理）
- 实际上游调用借用目标模型的 adapter_type、config、upstream_api_key

典型用法（admin 在弹窗里配置）：
{
  "id": "nano-banana-2",
  "adapter_type": "alias",
  "display_name": "Nano Banana 2",
  "supports": {"image": true},
  "pricing": {"mode": "per_image", "cost": 30},
  "config": {
    "route_by": "quality",
    "route_map": {
      "1k": "nano-banana-2-1k",
      "2k": "nano-banana-2-2k",
      "4k": "nano-banana-2-4k"
    },
    "default_target": "nano-banana-2-1k"
  }
}

- route_by：从 ctx 里取哪个字段做路由（quality / mode / size 等）
- route_map：参数值 → 目标模型 id
- default_target：参数缺失或不在 map 里时的兜底 id
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from .base import AdapterContext, AdapterError, AdapterResult, BaseAdapter


class AliasAdapter(BaseAdapter):
    is_async = False  # 实际由目标 adapter 决定，这里用占位值

    @classmethod
    def describe(cls) -> Dict[str, Any]:
        return {
            "display_name": "Alias / Router",
            "display_name_zh": "聚合 / 路由型",
            "description_zh": (
                "把一个对外模型按用户参数路由到 registry 里另一条真实模型，"
                "用于把上游若干同源模型聚合成一个统一入口（如 Nano Banana 2 的 1K/2K/4K 三档）。"
            ),
            "supports": {"image": True, "video": True, "text": True, "async": False},
            "config_fields": [
                {"key": "route_by", "type": "enum",
                 "options": ["quality", "mode", "size"],
                 "default": "quality",
                 "required": True,
                 "label_zh": "路由字段",
                 "help_zh": "用入参里的哪个字段决定要调用哪个真实模型",
                 "group": "upstream"},
                {"key": "route_map", "type": "json",
                 "required": True,
                 "label_zh": "路由表",
                 "help_zh": "JSON 对象：把字段值映射到真实模型 id。例如 {\"1k\": \"nano-banana-2-1k\", \"2k\": \"nano-banana-2-2k\"}",
                 "placeholder": "{\n  \"1k\": \"nano-banana-2-1k\",\n  \"2k\": \"nano-banana-2-2k\",\n  \"4k\": \"nano-banana-2-4k\"\n}",
                 "group": "upstream"},
                {"key": "default_target", "type": "string",
                 "required": False,
                 "label_zh": "兜底目标",
                 "help_zh": "用户没传路由字段、或传的值不在路由表里时使用的真实模型 id",
                 "placeholder": "nano-banana-2-1k",
                 "group": "upstream"},
            ],
        }

    @classmethod
    def params_schema(cls) -> list:
        return [
            {"name": "model", "type": "string", "required": True,
             "description": "聚合模型 ID（使用卡片上显示的值）"},
            {"name": "prompt", "type": "string", "required": True,
             "description": "文本提示词"},
        ]

    def generate(self, ctx: AdapterContext) -> AdapterResult:
        # 局部导入避免循环
        from . import get_adapter
        from .. import storage

        cfg = ctx.config or {}
        route_by = cfg.get("route_by") or "quality"
        route_map = cfg.get("route_map") or {}
        if not isinstance(route_map, dict):
            raise AdapterError("alias adapter misconfigured: route_map must be a dict", 500)
        default_target = cfg.get("default_target")

        # 取路由字段值
        if route_by == "quality":
            value = ctx.quality
        elif route_by == "mode":
            value = ctx.mode
        elif route_by == "size":
            value = ctx.size
        else:
            value = (ctx.extra or {}).get(route_by)
        # 归一化：字符串小写
        norm = str(value).lower() if value else None

        target_id = (route_map.get(norm) if norm else None) or default_target
        if not target_id:
            raise AdapterError(
                f"alias: cannot resolve target for {route_by}={value!r} "
                f"(no match in route_map and no default_target)",
                400,
            )

        target = storage.get_model(target_id)
        if not target:
            raise AdapterError(f"alias: target model '{target_id}' not found in registry", 500)
        if not target.get("enabled", True):
            raise AdapterError(f"alias: target model '{target_id}' is disabled", 503)
        target_adapter_type = target.get("adapter_type")
        if not target_adapter_type or target_adapter_type == "alias":
            raise AdapterError(f"alias: target '{target_id}' has invalid adapter_type", 500)

        try:
            target_adapter_cls = get_adapter(target_adapter_type)
        except Exception as e:
            raise AdapterError(f"alias: target adapter '{target_adapter_type}' unknown: {e}", 500)

        # 用目标模型的 config + 上游凭据；保留入参（prompt/image/size/n/quality/mode/extra）
        new_ctx = AdapterContext(
            api_key=target.get("upstream_api_key") or "",
            config=target.get("config") or {},
            prompt=ctx.prompt,
            image=list(ctx.image or []),
            size=ctx.size,
            n=ctx.n,
            quality=ctx.quality,
            mode=ctx.mode,
            extra=dict(ctx.extra or {}),
        )

        result = target_adapter_cls().generate(new_ctx)
        # 把路由信息透传到 extra，便于排查
        merged_extra = dict(result.extra or {})
        merged_extra.setdefault("alias_routed_to", target_id)
        merged_extra.setdefault("alias_route_value", norm)
        return AdapterResult(images=list(result.images), extra=merged_extra)
