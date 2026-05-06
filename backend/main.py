import os
import uvicorn
import requests
import json
import uuid
import shutil
import oss2
import time
import threading
import hashlib
import random
import string
import socket
from urllib3.connection import HTTPConnection
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware

# 全局开启 TCP Keep-Alive，防止长时间生成（如 150s+）时被 NAT/防火墙强制断开连接导致 RemoteDisconnected
try:
    keepalive_options = [(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)]
    if hasattr(socket, 'TCP_KEEPIDLE'):
        keepalive_options.append((socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 15))
    elif hasattr(socket, 'TCP_KEEPALIVE'): # macOS 等环境
        keepalive_options.append((socket.IPPROTO_TCP, socket.TCP_KEEPALIVE, 15))
    if hasattr(socket, 'TCP_KEEPINTVL'):
        keepalive_options.append((socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10))
    if hasattr(socket, 'TCP_KEEPCNT'):
        keepalive_options.append((socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 5))
    HTTPConnection.default_socket_options = HTTPConnection.default_socket_options + keepalive_options
except Exception as e:
    print(f"Warning: TCP Keep-Alive configuration failed: {e}")
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta

# 导入短信服务 (支持从项目根目录和 backend 目录两种启动方式)
try:
    from backend.sms_service import send_verification_code, generate_code
except ImportError:
    from sms_service import send_verification_code, generate_code

# --- 1. 初始化配置 ---
load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "default_secret_key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 
TT_API_KEY = os.getenv("TT_API_KEY")
TUZI_API_KEY = os.getenv("TUZI_API_KEY")
TT_ENDPOINT = "https://api.ttapi.io/openai/gpt/generations"
TT_FETCH_ENDPOINT = "https://api.ttapi.io/openai/gpt/fetch"
TUZI_VIDEO_ENDPOINT = "https://api.tu-zi.com/v1/videos"

def poll_tuzi_video_result(job_id: str, headers: dict, timeout: int = 600) -> str:
    start_time = time.time()
    while True:
        if time.time() - start_time > timeout:
            raise Exception("Timeout waiting for video generation")
        try:
            resp = requests.get(f"{TUZI_VIDEO_ENDPOINT}/{job_id}", headers=headers, timeout=10, proxies={"http": None, "https": None})
            if resp.status_code == 200:
                res_json = resp.json()
                status = res_json.get("status")
                if status == "completed":
                    return res_json.get("video_url")
                elif status in ["failed", "error"]:
                    print(f"Video generation failed: {res_json}")
                    raise RuntimeError("视频生成失败，请稍后再试")
        except RuntimeError:
            raise
        except Exception:
            pass
        time.sleep(5)

def poll_ttapi_result(job_id: str, headers: dict, timeout: int = 300) -> str:
    start_time = time.time()
    while True:
        if time.time() - start_time > timeout:
            raise Exception("Timeout waiting for image generation")
        try:
            resp = requests.get(f"{TT_FETCH_ENDPOINT}?jobId={job_id}", headers=headers, timeout=10, proxies={"http": None, "https": None})
            if resp.status_code == 200:
                res_json = resp.json()
                status_code = res_json.get("status")
                if status_code == "SUCCESS":
                    return res_json.get("data", {}).get("imageUrl")
                elif status_code == "FAILED":
                    print(f"Generation failed: {res_json.get('message', 'Unknown error')}")
                    raise RuntimeError("图片生成失败，请稍后再试")
            # ON_QUEUE or others -> continue polling
        except RuntimeError:
            raise # 确保生成失败的异常直接抛出
        except Exception:
            pass # 忽略网络抖动或 JSON 解析错误，继续轮询
        time.sleep(3)

# 使用脚本所在目录的绝对路径，确保无论从哪里启动都能找到数据文件
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BACKEND_DIR, "wx_data.json")

# --- 验证码存储 (手机号 -> {code, timestamp, attempts}) ---
verification_codes: Dict[str, dict] = {}
CODE_EXPIRE_SECONDS = 300  # 5分钟过期
SEND_INTERVAL_SECONDS = 60  # 60秒发送间隔

# --- 请求模型 ---
class SendCodeRequest(BaseModel):
    phone: str
    captcha_token: Optional[str] = None

class VerifyCodeRequest(BaseModel):
    phone: str
    code: str

class AdminCreateUserRequest(BaseModel):
    initial_quota: int = 10

class AdminQuotaRequest(BaseModel):
    amount: int
    reason: str = ""

class AdminPasswordRequest(BaseModel):
    new_password: str

class UserSetPasswordRequest(BaseModel):
    username: Optional[str] = None  # 可选：绑定自定义用户名
    new_password: str
    verification_phone: Optional[str] = None  # 二次验证手机号
    verification_code: Optional[str] = None   # 二次验证码
    current_password: Optional[str] = None    # 已有密码用户修改密码时用

# --- OSS 配置 ---
OSS_ACCESS_KEY_ID = os.getenv("ALIYUN_ACCESS_KEY_ID")
OSS_ACCESS_KEY_SECRET = os.getenv("ALIYUN_ACCESS_KEY_SECRET")
OSS_ENDPOINT = os.getenv("ALIYUN_OSS_ENDPOINT")
OSS_BUCKET_NAME = os.getenv("ALIYUN_OSS_BUCKET")
OSS_DOMAIN = os.getenv("ALIYUN_OSS_DOMAIN") 

bucket = None
if OSS_ACCESS_KEY_ID and OSS_ACCESS_KEY_SECRET and OSS_ENDPOINT and OSS_BUCKET_NAME:
    try:
        auth = oss2.Auth(OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET)
        bucket = oss2.Bucket(auth, OSS_ENDPOINT, OSS_BUCKET_NAME)
    except Exception as e:
        print(f"OSS Init Error: {e}")
else:
    print("❌ 警告: OSS 配置缺失")

app = FastAPI(title="OG AI API")
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
    """加载数据库，如果主文件损坏则尝试从备份恢复"""
    if not os.path.exists(DB_FILE):
        default_hash = pwd_context.hash("wxstudio2025")
        initial_data = {"users": {"admin": {"hash": default_hash, "quota": 9999, "role": "admin"}}, "history": {}}
        save_db(initial_data)
        print("✅ 初始化新数据库")
        return initial_data
    
    # 尝试从主文件加载
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # 验证数据结构完整性
            if "users" in data and "history" in data:
                return data
            raise ValueError("数据结构不完整")
    except Exception as e:
        print(f"⚠️ 主数据库加载失败: {e}")
    
    # 主文件损坏，尝试从备份恢复
    backup_file = f"{DB_FILE}.bak"
    if os.path.exists(backup_file):
        try:
            with open(backup_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if "users" in data and "history" in data:
                    # 恢复备份到主文件
                    shutil.copy(backup_file, DB_FILE)
                    print(f"✅ 已从备份文件恢复数据库")
                    return data
        except Exception as e:
            print(f"❌ 备份文件也损坏: {e}")
    
    # 两个文件都损坏，这是严重错误，不应返回空数据导致配额重置
    # 抛出异常让服务启动失败，而不是静默丢失用户数据
    raise RuntimeError("❌ 数据库及备份均损坏，请手动检查 wx_data.json 和 wx_data.json.bak")

def save_db(data):
    if os.path.exists(DB_FILE): shutil.copy(DB_FILE, f"{DB_FILE}.bak")
    with open(DB_FILE, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, indent=2)

def load_ai_config():
    config_path = os.path.join(BACKEND_DIR, "ai_config.json")
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {
            "models": {
                "gpt-image-2": {"cost": 1},
                "veo3.1-4k": {"cost": 5}
            },
            "endpoints": {
                "generate": {"model": "gpt-image-2", "cost": 1},
                "retouch": {"model": "gpt-image-2", "cost": 1},
                "portrait": {"model": "gpt-image-2", "cost": 1},
                "create": {
                    "default_model": "gpt-image-2", 
                    "cost_per_image": 1, 
                    "4k_pixel_threshold": 4500000, 
                    "4k_cost": 2
                },
                "video": {"model": "veo3.1-4k", "cost": 5}
            }
        }

def verify_password(plain, hashed): return pwd_context.verify(plain, hashed)
def create_access_token(data):
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    try: return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM]).get("sub")
    except: raise HTTPException(401, "Invalid token")

def get_admin_user(token: str = Depends(oauth2_scheme)):
    """管理员权限验证"""
    username = get_current_user(token)
    db = load_db()
    user = db["users"].get(username)
    if not user or user.get("role") != "admin":
        raise HTTPException(403, "需要管理员权限")
    return username

# --- 滑块验证 ---
CAPTCHA_SECRET = SECRET_KEY  # 复用 JWT 密钥
CAPTCHA_EXPIRE_SECONDS = 300  # 5分钟有效

def generate_captcha_token():
    """生成滑块验证 token (前端用)"""
    ts = str(int(time.time()))
    nonce = uuid.uuid4().hex[:8]
    raw = f"{ts}:{nonce}:{CAPTCHA_SECRET}"
    sig = hashlib.sha256(raw.encode()).hexdigest()[:16]
    return f"{ts}:{nonce}:{sig}"

def verify_captcha_token(token: str) -> bool:
    """验证滑块 token 有效性"""
    if not token:
        return False
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return False
        ts, nonce, sig = parts
        # 检查过期
        if time.time() - int(ts) > CAPTCHA_EXPIRE_SECONDS:
            return False
        # 验证签名
        raw = f"{ts}:{nonce}:{CAPTCHA_SECRET}"
        expected_sig = hashlib.sha256(raw.encode()).hexdigest()[:16]
        return sig == expected_sig
    except:
        return False

@app.get("/auth/captcha-config")
async def get_captcha_config():
    """获取滑块验证配置（供前端生成token用）"""
    token = generate_captcha_token()
    return {"captcha_token": token}

# --- 3. 工具函数 ---

def upload_bytes_to_oss(file_bytes, file_ext=".jpg"):
    if not bucket: raise Exception("OSS not configured")
    filename = f"uploads/{uuid.uuid4()}{file_ext}"
    bucket.put_object(filename, file_bytes)
    if OSS_DOMAIN: return f"{OSS_DOMAIN}/{filename}"
    else: return f"https://{OSS_BUCKET_NAME}.{OSS_ENDPOINT}/{filename}"

# --- 配额原子操作（防止并发超用）---
db_lock = threading.Lock()

def deduct_quota_atomic(username: str, amount: int = 1) -> int:
    """
    原子性预扣分：检查配额并立即扣除 amount 点
    返回扣除后的剩余配额
    如果配额不足，抛出 HTTPException
    """
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if not user:
            raise HTTPException(status_code=401, detail="用户异常")
        if user["quota"] < amount:
            raise HTTPException(status_code=403, detail="配额不足")
        user["quota"] -= amount
        save_db(db)
        return user["quota"]

def refund_quota(username: str, amount: int = 1):
    """
    回滚配额：任务失败时返还 amount 点配额
    """
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if user:
            user["quota"] += amount
            save_db(db)
            print(f"✅ 已回滚配额 {amount} 点给用户 {username}")

# --- 4. 路由 ---

@app.post("/auth/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    db = load_db()
    user = db["users"].get(form_data.username)
    if not user or not user.get("hash") or not verify_password(form_data.password, user["hash"]): raise HTTPException(400, "账号或密码错误")
    if user.get("disabled"):
        raise HTTPException(403, "账号已被禁用")
    return {"access_token": create_access_token({"sub": form_data.username}), "token_type": "bearer", "username": form_data.username, "quota": user["quota"], "role": user.get("role", "user")}

@app.post("/auth/send-code")
async def send_code(request: SendCodeRequest):
    """发送短信验证码（需要滑块验证）"""
    phone = request.phone.strip()
    
    # 验证滑块 token
    if not verify_captcha_token(request.captcha_token):
        raise HTTPException(400, "请先完成滑块验证")
    
    # 验证手机号格式
    if not phone or len(phone) != 11 or not phone.isdigit():
        raise HTTPException(400, "请输入正确的11位手机号")
    
    # 检查发送间隔
    if phone in verification_codes:
        last_sent = verification_codes[phone].get("timestamp", 0)
        if time.time() - last_sent < SEND_INTERVAL_SECONDS:
            remaining = int(SEND_INTERVAL_SECONDS - (time.time() - last_sent))
            raise HTTPException(429, f"请{remaining}秒后再试")
    
    # 生成并发送验证码
    code = generate_code()
    result = send_verification_code(phone, code)
    
    if not result["success"]:
        raise HTTPException(500, result["message"])
    
    # 存储验证码
    verification_codes[phone] = {
        "code": code,
        "timestamp": time.time(),
        "attempts": 0
    }
    
    return {"message": "验证码已发送", "expires_in": CODE_EXPIRE_SECONDS}

@app.post("/auth/verify-code")
async def verify_code(request: VerifyCodeRequest):
    """验证码登录/注册"""
    phone = request.phone.strip()
    code = request.code.strip()
    
    # 检查验证码是否存在
    if phone not in verification_codes:
        raise HTTPException(400, "请先获取验证码")
    
    stored = verification_codes[phone]
    
    # 检查过期
    if time.time() - stored["timestamp"] > CODE_EXPIRE_SECONDS:
        del verification_codes[phone]
        raise HTTPException(400, "验证码已过期，请重新获取")
    
    # 检查尝试次数
    if stored["attempts"] >= 5:
        del verification_codes[phone]
        raise HTTPException(429, "尝试次数过多，请重新获取验证码")
    
    # 验证码校验
    if stored["code"] != code:
        verification_codes[phone]["attempts"] += 1
        raise HTTPException(400, "验证码错误")
    
    # 验证成功，删除验证码
    del verification_codes[phone]
    
    # 登录或注册
    db = load_db()
    
    if phone not in db["users"]:
        # 新用户注册
        db["users"][phone] = {
            "phone": phone,
            "quota": 10,  # 新用户初始配额
            "role": "user",
            "created_at": time.time()
        }
        save_db(db)
        print(f"✅ 新用户注册: {phone}")
    
    user = db["users"][phone]
    token = create_access_token({"sub": phone})
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": phone,
        "quota": user["quota"]
    }

@app.get("/api/user/me")
async def get_user(u: str = Depends(get_current_user)):
    user_data = load_db()["users"].get(u, {})
    return {
        "username": u,
        "quota": user_data.get("quota", 0),
        "role": user_data.get("role", "user"),
        "phone": user_data.get("phone", ""),
        "has_password": bool(user_data.get("hash")),
        "display_name": user_data.get("display_name", "")
    }

@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...), u: str = Depends(get_current_user)):
    try:
        file_content = await file.read()
        ext = os.path.splitext(file.filename)[1] or ".jpg"
        oss_url = upload_bytes_to_oss(file_content, ext)
        return {"status": "success", "url": oss_url}
    except Exception as e:
        print(f"Upload Fail: {e}")
        raise HTTPException(500, f"上传失败: {str(e)}")

@app.get("/api/history")
async def get_history(u: str = Depends(get_current_user)):
    h = load_db()["history"].get(u, [])
    h.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
    return h

@app.delete("/api/history/{item_id}")
async def delete_history_item(item_id: str, u: str = Depends(get_current_user)):
    """删除历史记录"""
    with db_lock:
        db = load_db()
        user_history = db["history"].get(u, [])
        # 查找并删除指定记录
        original_len = len(user_history)
        db["history"][u] = [item for item in user_history if item.get("id") != item_id]
        
        if len(db["history"][u]) == original_len:
            raise HTTPException(404, "记录不存在")
        
        save_db(db)
    
    return {"status": "SUCCESS", "message": "删除成功"}

@app.post("/api/generate")
def generate_image(
    prompt: str = Form(...),
    style: str = Form(...),
    image_urls_json: str = Form(...), 
    username: str = Depends(get_current_user)
):
    ai_config = load_ai_config()
    model = ai_config.get("endpoints", {}).get("generate", {}).get("model", "gpt-image-2")
    cost = ai_config.get("endpoints", {}).get("generate", {}).get("cost", 1)

    # 预扣分（原子操作，防止并发超用）
    remaining_quota = deduct_quota_atomic(username, cost)
    
    try:
        image_list = json.loads(image_urls_json)
    except:
        refund_quota(username, cost)  # 参数错误，回滚
        raise HTTPException(400, "图片列表格式错误")

    headers = { "TT-API-KEY": TT_API_KEY, "Content-Type": "application/json" }
    payload = {
        "prompt": f"{prompt}, {style} style, 8k",
        "model": model,
        "referImages": image_list
    }

    try:
        resp = requests.post(TT_ENDPOINT, headers=headers, json=payload, timeout=30, proxies={"http": None, "https": None})
        
        if resp.status_code != 200:
            print(f"API Error: {resp.text}")
            refund_quota(username, cost)  # API调用失败，回滚
            raise HTTPException(500, "AI生成服务暂时不可用，请稍后再试")

        res_json = resp.json()
        if res_json.get("status") != "SUCCESS":
            refund_quota(username, cost)  # AI返回失败，回滚
            print(f"API Failed: {res_json.get('message')}")
            raise HTTPException(500, "AI生成失败，请调整提示词或稍后再试")

        job_id = res_json.get("data", {}).get("jobId") or res_json.get("data", {}).get("job_id")
        result_url = poll_ttapi_result(job_id, headers)
        
        # 转存 OSS
        try:
            r_gen = requests.get(result_url, timeout=60)
            if r_gen.status_code == 200:
                result_url = upload_bytes_to_oss(r_gen.content, ".png")
        except Exception as e:
            print(f"Warning: OSS Save Failed: {e}")

        # 保存历史记录（配额已在开头扣除，无需再扣）
        record = {"id": str(uuid.uuid4()), "image": result_url, "prompt": prompt, "timestamp": datetime.now().timestamp(), "type": "product"}
        
        with db_lock:
            db = load_db()
            if username not in db["history"]: db["history"][username] = []
            db["history"][username].append(record)
            save_db(db)

        return {"status": "SUCCESS", "data": {"image_url": result_url, "history_item": record, "remaining_quota": remaining_quota}}

    except HTTPException:
        raise  # 已处理的异常直接抛出
    except Exception as e:
        print(f"Gen Exception: {str(e)}")
        refund_quota(username, cost)  # 未知错误，回滚
        raise HTTPException(500, "生成过程发生未知错误，请稍后再试")

# --- 智能修图提示词模版 ---
RETOUCH_TEMPLATES = {
    "general": "High-fidelity image enhancement, professional photography standard. Correct white balance, optimize exposure, and expand dynamic range. Remove noise and compression artifacts. Sharpen details while maintaining natural textures. Apply subtle cinematic color grading. 8k resolution, ultra-realistic, master quality.",
    "portrait": "High-end beauty retouching. Preserve realistic skin texture and pores (avoid plastic look). Enhance eye clarity and reflections. Soft, flattering lighting on the face to accentuate bone structure. Remove blemishes and stray hairs naturally. Professional studio lighting, bokeh background, sharp focus on eyes, 85mm lens style.",
    "landscape": "National Geographic style landscape photography. High Dynamic Range (HDR), vivid but natural colors. Enhance depth of field and atmospheric perspective. Clear sky, sharp architectural or natural details. Golden hour lighting, dramatic contrast, wide-angle view, hyper-detailed, rule of thirds composition.",
    "product": "Commercial product photography style. Ultra-sharp focus on the subject, macro details visible. Appetizing and rich colors (if food) or clean premium textures (if product). Studio lighting setup, clean and distinct background separation, 4k clarity, advertising quality."
}

STRENGTH_MAPPING = {
    "low": "Low",
    "medium": "Medium", 
    "high": "High"
}

from fastapi import BackgroundTasks

# 异步转存任务
def background_save_to_oss(username, record_id, temp_url):
    try:
        # 下载图片
        r_gen = requests.get(temp_url, timeout=60)
        if r_gen.status_code != 200:
            print(f"Background Upload Failed: Download error {r_gen.status_code}")
            return

        # 上传到 OSS
        oss_url = upload_bytes_to_oss(r_gen.content, ".png")
        
        # 更新数据库
        with db_lock:
            db = load_db()
            if username in db["history"]:
                for item in db["history"][username]:
                    if item["id"] == record_id:
                        item["image"] = oss_url
                        break
            save_db(db)
        print(f"✅ Background Upload Success: {oss_url}")
        
    except Exception as e:
        print(f"Background Upload Error: {e}")

@app.post("/api/retouch")
async def retouch_image(
    background_tasks: BackgroundTasks,
    mode: str = Form(...),
    strength: str = Form(...),
    suggestion: str = Form(""),
    image_url: str = Form(...),
    username: str = Depends(get_current_user)
):
    """智能修图接口 - 异步优化版"""
    # 验证模式
    if mode not in RETOUCH_TEMPLATES:
        raise HTTPException(400, f"无效的修图模式: {mode}")
    
    # 验证强度
    if strength not in STRENGTH_MAPPING:
        raise HTTPException(400, f"无效的强度设置: {strength}")

    # 扣除配额 (每张图扣1点)
    # 若 deduct_quota_atomic 定义为 def deduct_quota_atomic(username, amount=1), 则传2个参或1个均可
    # 这里假设它接受 amount 参数
    ai_config = load_ai_config()
    model = ai_config.get("endpoints", {}).get("retouch", {}).get("model", "gpt-image-2")
    cost = ai_config.get("endpoints", {}).get("retouch", {}).get("cost", 1)

    try:
        remaining_quota = deduct_quota_atomic(username, cost)
    except TypeError:
        # Fallback if function only accepts 1 arg
        remaining_quota = deduct_quota_atomic(username)
    
    # 构造提示词
    base_prompt = RETOUCH_TEMPLATES[mode]
    strength_prompt = f"Strength level: {STRENGTH_MAPPING[strength]}."
    user_suggestion = f"Additional instruction: {suggestion}" if suggestion else ""
    full_prompt = f"{base_prompt} {strength_prompt} {user_suggestion}"

    image_list = [image_url]
    
    # 限制图片大小
    image_size = "1K"  # 固定大小以加快速度

    headers = { "TT-API-KEY": TT_API_KEY, "Content-Type": "application/json" }
    payload = {
        "prompt": full_prompt,
        "model": model,
        "referImages": image_list
    }

    try:
        resp = requests.post(TT_ENDPOINT, headers=headers, json=payload, timeout=30, proxies={"http": None, "https": None})
        
        if resp.status_code != 200:
            print(f"API Error: {resp.text}")
            refund_quota(username, cost)
            raise HTTPException(500, "AI修图服务暂时不可用，请稍后再试")

        res_json = resp.json()
        if res_json.get("status") != "SUCCESS":
            refund_quota(username, cost)
            print(f"API Failed: {res_json.get('message')}")
            raise HTTPException(500, "AI修图失败，请稍后再试")

        # 获取临时 URL
        job_id = res_json.get("data", {}).get("jobId") or res_json.get("data", {}).get("job_id")
        result_url = poll_ttapi_result(job_id, headers)
        record_id = str(uuid.uuid4())
        
        # 记录历史 (先存临时 URL)
        record = {
            "id": record_id, 
            "image": result_url, 
            "prompt": f"[{STRENGTH_MAPPING[strength]}] {mode}", 
            "timestamp": datetime.now().timestamp(), 
            "type": "retouch"
        }
        
        with db_lock:
            db = load_db()
            if username not in db["history"]: db["history"][username] = []
            db["history"][username].insert(0, record) # 插到最前
            save_db(db)

        # 添加后台任务：转存到 OSS 并更新 DB
        background_tasks.add_task(background_save_to_oss, username, record_id, result_url)

        # 立即返回结果，无需等待 OSS 上传
        return {
            "status": "SUCCESS", 
            "data": {
                "image_url": result_url, 
                "history_item": record, 
                "remaining_quota": remaining_quota
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Gen Exception: {str(e)}")
        # refund_quota(username) # 配额已扣除，若生成失败可退还，此处保留之前的逻辑
        # 注意：如果是 OSS 上传失败，这里不会捕获，因为那是后台任务
        # 如果是请求 API 失败，会捕获并退还
        refund_quota(username, cost)
        raise HTTPException(500, "修图过程发生未知错误，请稍后再试")
    


# --- 人像写真固定提示词 ---
PORTRAIT_PROMPT = "Replace the face in Figure 1 with the face in Figure 2, keeping all other details the same."

@app.post("/api/portrait")
def portrait_generate(
    subject_url: str = Form(...),  # 本人照片
    target_url: str = Form(...),   # 目标写真/服装
    username: str = Depends(get_current_user)
):
    """人像写真接口"""
    ai_config = load_ai_config()
    model = ai_config.get("endpoints", {}).get("portrait", {}).get("model", "gpt-image-2")
    cost = ai_config.get("endpoints", {}).get("portrait", {}).get("cost", 1)

    # 预扣分（原子操作，防止并发超用）
    remaining_quota = deduct_quota_atomic(username, cost)
    
    headers = { "TT-API-KEY": TT_API_KEY, "Content-Type": "application/json" }
    payload = {
        "prompt": PORTRAIT_PROMPT,
        "model": model,
        "referImages": [subject_url, target_url]
    }
    
    try:
        resp = requests.post(TT_ENDPOINT, headers=headers, json=payload, timeout=30, proxies={"http": None, "https": None})
        
        if resp.status_code != 200:
            print(f"Portrait API Error: {resp.text}")
            refund_quota(username, cost)
            raise HTTPException(500, "人像写真服务暂时不可用，请稍后再试")
        
        res_json = resp.json()
        if res_json.get("status") != "SUCCESS":
            refund_quota(username, cost)
            print(f"Portrait API Failed: {res_json.get('message')}")
            raise HTTPException(500, "人像写真生成失败，请稍后再试")
        
        job_id = res_json.get("data", {}).get("jobId") or res_json.get("data", {}).get("job_id")
        result_url = poll_ttapi_result(job_id, headers)
        
        # 转存 OSS
        try:
            r_gen = requests.get(result_url, timeout=60)
            if r_gen.status_code == 200:
                result_url = upload_bytes_to_oss(r_gen.content, ".png")
        except Exception as e:
            print(f"Warning: OSS Save Failed: {e}")
        
        # 保存历史记录
        record = {
            "id": str(uuid.uuid4()),
            "image": result_url,
            "prompt": f"[人像写真] {quality}",
            "timestamp": datetime.now().timestamp(),
            "type": "portrait"
        }
        
        with db_lock:
            db = load_db()
            if username not in db["history"]:
                db["history"][username] = []
            db["history"][username].append(record)
            save_db(db)
        
        return {
            "status": "SUCCESS",
            "data": {
                "image_url": result_url,
                "history_item": record,
                "remaining_quota": remaining_quota
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Portrait Exception: {str(e)}")
        refund_quota(username, cost)
        raise HTTPException(500, "写真生成过程发生未知错误，请稍后再试")

@app.post("/api/create")
def basic_create(
    background_tasks: BackgroundTasks,
    prompt: str = Form(...),              # 必填：文本提示词
    image_urls_json: str = Form("[]"),    # 选填：参考图片URL列表（JSON数组）
    model: str = Form("gpt-image-2"),     # 选填：模型选择
    size: str = Form(None),               # 选填：尺寸
    quality: str = Form("auto"),          # 选填：图像质量
    n: int = Form(1),                     # 选填：生成数量
    username: str = Depends(get_current_user)
):
    """基础创作接口 - 异步后台任务版（支持长时间生成）"""
    if not (1 <= n <= 10):
        raise HTTPException(400, "生成数量 n 必须介于 1 和 10 之间")
    if quality.lower() not in ["auto", "low", "medium", "high", "4k", "hd"]:
        raise HTTPException(400, f"无效的质量参数: {quality}")
        
    # 解析图片列表
    try:
        image_list = json.loads(image_urls_json)
        if not isinstance(image_list, list):
            image_list = []
    except:
        image_list = []
        
    ai_config = load_ai_config()
    
    # 默认模型基础价格
    model_config = ai_config.get("models", {}).get(model, {})
    cost_per_item = model_config.get("cost", ai_config.get("endpoints", {}).get("create", {}).get("cost_per_image", 1))
    
    # 检查尺寸是否达到 4K 级别（根据像素数）
    if size and "x" in size:
        try:
            w, h = map(int, size.split("x"))
            pixels = w * h
            threshold = ai_config.get("endpoints", {}).get("create", {}).get("4k_pixel_threshold", 4500000)
            if pixels > threshold:
                cost_per_item = ai_config.get("endpoints", {}).get("create", {}).get("4k_cost", 2)
        except Exception:
            pass
    
    total_cost = cost_per_item * n
    
    # 预扣分 (按照生成张数扣除积分)
    remaining_quota = deduct_quota_atomic(username, amount=total_cost)
    
    task_id = str(uuid.uuid4())
    create_type = "text2img" if len(image_list) == 0 else f"img2img({len(image_list)})"
    
    # 立即写入历史记录（状态为 ON_QUEUE）
    with db_lock:
        db = load_db()
        if username not in db["history"]:
            db["history"][username] = []
        db["history"][username].append({
            "id": task_id,
            "image": None,
            "image_urls": [],
            "prompt": f"[{create_type}] {prompt[:50]}{'...' if len(prompt) > 50 else ''}",
            "timestamp": datetime.now().timestamp(),
            "type": "create",
            "status": "ON_QUEUE"
        })
        save_db(db)
    
    # 提交后台任务
    background_tasks.add_task(
        background_generate_image,
        task_id=task_id,
        username=username,
        prompt=prompt,
        image_list=image_list,
        model=model,
        n=n,
        quality=quality,
        size=size,
        amount=total_cost,
    )
    
    return {
        "status": "SUCCESS",
        "data": {
            "taskId": task_id,
            "remaining_quota": remaining_quota
        }
    }

def background_generate_image(
    task_id: str,
    username: str,
    prompt: str,
    image_list: list,
    model: str,
    n: int,
    quality: str,
    size: str,
    amount: int,
):
    """后台线程执行图片生成，不受 HTTP 超时限制
    
    API 仅支持以下参数（参考官方文档）：
    - model: 必需 (gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-4o-image-vip, gpt-4o-image)
    - prompt: 必需，最大5000字符
    - image: 可选，支持 url 和 base64 传图
    - size: 可选，支持任意分辨率 (如 "2048x2048") 或比例枚举 (如 "1:1")
    
    注意：API 不支持 n 参数，多图生成通过循环多次请求实现。
    """
    result_urls = None
    key = TUZI_API_KEY if TUZI_API_KEY else TT_API_KEY
    headers = { "Authorization": f"Bearer {key}", "Content-Type": "application/json" }
    
    # 构造符合官方文档的 payload（仅包含 model, prompt, image, size）
    payload = {
        "prompt": prompt,
        "model": model
    }

    if size:
        payload["size"] = size
    if image_list:
        payload["image"] = image_list

    try:
        actual_n = max(1, n or 1)
        print(f"🎨 后台图片生成开始... 任务 ID: {task_id}, 用户: {username}, 需生成 {actual_n} 张, payload={payload}")
        
        raw_urls = []
        failed_count = 0
        
        for i in range(actual_n):
            try:
                if i > 0:
                    print(f"  📸 正在生成第 {i+1}/{actual_n} 张...")
                
                print(f"  ⏳ 第 {i+1} 张请求已发出，等待 API 返回...")
                start_time = time.time()
                
                resp = requests.post(
                    "https://api.tu-zi.com/v1/images/generations",
                    headers=headers,
                    json=payload,
                    timeout=600,
                    proxies={"http": None, "https": None}
                )
                
                elapsed = time.time() - start_time
                print(f"  📡 第 {i+1} 张 API 响应耗时: {elapsed:.1f}s, HTTP {resp.status_code}")
                
                if resp.status_code != 200:
                    print(f"  ❌ 第 {i+1} 张生成失败 (HTTP {resp.status_code}): {resp.text}")
                    failed_count += 1
                    continue
                
                res_json = resp.json()
                data_list = res_json.get("data", [])
                if not data_list or not isinstance(data_list, list) or not data_list[0].get("url"):
                    print(f"  ❌ 第 {i+1} 张响应异常: {res_json}")
                    failed_count += 1
                    continue
                
                url = data_list[0].get("url")
                if url:
                    raw_urls.append(url)
                    print(f"  ✅ 第 {i+1} 张生成成功 ({elapsed:.1f}s)")
                else:
                    failed_count += 1
                    
            except Exception as req_err:
                print(f"  ❌ 第 {i+1} 张请求异常: {str(req_err)}")
                failed_count += 1
        
        if not raw_urls:
            raise RuntimeError(f"所有 {actual_n} 张图片均生成失败")
        
        # 转存 OSS
        final_urls = []
        for url in raw_urls:
            try:
                r_gen = requests.get(url, timeout=60)
                if r_gen.status_code == 200:
                    final_urls.append(upload_bytes_to_oss(r_gen.content, ".png"))
                else:
                    final_urls.append(url)
            except Exception as e:
                print(f"Warning: OSS Save Failed: {e}")
                final_urls.append(url)
        
        result_urls = final_urls
        
        # 部分失败时退还对应积分
        if failed_count > 0 and amount > 0:
            refund_per_image = amount // actual_n
            refund_amount = refund_per_image * failed_count
            if refund_amount > 0:
                refund_quota(username, amount=refund_amount)
                print(f"  💰 {failed_count} 张失败，已退还 {refund_amount} 积分")
        
        print(f"✅ 图片生成完成，任务 ID: {task_id}，成功 {len(result_urls)}/{actual_n} 张")
            
    except Exception as e:
        print(f"❌ 图片生成出错 (任务 {task_id}): {str(e)}")
        import traceback
        traceback.print_exc()
        refund_quota(username, amount=amount)
    finally:
        # 更新数据库中的任务状态
        with db_lock:
            db = load_db()
            if username in db.get("history", {}):
                # 找到原始任务
                original_item = None
                for item in db["history"][username]:
                    if item["id"] == task_id:
                        original_item = item
                        break
                
                if original_item:
                    if result_urls:
                        # 第一张图更新到原任务
                        original_item["status"] = "SUCCESS"
                        original_item["image"] = result_urls[0]
                        original_item["image_urls"] = result_urls
                        
                        # 如果有更多图，创建新的记录
                        if len(result_urls) > 1:
                            for extra_url in result_urls[1:]:
                                extra_record = original_item.copy()
                                extra_record["id"] = str(uuid.uuid4())
                                extra_record["image"] = extra_url
                                extra_record["image_urls"] = [extra_url]
                                # 稍微偏移一下时间戳，保证排序
                                extra_record["timestamp"] += 0.001 
                                db["history"][username].append(extra_record)
                    else:
                        # 只有在没有 result_urls 的情况下才标记失败
                        # 如果是 catch 到异常 result_urls 会是 None
                        original_item["status"] = "FAILED"
            save_db(db)

@app.get("/api/create/status/{task_id}")
def create_task_status(task_id: str, username: str = Depends(get_current_user)):
    """轮询图片生成任务状态"""
    with db_lock:
        db = load_db()
        history = db.get("history", {}).get(username, [])
        for item in history:
            if item["id"] == task_id:
                return {
                    "status": item.get("status", "ON_QUEUE"),
                    "image_url": item.get("image"),
                    "image_urls": item.get("image_urls", []),
                    "history_item": item
                }
    raise HTTPException(404, "任务不存在")

# ==========================================
# 🎬 视频生成接口
# ==========================================

def background_generate_video(
    task_id: str,
    username: str,
    prompt: str,
    image_list: list,
    model: str,
    amount: int
):
    result_url = None
    key = TUZI_API_KEY if TUZI_API_KEY else TT_API_KEY
    headers = {"Authorization": f"Bearer {key}"} # 移除 Content-Type，由 requests 自动处理 multipart/form-data boundary
    try:
        print(f"🎬 正在后台为您生成视频... 任务 ID: {task_id}")
        
        # 强制使用 multipart/form-data 传递基础参数
        files = {
            "model": (None, model),
            "prompt": (None, prompt)
        }
        
        # 视频接口支持首帧图：需下载后作为文件上传
        if image_list and len(image_list) > 0:
            try:
                img_url = image_list[0]
                print(f"📥 正在下载首帧参考图: {img_url}")
                img_resp = requests.get(img_url, timeout=10)
                if img_resp.status_code == 200:
                    files["image"] = ("image.png", img_resp.content, "image/png")
                    print("✅ 成功下载并附加首帧参考图")
                else:
                    print(f"⚠️ 下载参考图失败: HTTP {img_resp.status_code}")
            except Exception as e:
                print(f"⚠️ 下载参考图异常: {str(e)}")
            
        resp = requests.post(TUZI_VIDEO_ENDPOINT, headers=headers, files=files, timeout=30, proxies={"http": None, "https": None})
        if resp.status_code != 200:
            print(f"Video API Error: {resp.text}")
            raise RuntimeError("视频服务暂时不可用")
            
        job_data = resp.json()
        job_id = job_data.get("id")
        
        if not job_id:
            print(f"Video API failed to return job ID: {resp.text}")
            raise RuntimeError("视频任务提交失败")
            
        print(f"🔍 视频任务已提交，获取到后端作业 ID: {job_id}，开始轮询结果...")
        video_url = poll_tuzi_video_result(job_id, headers=headers)
        
        if video_url:
            print(f"✅ 视频生成成功，URL: {video_url}")
            result_url = video_url
            
    except Exception as e:
        print(f"❌ 视频生成出错: {str(e)}")
        refund_quota(username, amount)
    finally:
        with db_lock:
            db = load_db()
            if username not in db["history"]:
                db["history"][username] = []
            
            # 更新状态
            for item in db["history"][username]:
                if item["id"] == task_id:
                    item["status"] = "SUCCESS" if result_url else "FAILED"
                    item["image"] = result_url  # 为了兼容前端，我们复用 image 字段存储视频URL，前端通过 type="video" 判断
                    break
            save_db(db)

@app.post("/api/video")
def video_generate(
    background_tasks: BackgroundTasks,
    prompt: str = Form(...),
    image_urls_json: str = Form("[]"),
    username: str = Depends(get_current_user)
):
    ai_config = load_ai_config()
    model = ai_config.get("endpoints", {}).get("video", {}).get("model", "veo3.1-4k")
    cost = ai_config.get("endpoints", {}).get("video", {}).get("cost", 5)

    deduct_quota_atomic(username, cost)

    try:
        image_list = json.loads(image_urls_json)
        if not isinstance(image_list, list):
            image_list = []
    except:
        image_list = []

    task_id = str(uuid.uuid4())
    
    with db_lock:
        db = load_db()
        if username not in db["history"]:
            db["history"][username] = []
        db["history"][username].append({
            "id": task_id,
            "username": username,
            "type": "video",
            "prompt": prompt,
            "status": "ON_QUEUE",
            "image": None,
            "timestamp": datetime.now().timestamp()
        })
        save_db(db)

    background_tasks.add_task(
        background_generate_video,
        task_id=task_id,
        username=username,
        prompt=prompt,
        image_list=image_list,
        model=model,
        amount=cost
    )

    return {"message": "Video task started", "taskId": task_id}

# ==========================================
# 💬 反馈收集接口
# ==========================================
FEEDBACK_FILE = os.path.join(BACKEND_DIR, "feedback.json")

class FeedbackRequest(BaseModel):
    phone: str
    content: str

def load_feedback():
    """加载反馈数据"""
    if os.path.exists(FEEDBACK_FILE):
        try:
            with open(FEEDBACK_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return []
    return []

def save_feedback(data):
    """保存反馈数据"""
    with open(FEEDBACK_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.post("/api/feedback")
async def submit_feedback(request: FeedbackRequest):
    """提交用户反馈"""
    phone = request.phone.strip()
    content = request.content.strip()
    
    if not phone or not content:
        raise HTTPException(400, "手机号和反馈内容不能为空")
    
    feedback_list = load_feedback()
    
    feedback_item = {
        "id": str(uuid.uuid4()),
        "phone": phone,
        "content": content,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "created_at": time.time()
    }
    
    feedback_list.append(feedback_item)
    save_feedback(feedback_list)
    
    print(f"📝 收到用户反馈: {phone} - {content[:50]}...")
    
    return {"success": True, "message": "感谢您的反馈！"}

# ==========================================
# 👤 用户设置 API
# ==========================================

@app.get("/api/user/quota-logs")
async def get_user_quota_logs(u: str = Depends(get_current_user)):
    """获取用户积分变动记录"""
    db = load_db()
    all_logs = db.get("quota_logs", [])
    user_logs = [log for log in all_logs if log.get("username") == u]
    user_logs.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return user_logs[:100]  # 最多返回100条

@app.post("/api/user/set-password")
async def user_set_password(request: UserSetPasswordRequest, u: str = Depends(get_current_user)):
    """用户设置/修改密码（支持绑定用户名）"""
    with db_lock:
        db = load_db()
        user = db["users"].get(u)
        if not user:
            raise HTTPException(404, "用户不存在")
        
        has_existing_password = bool(user.get("hash"))
        
        if has_existing_password:
            # 已有密码 -> 修改密码，需要验证旧密码
            if not request.current_password:
                raise HTTPException(400, "请输入当前密码")
            if not verify_password(request.current_password, user["hash"]):
                raise HTTPException(400, "当前密码错误")
        else:
            # 首次设置密码（手机号用户绑定），需要短信二次验证
            if not request.verification_phone or not request.verification_code:
                raise HTTPException(400, "首次设置密码需要短信验证")
            
            phone = request.verification_phone.strip()
            code = request.verification_code.strip()
            
            # 验证手机号是否匹配（手机号用户的用户名就是手机号）
            if phone != u and user.get("phone") != phone:
                raise HTTPException(400, "手机号不匹配")
            
            if phone not in verification_codes:
                raise HTTPException(400, "请先获取验证码")
            
            stored = verification_codes[phone]
            if time.time() - stored["timestamp"] > CODE_EXPIRE_SECONDS:
                del verification_codes[phone]
                raise HTTPException(400, "验证码已过期")
            if stored["code"] != code:
                raise HTTPException(400, "验证码错误")
            del verification_codes[phone]
        
        # 设置新密码
        user["hash"] = pwd_context.hash(request.new_password)
        
        # 可选：绑定自定义用户名
        new_username = u
        if request.username and request.username.strip():
            new_username_candidate = request.username.strip()
            if new_username_candidate != u:
                if new_username_candidate in db["users"]:
                    raise HTTPException(400, f"用户名 '{new_username_candidate}' 已存在")
                # 迁移用户数据到新用户名
                db["users"][new_username_candidate] = user
                db["users"][new_username_candidate]["display_name"] = new_username_candidate
                # 迁移历史记录
                if u in db["history"]:
                    db["history"][new_username_candidate] = db["history"].pop(u)
                del db["users"][u]
                new_username = new_username_candidate
        
        save_db(db)
    
    # 生成新 token
    new_token = create_access_token({"sub": new_username})
    return {
        "message": "密码设置成功",
        "access_token": new_token,
        "username": new_username
    }

# ==========================================
# 🛡️ 管理后台 API
# ==========================================

@app.get("/admin/dashboard")
async def admin_dashboard(admin: str = Depends(get_admin_user)):
    """管理后台仪表盘数据"""
    db = load_db()
    users = db.get("users", {})
    history = db.get("history", {})
    
    total_users = len(users)
    total_quota = sum((u.get("quota") or 0) for u in users.values() if isinstance(u, dict))
    total_creations = sum(len(h or []) for h in history.values())
    
    # 今日新增用户
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    new_users_today = sum(1 for u in users.values() if isinstance(u, dict) and (u.get("created_at") or 0) >= today_start)
    
    # 用户角色分布
    admin_count = sum(1 for u in users.values() if isinstance(u, dict) and u.get("role") == "admin")
    user_count = total_users - admin_count
    
    # 有密码的用户数
    users_with_password = sum(1 for u in users.values() if isinstance(u, dict) and u.get("hash"))
    
    # 近7天积分消耗（从 quota_logs 统计）
    week_ago = time.time() - 7 * 24 * 3600
    recent_logs = [log for log in db.get("quota_logs", []) if log.get("timestamp", 0) >= week_ago]
    recent_quota_spent = sum(abs(log.get("amount", 0)) for log in recent_logs if log.get("amount", 0) < 0)
    recent_quota_added = sum(log.get("amount", 0) for log in recent_logs if log.get("amount", 0) > 0)
    
    return {
        "total_users": total_users,
        "new_users_today": new_users_today,
        "total_creations": total_creations,
        "total_quota": total_quota,
        "admin_count": admin_count,
        "user_count": user_count,
        "users_with_password": users_with_password,
        "recent_quota_spent": recent_quota_spent,
        "recent_quota_added": recent_quota_added
    }

@app.get("/admin/users")
async def admin_list_users(
    search: str = "",
    page: int = 1,
    page_size: int = 20,
    admin: str = Depends(get_admin_user)
):
    """管理后台用户列表"""
    db = load_db()
    users = db.get("users", {})
    history = db.get("history", {})
    
    user_list = []
    for uname, udata in users.items():
        if not isinstance(udata, dict):
            continue
            
        phone = udata.get("phone") or ""
        display_name = udata.get("display_name") or ""
        created_at = udata.get("created_at") or 0
        quota = udata.get("quota") or 0
        
        # 搜索过滤
        if search and search.lower() not in uname.lower() and search not in phone:
            continue
        user_list.append({
            "username": uname,
            "phone": phone,
            "display_name": display_name,
            "role": udata.get("role", "user"),
            "quota": quota,
            "has_password": bool(udata.get("hash")),
            "disabled": udata.get("disabled", False),
            "created_at": created_at,
            "creation_count": len(history.get(uname) or [])
        })
    
    # 按创建时间倒序
    user_list.sort(key=lambda x: x.get("created_at") or 0, reverse=True)
    
    total = len(user_list)
    start = (page - 1) * page_size
    end = start + page_size
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "users": user_list[start:end]
    }

@app.post("/admin/users/create")
async def admin_create_user(request: AdminCreateUserRequest, admin: str = Depends(get_admin_user)):
    """管理后台创建用户（随机生成账号密码）"""
    with db_lock:
        db = load_db()
        
        # 生成随机用户名：OG + 6位随机字符
        while True:
            random_name = "OG" + ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
            if random_name not in db["users"]:
                break
        
        # 生成随机密码：12位
        random_password = ''.join(random.choices(string.ascii_letters + string.digits + "!@#$%", k=12))
        
        db["users"][random_name] = {
            "hash": pwd_context.hash(random_password),
            "quota": request.initial_quota,
            "role": "user",
            "created_at": time.time(),
            "created_by": admin
        }
        
        # 记录积分日志
        if "quota_logs" not in db:
            db["quota_logs"] = []
        db["quota_logs"].append({
            "id": str(uuid.uuid4()),
            "username": random_name,
            "operator": admin,
            "amount": request.initial_quota,
            "reason": "新用户初始积分",
            "type": "admin_grant",
            "timestamp": time.time()
        })
        
        save_db(db)
    
    return {
        "username": random_name,
        "password": random_password,  # 明文只返回这一次
        "quota": request.initial_quota,
        "message": "用户创建成功"
    }

@app.post("/admin/users/{username}/quota")
async def admin_update_quota(username: str, request: AdminQuotaRequest, admin: str = Depends(get_admin_user)):
    """管理后台发放/扣除积分"""
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if not user:
            raise HTTPException(404, "用户不存在")
        
        old_quota = user.get("quota", 0)
        user["quota"] = old_quota + request.amount
        if user["quota"] < 0:
            user["quota"] = 0
        
        # 记录积分日志
        if "quota_logs" not in db:
            db["quota_logs"] = []
        db["quota_logs"].append({
            "id": str(uuid.uuid4()),
            "username": username,
            "operator": admin,
            "amount": request.amount,
            "balance_before": old_quota,
            "balance_after": user["quota"],
            "reason": request.reason or ("管理员充值" if request.amount > 0 else "管理员扣除"),
            "type": "admin_grant" if request.amount > 0 else "admin_deduct",
            "timestamp": time.time()
        })
        
        save_db(db)
    
    return {
        "username": username,
        "old_quota": old_quota,
        "new_quota": user["quota"],
        "amount": request.amount,
        "message": "积分更新成功"
    }

@app.post("/admin/users/{username}/password")
async def admin_reset_password(username: str, request: AdminPasswordRequest, admin: str = Depends(get_admin_user)):
    """管理后台重置用户密码"""
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if not user:
            raise HTTPException(404, "用户不存在")
        
        user["hash"] = pwd_context.hash(request.new_password)
        save_db(db)
    
    return {"message": f"用户 {username} 密码已重置"}

@app.post("/admin/users/{username}/status")
async def admin_toggle_status(username: str, admin: str = Depends(get_admin_user)):
    """管理后台禁用/启用用户"""
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if not user:
            raise HTTPException(404, "用户不存在")
        if username == admin:
            raise HTTPException(400, "不能禁用自己")
        
        user["disabled"] = not user.get("disabled", False)
        save_db(db)
    
    return {
        "username": username,
        "disabled": user["disabled"],
        "message": f"用户已{'禁用' if user['disabled'] else '启用'}"
    }

# --- 自动记录积分消耗到 quota_logs ---
_original_deduct_quota_atomic = deduct_quota_atomic
_original_refund_quota = refund_quota

def deduct_quota_atomic_with_log(username: str, amount: int = 1) -> int:
    """带日志的原子扣分"""
    remaining = _original_deduct_quota_atomic(username, amount)
    # 记录消耗日志
    try:
        with db_lock:
            db = load_db()
            if "quota_logs" not in db:
                db["quota_logs"] = []
            db["quota_logs"].append({
                "id": str(uuid.uuid4()),
                "username": username,
                "operator": "system",
                "amount": -amount,
                "balance_after": remaining,
                "reason": "创作消耗",
                "type": "consume",
                "timestamp": time.time()
            })
            save_db(db)
    except:
        pass  # 日志记录失败不影响主流程
    return remaining

def refund_quota_with_log(username: str, amount: int = 1):
    """带日志的积分回滚（退回）"""
    _original_refund_quota(username, amount)
    # 记录退回日志
    try:
        with db_lock:
            db = load_db()
            user = db["users"].get(username)
            if user:
                if "quota_logs" not in db:
                    db["quota_logs"] = []
                db["quota_logs"].append({
                    "id": str(uuid.uuid4()),
                    "username": username,
                    "operator": "system",
                    "amount": amount,
                    "balance_after": user["quota"],
                    "reason": "任务失败，积分退回",
                    "type": "refund",
                    "timestamp": time.time()
                })
                save_db(db)
    except:
        pass

# 替换原函数
deduct_quota_atomic = deduct_quota_atomic_with_log
refund_quota = refund_quota_with_log

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
