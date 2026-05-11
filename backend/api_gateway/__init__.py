"""API Gateway 模块

职责：
- 对外提供 OpenAI 兼容的 API 端点（/v1/images/generations 等）
- 用 sk-xxx 格式的 API Key 认证
- 统一计费（复用现有 deduct_quota_atomic / refund_quota）
- 记录请求日志
- Admin 可通过配置注册新模型（无需改代码），协议不同则需新增 Adapter 类

模块导出的 router 由 main.py 负责 include。
"""
