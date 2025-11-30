import os
import uvicorn
import requests
import json
import uuid
import shutil
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta

# --- 1. 初始化配置 ---
load_dotenv()

# [请修改] 您的服务器公网 IP 或域名
SERVER_DOMAIN = "http://8.149.136.249"

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "default_secret_key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 
TT_API_KEY = os.getenv("TT_API_KEY")
# [注意] 确保这里的 URL 是纯净的，没有 Markdown 符号
TT_ENDPOINT = "https://api.ttapi.io/gemini/image/generate"
DB_FILE = "wx_data.json"

# 图片本地存储路径
UPLOAD_DIR = "/www/wx-studio/dist/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="WX Studio API")
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. 数据层 ---
def load_db():
    if not os.path.exists(DB_FILE):
        default_hash = pwd_context.hash("wxstudio2025")
        initial_data = {
            "users": {
                "admin": {"hash": default_hash, "quota": 9999, "role": "admin"}
            },
            "history": {}
        }
        save_db(initial_data)
        return initial_data
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {"users": {}, "history": {}}

def save_db(data):
    if os.path.exists(DB_FILE):
        shutil.copy(DB_FILE, f"{DB_FILE}.bak")
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# --- 3. 鉴权逻辑 ---
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="无效凭证")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="凭证已过期")

# --- 4. 业务 API ---

@app.post("/auth/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    db = load_db()
    user = db["users"].get(form_data.username)
    if not user or not verify_password(form_data.password, user["hash"]):
        raise HTTPException(status_code=400, detail="账号或密码错误")
    access_token = create_access_token(data={"sub": form_data.username})
    return {"access_token": access_token, "token_type": "bearer", "username": form_data.username, "quota": user["quota"]}

@app.get("/api/user/me")
async def get_user_info(username: str = Depends(get_current_user)):
    db = load_db()
    user = db["users"].get(username)
    if not user: raise HTTPException(status_code=404, detail="用户不存在")
    return {"username": username, "quota": user["quota"]}

# [上传] 本地存储
@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...), username: str = Depends(get_current_user)):
    try:
        file_ext = os.path.splitext(file.filename)[1]
        if not file_ext: file_ext = ".jpg"
        new_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(UPLOAD_DIR, new_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        # 返回拼接好 IP 的完整 URL
        full_url = f"{SERVER_DOMAIN}/uploads/{new_filename}"
        return {"status": "success", "url": full_url}
    except Exception as e:
        print(f"Local Upload Error: {e}")
        raise HTTPException(status_code=500, detail=f"文件保存失败: {str(e)}")

@app.get("/api/history")
async def get_history(username: str = Depends(get_current_user)):
    db = load_db()
    history = db["history"].get(username, [])
    history.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
    return history

# [下载工具函数] 下载远程图片到本地
def download_remote_image(remote_url):
    try:
        print(f"Downloading remote image: {remote_url}")
        r = requests.get(remote_url, stream=True, timeout=60)
        if r.status_code == 200:
            file_ext = ".png" # 假设是 PNG，也可以解析 Header
            new_filename = f"gen_{uuid.uuid4()}{file_ext}"
            file_path = os.path.join(UPLOAD_DIR, new_filename)
            with open(file_path, 'wb') as f:
                r.raw.decode_content = True
                shutil.copyfileobj(r.raw, f)
            print(f"Saved to: {file_path}")
            return f"{SERVER_DOMAIN}/uploads/{new_filename}"
        else:
            print(f"Remote download failed: {r.status_code}")
            return remote_url # 失败则降级返回原链接
    except Exception as e:
        print(f"Download exception: {e}")
        return remote_url

@app.post("/api/generate")
async def generate_image(
    prompt: str = Form(...),
    image_size: str = Form(...),
    ratio: str = Form(...),
    style: str = Form(...),
    image_url: str = Form(...),
    username: str = Depends(get_current_user)
):
    db = load_db()
    user_data = db["users"].get(username)
    if not user_data: raise HTTPException(status_code=401, detail="用户异常")
    if user_data["quota"] <= 0: raise HTTPException(status_code=403, detail="配额已用尽")

    full_prompt = f"{prompt}. Style: {style} aesthetic, professional photography, high quality. Ratio: {ratio}."
    headers = { "TT-API-KEY": TT_API_KEY, "Content-Type": "application/json" }
    payload = {
        "prompt": full_prompt, "mode": "gemini-3-pro-image-preview",
        "refer_images": [image_url], "image_size": image_size, "google_search": True
    }

    try:
        response = requests.post(TT_ENDPOINT, headers=headers, json=payload, timeout=120)
        if response.status_code != 200:
            print(f"TT-API Error: {response.text}")
            raise HTTPException(status_code=response.status_code, detail=f"AI 生成失败: {response.text}")
            
        api_res = response.json()
        if api_res.get("status") != "SUCCESS":
             raise HTTPException(status_code=500, detail=api_res.get("message", "Unknown API error"))

        raw_url = api_res['data']['image_url']
        
        # [核心优化] 后端立即下载图片到本地
        local_url = download_remote_image(raw_url)

        user_data["quota"] -= 1
        new_record = {
            "id": str(uuid.uuid4()), "image": local_url, "prompt": prompt,
            "timestamp": datetime.now().timestamp()
        }
        
        if username not in db["history"]: db["history"][username] = []
        db["history"][username].append(new_record)
        save_db(db)

        return {
            "status": "SUCCESS",
            "data": { "image_url": local_url, "history_item": new_record, "remaining_quota": user_data["quota"] }
        }

    except requests.exceptions.RequestException as e:
        print(f"Network Error: {e}")
        raise HTTPException(status_code=500, detail=f"网络请求失败: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
