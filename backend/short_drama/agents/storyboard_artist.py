"""Storyboard Artist (Adapted from HKUDS/ViMax, MIT License)

两步：
1) design_storyboard: 剧本 + 角色 → 镜头简要列表
2) decompose: 每个镜头 → first/last/motion + variation_type

短剧裁剪：
- 强制竖屏 9:16 思维（在 prompt 里说明）
- 不再追求多机位树（让模型自由生成 cam_idx，下游不构造 camera tree）
"""
from __future__ import annotations

import asyncio
from typing import List, Literal

from pydantic import BaseModel, Field

from ..config import CFG
from ..interfaces import CharacterInScene, ShotBriefDescription, ShotDescription
from ..llm import LLMClient


# ---------- design_storyboard ----------

DESIGN_SYSTEM_PROMPT = """
[Role]
You are a professional storyboard artist for vertical-format (9:16) short drama.
Your skills cover script analysis, cinematic visual translation, shot-list design
and narrative pacing.

[Task]
Design a storyboard for the user-provided ONE-SCENE short-drama script. The
storyboard is a list of shots with rich visual + audio descriptions.

[Input]
- <SCRIPT>...</SCRIPT>: the script text.
- <CHARACTERS>...</CHARACTERS>: indexed character feature list.
- <USER_REQUIREMENT>...</USER_REQUIREMENT>: optional constraints (audience, style,
  number of shots).

[Output]
{format_instructions}

[Guidelines]
- Output language MUST match the input script language.
- All shots are framed for vertical 9:16 viewing. Composition advice
  (close-ups, low angle, high angle, profile, symmetry) MUST suit vertical framing.
- Each shot has a clear narrative purpose: establishing, reaction, payoff, etc.
- Use cinematic vocabulary explicitly: close-up, medium shot, wide shot, dutch
  angle, dolly in/out, handheld, crane, etc.
- Reuse a `cam_idx` when a new shot can be filmed from the same camera position
  (size/angle/focus essentially unchanged); otherwise increment cam_idx.
- Wrap every character identifier in angle brackets in `visual_desc` (e.g. <Alice>),
  but NOT in dialogue or audio_desc.
- Specify each character's facing direction in `visual_desc`.
- At most one dialogue line per character per shot. Dialogues go into `audio_desc`
  in the form `[Speaker] <name> (emotion): "line"`.
- Sound effects go into `audio_desc` as `[Sound Effect] ...`.
- Hard caps: at most {max_shots} shots in total. Keep the drama under 90 seconds.
- The first shot MUST establish the environment; the last shot MUST land the
  emotional payoff or twist (set `is_last: true`).
- Avoid unsafe content; substitute when needed.
- CRITICAL: Your output is a JSON object. All string values MUST have internal
  double-quotes escaped as \\". Do NOT use unescaped " inside any string value.
  Use single quotes or 「」 for dialogue within visual_desc/audio_desc fields.
""".strip()

DESIGN_HUMAN_PROMPT = """
<SCRIPT>
{script}
</SCRIPT>

<CHARACTERS>
{characters}
</CHARACTERS>

<USER_REQUIREMENT>
{user_requirement}
</USER_REQUIREMENT>
""".strip()


class _StoryboardResponse(BaseModel):
    storyboard: List[ShotBriefDescription] = Field(
        ..., description="Ordered shot list."
    )


# ---------- decompose ----------

DECOMPOSE_SYSTEM_PROMPT = """
[Role]
You are a professional visual text analyst, proficient in cinematic language.

[Task]
Decompose the provided shot description into:
- ff_desc: a static snapshot at the very beginning (no ongoing actions)
- lf_desc: a static snapshot at the very end (must be consistent with ff_desc + motion_desc)
- motion_desc: camera motion + on-screen motion that bridges ff and lf
- variation_type: one of {large, medium, small}
  - large: dramatic transition (e.g. wide shot to close-up via large camera move)
  - medium: new character enters; subject turns from back to front
  - small: minor pose / expression / camera pan
- ff_vis_char_idxs / lf_vis_char_idxs: indices of visible characters
- variation_reason: brief reasoning

[Input]
- <VISUAL_DESC>...</VISUAL_DESC>: the shot's visual description
- <CHARACTERS>...</CHARACTERS>: indexed character list

[Output]
{format_instructions}

[Guidelines]
- Output language MUST match the input visual description language.
- ff/lf descriptions must be pure SNAPSHOTS, no progressive verbs.
- In motion_desc, refer to characters by their visible features (e.g. "the woman
  in the green dress"), not by name.
- Use accurate cinematic vocabulary; no metaphors.
- The lf_desc must logically follow ff_desc + motion_desc; all motion must land
  in the lf snapshot.
- If variation_type is "small" and lf is essentially identical to ff, you may
  set lf_desc to a brief restatement; the pipeline will skip lf rendering.
- CRITICAL: Your output is a JSON object. All string values MUST have internal
  double-quotes escaped as \\". Use single quotes or 「」 for dialogue within fields.
""".strip()

DECOMPOSE_HUMAN_PROMPT = """
<VISUAL_DESC>
{visual_desc}
</VISUAL_DESC>

<CHARACTERS>
{characters}
</CHARACTERS>
""".strip()


class _DecomposeResponse(BaseModel):
    ff_desc: str
    ff_vis_char_idxs: List[int] = Field(default_factory=list)
    lf_desc: str
    lf_vis_char_idxs: List[int] = Field(default_factory=list)
    motion_desc: str
    variation_type: Literal["large", "medium", "small"] = "small"
    variation_reason: str = ""


# ---------- main class ----------

class StoryboardArtist:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def design(
        self,
        script: str,
        characters: List[CharacterInScene],
        user_requirement: str = "",
        shot_count: int = 8,
    ) -> List[ShotBriefDescription]:
        chars_str = "\n".join(
            f"Character {i}: {c.identifier_in_scene} - "
            f"static: {c.static_features or 'n/a'}; dynamic: {c.dynamic_features or 'n/a'}"
            for i, c in enumerate(characters)
        )
        # 把 shot_count 作为硬约束注入 user_requirement
        shot_constraint = f"IMPORTANT: Generate EXACTLY {shot_count} shots. No more, no less."
        effective_req = f"{shot_constraint}\n{user_requirement}".strip()

        sys_prompt = DESIGN_SYSTEM_PROMPT.replace("{max_shots}", str(shot_count))
        out = await self.llm.chat_pydantic(
            system_prompt=sys_prompt,
            human_prompt=DESIGN_HUMAN_PROMPT.format(
                script=script.strip(),
                characters=chars_str,
                user_requirement=effective_req,
            ),
            model_cls=_StoryboardResponse,
        )
        # 强制截断到 shot_count，idx 单调，is_last 收敛
        shots = out.storyboard[:shot_count]
        for i, s in enumerate(shots):
            s.idx = i
            s.is_last = (i == len(shots) - 1)
        return shots

    async def decompose(
        self,
        shot: ShotBriefDescription,
        characters: List[CharacterInScene],
    ) -> ShotDescription:
        chars_str = "\n".join(
            f"{c.identifier_in_scene}: (static) {c.static_features}; (dynamic) {c.dynamic_features}"
            for c in characters
        )
        out = await self.llm.chat_pydantic(
            system_prompt=DECOMPOSE_SYSTEM_PROMPT,
            human_prompt=DECOMPOSE_HUMAN_PROMPT.format(
                visual_desc=shot.visual_desc.strip(),
                characters=chars_str,
            ),
            model_cls=_DecomposeResponse,
        )
        return ShotDescription(
            idx=shot.idx,
            is_last=shot.is_last,
            cam_idx=shot.cam_idx,
            visual_desc=shot.visual_desc,
            variation_type=out.variation_type,
            variation_reason=out.variation_reason,
            ff_desc=out.ff_desc,
            ff_vis_char_idxs=out.ff_vis_char_idxs,
            lf_desc=out.lf_desc,
            lf_vis_char_idxs=out.lf_vis_char_idxs,
            motion_desc=out.motion_desc,
            audio_desc=shot.audio_desc,
        )

    async def decompose_all(
        self,
        shots: List[ShotBriefDescription],
        characters: List[CharacterInScene],
    ) -> List[ShotDescription]:
        # 并行解码，控制并发
        sem = asyncio.Semaphore(CFG.max_inflight_per_job)

        async def _one(s: ShotBriefDescription) -> ShotDescription:
            async with sem:
                return await self.decompose(s, characters)

        return await asyncio.gather(*[_one(s) for s in shots])
