"""Short Drama Pipeline (Adapted from HKUDS/ViMax, MIT License)

支持两种模式：
- auto: 全自动，提交后一口气跑完
- directed: 导演模式，在 step 1/2/3/4 后暂停等用户确认

积分策略：
- LLM 调用：每次实时扣 llm_cost_per_call
- 图片生成：每次实时扣（走 run_model_raw，由网关 pricing 决定）
- 视频生成：第 5 步（decompose 完成后）知道镜头数，一次性预扣后续所有视频积分
  - 成功后核销；失败/取消退还未消耗部分

图/视频均支持 3 次重试（在 render.py 层实现）。
"""

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

from . import storage as drama_storage
from .agents import (
    CharacterExtractor,
    PortraitGenerator,
    ReferenceImageSelector,
    Screenwriter,
    StoryboardArtist,
)
from .compositor import concat_videos
from .config import ASPECT_RATIO_PRESETS, CFG, DEFAULT_ASPECT_RATIO
from .interfaces import (
    CharacterInScene,
    CharacterPortrait,
    JobStatus,
    ShotDescription,
)
from .llm import LLMClient
from .render import RenderError, download_to, generate_image, generate_video

logger = logging.getLogger(__name__)


class CanceledError(Exception):
    pass


class PipelineError(Exception):
    pass


class ShortDramaPipeline:
    def __init__(self, llm_api_key: str):
        if not llm_api_key:
            raise ValueError("ShortDramaPipeline requires Tuzi llm_api_key")
        self.llm = LLMClient(api_key=llm_api_key)

    # ============== 主入口 ==============

    async def run(self, job: Dict[str, Any], confirm_events: Dict[str, asyncio.Event]) -> str:
        """执行流水线，返回最终视频 OSS URL。

        confirm_events: job_id -> Event，导演模式下 worker 在暂停点 await 此 event。
        """
        job_id: str = job["id"]
        username: str = job["username"]
        idea: str = job["inputs"]["idea"]
        user_requirement: str = job["inputs"].get("user_requirement", "") or ""
        style: str = job["inputs"].get("style", "") or "Photorealistic, cinematic"
        mode: str = job["inputs"].get("mode", "auto") or "auto"
        aspect_ratio: str = job["inputs"].get("aspect_ratio", DEFAULT_ASPECT_RATIO) or DEFAULT_ASPECT_RATIO
        shot_count: int = int(job["inputs"].get("shot_count", 8) or 8)

        # 解析画幅
        ar = ASPECT_RATIO_PRESETS.get(aspect_ratio, ASPECT_RATIO_PRESETS[DEFAULT_ASPECT_RATIO])
        frame_size = ar["frame_size"]
        video_size = ar["video_size"]

        work_dir = _job_work_dir(job_id)
        os.makedirs(work_dir, exist_ok=True)

        is_directed = (mode == "directed")

        # ---- 1. 剧本 ----
        while True:
            self._step(job_id, JobStatus.WRITING, "writing script", 5)
            self._charge_llm(username, job_id)
            screenwriter = Screenwriter(self.llm)
            # 读取可能被用户修改过的 requirement（含 feedback）
            user_requirement = self._get_effective_requirement(job_id, user_requirement)
            script = await screenwriter.write(idea=idea, user_requirement=user_requirement, style=style)
            drama_storage.update_job(job_id, {"artifacts": {"script": script}})
            self._check_canceled(job_id)
            if not is_directed:
                break
            action = await self._wait_confirm(job_id, confirm_events, "script_ready")
            if action == "continue":
                break
            # regenerate: 读取用户 feedback，循环重跑
            user_requirement = self._get_effective_requirement(job_id, user_requirement)

        # ---- 2. 角色 + 3. 立绘 ----
        while True:
            self._step(job_id, JobStatus.CASTING, "extracting characters", 15)
            self._charge_llm(username, job_id)
            script = self._get_artifact(job_id, "script") or script
            ce = CharacterExtractor(self.llm)
            characters = await ce.extract(script)
            if not characters:
                raise PipelineError("character extraction returned empty list")
            drama_storage.update_job(job_id, {
                "artifacts": {"characters": [c.dict() for c in characters]},
            })
            self._check_canceled(job_id)

            # 生成立绘
            self._step(job_id, JobStatus.CASTING, "generating portraits", 20)
            portraits = await self._generate_portraits(
                characters, style, username=username, job_id=job_id
            )
            drama_storage.update_job(job_id, {
                "artifacts": {"portraits": {k: v.dict() for k, v in portraits.items()}},
            })
            for p in portraits.values():
                drama_storage.append_preview(job_id, p.front_url)
            self._check_canceled(job_id)

            if not is_directed:
                break
            action = await self._wait_confirm(job_id, confirm_events, "portraits_ready")
            if action == "continue":
                break
            # regenerate: 重跑角色+立绘
            user_requirement = self._get_effective_requirement(job_id, user_requirement)

        # ---- 4. 分镜 ----
        while True:
            self._step(job_id, JobStatus.STORYBOARDING, "designing storyboard", 35)
            self._charge_llm(username, job_id)
            sa = StoryboardArtist(self.llm)
            user_requirement = self._get_effective_requirement(job_id, user_requirement)
            brief_shots = await sa.design(script=script, characters=characters,
                                          user_requirement=user_requirement,
                                          shot_count=shot_count)
            if not brief_shots:
                raise PipelineError("storyboard returned empty")
            drama_storage.update_job(job_id, {
                "artifacts": {"storyboard": [s.dict() for s in brief_shots]},
            })
            self._check_canceled(job_id)

            if not is_directed:
                break
            action = await self._wait_confirm(job_id, confirm_events, "storyboard_ready")
            if action == "continue":
                break
            user_requirement = self._get_effective_requirement(job_id, user_requirement)

        # ---- 5. 拆解 first/last/motion ----
        self._step(job_id, JobStatus.DECOMPOSING, "decomposing shots", 45)
        # 每个镜头一次 LLM 调用
        for _ in brief_shots:
            self._charge_llm(username, job_id)
        shots = await sa.decompose_all(brief_shots, characters)
        drama_storage.update_job(job_id, {
            "artifacts": {"shots": [s.dict() for s in shots]},
        })
        self._check_canceled(job_id)

        # ---- 第 5 步完成：预扣后续积分（首帧 + 视频）----
        n_shots = len(shots)
        video_total_cost = n_shots * CFG.video_cost_per_call
        frame_total_cost = n_shots * CFG.image_cost_per_call
        remaining_cost = video_total_cost + frame_total_cost
        self._reserve_quota(username, remaining_cost, job_id)
        drama_storage.update_job(job_id, {
            "quota_reserved": remaining_cost,
            "artifacts": {"estimated_remaining_cost": remaining_cost},
        })

        # ---- 6. 出首帧 ----
        self._step(job_id, JobStatus.FRAMING, "rendering first frames", 55)
        first_frame_urls = await self._render_first_frames(
            shots=shots,
            characters=characters,
            portraits=portraits,
            frame_size=frame_size,
            username=username,
            job_id=job_id,
        )
        self._update_shot_field(job_id, shots, first_frame_urls, "first_frame_url")
        for u in first_frame_urls:
            drama_storage.append_preview(job_id, u)
        self._check_canceled(job_id)

        # ---- 7. 出视频片段 ----
        self._step(job_id, JobStatus.FILMING, "rendering video clips", 70)
        clip_urls = await self._render_clips(
            shots=shots,
            first_frame_urls=first_frame_urls,
            video_size=video_size,
            username=username,
            job_id=job_id,
        )
        self._update_shot_field(job_id, shots, clip_urls, "clip_url")
        self._check_canceled(job_id)

        # ---- 8. 拼接 ----
        self._step(job_id, JobStatus.COMPOSING, "composing final video", 90)
        local_clip_paths: List[str] = []
        for i, url in enumerate(clip_urls):
            dest = os.path.join(work_dir, "clips", f"shot_{i}.mp4")
            await download_to(url, dest)
            local_clip_paths.append(dest)
        final_local = os.path.join(work_dir, "final.mp4")
        await concat_videos(local_clip_paths, final_local)
        final_url = await self._upload_final(final_local)

        # 核销预扣（实际消耗 = 预扣，因为重试不额外扣费——重试走的是 run_model_raw 不扣用户配额）
        # 注意：run_model_raw 不扣用户配额，所以这里的"预扣"是我们自己管理的
        self._finalize_quota(username, remaining_cost, job_id)

        drama_storage.update_job(job_id, {
            "artifacts": {"final_video_url": final_url},
            "status": JobStatus.DONE,
            "progress": 100,
            "current_step": "done",
            "quota_charged": self._get_total_charged(job_id),
        })
        return final_url

    # ============== 导演模式暂停 ==============

    async def _wait_confirm(self, job_id: str, confirm_events: Dict[str, asyncio.Event], checkpoint: str) -> str:
        """暂停等用户确认。返回 action: "continue" | "regenerate"。"""
        drama_storage.update_job(job_id, {
            "status": JobStatus.AWAITING_CONFIRM,
            "current_step": f"awaiting:{checkpoint}",
            "confirm_action": None,
            "confirm_feedback": None,
        })
        event = confirm_events.get(job_id)
        if not event:
            event = asyncio.Event()
            confirm_events[job_id] = event
        else:
            event.clear()

        try:
            await asyncio.wait_for(event.wait(), timeout=CFG.confirm_timeout)
        except asyncio.TimeoutError:
            logger.info("job %s confirm timeout at %s, auto-continuing", job_id, checkpoint)
            return "continue"

        self._check_canceled(job_id)

        # 读取用户选择的 action
        j = drama_storage.get_job(job_id)
        action = (j or {}).get("confirm_action", "continue") or "continue"
        return action

    def _get_effective_requirement(self, job_id: str, base_requirement: str) -> str:
        """合并用户原始 requirement + 导演模式的 feedback"""
        j = drama_storage.get_job(job_id)
        feedback = (j or {}).get("confirm_feedback", "") or ""
        if feedback:
            return f"{base_requirement}\n\n[Director feedback]: {feedback}".strip()
        return base_requirement

    # ============== 积分管理 ==============

    def _charge_llm(self, username: str, job_id: str) -> None:
        """实时扣 LLM 积分"""
        cost = CFG.llm_cost_per_call
        if cost <= 0:
            return
        try:
            self._deduct(username, cost, job_id, reason="drama:llm")
        except Exception as e:
            raise PipelineError(f"quota insufficient for LLM: {e}") from e

    def _reserve_quota(self, username: str, amount: int, job_id: str) -> None:
        """一次性预扣后续积分"""
        if amount <= 0:
            return
        try:
            self._deduct(username, amount, job_id, reason="drama:reserve_render")
        except Exception as e:
            raise PipelineError(f"quota insufficient for rendering ({amount} needed): {e}") from e

    def _finalize_quota(self, username: str, amount: int, job_id: str) -> None:
        """核销：预扣已经扣了，这里只做记录"""
        # 实际上 _reserve_quota 已经扣了用户余额，这里不需要再扣
        # 如果有部分退还逻辑（比如某些镜头跳过了），在这里 refund
        pass

    def _refund_remaining(self, username: str, amount: int, job_id: str) -> None:
        """失败/取消时退还预扣"""
        if amount <= 0:
            return
        try:
            _deps_mod = self._get_deps()
            _deps_mod.refund_quota(username, amount)
            logger.info("refunded %d to %s for job %s", amount, username, job_id)
        except Exception as e:
            logger.error("refund failed for job %s: %s", job_id, e)

    def _deduct(self, username: str, amount: int, job_id: str, reason: str = "") -> int:
        _deps_mod = self._get_deps()
        return _deps_mod.deduct_quota(username, amount, model="short-drama", reason=reason)

    def _get_deps(self):
        try:
            from backend.api_gateway import deps
        except ImportError:
            from api_gateway import deps
        return deps

    def _get_total_charged(self, job_id: str) -> int:
        j = drama_storage.get_job(job_id)
        return int((j or {}).get("quota_charged", 0))

    # ============== 子步骤 ==============

    async def _generate_portraits(
        self,
        characters: List[CharacterInScene],
        style: str,
        *,
        username: str,
        job_id: str,
    ) -> Dict[str, CharacterPortrait]:
        sem = asyncio.Semaphore(CFG.max_inflight_per_job)
        out: Dict[str, CharacterPortrait] = {}
        gen = PortraitGenerator(username=username, job_id=job_id)

        async def _one(c: CharacterInScene) -> Tuple[str, CharacterPortrait]:
            async with sem:
                self._check_canceled(job_id)
                # 图片积分实时扣（每张立绘）
                self._deduct(username, CFG.image_cost_per_call, job_id, reason="drama:portrait")
                p = await gen.generate_front(c, style=style)
                return c.identifier_in_scene, p

        results = await asyncio.gather(
            *[_one(c) for c in characters if c.is_visible],
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, Exception):
                raise PipelineError(f"portrait generation failed: {r}") from r
            ident, portrait = r
            out[ident] = portrait
        return out

    async def _render_first_frames(
        self,
        shots: List[ShotDescription],
        characters: List[CharacterInScene],
        portraits: Dict[str, CharacterPortrait],
        frame_size: str,
        *,
        username: str,
        job_id: str,
    ) -> List[str]:
        """分批并行渲染首帧。

        策略：每 3 个镜头一组并行生成。同组内的镜头共享前面所有组的结果作为参考。
        这样 12 个镜头只需 4 轮 × 50 秒 ≈ 3-4 分钟，而不是 12 × 50 秒 = 10 分钟。
        """
        selector = ReferenceImageSelector(self.llm)
        prior_frames: List[Tuple[str, str]] = []  # (url, desc) 已完成的所有帧
        out: List[str] = []
        batch_size = CFG.max_inflight_per_job  # 默认 3

        for batch_start in range(0, len(shots), batch_size):
            batch = shots[batch_start : batch_start + batch_size]
            self._check_canceled(job_id)

            # 为这一批的每个镜头准备候选 + prompt
            async def _gen_one(s: ShotDescription) -> Tuple[int, str]:
                # LLM 调用（selector）
                self._charge_llm(username, job_id)
                candidates: List[Tuple[str, str]] = []
                for cidx in s.ff_vis_char_idxs:
                    if 0 <= cidx < len(characters):
                        ident = characters[cidx].identifier_in_scene
                        p = portraits.get(ident)
                        if p:
                            candidates.append((p.front_url, p.description))
                candidates.extend(prior_frames)

                selected, prompt = await selector.select(candidates, s.ff_desc)
                ref_urls = [u for (u, _) in selected]

                result = await generate_image(
                    prompt=prompt,
                    reference_image_paths=ref_urls,
                    size=frame_size,
                    username=username,
                    job_id=job_id,
                )
                return s.idx, result.url

            # 并行执行这一批
            results = await asyncio.gather(*[_gen_one(s) for s in batch])

            # 按 idx 排序，加入 prior_frames
            for idx, url in sorted(results, key=lambda x: x[0]):
                out.append(url)
                s = shots[idx]
                prior_frames.append((
                    url,
                    f"[Camera {s.cam_idx}] Shot {s.idx}: {s.ff_desc[:200]}",
                ))

        return out

    async def _render_clips(
        self,
        shots: List[ShotDescription],
        first_frame_urls: List[str],
        video_size: str,
        *,
        username: str,
        job_id: str,
    ) -> List[str]:
        """视频片段并行"""
        sem = asyncio.Semaphore(CFG.max_inflight_per_job)

        async def _one(s: ShotDescription, ff_url: str) -> str:
            async with sem:
                self._check_canceled(job_id)
                prompt = s.motion_desc.strip()
                if s.audio_desc:
                    prompt += "\n" + s.audio_desc.strip()
                result = await generate_video(
                    prompt=prompt,
                    reference_image_paths=[ff_url],
                    size=video_size,
                    seconds=CFG.video_seconds,
                    username=username,
                    job_id=job_id,
                )
                return result.url

        results = await asyncio.gather(
            *[_one(s, ff) for s, ff in zip(shots, first_frame_urls)]
        )
        return list(results)

    # ============== 工具 ==============

    def _step(self, job_id: str, status: str, current_step: str, progress: int) -> None:
        drama_storage.update_job(job_id, {
            "status": status,
            "current_step": current_step,
            "progress": progress,
        })

    def _check_canceled(self, job_id: str) -> None:
        if drama_storage.is_canceled(job_id):
            raise CanceledError(f"job {job_id} was canceled")

    def _get_artifact(self, job_id: str, key: str):
        j = drama_storage.get_job(job_id)
        return (j or {}).get("artifacts", {}).get(key)

    def _reload_characters(self, job_id: str) -> Optional[List[CharacterInScene]]:
        raw = self._get_artifact(job_id, "characters")
        if not raw:
            return None
        return [CharacterInScene.parse_obj(c) for c in raw]

    def _reload_storyboard(self, job_id: str):
        from .interfaces import ShotBriefDescription
        raw = self._get_artifact(job_id, "storyboard")
        if not raw:
            return None
        return [ShotBriefDescription.parse_obj(s) for s in raw]

    def _update_shot_field(self, job_id: str, shots: List[ShotDescription],
                           urls: List[str], field: str) -> None:
        j = drama_storage.get_job(job_id)
        if not j:
            return
        shot_dicts = j.get("artifacts", {}).get("shots", [])
        for s, url in zip(shots, urls):
            for sd in shot_dicts:
                if sd.get("idx") == s.idx:
                    sd[field] = url
        drama_storage.update_job(job_id, {"artifacts": {"shots": shot_dicts}})

    async def _upload_final(self, local_path: str) -> str:
        _deps_mod = self._get_deps()
        with open(local_path, "rb") as f:
            data = f.read()
        return await asyncio.to_thread(_deps_mod.upload_bytes_to_oss, data, ".mp4")


def _job_work_dir(job_id: str) -> str:
    return os.path.join(CFG.working_root, job_id)
