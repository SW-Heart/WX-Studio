# OG AI - 专业 AI 商业摄影工作站

<p align="center">
  <img src="https://img.shields.io/badge/React-18.x-61DAFB?logo=react" />
  <img src="https://img.shields.io/badge/FastAPI-0.83-009688?logo=fastapi" />
  <img src="https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.x-06B6D4?logo=tailwindcss" />
</p>

OG AI 是一款面向电商与个人创作者的专业级 AI 摄影生成工具。它利用先进的生成式 AI 技术，将普通的商品底图瞬间转化为影棚级、场景化的商业摄影大片。

---

## ✨ 核心功能

| 功能 | 描述 |
|------|------|
| 🎨 **商品摄影生成** | 上传白底图或随手拍，一键生成指定风格（奢华、自然、赛博朋克等）的场景图 |
| 🖌️ **智能修图** | AI 自动优化画质、色彩和构图，支持多种修图模式 |
| 👤 **人像写真** | 人脸融合技术，一键生成风格化写真照 |
| ✏️ **基础创作** | 文生图、图生图，支持多参考图混合创作 |

## 🔐 企业级特性

- ✅ JWT 安全鉴权 + 手机验证码登录
- ✅ 用户配额管理系统（点数扣除、自动回滚）
- ✅ 密码 bcrypt 加密存储
- ✅ 阿里云 OSS 图片存储 + CDN 加速
- ✅ 响应式设计（移动端 + 桌面端）

---

## 🏗️ 技术栈

### 前端 (Frontend)
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | 核心框架 |
| Vite | 7.x | 构建工具 |
| TailwindCSS | 3.x | UI 样式 |
| Lucide React | - | 图标库 |
| React Helmet | - | SEO 优化 |

### 后端 (Backend)
| 技术 | 版本 | 用途 |
|------|------|------|
| Python | 3.8+ | 运行环境 |
| FastAPI | 0.83 | Web 框架 |
| Uvicorn | 0.15 | ASGI 服务器 |
| python-jose | 3.3 | JWT 认证 |
| passlib | 1.7 | 密码加密 |
| oss2 | - | 阿里云 OSS |

### 部署环境
| 组件 | 推荐 |
|------|------|
| OS | Ubuntu 20.04+ / Alibaba Cloud Linux |
| Web Server | Nginx (反向代理 + 静态托管) |
| Process Manager | Supervisor / systemd |

---

## 🚀 快速开始

### 1️⃣ 克隆项目

```bash
git clone https://github.com/your-repo/ai-photo-studio.git
cd ai-photo-studio
```

### 2️⃣ 配置环境变量

复制模板文件并填入您的配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```ini
# ===== 安全配置 =====
# 生成方式: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY=your_jwt_secret_key_here

# ===== AI 图像生成 =====
TT_API_KEY=your_tt_api_key_here

# ===== 阿里云 OSS =====
ALIYUN_ACCESS_KEY_ID=your_access_key_id
ALIYUN_ACCESS_KEY_SECRET=your_access_key_secret
ALIYUN_OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
ALIYUN_OSS_BUCKET=your_bucket_name
ALIYUN_OSS_DOMAIN=  # 可选，留空使用默认域名

# ===== 阿里云短信 (验证码登录) =====
SMS_SIGN_NAME=您的签名
SMS_TEMPLATE_CODE=您的模板ID
SMS_SCHEME_NAME=AIGC
```

### 3️⃣ 启动后端

```bash
# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 初始化数据库并添加管理员账户
# 用法: python manage_users.py add <用户名> <密码> <配额>
python manage_users.py add admin yourpassword 100

# 启动开发服务器
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 4️⃣ 启动前端

```bash
# 安装 Node.js 依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
```

访问 http://localhost:5173 开始使用！

---

## 📦 生产部署指南

### 服务器环境准备

```bash
# 安装必要软件
sudo apt update
sudo apt install python3 python3-pip python3-venv nginx supervisor -y

# 安装 Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs -y
```

### 项目部署

```bash
# 1. 上传代码到服务器
mkdir -p /www/ai-photo-studio
cd /www/ai-photo-studio

# 2. 配置后端
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. 构建前端
npm install
npm run build

# 4. 配置 Nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/ai-photo-studio
sudo ln -s /etc/nginx/sites-available/ai-photo-studio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Nginx 配置 (deploy/nginx.conf)

> ⚠️ 请修改 `server_name` 为您自己的 IP 或域名

```nginx
server {
    listen 80;
    server_name your_domain_or_ip;  # 🔹 修改这里

    # 前端静态文件
    location / {
        root /www/ai-photo-studio/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
        client_max_body_size 20M;
    }

    # 认证接口
    location /auth/ {
        proxy_pass http://127.0.0.1:8000/auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Supervisor 进程管理

创建 `/etc/supervisor/conf.d/ai-photo-studio.conf`：

```ini
[program:ai-photo-studio]
command=/www/ai-photo-studio/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
directory=/www/ai-photo-studio
user=www-data
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/ai-photo-studio.log
```

启动服务：

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start ai-photo-studio
```

---

## 🔧 常用管理命令

### 用户管理

```bash
# 查看所有用户
python manage_users.py list

# 添加用户
python manage_users.py add <用户名> <密码> <配额>

# 修改配额
python manage_users.py quota <用户名> <新配额>

# 重置密码
python manage_users.py passwd <用户名> <新密码>
```

### 服务管理

```bash
# 查看后端状态
sudo supervisorctl status ai-photo-studio

# 重启后端
sudo supervisorctl restart ai-photo-studio

# 查看日志
tail -f /var/log/ai-photo-studio.log

# 重载 Nginx
sudo nginx -t && sudo systemctl reload nginx
```

---

## 📂 目录结构

```
ai-photo-studio/
├── .env.example          # 环境变量模板
├── backend/              # 后端 Python 代码
│   ├── main.py           # FastAPI 核心逻辑
│   └── sms_service.py    # 短信验证码服务
├── src/                  # 前端 React 代码
│   ├── App.jsx           # 主应用组件
│   ├── components/       # UI 组件
│   ├── context/          # 全局状态
│   └── hooks/            # 自定义 Hooks
├── deploy/               # 部署配置
│   └── nginx.conf        # Nginx 配置模板
├── public/               # 静态资源
├── manage_users.py       # 用户管理脚本
├── requirements.txt      # Python 依赖
├── package.json          # Node.js 依赖
└── vite.config.js        # Vite 配置
```

---

## 🎨 自定义配置

### 修改 LOGO

编辑 `src/App.jsx` 第 21 行：

```javascript
const LOGO_URL = "https://your-oss.com/your-logo.png";
```

### 修改域名/IP (用于 HTTPS 转换)

编辑 `src/App.jsx` 第 31-32 行：

```javascript
const YOUR_DOMAIN = "your-domain.com";
const YOUR_IP = "your-server-ip";
```

---

## 🛡️ 安全注意事项

> [!WARNING]
> 部署前请确保：

1. **更换所有 API 密钥** - 不要使用默认或示例密钥
2. **配置 HTTPS** - 生产环境必须启用 SSL
3. **限制 CORS** - 修改 `backend/main.py` 中的 `allow_origins`
4. **定期备份** - 备份 `wx_data.json` 用户数据

---

## 📞 技术支持

如有问题，请联系技术支持或查阅文档。

---

## 📜 版权声明

© 2026 OG AI. All Rights Reserved.  
本软件为商业授权软件，未经授权禁止分发。