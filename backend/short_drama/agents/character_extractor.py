"""Character Extractor (Adapted from HKUDS/ViMax, MIT License)

输入剧本，产出角色列表（含 static / dynamic 视觉特征）。
直接复用 ViMax 的 system prompt（短剧场景同样适用），结构改为 pydantic v1。
"""
from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from ..config import CFG
from ..interfaces import CharacterInScene
from ..llm import LLMClient


SYSTEM_PROMPT = """
[Role]
You are a top-tier movie script analysis expert.

[Task]
Your task is to analyze the provided script and extract all relevant character information.

[Input]
You will receive a script enclosed within <SCRIPT> and </SCRIPT>.

[Output]
{format_instructions}

[Guidelines]
- The language of all values (not keys) MUST match the language of the input script.
- Group all names referring to the same entity under one character. Pick the most natural identifier.
- Pronouns/occupations are acceptable identifiers when no name is given (e.g. "the young woman").
- Skip background characters who never become the focus of any shot.
- If a character's traits are missing, fabricate plausible features that make them visually distinct
  from the other characters.
- static_features: face, body, age range, ethnicity, hair-style, eye colour, build.
- dynamic_features: outfit, accessories, props they hold.
- Do NOT mention personality, emotions, occupation, or relationships in either feature field.
- Use concrete, filmable descriptors only (no abstract adjectives).
- Strictly cap the result at {max_characters} characters; merge or drop less important ones.
"""

HUMAN_PROMPT = """
<SCRIPT>
{script}
</SCRIPT>
""".strip()


class _ExtractCharactersResponse(BaseModel):
    characters: List[CharacterInScene] = Field(
        ..., description="A list of characters extracted from the script."
    )


class CharacterExtractor:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def extract(self, script: str, max_characters: int = None) -> List[CharacterInScene]:
        max_characters = max_characters or CFG.max_characters
        sys_prompt = SYSTEM_PROMPT.replace("{max_characters}", str(max_characters))

        out = await self.llm.chat_pydantic(
            system_prompt=sys_prompt,
            human_prompt=HUMAN_PROMPT.format(script=script.strip()),
            model_cls=_ExtractCharactersResponse,
        )

        # 重排索引、强制 idx 单调
        chars = out.characters[:max_characters]
        for i, c in enumerate(chars):
            c.idx = i
        return chars
