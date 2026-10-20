# Wilsify AI — MVP Launch Checklist

**Status**: Active

This checklist covers the **operational** work remaining to take the standalone Wilsify AI MVP (FastAPI + React) from "code deployed" to "publicly launched".

> **Note: Historical Documentation**
> For legacy launch checklists involving multi-service architectures, PostgreSQL, Redis, mobile apps, and payment gateways, please see the `docs/archive/` folder.

---

## 1. Infrastructure

### Backend API (FastAPI)
- [ ] 🔴 Deployed to a Python 3.12+ compatible host
- [ ] 🔴 Required system dependencies installed (`ffmpeg`)
- [ ] 🔴 `GET /` or `/health` returns `200 OK`
- [ ] 🔴 `CORS_ORIGINS` configured to include production frontend domain

### Web Frontend (React/Vite)
- [ ] 🔴 Deployed to a static hosting provider (e.g., Vercel, Netlify, Cloudflare Pages)
- [ ] 🔴 Build step (`npm run build`) completes successfully
- [ ] 🔴 `VITE_API_URL` set to the production backend URL

---

## 2. Security

- [ ] 🔴 HTTPS enforced on all services
- [ ] 🔴 No `.env` files committed to git
- [ ] 🔴 API endpoints validated for payload size limits (to prevent OOM on large audio uploads)

---

## 3. Smoke Test (run against deployed environment)

- [ ] 🔴 Frontend loads without console errors
- [ ] 🔴 Upload a standard MP3 file → analysis completes successfully
- [ ] 🔴 Processed analysis accurately displays Key, BPM, and Chords
- [ ] 🔴 YouTube URL extraction (if enabled in MVP) completes successfully
- [ ] 🔴 Check application behaves correctly under simulated heavy load (concurrent audio processing)

---

## 4. Rollback Plan

| Component | Rollback |
|---|---|
| Backend | Revert commit and trigger redeploy on host |
| Frontend | Redeploy previous successful build from hosting dashboard |

---

## Release Sign-Off

| Role | Sign-off | Date |
|---|---|---|
| Engineering | ☐ | |

**All 🔴 items must be checked before this sign-off is valid.**
