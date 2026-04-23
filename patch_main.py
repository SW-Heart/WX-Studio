import re

with open('backend/main.py', 'r') as f:
    content = f.read()

# Add TUZI_API_KEY definition
if 'TUZI_API_KEY = os.getenv("TUZI_API_KEY")' not in content:
    content = content.replace(
        'TT_API_KEY = os.getenv("TT_API_KEY")',
        'TT_API_KEY = os.getenv("TT_API_KEY")\nTUZI_API_KEY = os.getenv("TUZI_API_KEY")'
    )

# Replace headers for TUZI
if 'headers = {"TT-API-KEY": TT_API_KEY, "Content-Type": "application/json"}' in content:
    # Notice Tuzi often uses standard Bearer token. I will fallback to TT_API_KEY if TUZI_API_KEY is not set.
    content = content.replace(
        'headers = {"TT-API-KEY": TT_API_KEY, "Content-Type": "application/json"}',
        'key = TUZI_API_KEY if TUZI_API_KEY else TT_API_KEY\n    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}'
    )

# Fix payload for referImages
old_payload = """        # 如果有图片，参考官方文档如果视频生成接受 referImages 或类似字段，我们就放入
        # 根据推测，如果它类似图生视频，可能是传入 referImages 或 image_url
        if image_list:
            payload["referImages"] = image_list"""

new_payload = """        # 视频接口支持首尾帧
        if len(image_list) > 0:
            payload["image_url"] = image_list[0] # 首帧
        if len(image_list) > 1:
            payload["image_tail_url"] = image_list[1] # 尾帧 (部分接口叫 image_end_url，如果报错请联系修改)"""

content = content.replace(old_payload, new_payload)

with open('backend/main.py', 'w') as f:
    f.write(content)
