import json
import time
import os

DB_FILE = os.path.join(os.path.dirname(__file__), "wx_data.json")

def _atomic_write_json(path: str, data) -> None:
    tmp_path = f"{path}.tmp"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)

def main():
    if not os.path.exists(DB_FILE):
        print(f"Database not found at {DB_FILE}")
        return

    with open(DB_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    if "models_registry" not in data:
        data["models_registry"] = {}

    registry = data["models_registry"]
    
    tuzi_key = os.getenv("TUZI_API_KEY", "")

    # Claude Opus 4.7
    claude_id = "claude-opus-4-7"
    registry[claude_id] = {
        "id": claude_id,
        "display_name": "Claude Opus 4.7",
        "description": "Tuzi - 高级推理与长文本处理",
        "enabled": True,
        "adapter_type": "openai-compat",
        "supports": {"image": False, "video": False, "text": True},
        "upstream_api_key": tuzi_key,
        "config": {
            "endpoint": "https://tuzi-api.apifox.cn/346380647e0",
            "upstream_model": "claude-opus-4-7"
        },
        "pricing": {
            "mode": "per_token",
            "input_m_cost": 5,
            "output_m_cost": 25,
            "cache_hit_m_cost": 0.5,
            "exchange_rate": 100
        },
        "params_schema": [
            {"name": "model", "type": "string", "required": True, "description": "模型 ID"},
            {"name": "messages", "type": "array", "required": True, "description": "对话历史数组", "example": [{"role": "user", "content": "你好"}]},
            {"name": "stream", "type": "boolean", "required": False, "description": "是否开启流式返回", "default": False}
        ],
        "created_at": time.time(),
        "created_by": "system",
        "order": 10
    }

    # GPT 5.5
    gpt_id = "gpt-5.5"
    registry[gpt_id] = {
        "id": gpt_id,
        "display_name": "GPT 5.5",
        "description": "Tuzi - 旗舰逻辑与对话模型",
        "enabled": True,
        "adapter_type": "openai-compat",
        "supports": {"image": False, "video": False, "text": True},
        "upstream_api_key": tuzi_key,
        "config": {
            "endpoint": "https://tuzi-api.apifox.cn/343647063e0",
            "upstream_model": "gpt-5.5"
        },
        "pricing": {
            "mode": "per_token",
            "input_m_cost": 5,
            "output_m_cost": 30,
            "exchange_rate": 100
        },
        "params_schema": [
            {"name": "model", "type": "string", "required": True, "description": "模型 ID"},
            {"name": "messages", "type": "array", "required": True, "description": "对话历史数组", "example": [{"role": "user", "content": "你好"}]},
            {"name": "stream", "type": "boolean", "required": False, "description": "是否开启流式返回", "default": False}
        ],
        "created_at": time.time(),
        "created_by": "system",
        "order": 11
    }

    _atomic_write_json(DB_FILE, data)
    print("Models successfully added to wx_data.json")

if __name__ == "__main__":
    main()
