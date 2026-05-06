import requests
import os
from dotenv import load_dotenv

load_dotenv()
key = os.getenv("TUZI_API_KEY")

headers = { "Authorization": f"Bearer {key}", "Content-Type": "application/json" }
payload = {
    "prompt": "a simple red apple",
    "model": "gpt-image-2",
    "size": "1024x1024"
}

try:
    print("Sending request exactly like main.py...")
    resp = requests.post("https://api.tu-zi.com/v1/images/generations", headers=headers, json=payload, timeout=600)
    print(resp.status_code)
    print(resp.text)
except Exception as e:
    print(f"Error: {repr(e)}")
