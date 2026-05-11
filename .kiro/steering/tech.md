
---
inclusion: always
---
始终使用中文回复、思考过程内容和设计执行方案
简单问题简单处理，不需要深入分析
复杂问题深入分析设计方案，我们讨论后再执行
# Tech Stack

## Frontend

- **React 19** with JSX (no TypeScript)
- **Vite 7** build tool and dev server
- **Tailwind CSS 3** for styling (configured in `tailwind.config.js` with custom `pulse-slow` animation and `orange-glow` shadow)
- **lucide-react** for icons
- **react-helmet-async** for SEO / head management
- ESLint 9 flat config with `react-hooks` and `react-refresh` plugins
  - Unused-vars rule ignores identifiers matching `^[A-Z_]` (allows unused constants/components)

## Backend

- **Python 3.8+**
- **FastAPI 0.83** + **Uvicorn 0.15** (ASGI)
- **Pydantic 1.9** (v1 syntax — do not use v2 patterns)
- **python-jose** for JWT, **passlib** for password hashing (bcrypt)
- **oss2** for Aliyun OSS uploads
- **alibabacloud_dypnsapi20170525** for SMS verification codes
- **requests 2.27** for outbound AI API calls
- User data persisted to `backend/wx_data.json` (flat JSON store, no database)

## External AI Providers (Strict Isolation)

Two independent providers must never share credentials or header formats. See `AI_DEVELOPMENT_RULES.md` — this rule is load-bearing.

| Module | Provider | Env Var | Auth Header |
|--------|----------|---------|-------------|
| Product shot / retouch / portrait / basic | TT-API | `TT_API_KEY` | `{"TT-API-KEY": <key>}` |
| Video generation | Tuzi | `TUZI_API_KEY` | `{"Authorization": "Bearer <key>"}` |

Additional env vars: `JWT_SECRET_KEY`, `ALIYUN_ACCESS_KEY_ID/SECRET`, `ALIYUN_OSS_ENDPOINT/BUCKET/DOMAIN`, `SMS_SIGN_NAME`, `SMS_TEMPLATE_CODE`, `SMS_SCHEME_NAME`. See `.env.example`.

## API Base URL Convention

Frontend reads `import.meta.env.VITE_API_BASE_URL`. In production it is empty so Nginx proxies `/api/` and `/auth/` to the backend on `127.0.0.1:8000`. Dev values come from `.env.development`.

## Common Commands

### Frontend
```bash
npm install          # install deps
npm run dev          # Vite dev server on :5173
npm run build        # production build -> dist/
npm run preview      # preview built bundle
npm run lint         # ESLint across the repo
```

### Backend
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### User Management
```bash
python manage_users.py list
python manage_users.py add <username> <password> <quota>
python manage_users.py quota <username> <new_quota>
python manage_users.py passwd <username> <new_password>
```

### Deployment
- Nginx template in `deploy/nginx.conf` (reverse-proxies `/api/` and `/auth/`, serves `dist/`)
- Supervisor manages the uvicorn process
- `client_max_body_size 20M` and `proxy_read_timeout 300s` are required for image uploads and long-running AI jobs
