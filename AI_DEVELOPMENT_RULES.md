# 🤖 AI Photo Studio - AI 接口开发规范与防坑指南

本文档用于防范在后续开发过程中（特别是针对多个不同 AI API 供应商的集成）出现低级混用错误。
**每次修改后端 API 接口时，无论是人类开发者还是 AI 代码助手，都请务必遵守以下准则！**

## 🚫 绝对禁止的“低级错误”

1. **跨厂商的 API Key 混用 (Fallback 污染)**
   - **错误示例**: `key = TUZI_API_KEY if TUZI_API_KEY else TT_API_KEY`
   - **原因**: Tuzi API (用于生成视频) 和 TT-API (用于生成图片) 是两套完全不同的服务体系。当某个环境缺失某个 Key 时，决不能用另一个厂商的 Key 去顶替兜底，这必然会导致 401/403 鉴权失败（例如报出 `Wrong API KEY`）。

2. **不同厂商的 Header 和 Auth 格式混用**
   - **错误示例**: 拿着 TT-API 的 Endpoint 请求，却塞入 `{"Authorization": f"Bearer {key}"}` 的 Header，或者反过来。
   - **正确规范**: 
     - **图片接口 (TT-API)**: 必须严格使用 `headers = { "TT-API-KEY": os.getenv("TT_API_KEY"), "Content-Type": "application/json" }`
     - **视频接口 (Tuzi)**: 必须严格使用 `headers = { "Authorization": f"Bearer {os.getenv('TUZI_API_KEY')}" }` (注意视频上传首帧图时使用了 multipart/form-data，不要手动指定 Content-Type，由 requests 自动管理 boundary)

## 🏗️ 环境变量与接口严格对应关系

为了保持代码的高内聚、低耦合，请在开发时严格遵守以下配置的绑定规则：

| 业务模块 | 供应商 | 环境变量名 | 请求 Endpoint | 鉴权 Header 格式 |
| :--- | :--- | :--- | :--- | :--- |
| **基础创作/修图/人像** | TT API | `TT_API_KEY` | `TT_ENDPOINT`<br>`TT_FETCH_ENDPOINT` | `{"TT-API-KEY": TT_API_KEY}` |
| **视频生成与处理** | Tuzi | `TUZI_API_KEY` | `TUZI_VIDEO_ENDPOINT` | `{"Authorization": "Bearer " + TUZI_API_KEY}` |

## 🛡️ 代码修改与变更原则

1. **正交扩展**: 每引入一个新的外部 AI 服务供应商，必须为其在 `.env` 中创建**独立**的环境变量，并编写**专属**的请求逻辑，严禁在原有的变量上做重载。
2. **拒绝强行复用**: 发给图片 API 的请求和发给视频 API 的请求，即使看起来参数有些相似，也建议封装成两个独立的请求函数。**严禁**在一个通用函数里写长串的 `if-else` 然后强行复用底层的 `requests.post()`，这非常容易引发 Headers 或 Payload 拼装错乱。
3. **修改隔离界限**: 如果当前的任务是修改图片相关路由（如 `/api/create`, `/api/portrait`），则**绝对不要**在此作用域内触碰、读取或引入视频相关的环境变量（如 `TUZI_API_KEY`）。

## 📝 致 AI Code Agents
如果你是辅助开发的 AI 助手，在对 `backend/main.py` 等后端文件执行增删改查操作时，**请将本文件视为第一优先级准则**。执行涉及到 `requests` 的代码生成前，请主动交叉核对目标 API 的厂商、需要的 Header 格式，不要张冠李戴。
