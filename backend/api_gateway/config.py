"""API Gateway 公共配置

PUBLIC_API_BASE：
  对外公开的 API base URL，用于生成 curl 示例、文档等。
  生产环境 export PUBLIC_API_BASE=https://aigcog.com
  如果未设置，回落到空字符串（前端会用自身 origin）。
"""
from __future__ import annotations

import os


def get_public_api_base() -> str:
    return (os.getenv("PUBLIC_API_BASE") or "").rstrip("/")
