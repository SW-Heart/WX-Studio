from __future__ import annotations
"""LLM 客户端：直连 Tuzi /v1/chat/completions

不引入 langchain。提供两个能力：
- chat_text(messages) -> str：自由对话，返回原始文本
- chat_json(messages, schema) -> pydantic_obj：要求返回 JSON 并自动解析
- chat_pydantic(system, human, model_cls) -> pydantic_obj：上层语法糖

为何走 Tuzi 的 chat 端点而不是 /v1/messages（Anthropic 原生）？
- 网关已有 anthropic_compat 把内部 sk-xxx 翻译到上游，但这里我们直接持上游 key 调上游，
  避免任务内部递归打回自己的 /v1。Tuzi 的 chat/completions 是 OpenAI 兼容格式，更通用。

模型：claude-sonnet-4-6（Tuzi 提供的别名，参考 Tuzi 文档示例 claude-opus-4-1-thinking）
"""

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional, Type, TypeVar

import httpx
from pydantic import BaseModel

from .config import CFG

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    pass


class LLMClient:
    """异步 LLM 客户端，OpenAI 兼容协议"""

    def __init__(self, api_key: str, *, model: str = None, endpoint: str = None,
                 timeout: int = None, max_retries: int = None):
        if not api_key:
            raise ValueError("LLMClient requires non-empty api_key")
        self.api_key = api_key
        self.model = model or CFG.chat_model_id
        self.endpoint = endpoint or CFG.chat_endpoint
        self.timeout = timeout or CFG.chat_timeout
        self.max_retries = max_retries or CFG.chat_max_retries

    # ----- raw call -----

    async def _call_once(self, messages: List[Dict[str, Any]],
                         response_format_json: bool = False) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }
        if response_format_json:
            # OpenAI / Tuzi 兼容的 JSON 模式（部分模型支持，不支持时也不会报错，只是依赖解析容错）
            payload["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(self.endpoint, headers=headers, json=payload)
        if resp.status_code != 200:
            raise LLMError(f"LLM HTTP {resp.status_code}: {resp.text[:500]}")
        try:
            data = resp.json()
        except Exception as e:
            raise LLMError(f"LLM non-json response: {resp.text[:300]}") from e

        choices = data.get("choices") or []
        if not choices:
            raise LLMError(f"LLM empty choices: {data}")
        msg = choices[0].get("message") or {}
        content = msg.get("content")
        if isinstance(content, list):
            # Anthropic 风格 content blocks
            text_parts = [b.get("text", "") for b in content if isinstance(b, dict)]
            content = "".join(text_parts)
        if not isinstance(content, str) or not content:
            raise LLMError(f"LLM no text content: {data}")
        return content

    async def chat_text(self, messages: List[Dict[str, Any]]) -> str:
        """带重试的文本对话"""
        last_err: Optional[Exception] = None
        for i in range(self.max_retries):
            try:
                return await self._call_once(messages, response_format_json=False)
            except Exception as e:
                last_err = e
                logger.warning("LLM chat_text retry %d/%d: %s", i + 1, self.max_retries, e)
                await asyncio.sleep(2 ** i)
        raise LLMError(f"LLM chat_text failed after {self.max_retries} retries: {last_err}")

    async def chat_pydantic(
        self,
        system_prompt: str,
        human_prompt: str,
        model_cls: Type[T],
        format_instructions: Optional[str] = None,
    ) -> T:
        """要求 LLM 返回符合 pydantic schema 的 JSON 并解析。

        重试时会把上次的解析错误反馈给 LLM，让它自己修正。
        """
        if format_instructions is None:
            format_instructions = _auto_format_instructions(model_cls)

        sys_full = system_prompt
        if "{format_instructions}" in sys_full:
            sys_full = sys_full.replace("{format_instructions}", format_instructions)
        else:
            sys_full = sys_full.rstrip() + "\n\n" + format_instructions

        messages = [
            {"role": "system", "content": sys_full},
            {"role": "user", "content": human_prompt},
        ]

        last_err: Optional[Exception] = None
        for i in range(self.max_retries):
            try:
                raw = await self._call_once(messages, response_format_json=True)
                obj = _parse_pydantic_json(raw, model_cls)
                return obj
            except Exception as e:
                last_err = e
                logger.warning("LLM chat_pydantic retry %d/%d: %s", i + 1, self.max_retries, e)
                # 把错误信息追加到对话中，让 LLM 下次修正
                if i < self.max_retries - 1:
                    messages.append({"role": "assistant", "content": raw if 'raw' in dir() else ""})
                    messages.append({"role": "user", "content": (
                        f"Your previous response had a JSON format error: {str(e)[:300]}\n"
                        "Please output the SAME content again but fix the JSON formatting. "
                        "Remember: escape all double-quotes inside string values as \\\". "
                        "Do NOT use unescaped \" inside any JSON string value. "
                        "Use single quotes ' or 「」 for dialogue/quotes within text fields."
                    )})
                    await asyncio.sleep(2 ** i)
        raise LLMError(f"LLM chat_pydantic failed after {self.max_retries} retries: {last_err}")


# ----- helpers -----

def _auto_format_instructions(model_cls: Type[BaseModel]) -> str:
    """生成"输出 JSON 必须符合此 schema"的提示词

    pydantic v1 用 .schema() 取 JSON Schema。
    """
    schema = model_cls.schema()
    return (
        "The output must be a single valid JSON object that strictly matches the following JSON Schema. "
        "Do NOT wrap the JSON in markdown code fences. Do NOT include any commentary.\n"
        "IMPORTANT: All string values in the JSON must properly escape internal double-quotes as \\\". "
        "Use single quotes or special brackets 「」 for dialogue/quotes within string values.\n\n"
        f"```json\n{json.dumps(schema, ensure_ascii=False, indent=2)}\n```"
    )


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def _parse_pydantic_json(raw: str, model_cls: Type[T]) -> T:
    """把 LLM 输出里的 JSON 提取出来并解析为 pydantic 实例。

    包含多层容错：直接解析 → 抠 fence → 找 {} 边界 → 修复常见错误后重试。
    """
    text = raw.strip()

    # 尝试顺序：原文 → fence → {} 边界
    candidates = [text]

    m = _JSON_FENCE_RE.search(text)
    if m:
        candidates.append(m.group(1))

    s = text.find("{")
    e = text.rfind("}")
    if s != -1 and e != -1 and e > s:
        candidates.append(text[s : e + 1])

    for chunk in candidates:
        # 直接尝试
        try:
            return model_cls.parse_obj(json.loads(chunk))
        except Exception:
            pass
        # 修复后重试
        fixed = _fix_json(chunk)
        if fixed != chunk:
            try:
                return model_cls.parse_obj(json.loads(fixed))
            except Exception:
                pass

    # 最后一搏：用更激进的修复
    if s != -1 and e != -1 and e > s:
        chunk = text[s : e + 1]
        aggressive = _aggressive_fix_json(chunk)
        try:
            return model_cls.parse_obj(json.loads(aggressive))
        except Exception as ex:
            raise LLMError(f"failed to parse LLM json: {ex}; head={chunk[:200]}")

    raise LLMError(f"no JSON object found in LLM output: head={text[:200]}")


def _fix_json(s: str) -> str:
    """修复常见的 LLM JSON 输出错误"""
    # 1. 移除尾逗号 (,] 或 ,})
    s = re.sub(r',\s*([}\]])', r'\1', s)
    # 2. 修复单引号 → 双引号（仅在 key 位置）
    # 不做全局替换，因为值里可能有合法单引号
    return s


def _aggressive_fix_json(s: str) -> str:
    """更激进的 JSON 修复：逐字符扫描，修复字符串值中的未转义双引号"""
    s = _fix_json(s)

    # 策略：找到所有 "key": "value" 模式中 value 部分的未转义引号
    # 用正则找 ": " 后面的字符串值，尝试修复内部引号
    def fix_string_value(match):
        prefix = match.group(1)  # ": 
        content = match.group(2)  # 字符串内容（不含外层引号）
        # 转义内部的双引号（但不转义已经转义的）
        fixed_content = re.sub(r'(?<!\\)"', '\\"', content)
        return f'{prefix}"{fixed_content}"'

    # 匹配 ": "..." 模式，贪婪匹配到下一个 ", " 或 "} 或 "] 边界
    # 这个正则不完美但能处理大多数情况
    try:
        # 尝试用 Python 的 json.decoder 来定位错误位置
        try:
            json.loads(s)
            return s  # 已经合法
        except json.JSONDecodeError as e:
            # 在错误位置附近尝试修复
            pos = e.pos
            if pos and pos < len(s):
                # 常见情况：字符串值中有未转义的引号
                # 向前找到这个字符串值的开始引号
                # 向后找到合法的结束位置
                # 简单策略：在错误位置的引号前加反斜杠
                fixed = s[:pos] + '\\' + s[pos:]
                try:
                    json.loads(fixed)
                    return fixed
                except Exception:
                    pass
                # 尝试删除错误位置的字符
                fixed2 = s[:pos] + s[pos+1:]
                try:
                    json.loads(fixed2)
                    return fixed2
                except Exception:
                    pass
    except Exception:
        pass

    return s
