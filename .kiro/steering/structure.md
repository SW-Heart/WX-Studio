---
inclusion: always
---
始终使用中文回复、思考过程内容和设计执行方案
简单问题简单处理，不需要深入分析
复杂问题深入分析设计方案，我们讨论后再执行

# Project Structure

```
ai-photo-studio/
├── .env / .env.development / .env.production / .env.example
├── backend/                     # Python FastAPI server
│   ├── main.py                  # All routes, AI provider calls, auth, quotas
│   ├── sms_service.py           # Aliyun SMS verification-code service
│   ├── ai_config.json           # AI prompt / style configuration
│   ├── wx_data.json             # User data store (flat JSON, + .bak backup)
│   └── debug_quota.py           # Quota diagnostic utility
├── src/                         # React frontend (JSX, no TS)
│   ├── App.jsx                  # Root component — owns most UI + state
│   ├── main.jsx                 # ReactDOM entry, wraps HelmetProvider
│   ├── index.css / App.css      # Tailwind + global styles
│   ├── assets/                  # Static SVG/image assets bundled via Vite
│   ├── components/
│   │   ├── InfiniteCanvas.jsx   # Canvas workspace (exports NODE_DEFAULT_W/H)
│   │   ├── layout/Layout.jsx    # App shell / navigation
│   │   └── common/              # Shared presentational components
│   ├── context/
│   │   └── TaskContext.jsx      # TaskProvider, useTaskManager, TASK_STATUS
│   ├── hooks/
│   │   └── useTasks.js          # Task-related hook logic
│   ├── pages/
│   │   └── AdminPanel.jsx       # Admin-only user management page
│   └── utils/
│       └── storage.js           # LocalStorage wrapper
├── public/                      # Served as-is (robots.txt, sitemap.xml, vite.svg)
├── deploy/
│   └── nginx.conf               # Production Nginx template
├── dist/                        # Vite build output (gitignored)
├── manage_users.py              # CLI for user CRUD against wx_data.json
├── patch_main.py                # One-off patch script for backend/main.py
├── test_api*.py / test_tuzi.py  # Standalone AI provider smoke tests
├── requirements.txt             # Python deps
├── package.json                 # Node deps + scripts
├── vite.config.js               # Minimal — just @vitejs/plugin-react
├── tailwind.config.js           # Scans index.html + src/**/*.{js,ts,jsx,tsx}
├── postcss.config.js / eslint.config.js
├── README.md                    # User/operator docs (中文)
└── AI_DEVELOPMENT_RULES.md      # MUST-READ: AI provider isolation rules
```

## Architecture Notes

- **Single-file frontend tendency** — `src/App.jsx` is the primary component and holds a large amount of feature state. When adding features, prefer extracting new modules into `src/components/`, `src/context/`, or `src/hooks/` rather than growing `App.jsx` further.
- **No router library** — navigation is handled by internal state in `App.jsx` (e.g., admin panel swap). Do not introduce `react-router` without discussion.
- **Global state via Context** — `TaskProvider` + `useTaskManager` in `src/context/TaskContext.jsx` is the canonical pattern. New cross-cutting state should follow the same shape.
- **i18n via inline dictionary** — `TRANSLATIONS` object in `App.jsx` with `en` and `zh` keys. Add new strings to both locales.
- **URL normalization** — outbound image URLs go through `toSecureUrl()` in `App.jsx`; it replaces the server IP with the HTTPS domain to avoid cert errors. Update `YOUR_DOMAIN` / `YOUR_IP` constants there if infrastructure changes.
- **Backend monolith** — `backend/main.py` contains all FastAPI routes, AI client wrappers, OSS upload helpers, auth, and quota logic. Keep image (TT-API) and video (Tuzi) request code in **separate functions** — do not unify them behind a shared `requests.post` wrapper.
- **Persistence** — user records are read/written to `backend/wx_data.json`. Treat it as the source of truth; the `.bak` file exists as a manual safety net.

## Conventions

- **Filenames** — React components use `PascalCase.jsx`, hooks use `useCamelCase.js`, utilities use `camelCase.js`.
- **Imports** — use relative paths (no path aliases configured). Group: React → third-party → local.
- **Styling** — Tailwind utility classes inline in JSX; custom tokens live in `tailwind.config.js` under `theme.extend`. Avoid ad-hoc CSS files beyond `index.css` / `App.css`.
- **Icons** — import from `lucide-react`; the `ChatGPT.svg` asset is imported as a module for the one case Lucide doesn't cover.
- **Comments** — existing code uses Chinese comments for product/UX notes and English for technical markers. Match the surrounding style.
- **Secrets** — never commit `.env`. Only `.env.example` is tracked. `wx_data.json` contains hashed user data and should be handled carefully when sharing repros.
