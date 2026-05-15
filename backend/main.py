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
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib3.connection import HTTPConnection
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Request, status
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

# 导入限流器
try:
    from backend.rate_limiter import (
        limiter, get_client_ip,
        LOGIN_IP_LIMIT, LOGIN_USER_LIMIT,
        SMS_IP_LIMIT, SMS_PHONE_LIMIT,
        VERIFY_IP_LIMIT,
        CREATE_USER_LIMIT, CREATE_IP_LIMIT,
        UPLOAD_USER_LIMIT, UPLOAD_IP_LIMIT,
        FEEDBACK_IP_LIMIT, ADMIN_IP_LIMIT,
    )
except ImportError:
    from rate_limiter import (
        limiter, get_client_ip,
        LOGIN_IP_LIMIT, LOGIN_USER_LIMIT,
        SMS_IP_LIMIT, SMS_PHONE_LIMIT,
        VERIFY_IP_LIMIT,
        CREATE_USER_LIMIT, CREATE_IP_LIMIT,
        UPLOAD_USER_LIMIT, UPLOAD_IP_LIMIT,
        FEEDBACK_IP_LIMIT, ADMIN_IP_LIMIT,
    )

# --- 1. 初始化配置 ---
load_dotenv()

APP_ENV = (os.getenv("APP_ENV") or os.getenv("ENV") or "development").strip().lower()
IS_PRODUCTION = APP_ENV in {"prod", "production"}
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "default_secret_key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 
TT_API_KEY = os.getenv("TT_API_KEY")
TUZI_API_KEY = os.getenv("TUZI_API_KEY")
CORS_ALLOW_ORIGINS = [x.strip() for x in (os.getenv("CORS_ALLOW_ORIGINS") or "").split(",") if x.strip()]
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))
ALLOWED_UPLOAD_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
}
ALLOWED_UPLOAD_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}

if IS_PRODUCTION and (not SECRET_KEY or SECRET_KEY == "default_secret_key" or len(SECRET_KEY) < 32):
    raise RuntimeError("JWT_SECRET_KEY must be explicitly configured in production and be at least 32 characters")

if IS_PRODUCTION and not CORS_ALLOW_ORIGINS:
    raise RuntimeError("CORS_ALLOW_ORIGINS must be configured in production")

allow_origins = CORS_ALLOW_ORIGINS or ["*"]
allow_credentials = allow_origins != ["*"]

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
    invite_code: Optional[str] = None  # 可选邀请码，填写有效邀请码赠送积分

class AdminCreateUserRequest(BaseModel):
    initial_quota: int = 50

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
    allow_origins=allow_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. 数据层 ---
def load_db():
    """加载数据库，如果主文件损坏则尝试从备份恢复。

    线程安全说明：读操作在 db_lock 下调用最保险；本函数自身不加锁，
    由调用方决定是否在 with db_lock 中使用。已有路径（deduct/refund/
    业务读写）基本都在锁内读，外部偶发脏读不会造成数据损坏。
    """
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
            if "users" in data and "history" in data:
                return data
            raise ValueError("数据结构不完整")
    except Exception as e:
        print(f"⚠️ 主数据库加载失败: {e}")

    # 主文件损坏或不完整，尝试从备份恢复
    backup_file = f"{DB_FILE}.bak"
    if os.path.exists(backup_file):
        try:
            with open(backup_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if "users" in data and "history" in data:
                    # 恢复备份到主文件（用原子写，避免再次产生半写状态）
                    _atomic_write_json(DB_FILE, data)
                    print(f"✅ 已从备份文件恢复数据库")
                    return data
        except Exception as e:
            print(f"❌ 备份文件也损坏: {e}")

    # 两个文件都损坏：抛异常让服务启动失败，不返回空数据导致配额重置
    raise RuntimeError("❌ 数据库及备份均损坏，请手动检查 wx_data.json 和 wx_data.json.bak")


# --- 原子写 + 节流备份 ---
# 每次 save_db 都用 tmp + fsync + os.replace 做原子替换，保证 DB_FILE 永远是一致的 JSON。
# .bak 不再每次都 copy（高并发下是两倍 I/O），改为至少 BACKUP_MIN_INTERVAL 秒才刷新一次快照。
BACKUP_MIN_INTERVAL = float(os.getenv("DB_BACKUP_INTERVAL_SECONDS", "30"))
_last_backup_ts = 0.0


def _atomic_write_json(path: str, data) -> None:
    """tmp 文件写完 fsync 后用 os.replace 原子替换目标文件。

    - os.replace 在 POSIX 下是原子的；进程崩溃不会留下半写 DB_FILE。
    - 失败时保留 tmp 方便排查，不破坏原始 DB_FILE。
    """
    tmp_path = f"{path}.tmp.{os.getpid()}.{threading.get_ident()}"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        try:
            os.fsync(f.fileno())
        except OSError:
            # 某些文件系统（如部分 CI 容器）不支持 fsync，忽略
            pass
    os.replace(tmp_path, path)


def save_db(data):
    """原子写 + 节流备份。

    所有业务路径已经在 db_lock 内调用，这里不再重复加锁。
    备份按时间节流：读时只要 DB_FILE 合法就不依赖 .bak；
    .bak 作为"万一 DB_FILE 被人工误删"时的回退。
    """
    global _last_backup_ts
    # 先做 .bak（用当前磁盘上的旧值，不包含本次要写的新数据；节流）
    now = time.time()
    if os.path.exists(DB_FILE) and (now - _last_backup_ts) >= BACKUP_MIN_INTERVAL:
        try:
            shutil.copy(DB_FILE, f"{DB_FILE}.bak")
            _last_backup_ts = now
        except Exception as e:
            # 备份失败不阻塞主写
            print(f"⚠️ 备份 wx_data.json.bak 失败: {e}")
    # 原子替换主文件
    _atomic_write_json(DB_FILE, data)

def verify_password(plain, hashed): return pwd_context.verify(plain, hashed)


# 旧前端 id 到新 id 的兼容映射（逐步过渡，确认所有前端已更新后可删除）
_LEGACY_MODEL_ID_MAP = {
    "gpt-image-2-vip": "gpt-image-2-high",
    # 老前端里 nano-banana 是 tuzi 的 gpt-image-2 特殊 quality 档位，现已下线
    "nano-banana": "gpt-image-2",
    # 注意：nano-banana-2 / nano-banana-2-2k / nano-banana-2-4k 现在是真实注册的模型
    # （tuzi · gemini-3.1-flash-image-preview），不能再重定向
}


def _normalize_model_id(model: str) -> str:
    if not model:
        return "gpt-image-2"
    return _LEGACY_MODEL_ID_MAP.get(model, model)
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
db_lock = threading.RLock()

# quota_logs 最大保留条数，超过从头裁剪
MAX_QUOTA_LOGS = 10000

def deduct_quota_atomic(username: str, amount: int = 1, source: str = "platform", model: str = None, reason_override: str = None) -> int:
    """
    原子性预扣分 + 记日志：检查配额 → 扣除 → 写日志 → 一次 save_db。
    source: "platform" 表示平台创作消耗, "api" 表示 API 调用消耗
    返回扣除后的剩余配额。如果配额不足，抛出 HTTPException。
    """
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if not user:
            raise HTTPException(status_code=401, detail="用户异常")
        if user["quota"] < amount:
            raise HTTPException(status_code=403, detail="配额不足")
        user["quota"] -= amount
        remaining = user["quota"]

        # 同一把锁内写日志，避免二次 load_db + save_db
        if "quota_logs" not in db:
            db["quota_logs"] = []
        reason = reason_override if reason_override else ("API调用消耗" if source == "api" else "创作消耗")
        db["quota_logs"].append({
            "id": str(uuid.uuid4()),
            "username": username,
            "operator": "system",
            "amount": -amount,
            "balance_after": remaining,
            "reason": reason,
            "type": "consume",
            "source": source,
            "model": model,
            "timestamp": time.time()
        })
        # 裁剪过长日志
        if len(db["quota_logs"]) > MAX_QUOTA_LOGS:
            db["quota_logs"] = db["quota_logs"][-MAX_QUOTA_LOGS:]
        save_db(db)
        return remaining

def refund_quota(username: str, amount: int = 1):
    """
    回滚配额 + 记日志：返还积分 → 写日志 → 一次 save_db。
    """
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if user:
            user["quota"] += amount
            # 同一把锁内写日志
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
            # 裁剪过长日志
            if len(db["quota_logs"]) > MAX_QUOTA_LOGS:
                db["quota_logs"] = db["quota_logs"][-MAX_QUOTA_LOGS:]
            save_db(db)
            print(f"✅ 已回滚配额 {amount} 点给用户 {username}")


def _validate_upload(file: UploadFile, file_bytes: bytes) -> str:
    content_type = (file.content_type or "").lower().strip()
    ext = (os.path.splitext(file.filename or "")[1] or "").lower()

    if len(file_bytes) == 0:
        raise HTTPException(400, "上传文件为空")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"文件过大，限制 {MAX_UPLOAD_BYTES // (1024 * 1024)}MB")
    if content_type not in ALLOWED_UPLOAD_MIME_TYPES:
        raise HTTPException(415, f"不支持的文件类型: {content_type or 'unknown'}")
    if ext and ext not in ALLOWED_UPLOAD_EXTS:
        raise HTTPException(415, f"不支持的文件扩展名: {ext}")

    if ext:
        return ext
    if content_type == "image/png":
        return ".png"
    if content_type == "image/webp":
        return ".webp"
    if content_type in {"image/heic", "image/heif"}:
        return ".heic"
    return ".jpg"

# --- 4. 路由 ---

@app.post("/auth/token")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    client_ip = get_client_ip(request)
    # 限流：IP 维度 + 用户名维度
    limiter.check("login_ip", client_ip, *LOGIN_IP_LIMIT, "登录请求过于频繁")
    limiter.check("login_user", form_data.username, *LOGIN_USER_LIMIT, "该账号登录尝试过多，请稍后再试")

    db = load_db()
    user = db["users"].get(form_data.username)
    if not user or not user.get("hash") or not verify_password(form_data.password, user["hash"]): raise HTTPException(400, "账号或密码错误")
    if user.get("disabled"):
        raise HTTPException(403, "账号已被禁用")
    return {"access_token": create_access_token({"sub": form_data.username}), "token_type": "bearer", "username": form_data.username, "quota": user["quota"], "role": user.get("role", "user")}

@app.post("/auth/send-code")
async def send_code(request: SendCodeRequest, raw_request: Request = None):
    """发送短信验证码（需要滑块验证）"""
    if raw_request:
        client_ip = get_client_ip(raw_request)
        # 限流：IP 维度 + 手机号维度
        limiter.check("sms_ip", client_ip, *SMS_IP_LIMIT, "短信发送请求过于频繁")
        limiter.check("sms_phone", request.phone.strip(), *SMS_PHONE_LIMIT, "该手机号发送验证码过于频繁")

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
async def verify_code(request: VerifyCodeRequest, raw_request: Request = None):
    """验证码登录/注册"""
    if raw_request:
        client_ip = get_client_ip(raw_request)
        limiter.check("verify_ip", client_ip, *VERIFY_IP_LIMIT, "验证请求过于频繁")

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
        # 检查邀请码：只有填写了有效邀请码才赠送积分
        INITIAL_QUOTA_FOR_NEW_USER = 0
        invite_code_used = None
        if request.invite_code and request.invite_code.strip():
            invite_code_str = request.invite_code.strip().upper()
            invite_codes = db.get("invite_codes", [])
            matched_code = None
            for ic in invite_codes:
                if ic["code"] == invite_code_str and not ic.get("used"):
                    matched_code = ic
                    break
            if matched_code:
                INITIAL_QUOTA_FOR_NEW_USER = 50
                matched_code["used"] = True
                matched_code["used_by"] = phone
                matched_code["used_at"] = time.time()
                invite_code_used = invite_code_str
        
        db["users"][phone] = {
            "phone": phone,
            "quota": INITIAL_QUOTA_FOR_NEW_USER,
            "role": "user",
            "created_at": time.time()
        }
        
        # 记录初始积分日志（仅在有赠送时记录）
        if INITIAL_QUOTA_FOR_NEW_USER > 0:
            if "quota_logs" not in db:
                db["quota_logs"] = []
            db["quota_logs"].append({
                "id": str(uuid.uuid4()),
                "username": phone,
                "operator": "system",
                "amount": INITIAL_QUOTA_FOR_NEW_USER,
                "balance_after": INITIAL_QUOTA_FOR_NEW_USER,
                "reason": f"新用户注册赠送积分（邀请码: {invite_code_used}）",
                "type": "signup_bonus",
                "timestamp": time.time()
            })
        save_db(db)
        if invite_code_used:
            print(f"✅ 新用户注册: {phone}（邀请码 {invite_code_used}，赠送积分 {INITIAL_QUOTA_FOR_NEW_USER}）")
        else:
            print(f"✅ 新用户注册: {phone}（无有效邀请码，不赠送积分）")
    
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
async def upload_image(request: Request, file: UploadFile = File(...), u: str = Depends(get_current_user)):
    client_ip = get_client_ip(request)
    limiter.check("upload_user", u, *UPLOAD_USER_LIMIT, "上传过于频繁")
    limiter.check("upload_ip", client_ip, *UPLOAD_IP_LIMIT, "上传过于频繁")
    try:
        file_content = await file.read()
        ext = _validate_upload(file, file_content)
        oss_url = upload_bytes_to_oss(file_content, ext)
        return {"status": "success", "url": oss_url}
    except HTTPException:
        raise
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
    request: Request,
    prompt: str = Form(...),
    style: str = Form(...),
    image_urls_json: str = Form(...), 
    username: str = Depends(get_current_user)
):
    client_ip = get_client_ip(request)
    limiter.check("create_user", username, *CREATE_USER_LIMIT, "创作请求过于频繁")
    limiter.check("create_ip", client_ip, *CREATE_IP_LIMIT, "创作请求过于频繁")

    try:
        from backend.api_gateway.pricing import resolve_model_cost
        from backend.api_gateway.service import run_model_raw, ServiceError
    except ImportError:
        from api_gateway.pricing import resolve_model_cost
        from api_gateway.service import run_model_raw, ServiceError

    model = "gpt-image-2"
    cost = resolve_model_cost(model, default=1)

    # 预扣分（原子操作，防止并发超用）
    remaining_quota = deduct_quota_atomic(username, cost, model=model)
    
    try:
        image_list = json.loads(image_urls_json)
    except:
        refund_quota(username, cost)  # 参数错误，回滚
        raise HTTPException(400, "图片列表格式错误")

    # 通过 API Gateway 调用（handler 已扣分，这里用 run_model_raw 不重复扣）
    try:
        full_prompt = f"{prompt}, {style} style, 8k"
        result = run_model_raw(
            model_id=model,
            prompt=full_prompt,
            image=image_list,
            username=username,
            source="product:/api/generate",
            mirror_to_oss=True,
        )
        result_url = (result.get("images") or [None])[0]
        if not result_url:
            raise RuntimeError("未获取到生成图片")

        record = {"id": str(uuid.uuid4()), "image": result_url, "prompt": prompt,
                  "timestamp": datetime.now().timestamp(), "type": "product", "model": model}
        with db_lock:
            db = load_db()
            if username not in db["history"]:
                db["history"][username] = []
            db["history"][username].append(record)
            save_db(db)

        return {"status": "SUCCESS", "data": {"image_url": result_url, "history_item": record,
                                              "remaining_quota": remaining_quota}}
    except ServiceError as se:
        refund_quota(username, cost)
        raise HTTPException(se.status_code, str(se))
    except HTTPException:
        raise
    except Exception as e:
        print(f"Gen Exception: {str(e)}")
        refund_quota(username, cost)
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
    request: Request,
    background_tasks: BackgroundTasks,
    mode: str = Form(...),
    strength: str = Form(...),
    suggestion: str = Form(""),
    image_url: str = Form(...),
    username: str = Depends(get_current_user)
):
    """智能修图接口 - 异步优化版"""
    client_ip = get_client_ip(request)
    limiter.check("create_user", username, *CREATE_USER_LIMIT, "修图请求过于频繁")
    limiter.check("create_ip", client_ip, *CREATE_IP_LIMIT, "修图请求过于频繁")
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
        from backend.api_gateway.pricing import resolve_model_cost
        from backend.api_gateway.service import run_model_raw, ServiceError
    except ImportError:
        from api_gateway.pricing import resolve_model_cost
        from api_gateway.service import run_model_raw, ServiceError

    model = "gpt-image-2"
    cost = resolve_model_cost(model, default=1)

    try:
        remaining_quota = deduct_quota_atomic(username, cost, model=model)
    except TypeError:
        # Fallback if function only accepts 1 arg
        remaining_quota = deduct_quota_atomic(username, model=model)
    
    # 构造提示词
    base_prompt = RETOUCH_TEMPLATES[mode]
    strength_prompt = f"Strength level: {STRENGTH_MAPPING[strength]}."
    user_suggestion = f"Additional instruction: {suggestion}" if suggestion else ""
    full_prompt = f"{base_prompt} {strength_prompt} {user_suggestion}"

    image_list = [image_url]

    # 通过 API Gateway 调用
    try:
        result = run_model_raw(
            model_id=model,
            prompt=full_prompt,
            image=image_list,
            username=username,
            source="product:/api/retouch",
            mirror_to_oss=False,  # 保留原逻辑：异步后台转存
        )
        result_url = (result.get("images") or [None])[0]
        if not result_url:
            raise RuntimeError("未获取到生成图片")

        record_id = str(uuid.uuid4())
        record = {
            "id": record_id,
            "image": result_url,
            "prompt": f"[{STRENGTH_MAPPING[strength]}] {mode}",
            "timestamp": datetime.now().timestamp(),
            "type": "retouch",
            "model": model
        }
        with db_lock:
            db = load_db()
            if username not in db["history"]:
                db["history"][username] = []
            db["history"][username].insert(0, record)
            save_db(db)

        background_tasks.add_task(background_save_to_oss, username, record_id, result_url)

        return {
            "status": "SUCCESS",
            "data": {
                "image_url": result_url,
                "history_item": record,
                "remaining_quota": remaining_quota
            }
        }
    except ServiceError as se:
        refund_quota(username, cost)
        raise HTTPException(se.status_code, str(se))
    except HTTPException:
        raise
    except Exception as e:
        print(f"Gen Exception: {str(e)}")
        refund_quota(username, cost)
        raise HTTPException(500, "修图过程发生未知错误，请稍后再试")
    


# --- 人像写真固定提示词 ---
PORTRAIT_PROMPT = "Replace the face in Figure 1 with the face in Figure 2, keeping all other details the same."

@app.post("/api/portrait")
def portrait_generate(
    request: Request,
    subject_url: str = Form(...),  # 本人照片
    target_url: str = Form(...),   # 目标写真/服装
    username: str = Depends(get_current_user)
):
    """人像写真接口"""
    client_ip = get_client_ip(request)
    limiter.check("create_user", username, *CREATE_USER_LIMIT, "写真请求过于频繁")
    limiter.check("create_ip", client_ip, *CREATE_IP_LIMIT, "写真请求过于频繁")

    try:
        from backend.api_gateway.pricing import resolve_model_cost
        from backend.api_gateway.service import run_model_raw, ServiceError
    except ImportError:
        from api_gateway.pricing import resolve_model_cost
        from api_gateway.service import run_model_raw, ServiceError

    model = "gpt-image-2"
    cost = resolve_model_cost(model, default=1)

    # 预扣分
    remaining_quota = deduct_quota_atomic(username, cost, model=model)

    try:
        result = run_model_raw(
            model_id=model,
            prompt=PORTRAIT_PROMPT,
            image=[subject_url, target_url],
            username=username,
            source="product:/api/portrait",
            mirror_to_oss=True,
        )
        result_url = (result.get("images") or [None])[0]
        if not result_url:
            raise RuntimeError("未获取到生成图片")

        record = {
            "id": str(uuid.uuid4()),
            "image": result_url,
            "prompt": "[人像写真]",
            "timestamp": datetime.now().timestamp(),
            "type": "portrait",
            "model": model
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
    except ServiceError as se:
        refund_quota(username, cost)
        raise HTTPException(se.status_code, str(se))
    except HTTPException:
        raise
    except Exception as e:
        print(f"Portrait Exception: {str(e)}")
        refund_quota(username, cost)
        raise HTTPException(500, "写真生成过程发生未知错误，请稍后再试")

@app.post("/api/create")
def basic_create(
    request: Request,
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
    client_ip = get_client_ip(request)
    limiter.check("create_user", username, *CREATE_USER_LIMIT, "创作请求过于频繁")
    limiter.check("create_ip", client_ip, *CREATE_IP_LIMIT, "创作请求过于频繁")

    if not (1 <= n <= 10):
        raise HTTPException(400, "生成数量 n 必须介于 1 和 10 之间")
    if quality.lower() not in ["auto", "low", "medium", "high", "1k", "2k", "4k", "hd"]:
        raise HTTPException(400, f"无效的质量参数: {quality}")
        
    # 解析图片列表
    try:
        image_list = json.loads(image_urls_json)
        if not isinstance(image_list, list):
            image_list = []
    except:
        image_list = []

    # 计费：按用户选择的 model_id 走 registry
    try:
        from backend.api_gateway.pricing import resolve_model_cost
    except ImportError:
        from api_gateway.pricing import resolve_model_cost

    # 标准化：把老 id gpt-image-2-vip 映射到新 id（兼容旧前端）
    model = _normalize_model_id(model)

    cost_per_item = resolve_model_cost(model, n=1, size=size, default=1)
    total_cost = cost_per_item * n
    
    # 预扣分 (按照生成张数扣除积分)
    remaining_quota = deduct_quota_atomic(username, amount=total_cost, model=model)
    
    task_id = str(uuid.uuid4())
    # batch_id: 同一批次 N 张共享的逻辑 ID，供前端把 N 个占位 task 与服务端返回的 N 张对齐
    batch_id = str(uuid.uuid4())
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
            "prompt": prompt,
            "timestamp": datetime.now().timestamp(),
            "type": "create",
            "status": "ON_QUEUE",
            "model": model,
            "size": size or "auto",
            "batch_id": batch_id,
            "batch_total": n,
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
        batch_id=batch_id,
    )
    
    return {
        "status": "SUCCESS",
        "data": {
            "taskId": task_id,
            "batchId": batch_id,
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
    batch_id: str = "",
):
    """后台线程执行图片生成，直接使用用户选择的 model_id（走 registry 里的对应 adapter）。

    N 张图并发下发：每次单张调用，失败按比例退款。
    """
    try:
        try:
            from backend.api_gateway.service import run_model_raw, ServiceError
        except ImportError:
            from api_gateway.service import run_model_raw, ServiceError
    except Exception as imp_err:
        print(f"❌ 导入 API Gateway 失败: {imp_err}")
        refund_quota(username, amount=amount)
        return

    actual_n = max(1, min(10, int(n or 1)))
    cost_per = amount // actual_n if actual_n else amount
    print(f"🎨 [/api/create] 任务 {task_id[:8]} user={username} n={actual_n} "
          f"model={model} size={size}")

    def _one(i: int) -> str:
        if i > 0:
            time.sleep(random.uniform(1.0, 2.0) * i)
        res = run_model_raw(
            model_id=model,
            prompt=prompt,
            image=image_list or [],
            size=size if size else None,
            n=1,
            quality=quality if quality and quality != "auto" else None,
            username=username,
            source="product:/api/create",
            mirror_to_oss=True,
        )
        return (res.get("images") or [None])[0]

    result_urls: list = []
    failed = 0
    with ThreadPoolExecutor(max_workers=actual_n) as pool:
        futures = [pool.submit(_one, i) for i in range(actual_n)]
        for fut in as_completed(futures):
            try:
                url = fut.result()
                if url:
                    result_urls.append(url)
                else:
                    failed += 1
            except Exception as e:
                print(f"  ❌ single gen failed: {e}")
                failed += 1

    # 部分失败按比例退
    if failed > 0 and actual_n:
        refund_amount = cost_per * failed
        if refund_amount > 0:
            refund_quota(username, amount=refund_amount)
            print(f"  💰 {failed}/{actual_n} 张失败，退回 {refund_amount} 积分")

    # 写回 DB
    with db_lock:
        db = load_db()
        if username in db.get("history", {}):
            original_item = None
            for item in db["history"][username]:
                if item["id"] == task_id:
                    original_item = item
                    break
            if original_item:
                if result_urls:
                    original_item["status"] = "SUCCESS"
                    original_item["image"] = result_urls[0]
                    original_item["image_urls"] = result_urls
                    original_item["batch_id"] = batch_id
                    original_item["batch_index"] = 0
                    original_item["batch_total"] = max(1, actual_n)

                    for idx, extra_url in enumerate(result_urls[1:], start=1):
                        extra_record = original_item.copy()
                        extra_record["id"] = str(uuid.uuid4())
                        extra_record["image"] = extra_url
                        extra_record["image_urls"] = [extra_url]
                        extra_record["batch_index"] = idx
                        extra_record["timestamp"] += 0.001 * idx
                        db["history"][username].append(extra_record)
                else:
                    original_item["status"] = "FAILED"
                    original_item["batch_id"] = batch_id
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
# 🎨 GPT Image 2 Pro（TTAPI 非官转异步通道，upstream: gpt-image-2-plus）
# ------------------------------------------
# 独立路径 /api/create/pro，与现有 /api/create（Tuzi）完全隔离：
# - Endpoint: https://api.ttapi.io/openai/gpt/generations（同 TT_ENDPOINT，异步 jobId + fetch 轮询）
# - Auth:     TT-API-KEY
# - 计费:     从 registry 读（默认 per_image 2 积分）
# - n 支持 1-10，后端并发下发 n 次单张请求（非官转通道不支持原生 n）
# ==========================================


def _pro_upstream_model() -> str:
    """从 registry 读取 gpt-image-2-pro 的上游模型名"""
    try:
        from backend.api_gateway.pricing import resolve_model_config
    except ImportError:
        from api_gateway.pricing import resolve_model_config
    cfg = resolve_model_config("gpt-image-2-pro") or {}
    return cfg.get("upstream_model") or "gpt-image-2-plus"


def _map_pro_error_to_user_message(raw_msg: str) -> tuple:
    """
    把 TT-API 上游错误映射为用户友好中文文案。
    返回 (http_status, user_message)。对外绝不暴露 provider 名 / req_id / 英文原文。
    """
    import re
    msg = raw_msg or ""
    low = msg.lower()

    # 1) 内容安全拦截
    if "safety system" in low or "safety_violations" in low or "content_policy" in low or "moderation" in low:
        cat_map = {
            "sexual": "涉性敏感",
            "violence": "暴力",
            "hate": "仇恨",
            "self-harm": "自残",
            "self_harm": "自残",
            "minor": "未成年人相关",
            "minors": "未成年人相关",
            "illicit": "违法",
            "harassment": "骚扰",
        }
        m = re.search(r"safety_violations=\[([^\]]+)\]", msg)
        if m:
            cats = [c.strip() for c in m.group(1).split(",") if c.strip()]
            readable = "、".join(cat_map.get(c, "敏感") for c in cats) or "敏感"
            return 400, f"描述含 {readable} 内容，已被安全系统拦截，请调整描述后再试"
        return 400, "描述包含敏感内容，已被安全系统拦截，请调整描述后再试"

    # 2) 参数相关
    if "size" in low and ("invalid" in low or "not supported" in low or "unsupported" in low):
        return 400, "所选尺寸不支持，请调整宽高后再试"
    if "unknown parameter" in low or "invalid parameter" in low:
        return 400, "生成参数不合法，请换一组设置后再试"
    if "prompt" in low and ("too long" in low or "exceed" in low or "maximum" in low):
        return 400, "描述过长，请精简后再试"
    if "image" in low and ("too large" in low or "exceeds" in low):
        return 400, "参考图过大或无效，请更换图片后再试"

    # 3) 网关 / 超时
    if "504" in low or "gateway time-out" in low or "gateway timeout" in low:
        return 504, "图像生成服务繁忙，请稍后再试"
    if "502" in low or "bad gateway" in low:
        return 502, "图像生成服务暂时不稳定，请稍后再试"
    if "503" in low or "service unavailable" in low:
        return 503, "图像生成服务暂时不可用，请稍后再试"

    # 4) 认证 / 配额
    if "unauthorized" in low or "invalid api key" in low or "401" in low:
        return 503, "图像服务暂时不可用，请稍后再试"
    if "insufficient" in low and "quota" in low:
        return 503, "图像服务额度不足，请稍后再试"

    # 5) 限流
    if "rate limit" in low or "too many requests" in low or "429" in low:
        return 429, "请求过于频繁，请稍后再试"

    # 6) 超时 / 网络抖动
    if "timeout" in low or "timed out" in low:
        return 504, "生成超时，请稍后再试"
    if "remotedisconnected" in low or ("connection" in low and "closed" in low):
        return 502, "网络波动导致生成失败，请稍后再试"

    # 7) 非 JSON / 兜底 5xx
    if "非 JSON" in msg or "returned http" in low or re.search(r"http\s*5\d\d", low):
        return 502, "图像服务响应异常，请稍后再试"

    return 500, "生成失败，请稍后再试"


def _pro_call_single(prompt: str, image_list: list, size: str, upstream_model: str) -> str:
    """
    发一次 gpt-image-2-plus 生图（通过 API Gateway 的 ttapi-image adapter）。
    成功返回 image url；失败抛 RuntimeError。
    """
    try:
        from backend.api_gateway.service import run_model_raw, ServiceError
    except ImportError:
        from api_gateway.service import run_model_raw, ServiceError
    try:
        res = run_model_raw(
            model_id="gpt-image-2-pro",
            prompt=prompt,
            image=list(image_list)[:16] if image_list else [],
            size=size if size and size != "auto" else None,
            n=1,
            source="product:/api/create/pro",
            mirror_to_oss=False,  # handler 自己转存（保持原有逻辑）
            config_override={"upstream_model": upstream_model},
        )
    except ServiceError as se:
        raise RuntimeError(str(se))
    url = (res.get("images") or [None])[0]
    if not url:
        raise RuntimeError("未获取到生成图片")
    return url


@app.post("/api/create/pro")
def basic_create_pro(
    request: Request,
    background_tasks: BackgroundTasks,
    prompt: str = Form(...),
    image_urls_json: str = Form("[]"),
    size: str = Form("auto"),
    n: int = Form(1),
    username: str = Depends(get_current_user),
):
    """
    GPT Image 2 Pro（TTAPI 非官转异步 gpt-image-2-plus）
    - 固定 2 积分/张，总扣 n * 2
    - n 支持 1-10，后台并发 n 次 TTAPI submit+poll
    - 入口立即返回 taskId/batchId，前端走 /api/create/status 轮询，和 /api/create 对齐
    """
    client_ip = get_client_ip(request)
    limiter.check("create_user", username, *CREATE_USER_LIMIT, "创作请求过于频繁")
    limiter.check("create_ip", client_ip, *CREATE_IP_LIMIT, "创作请求过于频繁")

    if not (1 <= n <= 10):
        raise HTTPException(400, "生成数量 n 必须介于 1 和 10 之间")

    try:
        image_list = json.loads(image_urls_json) if image_urls_json else []
        if not isinstance(image_list, list):
            image_list = []
    except Exception:
        image_list = []

    if size and size != "auto" and "x" not in size:
        size = "auto"

    try:
        from backend.api_gateway.pricing import resolve_model_cost
    except ImportError:
        from api_gateway.pricing import resolve_model_cost

    upstream_model = _pro_upstream_model()
    cost_per = resolve_model_cost("gpt-image-2-pro", n=1, default=2)
    min_quota = cost_per  # 单张所需积分作为入口门槛
    total_cost = cost_per * n

    # 入口门槛
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if not user:
            raise HTTPException(401, "用户异常")
        if user.get("quota", 0) < max(min_quota, total_cost):
            raise HTTPException(403, f"积分不足，本次需要 {total_cost} 积分")

    # 预扣总积分
    remaining_after = deduct_quota_atomic(username, amount=total_cost, model="gpt-image-2-pro")

    task_id = str(uuid.uuid4())
    batch_id = str(uuid.uuid4())
    create_type = "text2img-pro" if not image_list else f"img2img-pro({len(image_list)})"

    # 立即写 ON_QUEUE 占位记录（和 /api/create 对齐）
    with db_lock:
        db = load_db()
        if username not in db["history"]:
            db["history"][username] = []
        db["history"][username].append({
            "id": task_id,
            "image": None,
            "image_urls": [],
            "prompt": prompt,
            "timestamp": datetime.now().timestamp(),
            "type": "create",
            "status": "ON_QUEUE",
            "model": "gpt-image-2-pro",
            "size": size or "auto",
            "batch_id": batch_id,
            "batch_total": n,
        })
        save_db(db)

    # 提交后台任务：并发 n 次 submit+poll，写回 SUCCESS/FAILED
    background_tasks.add_task(
        background_generate_pro,
        task_id=task_id,
        username=username,
        prompt=prompt,
        image_list=image_list,
        upstream_model=upstream_model,
        size=size,
        n=n,
        amount=total_cost,
        cost_per=cost_per,
        batch_id=batch_id,
    )

    # 立即返回（不等生成），前端拿 taskId/batchId 去 /api/create/status 轮询
    return {
        "status": "SUCCESS",
        "data": {
            "taskId": task_id,
            "batchId": batch_id,
            "remaining_quota": remaining_after,
        },
    }


def background_generate_pro(
    task_id: str,
    username: str,
    prompt: str,
    image_list: list,
    upstream_model: str,
    size: str,
    n: int,
    amount: int,
    cost_per: int,
    batch_id: str,
):
    """
    后台并发跑 n 次 TTAPI gpt-image-2-plus（submit + poll）。
    完成后按 /api/create 的 batch 规范写回 DB：
    - 第 0 张写到原 task_id 记录上（SUCCESS）
    - 第 1..N-1 张作为 extra 记录追加，batch_index 分别 1,2,...
    - 全部失败：原记录标 FAILED
    - 部分失败：按失败张数退款
    """
    result_urls: list = []
    failed_count = 0
    first_error_msg = ""

    try:
        def _run(i: int) -> tuple:
            if i > 0:
                time.sleep(random.uniform(0.5, 1.2) * i)
            try:
                url = _pro_call_single(prompt, image_list, size, upstream_model)
                return i, url, None
            except Exception as ex:
                return i, None, str(ex)

        # 按 batch_index 保序：用 dict 暂存，避免 as_completed 乱序
        idx_url_map: dict = {}
        with ThreadPoolExecutor(max_workers=n) as pool:
            futures = [pool.submit(_run, i) for i in range(n)]
            for fut in as_completed(futures):
                i, url, err = fut.result()
                if url:
                    idx_url_map[i] = url
                else:
                    failed_count += 1
                    if err and not first_error_msg:
                        first_error_msg = err

        # 按顺序收集（索引 0..n-1），失败的位置用空串占位方便后面跳过
        ordered = [(i, idx_url_map.get(i)) for i in range(n)]
        ok_ordered = [(i, u) for (i, u) in ordered if u]

        if not ok_ordered:
            raise RuntimeError(first_error_msg or "全部生成失败")

        # 部分失败：按比例退款
        if failed_count > 0:
            refund_amount = cost_per * failed_count
            refund_quota(username, amount=refund_amount)
            print(f"[Pro] {failed_count}/{n} 张失败，退回 {refund_amount} 积分")

        # OSS 转存
        final_pairs = []  # [(batch_index, oss_url), ...]
        for i, url in ok_ordered:
            if OSS_DOMAIN and OSS_DOMAIN in url:
                final_pairs.append((i, url)); continue
            if OSS_BUCKET_NAME and OSS_BUCKET_NAME in url:
                final_pairs.append((i, url)); continue
            try:
                r_gen = requests.get(url, timeout=60)
                if r_gen.status_code == 200:
                    final_pairs.append((i, upload_bytes_to_oss(r_gen.content, ".png")))
                else:
                    final_pairs.append((i, url))
            except Exception as e:
                print(f"[Pro] OSS 转存失败: {e}")
                final_pairs.append((i, url))

        result_urls = [u for _, u in final_pairs]
        print(f"✅ [Pro] 图片生成完成，任务 {task_id}，成功 {len(result_urls)}/{n}")

    except Exception as e:
        print(f"❌ [Pro] 生成出错 (任务 {task_id}): {e}")
        import traceback
        traceback.print_exc()
        # 全失败：全额退款
        refund_quota(username, amount=amount)
    finally:
        # 写回 DB（对齐 background_generate_image 的 batch 展开规则）
        with db_lock:
            db = load_db()
            if username in db.get("history", {}):
                original_item = None
                for item in db["history"][username]:
                    if item["id"] == task_id:
                        original_item = item
                        break

                if original_item:
                    if result_urls:
                        # 第一张填到原任务
                        first_idx, first_url = final_pairs[0]
                        original_item["status"] = "SUCCESS"
                        original_item["image"] = first_url
                        original_item["image_urls"] = result_urls
                        original_item["batch_id"] = batch_id
                        original_item["batch_index"] = first_idx
                        original_item["batch_total"] = n

                        # 其余张作为新记录
                        for idx, extra_url in final_pairs[1:]:
                            extra_record = {
                                **{k: v for k, v in original_item.items()
                                   if k not in ("id", "image", "image_urls", "timestamp", "batch_index")},
                                "id": str(uuid.uuid4()),
                                "image": extra_url,
                                "image_urls": [extra_url],
                                "timestamp": original_item["timestamp"] + 0.001 * idx,
                                "batch_index": idx,
                            }
                            db["history"][username].append(extra_record)
                    else:
                        original_item["status"] = "FAILED"
                        original_item["batch_id"] = batch_id
            save_db(db)


# ==========================================
# 🎨 Midjourney（TTAPI 异步通道）
# ------------------------------------------
# - Endpoint: POST /midjourney/v1/imagine → 提交；GET /midjourney/v1/fetch → 轮询
# - 一次任务返回 4 张子图（data.images[0..3]），另外还有合成的 cdnImage 网格图
# - 速度模式: relax / fast / turbo，对应不同积分
# - 比例通过 --ar 写进 prompt 尾巴（MJ 原生参数格式）
# - image prompt: 把图片 URL 放在 prompt 最前面（空格分隔）
# ==========================================

def _build_mj_prompt(prompt: str, image_list: list, aspect_ratio: str, mj_version: str = "v8.1") -> str:
    """
    拼装 MJ prompt：
    - image_list 放最前：图片 URL 作为 image prompt，空格分隔
    - 用户 prompt 紧随其后（先清洗掉 MJ 已废弃/不支持的 flag）
    - 追加 --ar W:H（auto 或 prompt 里已含 --ar 时跳过）
    - 追加 --v X 或 --niji X（prompt 里已含 --v / --niji 则跳过）
    """
    import re as _re

    def _sanitize(text: str) -> str:
        if not text:
            return ""
        banned_flags = [
            r"--hd\b",
            r"--uplight\b",
            r"--upbeta\b",
            r"--upanime\b",
            r"--test\b",
            r"--testp\b",
            r"--creative\b",
        ]
        cleaned = text
        for pat in banned_flags:
            cleaned = _re.sub(pat, "", cleaned, flags=_re.IGNORECASE)
        cleaned = _re.sub(r"\s+", " ", cleaned).strip(" ,;")
        return cleaned

    parts = []
    if image_list:
        parts.extend(str(u).strip() for u in image_list if u)
    if prompt:
        parts.append(_sanitize(prompt))
    text = " ".join(p for p in parts if p).strip()

    # 追加 --ar（去重）
    has_ar = bool(_re.search(r"--ar\s+\d+\s*:\s*\d+", text, flags=_re.IGNORECASE))
    if not has_ar and aspect_ratio and aspect_ratio != "auto" and ":" in aspect_ratio:
        try:
            w, h = aspect_ratio.split(":", 1)
            int(w); int(h)
            text = f"{text} --ar {aspect_ratio}"
        except Exception:
            pass

    # 追加版本 flag（prompt 已含 --v 或 --niji 时跳过）
    has_version = bool(_re.search(r"--(v|niji)\s+[\d.]+", text, flags=_re.IGNORECASE))
    if not has_version and mj_version:
        v = mj_version.strip().lower()
        # niji 系列
        if v.startswith("niji"):
            num = _re.sub(r"\D", "", v) or "6"
            text = f"{text} --niji {num}"
        else:
            # 去掉 v 前缀，保留数字和小数点
            num = _re.sub(r"[^\d.]", "", v)
            if num:
                text = f"{text} --v {num}"

    return text


@app.post("/api/create/mj")
def basic_create_mj(
    request: Request,
    background_tasks: BackgroundTasks,
    prompt: str = Form(""),
    image_urls_json: str = Form("[]"),
    aspect_ratio: str = Form("auto"),
    mj_mode: str = Form("fast"),
    mj_version: str = Form("v8.1"),
    username: str = Depends(get_current_user),
):
    """
    Midjourney 图像生成（每次出 4 张子图）
    - 按 mode 计费：relax 2 / fast 3 / turbo 5
    - n 由前端控制批量次数（前端多次调此端点），此接口一次请求 = 一次 imagine = 4 张
    """
    client_ip = get_client_ip(request)
    limiter.check("create_user", username, *CREATE_USER_LIMIT, "创作请求过于频繁")
    limiter.check("create_ip", client_ip, *CREATE_IP_LIMIT, "创作请求过于频繁")

    try:
        from backend.api_gateway.pricing import resolve_model_cost, resolve_model_config
    except ImportError:
        from api_gateway.pricing import resolve_model_cost, resolve_model_config

    mode = (mj_mode or "fast").lower()
    if mode not in ("relax", "fast", "turbo"):
        raise HTTPException(400, "无效的 Midjourney 速度模式")
    cost = resolve_model_cost("midjourney", n=1, mode=mode, default=3)
    mj_cfg = resolve_model_config("midjourney") or {}
    images_per_task = int(mj_cfg.get("max_images") or 4)

    # 解析参考图列表
    try:
        image_list = json.loads(image_urls_json) if image_urls_json else []
        if not isinstance(image_list, list):
            image_list = []
    except Exception:
        image_list = []

    # prompt 必填（允许纯图生图时仅图 + 默认提示；但至少要有文字或参考图）
    if not (prompt and prompt.strip()) and not image_list:
        raise HTTPException(400, "请输入描述或上传参考图")

    # 入口门槛 + 预扣
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if not user:
            raise HTTPException(401, "用户异常")
        if user.get("quota", 0) < cost:
            raise HTTPException(403, f"积分不足，本次需要 {cost} 积分")
    remaining_after = deduct_quota_atomic(username, amount=cost, model="midjourney")

    task_id = str(uuid.uuid4())
    batch_id = str(uuid.uuid4())
    create_type = f"mj-{mode}"

    # 写 ON_QUEUE 占位记录（batch_total=4）
    with db_lock:
        db = load_db()
        if username not in db["history"]:
            db["history"][username] = []
        db["history"][username].append({
            "id": task_id,
            "image": None,
            "image_urls": [],
            "prompt": prompt or "",
            "timestamp": datetime.now().timestamp(),
            "type": "create",
            "status": "ON_QUEUE",
            "model": "midjourney",
            "size": aspect_ratio or "1:1",
            "batch_id": batch_id,
            "batch_total": images_per_task,
        })
        save_db(db)

    background_tasks.add_task(
        background_generate_mj,
        task_id=task_id,
        username=username,
        prompt=prompt or "",
        image_list=image_list,
        aspect_ratio=aspect_ratio,
        mode=mode,
        amount=cost,
        batch_id=batch_id,
        mj_version=mj_version,
    )

    return {
        "status": "SUCCESS",
        "data": {
            "taskId": task_id,
            "batchId": batch_id,
            "remaining_quota": remaining_after,
            "mode": mode,
            "cost": cost,
            "batch_total": images_per_task,
        },
    }


def background_generate_mj(
    task_id: str,
    username: str,
    prompt: str,
    image_list: list,
    aspect_ratio: str,
    mode: str,
    amount: int,
    batch_id: str,
    mj_version: str = "v8.1",
):
    """后台执行 MJ imagine：拼 prompt → submit → poll → OSS 转存 → 展开写 DB"""
    final_pairs: list = []  # [(batch_index, oss_url), ...]
    try:
        from backend.api_gateway.pricing import resolve_model_config
    except ImportError:
        from api_gateway.pricing import resolve_model_config
    mj_cfg = resolve_model_config("midjourney") or {}
    poll_timeout = int(mj_cfg.get("poll_timeout") or 1200)
    images_per_task = int(mj_cfg.get("max_images") or 4)

    try:
        full_prompt = _build_mj_prompt(prompt, image_list, aspect_ratio, mj_version)
        print(f"🎨 [MJ] task {task_id[:8]} mode={mode} ver={mj_version} prompt={full_prompt[:200]}")

        try:
            from backend.api_gateway.service import run_model_raw, ServiceError
        except ImportError:
            from api_gateway.service import run_model_raw, ServiceError

        res = run_model_raw(
            model_id="midjourney",
            prompt=full_prompt,
            mode=mode,
            username=username,
            source="product:/api/create/mj",
            mirror_to_oss=False,  # handler 自己转存
            config_override={
                "poll_timeout": poll_timeout,
                "max_images": images_per_task,
            },
        )
        raw_urls = res.get("images") or []
        if not raw_urls:
            raise RuntimeError("MJ 未返回任何图片")

        # OSS 转存（最多 images_per_task 张）
        for i, url in enumerate(raw_urls[:images_per_task]):
            if OSS_DOMAIN and OSS_DOMAIN in url:
                final_pairs.append((i, url)); continue
            if OSS_BUCKET_NAME and OSS_BUCKET_NAME in url:
                final_pairs.append((i, url)); continue
            try:
                r_gen = requests.get(url, timeout=60)
                if r_gen.status_code == 200:
                    final_pairs.append((i, upload_bytes_to_oss(r_gen.content, ".png")))
                else:
                    final_pairs.append((i, url))
            except Exception as e:
                print(f"[MJ] OSS 转存失败: {e}")
                final_pairs.append((i, url))

        print(f"✅ [MJ] 生成完成 task {task_id[:8]} 共 {len(final_pairs)} 张")

    except Exception as e:
        print(f"❌ [MJ] 生成失败 task {task_id[:8]}: {e}")
        import traceback
        traceback.print_exc()
        # 全额退款
        refund_quota(username, amount=amount)
    finally:
        # 写回 DB：和 Pro 同样的 batch 展开规则
        with db_lock:
            db = load_db()
            if username in db.get("history", {}):
                original_item = None
                for item in db["history"][username]:
                    if item["id"] == task_id:
                        original_item = item
                        break

                if original_item:
                    if final_pairs:
                        first_idx, first_url = final_pairs[0]
                        all_urls = [u for _, u in final_pairs]
                        original_item["status"] = "SUCCESS"
                        original_item["image"] = first_url
                        original_item["image_urls"] = all_urls
                        original_item["batch_id"] = batch_id
                        original_item["batch_index"] = first_idx
                        original_item["batch_total"] = images_per_task

                        for idx, extra_url in final_pairs[1:]:
                            extra_record = {
                                **{k: v for k, v in original_item.items()
                                   if k not in ("id", "image", "image_urls", "timestamp", "batch_index")},
                                "id": str(uuid.uuid4()),
                                "image": extra_url,
                                "image_urls": [extra_url],
                                "timestamp": original_item["timestamp"] + 0.001 * idx,
                                "batch_index": idx,
                            }
                            db["history"][username].append(extra_record)
                    else:
                        original_item["status"] = "FAILED"
                        original_item["batch_id"] = batch_id
            save_db(db)


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
    """后台执行视频生成（通过 API Gateway 的 tuzi-video adapter）"""
    result_url = None
    try:
        try:
            from backend.api_gateway.service import run_model_raw, ServiceError
        except ImportError:
            from api_gateway.service import run_model_raw, ServiceError
        print(f"🎬 正在后台为您生成视频... 任务 ID: {task_id}")
        try:
            res = run_model_raw(
                model_id=model,
                prompt=prompt,
                image=image_list or [],
                username=username,
                source="product:/api/video",
                mirror_to_oss=False,  # 视频文件通常较大，保留上游 CDN 链接
            )
            result_url = (res.get("images") or [None])[0]
        except ServiceError as se:
            print(f"Video service error: {se}")
            refund_quota(username, amount)
    except Exception as e:
        print(f"❌ 视频生成出错: {str(e)}")
        refund_quota(username, amount)
    finally:
        with db_lock:
            db = load_db()
            if username not in db["history"]:
                db["history"][username] = []
            for item in db["history"][username]:
                if item["id"] == task_id:
                    item["status"] = "SUCCESS" if result_url else "FAILED"
                    item["image"] = result_url  # 复用 image 字段存储视频 URL
                    break
            save_db(db)

@app.post("/api/video")
def video_generate(
    request: Request,
    background_tasks: BackgroundTasks,
    prompt: str = Form(...),
    image_urls_json: str = Form("[]"),
    username: str = Depends(get_current_user)
):
    client_ip = get_client_ip(request)
    limiter.check("create_user", username, *CREATE_USER_LIMIT, "视频生成请求过于频繁")
    limiter.check("create_ip", client_ip, *CREATE_IP_LIMIT, "视频生成请求过于频繁")

    try:
        from backend.api_gateway.pricing import resolve_model_cost
        from backend.api_gateway.storage import get_model
    except ImportError:
        from api_gateway.pricing import resolve_model_cost
        from api_gateway.storage import get_model

    # 视频默认走 veo3.1-4k；admin 若改成别的 id，可通过 env 覆盖
    model = os.getenv("VIDEO_MODEL_ID", "veo3.1-4k")
    if not get_model(model):
        raise HTTPException(503, f"视频模型 {model} 尚未在管理后台配置")
    cost = resolve_model_cost(model, default=5)

    deduct_quota_atomic(username, cost, model=model)

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
            "model": model,
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
async def submit_feedback(request: FeedbackRequest, raw_request: Request = None):
    """提交用户反馈"""
    if raw_request:
        client_ip = get_client_ip(raw_request)
        limiter.check("feedback_ip", client_ip, *FEEDBACK_IP_LIMIT, "反馈提交过于频繁")

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

@app.get("/api/admin/dashboard")
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

@app.get("/api/admin/users")
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

@app.post("/api/admin/users/create")
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

@app.post("/api/admin/users/{username}/quota")
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

@app.post("/api/admin/users/{username}/password")
async def admin_reset_password(username: str, request: AdminPasswordRequest, admin: str = Depends(get_admin_user)):
    """管理后台重置用户密码"""
    with db_lock:
        db = load_db()
        user = db["users"].get(username)
        if not user:
            raise HTTPException(404, "用户不存在")
        
        user["hash"] = pwd_context.hash(request.new_password)

        # 审计日志
        if "quota_logs" not in db:
            db["quota_logs"] = []
        db["quota_logs"].append({
            "id": str(uuid.uuid4()),
            "username": username,
            "operator": admin,
            "amount": 0,
            "reason": f"管理员 {admin} 重置密码",
            "type": "admin_action",
            "action": "reset_password",
            "timestamp": time.time()
        })
        save_db(db)
    
    return {"message": f"用户 {username} 密码已重置"}

@app.post("/api/admin/users/{username}/status")
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
        new_status = "禁用" if user["disabled"] else "启用"

        # 审计日志
        if "quota_logs" not in db:
            db["quota_logs"] = []
        db["quota_logs"].append({
            "id": str(uuid.uuid4()),
            "username": username,
            "operator": admin,
            "amount": 0,
            "reason": f"管理员 {admin} {new_status}用户",
            "type": "admin_action",
            "action": f"user_{new_status}",
            "timestamp": time.time()
        })
        save_db(db)
    
    return {
        "username": username,
        "disabled": user["disabled"],
        "message": f"用户已{new_status}"
    }


# ==========================================
# 🎟️ 邀请码管理
# ==========================================

class InviteCodeBatchRequest(BaseModel):
    count: int = 1  # 批量生成数量，默认1个，最多50个

@app.post("/api/admin/invite-codes/generate")
async def admin_generate_invite_codes(request: InviteCodeBatchRequest, admin: str = Depends(get_admin_user)):
    """管理员批量生成邀请码"""
    count = min(max(request.count, 1), 50)  # 限制 1~50
    with db_lock:
        db = load_db()
        if "invite_codes" not in db:
            db["invite_codes"] = []
        
        new_codes = []
        for _ in range(count):
            # 生成 8 位大写字母+数字邀请码
            code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
            # 确保不重复
            existing = {ic["code"] for ic in db["invite_codes"]}
            while code in existing:
                code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
            
            invite_entry = {
                "id": str(uuid.uuid4()),
                "code": code,
                "created_by": admin,
                "created_at": time.time(),
                "used": False,
                "used_by": None,
                "used_at": None
            }
            db["invite_codes"].append(invite_entry)
            new_codes.append(invite_entry)
        
        save_db(db)
    
    return {
        "codes": [{"id": c["id"], "code": c["code"]} for c in new_codes],
        "message": f"成功生成 {count} 个邀请码"
    }

@app.get("/api/admin/invite-codes")
async def admin_list_invite_codes(
    page: int = 1,
    page_size: int = 20,
    status: str = "",  # "used" / "unused" / "" (all)
    admin: str = Depends(get_admin_user)
):
    """管理员查看邀请码列表"""
    db = load_db()
    codes = db.get("invite_codes", [])
    
    # 过滤
    if status == "used":
        codes = [c for c in codes if c.get("used")]
    elif status == "unused":
        codes = [c for c in codes if not c.get("used")]
    
    # 按创建时间倒序
    codes.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    
    total = len(codes)
    start = (page - 1) * page_size
    end = start + page_size
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "codes": codes[start:end]
    }

@app.delete("/api/admin/invite-codes/{code_id}")
async def admin_delete_invite_code(code_id: str, admin: str = Depends(get_admin_user)):
    """管理员删除未使用的邀请码"""
    with db_lock:
        db = load_db()
        codes = db.get("invite_codes", [])
        target = None
        for c in codes:
            if c["id"] == code_id:
                target = c
                break
        if not target:
            raise HTTPException(404, "邀请码不存在")
        if target.get("used"):
            raise HTTPException(400, "已使用的邀请码不能删除")
        codes.remove(target)
        save_db(db)
    
    return {"message": "邀请码已删除"}


# ==========================================
# 🔌 API Gateway 接入（sk-xxx 对外 API + 模型注册表）
# ------------------------------------------
# 新端点：
#   POST /v1/images/generations   /v1/images/edits   /v1/videos   (sk-xxx 认证)
#   POST /api/keys  GET /api/keys  PATCH/DELETE /api/keys/{id}    (JWT 认证)
#   GET  /api/keys/logs                                            (JWT)
#   GET  /api/models/public                                        (JWT)
#   GET/POST/PATCH/DELETE /api/admin/models/...                    (admin)
#   GET  /api/admin/adapter-types                                  (admin)
#   GET  /api/admin/api-keys  /api/admin/api-logs                  (admin)
# ==========================================
try:
    # 先把 IO 函数注入 api_gateway.storage
    try:
        from backend.api_gateway import storage as _gw_storage
        from backend.api_gateway import deps as _gw_deps
        from backend.api_gateway.router_public import router as _gw_public_router
        from backend.api_gateway.router_management import build_router as _gw_build_mgmt_router
    except ImportError:
        from api_gateway import storage as _gw_storage
        from api_gateway import deps as _gw_deps
        from api_gateway.router_public import router as _gw_public_router
        from api_gateway.router_management import build_router as _gw_build_mgmt_router

    _gw_storage.set_db_io(db_lock, load_db, save_db)

    def _gw_get_user_quota(username: str) -> int:
        db = load_db()
        return int(((db.get("users") or {}).get(username) or {}).get("quota", 0))

    _gw_deps.set_deps(
        deduct_quota=deduct_quota_atomic,       # 已 monkeypatch 为带日志版本
        refund_quota=refund_quota,               # 已 monkeypatch 为带日志版本
        upload_bytes_to_oss=upload_bytes_to_oss,
        get_user_quota=_gw_get_user_quota,
        get_current_user_dep=get_current_user,
        get_admin_user_dep=get_admin_user,
    )

    _gw_mgmt_router = _gw_build_mgmt_router(
        get_current_user=get_current_user,
        get_admin_user=get_admin_user,
    )

    app.include_router(_gw_public_router)
    app.include_router(_gw_mgmt_router)

    # 自举：将内置默认模型迁入 registry（幂等）
    try:
        try:
            from backend.api_gateway.bootstrap import seed_defaults
        except ImportError:
            from api_gateway.bootstrap import seed_defaults
        _seeded = seed_defaults(tt_api_key=TT_API_KEY or "",
                                tuzi_api_key=TUZI_API_KEY or "")
        if _seeded:
            print(f"✅ API Gateway 已自举模型: {_seeded}")
    except Exception as _seed_err:
        print(f"⚠️ API Gateway 自举失败（不影响运行）: {_seed_err}")

    print("✅ API Gateway 模块已挂载（/v1/* 对外 API + /api/keys + /api/admin/models）")
except Exception as _gw_err:
    print(f"❌ API Gateway 挂载失败: {_gw_err}")
    import traceback as _tb
    _tb.print_exc()

# ==========================================
# 🧹 后台定时清理任务
# ==========================================

# ON_QUEUE 任务超时阈值（秒）：超过此时间仍为 ON_QUEUE 的任务标记为 TIMEOUT 并退款
TASK_TIMEOUT_SECONDS = int(os.getenv("TASK_TIMEOUT_SECONDS", "1800"))  # 默认 30 分钟

def _cleanup_stale_tasks():
    """扫描所有用户历史，清理超时的 ON_QUEUE 任务：标记 TIMEOUT + 退款"""
    try:
        from api_gateway.pricing import resolve_model_cost
    except ImportError:
        try:
            from backend.api_gateway.pricing import resolve_model_cost
        except ImportError:
            resolve_model_cost = lambda *a, **kw: 1

    try:
        now = time.time()
        refund_list = []  # [(username, amount, task_id), ...]

        with db_lock:
            db = load_db()
            for username, history in db.get("history", {}).items():
                if not isinstance(history, list):
                    continue
                for item in history:
                    if item.get("status") != "ON_QUEUE":
                        continue
                    ts = item.get("timestamp", 0)
                    if now - ts < TASK_TIMEOUT_SECONDS:
                        continue
                    # 超时：标记 TIMEOUT
                    item["status"] = "TIMEOUT"
                    # 计算应退积分
                    model = item.get("model", "gpt-image-2")
                    batch_total = item.get("batch_total", 1)
                    try:
                        cost_per = resolve_model_cost(model, default=1)
                    except Exception:
                        cost_per = 1
                    refund_amount = cost_per * batch_total
                    refund_list.append((username, refund_amount, item.get("id", "?")))

            if refund_list:
                # 退款（在同一把锁内完成，避免重复 save）
                for username, amount, task_id in refund_list:
                    user = db["users"].get(username)
                    if user:
                        user["quota"] += amount
                        if "quota_logs" not in db:
                            db["quota_logs"] = []
                        db["quota_logs"].append({
                            "id": str(uuid.uuid4()),
                            "username": username,
                            "operator": "system",
                            "amount": amount,
                            "balance_after": user["quota"],
                            "reason": f"任务超时(>{TASK_TIMEOUT_SECONDS}s)，积分退回",
                            "type": "timeout_refund",
                            "task_id": task_id,
                            "timestamp": time.time()
                        })
                        print(f"⏰ 任务 {task_id[:8]} 超时，退回 {amount} 积分给 {username}")
                save_db(db)
    except Exception as e:
        print(f"⚠️ 清理超时任务出错: {e}")


def _cleanup_expired_codes():
    """清理内存中的过期验证码，防止内存泄漏"""
    now = time.time()
    expired = [
        phone for phone, data in verification_codes.items()
        if now - data.get("timestamp", 0) > CODE_EXPIRE_SECONDS + 60  # 多留 1 分钟缓冲
    ]
    for phone in expired:
        del verification_codes[phone]
    if expired:
        print(f"🧹 已清理 {len(expired)} 个过期验证码")


def _background_cleanup_loop():
    """后台清理线程主循环（每 60 秒一轮）"""
    while True:
        time.sleep(60)
        try:
            _cleanup_stale_tasks()
            _cleanup_expired_codes()
        except Exception as e:
            print(f"⚠️ 后台清理出错: {e}")


# 启动时立即清理一次（处理进程重启时遗留的 ON_QUEUE 任务）
try:
    _cleanup_stale_tasks()
except Exception as e:
    print(f"⚠️ 启动清理出错: {e}")

# 启动后台清理线程（daemon=True，主进程退出时自动终止）
_cleanup_thread = threading.Thread(target=_background_cleanup_loop, daemon=True, name="bg-cleanup")
_cleanup_thread.start()
print("✅ 后台清理任务已启动（ON_QUEUE 超时清理 + 验证码过期清理）")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
