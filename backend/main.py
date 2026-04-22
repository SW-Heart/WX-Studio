import os
import uvicorn
import requests
import json
import uuid
import shutil
import oss2
import time
import threading
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
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
TT_ENDPOINT = "https://api.ttapi.io/openai/gpt/generations"
TT_FETCH_ENDPOINT = "https://api.ttapi.io/openai/gpt/fetch"

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
                    raise Exception(res_json.get("message", "Generation failed"))
            # ON_QUEUE or others -> continue polling
        except Exception as e:
            if "Timeout waiting" in str(e) or "Generation failed" in str(e):
                raise e
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

class VerifyCodeRequest(BaseModel):
    phone: str
    code: str

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

def verify_password(plain, hashed): return pwd_context.verify(plain, hashed)
def create_access_token(data):
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    try: return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM]).get("sub")
    except: raise HTTPException(401, "Invalid token")

# --- 3. 工具函数 ---

def upload_bytes_to_oss(file_bytes, file_ext=".jpg"):
    if not bucket: raise Exception("OSS not configured")
    filename = f"uploads/{uuid.uuid4()}{file_ext}"
    bucket.put_object(filename, file_bytes)
    if OSS_DOMAIN: return f"{OSS_DOMAIN}/{filename}"
    else: return f"https://{OSS_BUCKET_NAME}.{OSS_ENDPOINT}/{filename}"

# --- 配额原子操作（防止并发超用）---
db_lock = threading.Lock()

def deduct_quota_atomic(username: str) -> int:
    """
    原子性预扣分：检查配额并立即扣除1点
    返回扣除后的剩余配额
    如果配额不足，抛出 HTTPException
    """
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if not user:
            raise HTTPException(status_code=401, detail="用户异常")
        if user["quota"] <= 0:
            raise HTTPException(status_code=403, detail="配额不足")
        user["quota"] -= 1
        save_db(db)
        return user["quota"]

def refund_quota(username: str):
    """
    回滚配额：任务失败时返还1点配额
    """
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if user:
            user["quota"] += 1
            save_db(db)
            print(f"✅ 已回滚配额给用户 {username}")

# --- 4. 路由 ---

@app.post("/auth/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    db = load_db()
    user = db["users"].get(form_data.username)
    if not user or not verify_password(form_data.password, user["hash"]): raise HTTPException(400, "账号或密码错误")
    return {"access_token": create_access_token({"sub": form_data.username}), "token_type": "bearer", "username": form_data.username, "quota": user["quota"]}

@app.post("/auth/send-code")
async def send_code(request: SendCodeRequest):
    """发送短信验证码"""
    phone = request.phone.strip()
    
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
    return {"username": u, "quota": load_db()["users"].get(u, {}).get("quota", 0)}

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
    image_size: str = Form(...),
    ratio: str = Form(...),
    style: str = Form(...),
    image_urls_json: str = Form(...), 
    username: str = Depends(get_current_user)
):
    # 预扣分（原子操作，防止并发超用）
    remaining_quota = deduct_quota_atomic(username)
    
    try:
        image_list = json.loads(image_urls_json)
    except:
        refund_quota(username)  # 参数错误，回滚
        raise HTTPException(400, "图片列表格式错误")

    headers = { "TT-API-KEY": TT_API_KEY, "Content-Type": "application/json" }
    payload = {
        "prompt": f"{prompt}, {style} style, 8k",
        "mode": "gpt-image-2",
        "referImages": image_list
    }

    try:
        resp = requests.post(TT_ENDPOINT, headers=headers, json=payload, timeout=30, proxies={"http": None, "https": None})
        
        if resp.status_code != 200:
            print(f"API Error: {resp.text}")
            refund_quota(username)  # API调用失败，回滚
            raise HTTPException(resp.status_code, f"AI Error: {resp.text}")

        res_json = resp.json()
        if res_json.get("status") != "SUCCESS":
            refund_quota(username)  # AI返回失败，回滚
            raise HTTPException(500, res_json.get("message"))

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
        refund_quota(username)  # 未知错误，回滚
        raise HTTPException(500, str(e))

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
    try:
        remaining_quota = deduct_quota_atomic(username, 1)
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
        "mode": "gpt-image-2",
        "referImages": image_list
    }

    try:
        resp = requests.post(TT_ENDPOINT, headers=headers, json=payload, timeout=30, proxies={"http": None, "https": None})
        
        if resp.status_code != 200:
            print(f"API Error: {resp.text}")
            refund_quota(username)
            raise HTTPException(resp.status_code, f"AI Error: {resp.text}")

        res_json = resp.json()
        if res_json.get("status") != "SUCCESS":
            refund_quota(username)
            raise HTTPException(500, res_json.get("message"))

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
        refund_quota(username)
        raise HTTPException(500, str(e))
    


# --- 人像写真固定提示词 ---
PORTRAIT_PROMPT = "Replace the face in Figure 1 with the face in Figure 2, keeping all other details the same."

@app.post("/api/portrait")
def portrait_generate(
    subject_url: str = Form(...),  # 本人照片
    target_url: str = Form(...),   # 目标写真/服装
    quality: str = Form("2K"),     # 图像质量
    username: str = Depends(get_current_user)
):
    """人像写真接口"""
    # 验证质量参数
    if quality not in ["1K", "2K", "4K"]:
        raise HTTPException(400, f"无效的图像质量: {quality}")
    
    # 预扣分（原子操作，防止并发超用）
    remaining_quota = deduct_quota_atomic(username)
    
    headers = {"TT-API-KEY": TT_API_KEY, "Content-Type": "application/json"}
    payload = {
        "prompt": PORTRAIT_PROMPT,
        "mode": "gpt-image-2",
        "referImages": [subject_url, target_url]
    }
    
    try:
        resp = requests.post(TT_ENDPOINT, headers=headers, json=payload, timeout=30, proxies={"http": None, "https": None})
        
        if resp.status_code != 200:
            print(f"Portrait API Error: {resp.text}")
            refund_quota(username)
            raise HTTPException(resp.status_code, f"AI Error: {resp.text}")
        
        res_json = resp.json()
        if res_json.get("status") != "SUCCESS":
            refund_quota(username)
            raise HTTPException(500, res_json.get("message"))
        
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
        refund_quota(username)
        raise HTTPException(500, str(e))

@app.post("/api/create")
def basic_create(
    prompt: str = Form(...),              # 必填：文本提示词
    image_urls_json: str = Form("[]"),    # 选填：参考图片URL列表（JSON数组）
    image_size: str = Form("2K"),         # 图像质量：1K, 2K, 4K
    mode: str = Form("gpt-image-2"),  # 模型版本
    aspect_ratio: str = Form("1:1"),      # 图片比例
    google_search: bool = Form(False),    # 是否启用 Google 搜索增强
    username: str = Depends(get_current_user)
):
    """基础创作接口 - 支持文生图、图生图、多参考图"""
    # 验证图像质量
    if image_size not in ["1K", "2K", "4K"]:
        raise HTTPException(400, f"无效的图像质量: {image_size}")
    
    # 验证模型
    valid_modes = ["gemini-2.5-flash-image", "gemini-3-pro-image-preview", "gpt-image-2"]
    if mode not in valid_modes:
        raise HTTPException(400, f"无效的模型: {mode}")
    
    # 验证比例
    valid_ratios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]
    if aspect_ratio not in valid_ratios:
        raise HTTPException(400, f"无效的比例: {aspect_ratio}")
    
    # 解析图片列表
    try:
        image_list = json.loads(image_urls_json)
        if not isinstance(image_list, list):
            image_list = []
    except:
        image_list = []
    
    # 预扣分
    remaining_quota = deduct_quota_atomic(username)
    
    headers = {"TT-API-KEY": TT_API_KEY, "Content-Type": "application/json"}
    payload = {
        "prompt": prompt,
        "mode": "gpt-image-2",
        "referImages": image_list
    }
    
    try:
        resp = requests.post(TT_ENDPOINT, headers=headers, json=payload, timeout=30, proxies={"http": None, "https": None})
        
        if resp.status_code != 200:
            print(f"Create API Error: {resp.text}")
            refund_quota(username)
            raise HTTPException(resp.status_code, f"AI Error: {resp.text}")
        
        res_json = resp.json()
        if res_json.get("status") != "SUCCESS":
            refund_quota(username)
            raise HTTPException(500, res_json.get("message"))
        
        job_id = res_json.get("data", {}).get("jobId") or res_json.get("data", {}).get("job_id")
        result_url = poll_ttapi_result(job_id, headers)
        
        # 转存 OSS
        try:
            r_gen = requests.get(result_url, timeout=60)
            if r_gen.status_code == 200:
                result_url = upload_bytes_to_oss(r_gen.content, ".png")
        except Exception as e:
            print(f"Warning: OSS Save Failed: {e}")
        
        # 确定创作类型
        create_type = "text2img" if len(image_list) == 0 else f"img2img({len(image_list)})"
        
        # 保存历史记录
        record = {
            "id": str(uuid.uuid4()),
            "image": result_url,
            "prompt": f"[{create_type}] {prompt[:50]}{'...' if len(prompt) > 50 else ''}",
            "timestamp": datetime.now().timestamp(),
            "type": "create"
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
        print(f"Create Exception: {str(e)}")
        refund_quota(username)
        raise HTTPException(500, str(e))

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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
