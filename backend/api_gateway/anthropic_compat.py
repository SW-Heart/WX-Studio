"""Anthropic Messages API 兼容层

- Anthropic ↔ OpenAI 协议互转（用于 GPT/Gemini 等只有 /v1/chat/completions 的上游）
- 透传模式（用于上游原生支持 /v1/messages 的模型，例如 Tuzi 上的 Claude 系列）

Anthropic 请求体核心字段：
  {
    "model": "...",
    "max_tokens": 1024,
    "messages": [{"role": "user"|"assistant", "content": "..." | [blocks]}],
    "system": "..." | [blocks],
    "stream": false,
    "temperature": ..., "top_p": ..., "top_k": ...,
    "stop_sequences": [...],
    "tools": [...],
    "tool_choice": {...}
  }

Anthropic 非流式响应：
  {
    "id": "msg_...",
    "type": "message",
    "role": "assistant",
    "model": "...",
    "content": [{"type": "text", "text": "..."}],
    "stop_reason": "end_turn"|"max_tokens"|"stop_sequence"|"tool_use",
    "stop_sequence": null,
    "usage": {"input_tokens": ..., "output_tokens": ...,
              "cache_creation_input_tokens": ..., "cache_read_input_tokens": ...}
  }

Anthropic 流式 SSE 事件序列：
  message_start → (content_block_start → content_block_delta* → content_block_stop)+
  → message_delta (含 stop_reason 与 usage.output_tokens) → message_stop
  期间会穿插 `ping` 事件。
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, AsyncIterator, Dict, Iterable, List, Optional, Tuple


# =========================================================================
# Anthropic → OpenAI（请求转换）
# =========================================================================

def anthropic_to_openai_request(body: Dict[str, Any], *, upstream_model: str) -> Dict[str, Any]:
    """把 Anthropic /v1/messages 请求体转成 OpenAI /v1/chat/completions 请求体"""
    out_messages: List[Dict[str, Any]] = []

    # system → 首条 system 消息
    system = body.get("system")
    if system:
        out_messages.append({"role": "system", "content": _flatten_anthropic_content(system)})

    for msg in body.get("messages") or []:
        role = msg.get("role") or "user"
        content = msg.get("content")
        flat = _flatten_anthropic_content(content)
        # OpenAI 不识别 "tool_use"/"tool_result"，这里直接转成文本占位以避免上游 400
        out_messages.append({"role": role, "content": flat})

    out: Dict[str, Any] = {
        "model": upstream_model,
        "messages": out_messages,
    }

    # 字段映射
    if "max_tokens" in body:
        out["max_tokens"] = body["max_tokens"]
    for k in ("temperature", "top_p", "stream", "user"):
        if k in body and body[k] is not None:
            out[k] = body[k]
    if body.get("stop_sequences"):
        out["stop"] = body["stop_sequences"]

    return out


def _flatten_anthropic_content(content: Any) -> str:
    """把 Anthropic 的 content（字符串或 content blocks 数组）扁平化成纯字符串。

    GPT/Gemini 通过 OpenAI chat/completions 调用时不一定支持图片块，
    这里只保留文本块，其他类型尽量转成可读文本。
    """
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for block in content:
            if not isinstance(block, dict):
                if isinstance(block, str):
                    parts.append(block)
                continue
            btype = block.get("type")
            if btype == "text":
                parts.append(block.get("text") or "")
            elif btype == "tool_use":
                parts.append(
                    f"[tool_use name={block.get('name')} input={json.dumps(block.get('input') or {}, ensure_ascii=False)}]"
                )
            elif btype == "tool_result":
                inner = block.get("content")
                if isinstance(inner, list):
                    parts.append(_flatten_anthropic_content(inner))
                elif isinstance(inner, str):
                    parts.append(inner)
            elif btype == "image":
                # 文本上游下放弃图片，避免 400；保留占位说明
                parts.append("[image omitted]")
            else:
                # 其他未知类型尽力序列化
                parts.append(json.dumps(block, ensure_ascii=False))
        return "\n".join(p for p in parts if p)
    # dict 或其他形状
    try:
        return json.dumps(content, ensure_ascii=False)
    except Exception:
        return str(content)


# =========================================================================
# OpenAI → Anthropic（响应转换）
# =========================================================================

def openai_to_anthropic_response(openai_resp: Dict[str, Any], *, model_id: str) -> Dict[str, Any]:
    """非流式：OpenAI chat completion 响应 → Anthropic message 响应"""
    choice = (openai_resp.get("choices") or [{}])[0]
    msg = choice.get("message") or {}
    text = msg.get("content") or ""

    finish = choice.get("finish_reason")
    stop_reason = _map_finish_to_stop(finish)

    usage = openai_resp.get("usage") or {}
    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    details = usage.get("prompt_tokens_details") or {}
    cache_read = int(details.get("cached_tokens") or details.get("cache_read_tokens") or 0)
    cache_create = int(details.get("cache_creation_tokens") or 0)
    base_input = max(0, prompt_tokens - cache_read - cache_create)

    return {
        "id": "msg_" + uuid.uuid4().hex,
        "type": "message",
        "role": "assistant",
        "model": model_id,
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {
            "input_tokens": base_input,
            "output_tokens": completion_tokens,
            "cache_creation_input_tokens": cache_create,
            "cache_read_input_tokens": cache_read,
        },
    }


def _map_finish_to_stop(finish: Optional[str]) -> str:
    if finish == "stop":
        return "end_turn"
    if finish == "length":
        return "max_tokens"
    if finish in ("tool_calls", "function_call"):
        return "tool_use"
    if finish == "content_filter":
        return "end_turn"
    return "end_turn"


# =========================================================================
# OpenAI 流式 → Anthropic 流式
# =========================================================================

def _sse(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def openai_stream_to_anthropic_stream(
    openai_chunks: AsyncIterator[str],
    *,
    model_id: str,
) -> AsyncIterator[str]:
    """把 OpenAI 流式 SSE 行（"data: {...}" 形式）转成 Anthropic 流式事件。

    会捕获 OpenAI usage（要求上游回传 stream_options.include_usage），
    并通过 anthropic_usage_holder 暴露给计费层。
    """
    msg_id = "msg_" + uuid.uuid4().hex
    started = False
    block_open = False
    finish_reason: Optional[str] = None
    usage_data: Optional[Dict[str, Any]] = None

    async for line in openai_chunks:
        if not line:
            continue
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            break
        try:
            chunk = json.loads(payload)
        except Exception:
            continue

        if not started:
            yield _sse("message_start", {
                "type": "message_start",
                "message": {
                    "id": msg_id,
                    "type": "message",
                    "role": "assistant",
                    "model": model_id,
                    "content": [],
                    "stop_reason": None,
                    "stop_sequence": None,
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                },
            })
            started = True

        choices = chunk.get("choices") or []
        if choices:
            delta = choices[0].get("delta") or {}
            text_delta = delta.get("content")
            if text_delta:
                if not block_open:
                    yield _sse("content_block_start", {
                        "type": "content_block_start",
                        "index": 0,
                        "content_block": {"type": "text", "text": ""},
                    })
                    block_open = True
                yield _sse("content_block_delta", {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": text_delta},
                })
            fr = choices[0].get("finish_reason")
            if fr:
                finish_reason = fr

        if chunk.get("usage"):
            usage_data = chunk["usage"]

    if block_open:
        yield _sse("content_block_stop", {"type": "content_block_stop", "index": 0})

    out_tokens = 0
    if usage_data:
        out_tokens = int(usage_data.get("completion_tokens") or 0)
    yield _sse("message_delta", {
        "type": "message_delta",
        "delta": {
            "stop_reason": _map_finish_to_stop(finish_reason),
            "stop_sequence": None,
        },
        "usage": {"output_tokens": out_tokens},
    })
    yield _sse("message_stop", {"type": "message_stop"})

    # 把 usage 通过特殊行带回（不是 SSE，仅供上层捕获）
    if usage_data is not None:
        yield "__USAGE__:" + json.dumps(usage_data) + "\n"


# =========================================================================
# 透传模式下的 SSE usage 提取
# =========================================================================

def extract_usage_from_anthropic_stream_event(event_name: str, data: Dict[str, Any]) -> Optional[Dict[str, int]]:
    """从 Anthropic 流式事件里提取 usage，转成 OpenAI 风格供 compute_token_cost 使用。

    - message_start.message.usage.input_tokens
    - message_delta.usage.output_tokens
    """
    if event_name == "message_start":
        u = ((data.get("message") or {}).get("usage")) or {}
        return _anthropic_usage_to_openai(u)
    if event_name == "message_delta":
        u = data.get("usage") or {}
        return _anthropic_usage_to_openai(u)
    return None


def _anthropic_usage_to_openai(u: Dict[str, Any]) -> Dict[str, Any]:
    input_tokens = int(u.get("input_tokens") or 0)
    output_tokens = int(u.get("output_tokens") or 0)
    cache_create = int(u.get("cache_creation_input_tokens") or 0)
    cache_read = int(u.get("cache_read_input_tokens") or 0)
    return {
        "prompt_tokens": input_tokens + cache_read + cache_create,
        "completion_tokens": output_tokens,
        "total_tokens": input_tokens + cache_read + cache_create + output_tokens,
        "prompt_tokens_details": {
            "cached_tokens": cache_read,
            "cache_creation_tokens": cache_create,
        },
    }


def merge_anthropic_usage(acc: Optional[Dict[str, Any]], new: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """把多个 SSE 事件解析出的 usage 合并（input 取最大、output 累加最大值）"""
    if not new:
        return acc
    if not acc:
        return dict(new)
    merged = dict(acc)
    # prompt_tokens / cache 在 message_start 就给出，取最大即可（一般不变）
    merged["prompt_tokens"] = max(int(merged.get("prompt_tokens") or 0),
                                  int(new.get("prompt_tokens") or 0))
    merged["completion_tokens"] = max(int(merged.get("completion_tokens") or 0),
                                      int(new.get("completion_tokens") or 0))
    merged["total_tokens"] = (merged.get("prompt_tokens") or 0) + (merged.get("completion_tokens") or 0)

    a = merged.get("prompt_tokens_details") or {}
    b = new.get("prompt_tokens_details") or {}
    merged["prompt_tokens_details"] = {
        "cached_tokens": max(int(a.get("cached_tokens") or 0), int(b.get("cached_tokens") or 0)),
        "cache_creation_tokens": max(int(a.get("cache_creation_tokens") or 0),
                                     int(b.get("cache_creation_tokens") or 0)),
    }
    return merged


def is_passthrough_model(model: Dict[str, Any]) -> bool:
    """判断该模型是否走 /v1/messages 透传。

    判定规则（按优先级）：
    1. config.messages_passthrough 为 true 显式开启
    2. config.messages_passthrough 为 false 显式关闭
    3. 默认：模型 id 或 upstream_model 以 'claude' 开头时启用
    """
    cfg = model.get("config") or {}
    if "messages_passthrough" in cfg:
        return bool(cfg["messages_passthrough"])
    upstream = (cfg.get("upstream_model") or model.get("id") or "").lower()
    return upstream.startswith("claude")


def derive_messages_endpoint(model: Dict[str, Any]) -> str:
    """从模型 config 推导 /v1/messages 端点。

    优先级：
    1. config.messages_endpoint 显式配置
    2. 把 config.endpoint 中的 /chat/completions 替换成 /messages
    3. 兜底使用 https://api.anthropic.com/v1/messages
    """
    cfg = model.get("config") or {}
    if cfg.get("messages_endpoint"):
        return cfg["messages_endpoint"]
    chat_endpoint = cfg.get("endpoint") or ""
    if "/chat/completions" in chat_endpoint:
        return chat_endpoint.replace("/chat/completions", "/messages")
    if chat_endpoint.endswith("/v1") or chat_endpoint.endswith("/v1/"):
        return chat_endpoint.rstrip("/") + "/messages"
    return "https://api.anthropic.com/v1/messages"
