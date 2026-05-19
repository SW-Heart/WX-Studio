"""Short Drama 模块

把 HKUDS/ViMax 的核心 agent 流程裁剪、移植到本项目，做"一句话 → 短剧视频"的功能。

设计原则：
- 不引入 langchain；LLM 用 httpx 直连 Tuzi /v1/chat/completions（claude-sonnet-4-6）。
- 图/视频生成全部走 backend.api_gateway.service.run_model_raw，自动复用 OSS/日志/限流。
- 任务状态持久化在 wx_data.json["drama_jobs"]（与现有锁共用）。
- 后台 asyncio worker 在 FastAPI startup 时启动。

Adapted from HKUDS/ViMax (MIT License).
"""

__all__ = []
