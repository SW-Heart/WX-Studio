import os
import uvicorn
import requests
import cloudinary
import cloudinary.uploader
import json
import uuid
import shutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional, List, Dict
from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta

# --- 1. 初始化配置 ---
load_dotenv()

cloudinary.config( 
  cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"), 
  api_key = os.getenv("CLOUDINARY_API_KEY"), 
  api_secret = os.getenv("CLOUDINARY_API_SECRET"),
  secure = True
)

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7天
TT_API_KEY = os.getenv("TT_API_KEY")
TT_ENDPOINT = "https://api.ttapi.io/gemini/image/generate"
DB_FILE = "wx_data.json"

app = FastAPI(title="WX Studio API")

# [关键修改] 更改加密算法为 pbkdf2_sha256，兼容性更好，无长度限制
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
        # 初始化默认管理员
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
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "username": form_data.username,
        "quota": user["quota"]
    }

@app.get("/api/user/me")
async def get_user_info(username: str = Depends(get_current_user)):
    db = load_db()
    user = db["users"].get(username)
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"username": username, "quota": user["quota"]}

@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...), username: str = Depends(get_current_user)):
    try:
        res = cloudinary.uploader.upload(file.file, folder="wx-studio")
        return {"status": "success", "url": res.get("secure_url")}
    except Exception as e:
        print(f"Upload Error: {e}")
        raise HTTPException(status_code=500, detail="云端存储服务异常")

@app.get("/api/history")
async def get_history(username: str = Depends(get_current_user)):
    db = load_db()
    history = db["history"].get(username, [])
    history.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
    return history

@app.post("/api/generate")
async def generate_image(
    prompt: str = Form(...),
    image_size: str = Form(...),
    ratio: str = Form(...),
    style: str = Form(...),
    image_url: str = Form(...),
    username: str = Depends(get_current_user)
):
    # 1. 检查配额
    db = load_db()
    user_data = db["users"].get(username)
    if not user_data:
        raise HTTPException(status_code=401, detail="用户异常")
    
    if user_data["quota"] <= 0:
        raise HTTPException(status_code=403, detail="配额已用尽，请联系管理员充值")

    # 2. 构造请求
    full_prompt = f"{prompt}. Style: {style} aesthetic, professional photography, high quality. Ratio: {ratio}."
    headers = { "TT-API-KEY": TT_API_KEY, "Content-Type": "application/json" }
    payload = {
        "prompt": full_prompt,
        "mode": "gemini-3-pro-image-preview",
        "refer_images": [image_url],
        "image_size": image_size,
        "google_search": True
    }

    try:
        # 3. 调用 AI
        response = requests.post(TT_ENDPOINT, headers=headers, json=payload, timeout=120)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=f"AI 服务异常: {response.text}")
            
        api_res = response.json()
        if api_res.get("status") != "SUCCESS":
             raise HTTPException(status_code=500, detail=api_res.get("message", "Unknown API error"))

        result_url = api_res['data']['image_url']

        # 4. 扣除配额 & 保存历史
        user_data["quota"] -= 1
        
        new_record = {
            "id": str(uuid.uuid4()),
            "image": result_url,
            "prompt": prompt,
            "timestamp": datetime.now().timestamp()
        }
        
        if username not in db["history"]:
            db["history"][username] = []
        db["history"][username].append(new_record)
        
        save_db(db)

        return {
            "status": "SUCCESS",
            "data": {
                "image_url": result_url,
                "history_item": new_record,
                "remaining_quota": user_data["quota"]
            }
        }

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=500, detail=f"网络请求失败: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)