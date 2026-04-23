import requests
key = "sk-hMda4uAVTwm5zuuPcNdo3NzScMGLnMuwUHvGDlIn1PvDdrIP"
headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
payload = {
    "model": "veo3.1-components-4k",
    "prompt": "a dog playing in a park"
}
resp = requests.post("https://api.tu-zi.com/v1/videos", headers=headers, json=payload, timeout=30)
print(resp.status_code)
print(resp.text)
