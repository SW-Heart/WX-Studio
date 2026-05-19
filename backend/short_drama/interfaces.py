from __future__ import annotations
"""Short Drama 数据结构（pydantic v1）

从 ViMax/interfaces 简化而来，移除多机位/transition 相关字段。

适配点：
- 项目用的是 pydantic 1.9.2，不能用 v2 的 model_validate / model_dump
- 改用 .parse_obj / .dict()
- Field 的 examples 在 v1 里要放进 schema_extra，这里直接省略 examples 简化
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class CharacterInScene(BaseModel):
    """场景中的角色，移植自 ViMax/interfaces/character.py"""
    idx: int = Field(description="The index of the character, starting from 0")
    identifier_in_scene: str = Field(
        description="Identifier (e.g. 'Alice', 'the old man')"
    )
    is_visible: bool = Field(default=True, description="Whether visible in this drama")
    static_features: str = Field(
        default="",
        description="Static visual features (face, body) that rarely change",
    )
    dynamic_features: str = Field(
        default="",
        description="Dynamic features (clothing, accessories) for this drama",
    )

    def render(self) -> str:
        s = f"{self.identifier_in_scene}"
        s += "[visible]" if self.is_visible else "[not visible]"
        s += f"\nstatic features: {self.static_features}"
        s += f"\ndynamic features: {self.dynamic_features}"
        return s


class ShotBriefDescription(BaseModel):
    """分镜简要描述（StoryboardArtist 第一阶段输出）"""
    idx: int = Field(description="Index of the shot, starting from 0")
    is_last: bool = Field(default=False, description="Whether this is the final shot")
    cam_idx: int = Field(default=0, description="Camera index (kept for prompt continuity)")
    visual_desc: str = Field(
        description=(
            "Vivid visual description of the shot. "
            "Character identifiers wrapped in <angle brackets>, e.g. <Alice>."
        )
    )
    audio_desc: str = Field(
        default="",
        description="Audio description (sound effects, dialog with speaker tag)",
    )


class ShotDescription(BaseModel):
    """完整分镜描述（StoryboardArtist 第二阶段拆解后输出）"""
    idx: int
    is_last: bool = False
    cam_idx: int = 0
    visual_desc: str
    variation_type: Literal["large", "medium", "small"] = "small"
    variation_reason: str = ""
    ff_desc: str = Field(description="First frame description (static)")
    ff_vis_char_idxs: List[int] = Field(default_factory=list)
    lf_desc: str = Field(default="", description="Last frame description (only if variation is medium/large)")
    lf_vis_char_idxs: List[int] = Field(default_factory=list)
    motion_desc: str = Field(description="Camera + on-screen motion that bridges first and last frame")
    audio_desc: str = ""


class CharacterPortrait(BaseModel):
    """角色立绘记录"""
    identifier: str
    front_url: str       # OSS URL (生成后镜像)
    description: str = ""


class JobStatus:
    """有限状态机的 string 常量"""
    QUEUED = "queued"
    WRITING = "writing"
    CASTING = "casting"
    STORYBOARDING = "storyboarding"
    DECOMPOSING = "decomposing"
    FRAMING = "framing"
    FILMING = "filming"
    COMPOSING = "composing"
    DONE = "done"
    FAILED = "failed"
    CANCELED = "canceled"
    AWAITING_CONFIRM = "awaiting_confirm"  # 导演模式暂停等用户确认

    ALL_RUNNING = (
        QUEUED, WRITING, CASTING, STORYBOARDING,
        DECOMPOSING, FRAMING, FILMING, COMPOSING,
        AWAITING_CONFIRM,
    )
    TERMINAL = (DONE, FAILED, CANCELED)
