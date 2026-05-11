---
inclusion: always
---
始终使用中文回复、思考过程内容和设计执行方案
简单问题简单处理，不需要深入分析
复杂问题深入分析设计方案，我们讨论后再执行

# Product

**OG AI** is a professional AI-powered commercial photography studio for e-commerce sellers and individual creators. It transforms plain product shots into studio-grade, scene-based commercial imagery using generative AI.

## Core Capabilities

- **Product Shot Generation** — Turn white-background or casual product photos into styled scenes (luxury, natural, cyberpunk, etc.)
- **AI Retouch** — Automated quality, color, and composition enhancement with multiple modes
- **Portrait** — Face-fusion for stylized portrait photography
- **Basic Creation** — Text-to-image and image-to-image with multi-reference mixing
- **Video Generation** — AI video pipeline (separate provider from image pipeline)

## Platform Features

- Phone-code login with JWT authentication and bcrypt password storage
- Per-user quota system with automatic rollback on failed generations
- Aliyun OSS storage + CDN for generated assets
- Responsive UI (desktop + mobile)
- Admin panel for user management

## Users & Audience

Commercial authorized software (© OG AI). Primary users are Chinese-speaking e-commerce operators and content creators. UI supports both Chinese and English via a `TRANSLATIONS` dictionary in `src/App.jsx`.
