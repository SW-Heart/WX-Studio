"""HTTP 路由：/api/drama/*

支持：
- POST /jobs          创建任务（mode: auto/directed, aspect_ratio: 9:16/16:9/1:1）
- GET  /jobs          列表
- GET  /jobs/{id}     详情
- POST /jobs/{id}/cancel   取消
- POST /jobs/{id}/confirm  导演模式确认继续
- POST /jobs/{id}/patch    导演模式修改中间产物
- GET  /meta          配置元信息
- GET  /admin/jobs    管理员全量列表
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel

from . import storage as drama_storage
from . import worker as drama_worker
from .config import ASPECT_RATIO_PRESETS, CFG, DEFAULT_ASPECT_RATIO


# ============== Schemas ==============

class CreateJobReq(BaseModel):
    idea: str
    user_requirement: Optional[str] = ""
    style: Optional[str] = ""
    mode: Optional[str] = "auto"          # "auto" | "directed"
    aspect_ratio: Optional[str] = "9:16"  # "9:16" | "16:9" | "1:1"
    shot_count: Optional[int] = 8         # 用户选择的镜头数量（3-12）


class CreateJobResp(BaseModel):
    job_id: str
    status: str


class PatchArtifactsReq(BaseModel):
    """导演模式下用户修改中间产物"""
    script: Optional[str] = None
    characters: Optional[List[Dict[str, Any]]] = None
    storyboard: Optional[List[Dict[str, Any]]] = None


# ============== Helpers ==============

def _ensure_user(authed) -> str:
    if isinstance(authed, dict):
        return authed.get("username") or authed.get("user") or ""
    return str(authed)


# ============== Router 工厂 ==============

def build_router(*, get_current_user, get_admin_user) -> APIRouter:
    r = APIRouter(prefix="/api/drama", tags=["short-drama"])

    # ---- 创建任务 ----
    @r.post("/jobs", response_model=CreateJobResp)
    async def create_job(body: CreateJobReq, authed=Depends(get_current_user)):
        username = _ensure_user(authed)
        if not username:
            raise HTTPException(401, "login required")
        if not body.idea or not body.idea.strip():
            raise HTTPException(400, "idea cannot be empty")

        # 验证 mode
        mode = (body.mode or "auto").strip().lower()
        if mode not in ("auto", "directed"):
            mode = "auto"

        # 验证 aspect_ratio
        ar = (body.aspect_ratio or DEFAULT_ASPECT_RATIO).strip()
        if ar not in ASPECT_RATIO_PRESETS:
            ar = DEFAULT_ASPECT_RATIO

        # 验证 shot_count
        shot_count = body.shot_count or 8
        shot_count = max(3, min(CFG.max_shots, shot_count))

        # 单用户并发上限
        running = drama_storage.count_running_jobs(username=username)
        if running >= CFG.max_concurrent_jobs_per_user:
            raise HTTPException(429, f"you already have {running} running drama job(s); please wait")

        job = drama_storage.create_job(
            username=username,
            idea=body.idea.strip(),
            user_requirement=(body.user_requirement or "").strip(),
            style=(body.style or "").strip(),
            mode=mode,
            aspect_ratio=ar,
            shot_count=shot_count,
            quota_reserved=0,
        )
        drama_worker.enqueue(job["id"])
        drama_storage.gc_user_history(username)
        return CreateJobResp(job_id=job["id"], status=job["status"])

    # ---- 列表 ----
    @r.get("/jobs")
    async def list_jobs(limit: int = 50, status: Optional[str] = None,
                        authed=Depends(get_current_user)):
        username = _ensure_user(authed)
        items = drama_storage.list_jobs(username=username, limit=limit, status=status)
        return {"items": [_summarize(j) for j in items]}

    # ---- 详情 ----
    @r.get("/jobs/{job_id}")
    async def get_job(job_id: str, authed=Depends(get_current_user)):
        username = _ensure_user(authed)
        j = drama_storage.get_job(job_id)
        if not j:
            raise HTTPException(404, "job not found")
        if j.get("username") != username:
            raise HTTPException(403, "not your job")
        return j

    # ---- 取消 ----
    @r.post("/jobs/{job_id}/cancel")
    async def cancel_job(job_id: str, authed=Depends(get_current_user)):
        username = _ensure_user(authed)
        try:
            j = drama_storage.cancel_job(job_id, owner=username)
        except PermissionError:
            raise HTTPException(403, "not your job")
        if not j:
            raise HTTPException(404, "job not found")
        return {"id": job_id, "status": j["status"]}

    # ---- 导演模式：确认继续 ----
    @r.post("/jobs/{job_id}/confirm")
    async def confirm_job(job_id: str, body: Dict[str, Any] = None,
                          authed=Depends(get_current_user)):
        username = _ensure_user(authed)
        j = drama_storage.get_job(job_id)
        if not j:
            raise HTTPException(404, "job not found")
        if j.get("username") != username:
            raise HTTPException(403, "not your job")
        if j.get("status") != "awaiting_confirm":
            raise HTTPException(400, f"job is not awaiting confirmation (status={j.get('status')})")
        body = body or {}
        action = body.get("action", "continue")  # "continue" | "regenerate"
        feedback = body.get("feedback", "")
        drama_worker.confirm_job(job_id, action=action, feedback=feedback)
        return {"id": job_id, "confirmed": True, "action": action}

    # ---- 导演模式：修改中间产物 ----
    @r.post("/jobs/{job_id}/patch")
    async def patch_artifacts(job_id: str, body: PatchArtifactsReq,
                              authed=Depends(get_current_user)):
        username = _ensure_user(authed)
        j = drama_storage.get_job(job_id)
        if not j:
            raise HTTPException(404, "job not found")
        if j.get("username") != username:
            raise HTTPException(403, "not your job")
        if j.get("status") != "awaiting_confirm":
            raise HTTPException(400, "can only patch while awaiting confirmation")

        patch: Dict[str, Any] = {}
        if body.script is not None:
            patch["script"] = body.script
        if body.characters is not None:
            patch["characters"] = body.characters
        if body.storyboard is not None:
            patch["storyboard"] = body.storyboard
        if patch:
            drama_storage.update_job(job_id, {"artifacts": patch})
        return {"id": job_id, "patched": list(patch.keys())}

    # ---- 配置元信息 ----
    @r.get("/meta")
    async def meta(authed=Depends(get_current_user)):
        return {
            "max_shots": CFG.max_shots,
            "max_characters": CFG.max_characters,
            "max_concurrent_jobs_per_user": CFG.max_concurrent_jobs_per_user,
            "video_seconds": CFG.video_seconds,
            "image_model": CFG.image_model_id,
            "video_model": CFG.video_model_id,
            "aspect_ratios": {
                k: {"label_zh": v["label_zh"], "label_en": v["label_en"]}
                for k, v in ASPECT_RATIO_PRESETS.items()
            },
            "default_aspect_ratio": DEFAULT_ASPECT_RATIO,
            "modes": ["auto", "directed"],
            "costs": {
                "llm_per_call": CFG.llm_cost_per_call,
                "image_per_call": CFG.image_cost_per_call,
                "video_per_call": CFG.video_cost_per_call,
            },
        }

    # ---- Admin 全量列表 ----
    @r.get("/admin/jobs")
    async def admin_list(limit: int = 100, status: Optional[str] = None,
                         authed=Depends(get_admin_user)):
        items = drama_storage.list_jobs(username=None, limit=limit, status=status)
        return {"items": [_summarize(j) for j in items]}

    return r


# ============== 内部工具 ==============

def _summarize(j: Dict[str, Any]) -> Dict[str, Any]:
    artifacts = j.get("artifacts") or {}
    return {
        "id": j.get("id"),
        "username": j.get("username"),
        "status": j.get("status"),
        "progress": j.get("progress", 0),
        "current_step": j.get("current_step"),
        "created_at": j.get("created_at"),
        "updated_at": j.get("updated_at"),
        "inputs": j.get("inputs") or {},
        "final_video_url": artifacts.get("final_video_url"),
        "preview_count": len(j.get("preview_urls") or []),
        "error": j.get("error"),
        "quota_reserved": j.get("quota_reserved", 0),
        "quota_charged": j.get("quota_charged", 0),
    }
