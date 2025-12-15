WX Studio - AI 商业商品摄影工作站

WX Studio 是一款面向电商与个人创作者的专业级 AI 摄影生成工具。它利用先进的生成式 AI 技术，将普通的商品底图瞬间转化为影棚级、场景化的商业摄影大片。

✨ 核心功能 (Features)

🎨 商品摄影生成 (Product Shot): 上传白底图或随手拍，一键生成指定风格（奢华、自然、赛博朋克等）的场景图。

🔐 企业级用户系统:

JWT 安全鉴权登录。

用户配额管理系统 (Quota System)，支持内测码/点数扣除。

密码 bcrypt 加密存储。

⚡ 高性能架构:

前后端分离设计 (React + FastAPI)。

图片本地化存储与 CDN 加速策略。

支持高并发请求队列。

🛠️ 智能交互:

Prompt 智能润色 (AI Enhance)。

全屏预览、无损下载、一键复制。

移动端与桌面端全响应式适配。

🏗️ 技术栈 (Tech Stack)

前端 (Frontend)

Core: React 18, Vite

UI Framework: Tailwind CSS

Icons: Lucide React

Network: Fetch API (with CORS proxy handling)

后端 (Backend)

Core: Python 3.8+, FastAPI

Server: Uvicorn, Supervisor (Process Control)

Database: JSON-based Lightweight DB (可平滑迁移至 MySQL/PostgreSQL)

Security: Python-Jose (JWT), Passlib (Hash)

AI Integration: TT-API (Gemini/Imagen Models)

部署 (Deployment)

OS: Alibaba Cloud Linux / Ubuntu

Web Server: Nginx (Reverse Proxy & Static Serving)

🚀 快速开始 (本地开发)

1. 克隆项目

git clone [https://github.com/your-repo/wx-studio.git](https://github.com/your-repo/wx-studio.git)
cd wx-studio


2. 配置环境变量

复制 .env.example 为 .env 并填入您的 API Key：

JWT_SECRET_KEY=your_secret
TT_API_KEY=your_tt_api_key
# ...其他配置


3. 启动后端

# 建议使用虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 初始化数据库并添加管理员
python manage_users.py add admin 123456 100

# 启动服务
uvicorn backend.main:app --reload


4. 启动前端

npm install
npm run dev


访问 http://localhost:5173 即可开始使用。

📦 目录结构说明

wx-studio/
├── .env                 # 敏感配置文件 (勿提交到 Git)
├── manage_users.py      # 用户管理命令行工具
├── backend/             # 后端代码
│   └── main.py          # FastAPI 核心逻辑
├── src/                 # 前端代码
│   ├── App.jsx          # 主应用逻辑
│   └── index.css        # 全局样式
├── dist/                # 前端构建产物 (由 npm run build 生成)
└── requirements.txt     # Python 依赖


🔒 版权说明 (License)

WX Studio © 2025. All Rights Reserved.
内部商业项目，严禁未经授权的代码分发。