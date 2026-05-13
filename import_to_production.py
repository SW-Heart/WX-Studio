import json
import os

db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend", "wx_data.json")

if not os.path.exists(db_path):
    print("线上数据库不存在，请确保在根目录执行或启动过一次后端。")
    exit(1)

with open(db_path, "r", encoding="utf-8") as f:
    db = json.load(f)

models_to_inject = {
    "gpt-image-2": {
        "adapter_type": "tuzi-image",
        "upstream_api_key": "sk-pB4HTnKHHVPp9t20wpdLiLk4tz0MTF4BxC2j7UIwT7LetWF2",
        "description": "基础生图模型，支持图生图与多尺寸输出",
        "enabled": true,
        "supports": {
            "image": true
        },
        "pricing": {
            "mode": "per_image",
            "cost": 7
        },
        "config": {
            "upstream_model": "gpt-image-2",
            "concurrent_n": true
        },
        "updated_at": 1778559023.615284,
        "updated_by": "admin",
        "created_at": 1778472543.926324,
        "created_by": "system",
        "display_name": "GPT Image 2",
        "channel": "ttapi",
        "visible": true,
        "params_schema": [
            {
                "name": "model",
                "type": "string",
                "required": true,
                "description": "模型 ID（使用卡片上显示的值）"
            },
            {
                "name": "prompt",
                "type": "string",
                "required": true,
                "description": "文本提示词，描述你想生成的内容",
                "example": "一只猫坐在书上，影棚灯光"
            },
            {
                "name": "image",
                "type": "string[] | string",
                "required": false,
                "description": "参考图 URL（支持传入 1 张或多张 HTTPS 链接，用于图生图）"
            },
            {
                "name": "size",
                "type": "string",
                "required": false,
                "description": "输出尺寸。该模型仅支持 1K 分辨率，如 1024x1024、1536x1024 等（总像素不超过约 1M）。",
                "example": "1024x1024"
            },
            {
                "name": "n",
                "type": "number",
                "required": false,
                "default": 1,
                "description": "生成数量（1-10），每张独立计费"
            }
        ],
        "order": 0
    },
    "gpt-image-2-pro": {
        "adapter_type": "ttapi-image",
        "upstream_api_key": "d6b0660c-6f2e-4cee-a64d-764960fd71c6",
        "description": "Pro 专业级生图模型（异步，支持任意尺寸）",
        "enabled": true,
        "supports": {
            "image": true
        },
        "pricing": {
            "mode": "per_image",
            "cost": 22
        },
        "config": {
            "upstream_model": "gpt-image-2-plus"
        },
        "updated_at": 1778516437.2846432,
        "updated_by": "system-migration",
        "created_at": 1778472543.929448,
        "created_by": "system",
        "display_name": "GPT Image 2 Pro",
        "channel": "ttapi",
        "visible": true,
        "order": 2
    },
    "midjourney": {
        "adapter_type": "ttapi-mj",
        "upstream_api_key": "d6b0660c-6f2e-4cee-a64d-764960fd71c6",
        "description": "Midjourney 图像生成，每次输出 4 张子图",
        "enabled": true,
        "supports": {
            "image": true
        },
        "pricing": {
            "mode": "by_mode",
            "by_mode": {
                "relax": 22,
                "fast": 42,
                "turbo": 62
            }
        },
        "config": {
            "mode": "fast",
            "poll_timeout": 1200,
            "max_images": 4
        },
        "updated_at": 1778516437.286122,
        "updated_by": "system-migration",
        "created_at": 1778472543.930636,
        "created_by": "system",
        "display_name": "Midjourney",
        "channel": "ttapi",
        "visible": true,
        "order": 3
    },
    "veo3.1-4k": {
        "adapter_type": "tuzi-video",
        "upstream_api_key": "sk-pB4HTnKHHVPp9t20wpdLiLk4tz0MTF4BxC2j7UIwT7LetWF2",
        "description": "Tuzi 视频生成（异步）",
        "enabled": false,
        "supports": {
            "video": true
        },
        "pricing": {
            "mode": "per_call",
            "cost": 5
        },
        "config": {
            "upstream_model": "veo3.1-4k",
            "use_multipart": true
        },
        "updated_at": 1778517373.9880261,
        "updated_by": "admin",
        "created_at": 1778472543.932974,
        "created_by": "system",
        "display_name": "Veo 3.1 (4K)",
        "channel": "tuzi-default",
        "visible": false,
        "order": 7
    },
    "gpt-image-2-high": {
        "adapter_type": "tuzi-image",
        "upstream_api_key": "sk-pB4HTnKHHVPp9t20wpdLiLk4tz0MTF4BxC2j7UIwT7LetWF2",
        "description": "高清生图模型，4K 以上尺寸自动加价",
        "enabled": true,
        "supports": {
            "image": true
        },
        "pricing": {
            "mode": "per_image",
            "cost": 13
        },
        "config": {
            "upstream_model": "gpt-image-2",
            "concurrent_n": true
        },
        "updated_by": "admin",
        "created_by": "system",
        "display_name": "GPT Image 2 High",
        "channel": "ttapi",
        "updated_at": 1778559032.929037,
        "created_at": 1778480522.723854,
        "visible": true,
        "order": 1
    },
    "nano-banana-2": {
        "adapter_type": "tuzi-image",
        "upstream_api_key": "sk-pB4HTnKHHVPp9t20wpdLiLk4tz0MTF4BxC2j7UIwT7LetWF2",
        "display_name": "Nano Banana 2 (1K)",
        "channel": "tuzi-default",
        "visible": true,
        "description": "Gemini 3.1 Flash Image Preview · 1K 标清输出（30 积分/张）",
        "enabled": true,
        "supports": {
            "image": true
        },
        "pricing": {
            "mode": "per_image",
            "cost": 30
        },
        "config": {
            "upstream_model": "gemini-3.1-flash-image-preview",
            "fixed_quality": "1k",
            "size_as_ratio": true,
            "concurrent_n": true
        },
        "params_schema": [
            {
                "name": "model",
                "type": "string",
                "required": true,
                "description": "模型 ID（使用卡片上显示的值）"
            },
            {
                "name": "prompt",
                "type": "string",
                "required": true,
                "description": "文本提示词，最长 1000 字符",
                "example": "一只猫坐在书上，影棚灯光"
            },
            {
                "name": "image",
                "type": "string[] | string",
                "required": false,
                "description": "参考图 URL（支持传入 1 张或多张 HTTPS 链接，用于图生图）"
            },
            {
                "name": "size",
                "type": "string",
                "required": false,
                "description": "画幅比例。可传 1x1 / 16x9 / 9x16 / 3x4 / 4x3 等；也可传 WxH 像素尺寸，服务端会就近转换为比例",
                "example": "1x1"
            },
            {
                "name": "n",
                "type": "number",
                "required": false,
                "default": 1,
                "description": "生成数量（1-10），每张独立计费（30 积分/张）"
            }
        ],
        "updated_at": 1778514278.724612,
        "updated_by": "system",
        "created_at": 1778514278.7246132,
        "created_by": "system",
        "order": 4
    },
    "nano-banana-2-2k": {
        "adapter_type": "tuzi-image",
        "upstream_api_key": "sk-pB4HTnKHHVPp9t20wpdLiLk4tz0MTF4BxC2j7UIwT7LetWF2",
        "display_name": "Nano Banana 2 (2K)",
        "channel": "tuzi-default",
        "visible": true,
        "description": "Gemini 3.1 Flash Image Preview · 2K 高清输出（30 积分/张）",
        "enabled": true,
        "supports": {
            "image": true
        },
        "pricing": {
            "mode": "per_image",
            "cost": 30
        },
        "config": {
            "upstream_model": "gemini-3.1-flash-image-preview",
            "fixed_quality": "2k",
            "size_as_ratio": true,
            "concurrent_n": true
        },
        "params_schema": [
            {
                "name": "model",
                "type": "string",
                "required": true,
                "description": "模型 ID（使用卡片上显示的值）"
            },
            {
                "name": "prompt",
                "type": "string",
                "required": true,
                "description": "文本提示词，最长 1000 字符",
                "example": "一只猫坐在书上，影棚灯光"
            },
            {
                "name": "image",
                "type": "string[] | string",
                "required": false,
                "description": "参考图 URL（支持传入 1 张或多张 HTTPS 链接，用于图生图）"
            },
            {
                "name": "size",
                "type": "string",
                "required": false,
                "description": "画幅比例。可传 1x1 / 16x9 / 9x16 / 3x4 / 4x3 等；也可传 WxH 像素尺寸，服务端会就近转换为比例",
                "example": "1x1"
            },
            {
                "name": "n",
                "type": "number",
                "required": false,
                "default": 1,
                "description": "生成数量（1-10），每张独立计费（30 积分/张）"
            }
        ],
        "updated_at": 1778514278.7266681,
        "updated_by": "system",
        "created_at": 1778514278.7266681,
        "created_by": "system",
        "order": 5
    },
    "nano-banana-2-4k": {
        "adapter_type": "tuzi-image",
        "upstream_api_key": "sk-pB4HTnKHHVPp9t20wpdLiLk4tz0MTF4BxC2j7UIwT7LetWF2",
        "display_name": "Nano Banana 2 (4K)",
        "channel": "tuzi-default",
        "visible": true,
        "description": "Gemini 3.1 Flash Image Preview · 4K 超清输出（30 积分/张）",
        "enabled": true,
        "supports": {
            "image": true
        },
        "pricing": {
            "mode": "per_image",
            "cost": 30
        },
        "config": {
            "upstream_model": "gemini-3.1-flash-image-preview",
            "fixed_quality": "4k",
            "size_as_ratio": true,
            "concurrent_n": true
        },
        "params_schema": [
            {
                "name": "model",
                "type": "string",
                "required": true,
                "description": "模型 ID（使用卡片上显示的值）"
            },
            {
                "name": "prompt",
                "type": "string",
                "required": true,
                "description": "文本提示词，最长 1000 字符",
                "example": "一只猫坐在书上，影棚灯光"
            },
            {
                "name": "image",
                "type": "string[] | string",
                "required": false,
                "description": "参考图 URL（支持传入 1 张或多张 HTTPS 链接，用于图生图）"
            },
            {
                "name": "size",
                "type": "string",
                "required": false,
                "description": "画幅比例。可传 1x1 / 16x9 / 9x16 / 3x4 / 4x3 等；也可传 WxH 像素尺寸，服务端会就近转换为比例",
                "example": "1x1"
            },
            {
                "name": "n",
                "type": "number",
                "required": false,
                "default": 1,
                "description": "生成数量（1-10），每张独立计费（30 积分/张）"
            }
        ],
        "updated_at": 1778514278.727982,
        "updated_by": "system",
        "created_at": 1778514278.727982,
        "created_by": "system",
        "order": 6
    },
    "claude-opus-4-7": {
        "id": "claude-opus-4-7",
        "display_name": "Claude Opus 4.7",
        "description": "Tuzi - 高级推理与长文本处理",
        "enabled": true,
        "adapter_type": "openai-compat",
        "supports": {
            "image": false,
            "video": false,
            "text": true
        },
        "upstream_api_key": "",
        "config": {
            "endpoint": "https://api.tu-zi.com/v1/chat/completions",
            "upstream_model": "claude-opus-4-7"
        },
        "pricing": {
            "mode": "per_token",
            "input_m_cost": 5,
            "output_m_cost": 25,
            "cache_hit_m_cost": 0.5,
            "exchange_rate": 100,
            "cache_write_m_cost": 6.25
        },
        "params_schema": [
            {
                "name": "model",
                "type": "string",
                "required": true,
                "description": "模型 ID"
            },
            {
                "name": "messages",
                "type": "array",
                "required": true,
                "description": "对话历史数组",
                "example": [
                    {
                        "role": "user",
                        "content": "你好"
                    }
                ]
            },
            {
                "name": "stream",
                "type": "boolean",
                "required": false,
                "description": "是否开启流式返回",
                "default": false
            }
        ],
        "created_at": 1778670135.691477,
        "created_by": "system",
        "order": 10,
        "updated_at": 1778673266.692823,
        "updated_by": "admin"
    },
    "gpt-5.5": {
        "id": "gpt-5.5",
        "display_name": "GPT 5.5",
        "description": "Tuzi - 旗舰逻辑与对话模型",
        "enabled": true,
        "adapter_type": "openai-compat",
        "supports": {
            "image": false,
            "video": false,
            "text": true
        },
        "upstream_api_key": "",
        "config": {
            "endpoint": "https://api.tu-zi.com/v1/chat/completions",
            "upstream_model": "gpt-5.5"
        },
        "pricing": {
            "mode": "per_token",
            "input_m_cost": 5,
            "output_m_cost": 30,
            "exchange_rate": 100
        },
        "params_schema": [
            {
                "name": "model",
                "type": "string",
                "required": true,
                "description": "模型 ID"
            },
            {
                "name": "messages",
                "type": "array",
                "required": true,
                "description": "对话历史数组",
                "example": [
                    {
                        "role": "user",
                        "content": "你好"
                    }
                ]
            },
            {
                "name": "stream",
                "type": "boolean",
                "required": false,
                "description": "是否开启流式返回",
                "default": false
            }
        ],
        "created_at": 1778670135.691478,
        "created_by": "system",
        "order": 11
    },
    "gemini-3.1-pro-preview": {
        "id": "gemini-3.1-pro-preview",
        "adapter_type": "openai-compat",
        "upstream_api_key": "",
        "display_name": "Gemini 3.1 Pro Preview",
        "channel": "Tuzi",
        "visible": true,
        "description": "Google 最先进的大语言模型",
        "enabled": true,
        "supports": {
            "text": true,
            "image": false,
            "video": false,
            "async": false
        },
        "pricing": {
            "mode": "per_token",
            "input_m_cost": 2.0,
            "output_m_cost": 12.0,
            "exchange_rate": 100
        },
        "config": {
            "upstream_model": "gemini-3.1-pro-preview",
            "endpoint": "https://api.tu-zi.com/v1/chat/completions",
            "timeout": 300
        }
    }
}

if "models_registry" not in db:
    db["models_registry"] = {}

# 增量/覆盖注入模型
for m_id, m_data in models_to_inject.items():
    db["models_registry"][m_id] = m_data

with open(db_path, "w", encoding="utf-8") as f:
    json.dump(db, f, indent=2, ensure_ascii=False)

print("✅ 线上模型数据恢复并同步完成！")
