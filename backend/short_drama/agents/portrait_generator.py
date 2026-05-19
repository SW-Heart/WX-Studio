from __future__ import annotations
"""Portrait Generator (Adapted from HKUDS/ViMax, MIT License)

简化版：每个角色只生成一张正面立绘（短剧成本敏感，砍掉 side/back）。
直接走主网关的图像 model（gpt-image-2），返回 OSS URL。
"""

from ..config import CFG
from ..interfaces import CharacterInScene, CharacterPortrait
from ..render import generate_image


PROMPT_TEMPLATE = (
    "Generate a full-body, front-view portrait of character {identifier}. "
    "Pure white seamless background, soft studio lighting, character centered "
    "and occupying most of the frame, gazing straight ahead, arms relaxed at sides, "
    "natural neutral expression. No text, no watermark, no border."
    "\nFeatures: {features}"
    "\nStyle: {style}"
)


class PortraitGenerator:
    def __init__(self, *, username: str = None, job_id: str = None):
        self.username = username
        self.job_id = job_id

    async def generate_front(
        self,
        character: CharacterInScene,
        style: str,
    ) -> CharacterPortrait:
        features = (
            f"(static) {character.static_features}; "
            f"(dynamic) {character.dynamic_features}"
        )
        prompt = PROMPT_TEMPLATE.format(
            identifier=character.identifier_in_scene,
            features=features,
            style=style or "Photorealistic, cinematic",
        )
        result = await generate_image(
            prompt=prompt,
            size=CFG.portrait_size,
            username=self.username,
            job_id=self.job_id,
        )
        return CharacterPortrait(
            identifier=character.identifier_in_scene,
            front_url=result.url,
            description=f"Front view portrait of {character.identifier_in_scene}.",
        )
