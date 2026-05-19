"""Reference Image Selector (Adapted from HKUDS/ViMax, MIT License)

输入：候选 (image_url, text_description) 对 + 目标帧文本描述
输出：精选参考图集合 + 用于图像生成器的最终 prompt（已带 "Image N: ..." 前缀）

短剧裁剪：
- 不再做"先文本筛 → 再多模态精选"两阶段（成本高且收益有限），统一一次文本 LLM
  调用筛选。Claude 处理结构化文本筛选已经足够稳定。
- 候选最多 8 张（避免上下文爆炸）。
- 输入的 image 都是 OSS URL，不再做本地 b64 转换。
"""

from typing import List, Tuple

from pydantic import BaseModel, Field

from ..llm import LLMClient


SYSTEM_PROMPT = """
[Role]
You are a professional visual creation assistant.

[Task]
Given a target frame description and a sequence of candidate reference images
(each with an index and a textual description), pick the most useful subset and
write a concise text prompt for an image generator that will use the selected
reference images.

The selection must keep the upcoming frame consistent with prior frames in
character appearance, environment, lighting and visual style.

[Input]
- <FRAME_DESC>...</FRAME_DESC>: the target frame to be generated.
- <CANDIDATES>...</CANDIDATES>: numbered candidate descriptions.

[Output]
{format_instructions}

[Guidelines]
- Select AT MOST 6 candidates (fewer is better).
- Prefer the most recent prior-frame candidate that matches the target's camera
  and composition.
- For a character, pick AT MOST one reference image (front view by default).
- Avoid candidates that duplicate information already covered by other selected
  candidates.
- The text_prompt must reference candidates as "Image 0", "Image 1", ...,
  numbered by their position in `ref_image_indices` (NOT the original candidate
  index). Example: "Generate the frame using Image 0 as Alice's appearance and
  Image 1 as the background scene."
- Keep the text_prompt under 120 words; do not narrate the story, only describe
  the visual goal.
- Output language MUST match the frame description language.
""".strip()

HUMAN_PROMPT = """
<FRAME_DESC>
{frame_description}
</FRAME_DESC>

<CANDIDATES>
{candidates}
</CANDIDATES>
""".strip()


class _SelectorResponse(BaseModel):
    ref_image_indices: List[int] = Field(
        default_factory=list,
        description="0-based indices into the original candidate list, ordered by usefulness.",
    )
    text_prompt: str = Field(
        ...,
        description="Final prompt for the image generator, using 'Image N' to refer to selected refs.",
    )


class ReferenceImageSelector:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    async def select(
        self,
        candidates: List[Tuple[str, str]],
        frame_description: str,
    ) -> Tuple[List[Tuple[str, str]], str]:
        """Returns (selected_pairs, prompt). selected_pairs preserves order."""
        if not candidates:
            return [], frame_description

        # 截到 8 个，按时间顺序保留最近的
        clipped = candidates[-8:]
        cand_str = "\n".join(
            f"Image {i}: {desc}" for i, (_, desc) in enumerate(clipped)
        )

        out = await self.llm.chat_pydantic(
            system_prompt=SYSTEM_PROMPT,
            human_prompt=HUMAN_PROMPT.format(
                frame_description=frame_description.strip(),
                candidates=cand_str,
            ),
            model_cls=_SelectorResponse,
        )
        # 容错：去掉越界 / 重复的 idx，限制到 6
        seen = set()
        valid = []
        for i in out.ref_image_indices:
            if 0 <= i < len(clipped) and i not in seen:
                valid.append(i)
                seen.add(i)
            if len(valid) >= 6:
                break
        if not valid:
            # 如果模型啥都没选，至少留最近一张
            valid = [len(clipped) - 1]
        selected = [clipped[i] for i in valid]

        # 把"Image N"映射到 selected 顺序的前缀塞进 prompt 头
        prefix = "\n".join(f"Image {i}: {desc}" for i, (_, desc) in enumerate(selected))
        prompt = f"{prefix}\n\n{out.text_prompt.strip()}"
        return selected, prompt
