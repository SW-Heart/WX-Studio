import requests
import os
from dotenv import load_dotenv
import time

load_dotenv()
key = os.getenv("TUZI_API_KEY")

headers = { "Authorization": f"Bearer {key}", "Content-Type": "application/json" }
payload = {
    "prompt": "生成一个位身着兔子 coser 服饰的美少女 艺术家正在将电脑屏幕上的图像手工复制到画布上，创作出一幅油画。然而，这张照片本身其实记录的正是这位艺术家在绘制那幅“递归图像”的过程。",
    "model": "gpt-image-2",
    "size": "1024x1024",
    "image": ["https://www.w3schools.com/html/img_girl.jpg"]
}

try:
    print("Sending user's exact prompt with an IMAGE (img2img)...")
    start = time.time()
    resp = requests.post("https://api.tu-zi.com/v1/images/generations", headers=headers, json=payload, timeout=600)
    print(f"Time taken: {time.time() - start:.2f} seconds")
    print(resp.status_code)
    print(resp.text)
except Exception as e:
    print(f"Time taken before error: {time.time() - start:.2f} seconds")
    print(f"Error: {repr(e)}")
