# AutoApply — production deploy

Backend on **Railway**, frontend on **Vercel**. You need a GitHub (or GitLab) repo with this project pushed.

Generate secrets on your machine before you start:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Save both values. `ENCRYPTION_KEY` must stay the same forever or stored portal passwords cannot be decrypted.

---

## 1. Push the repo

```bash
git add .
git commit -m "Prepare Railway and Vercel production deploy"
git push origin main
```

Do **not** commit `.env` or `.env.local`.

---

## 2. Railway — project and datastores

1. Open [railway.app](https://railway.app) → **New Project** → **Empty project**.
2. **Add Postgres** (Railway plugin). Note the service name, usually `Postgres`.
3. **Add Redis** (Railway plugin).
4. Enable **private networking** on the project (Settings). API, worker, beat, Postgres, and Redis should talk over `*.railway.internal`.

---

## 3. Railway — API service

1. **New Service** → **GitHub repo** → this repository.
2. Service settings:
   - **Root Directory:** `backend`
   - **Builder:** Dockerfile (`backend/Dockerfile` is used automatically)
   - **Start command:** leave empty (Dockerfile already runs uvicorn on `$PORT`)
3. **Variables** → add (do not paste `postgresql+asyncpg://` yourself — Railway’s `postgres://` URL is converted automatically):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (variable reference) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `SECRET_KEY` | the long random string you generated |
| `ENCRYPTION_KEY` | the Fernet key you generated |
| `APP_URL` | your Vercel URL, e.g. `https://autoapply.vercel.app` (you can set this after step 5 and redeploy) |
| `CORS_ORIGINS` | same as `APP_URL`, comma-separated if you have a custom domain too, e.g. `https://autoapply.vercel.app,https://www.yourdomain.com` |
| `RESEND_API_KEY` | from [resend.com](https://resend.com) |
| `EMAIL_FROM` | a verified Resend sender, e.g. `AutoApply <noreply@yourdomain.com>` |
| `EMAIL_REPLY_TO` | your inbox |
| `ADMIN_NOTIFY_EMAIL` | admin inbox for sign-up alerts |
| `UPLOAD_DIR` | `/tmp/uploads` |

4. **Generate domain** on the API service (Settings → Networking → Generate domain). Copy it, e.g. `https://autoapply-api-production.up.railway.app`.
5. Confirm **Healthcheck path** is `/health` (set in `backend/railway.toml`).
6. Deploy. Open `https://<api-domain>/health` — you should see `{"ok":true}`.

RAM: give the API at least **1 GB**. Playwright Chromium is bundled for Auto-Apply.

---

## 4. Railway — Celery worker

Beat scrape and Auto-Apply jobs run here. Same image as the API.

1. **New Service** → **GitHub repo** (same repo).
2. **Root Directory:** `backend`
3. **Custom start command:**

```bash
celery -A app.workers.celery_app worker --loglevel=info --concurrency=1
```

4. **Variables:** **Variable Shared** / duplicate from the API service so `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `ENCRYPTION_KEY`, `APP_URL`, and email vars match. Easiest: Railway **Shared Variables** at the project level for those keys.
5. No public domain.
6. Memory: **1–2 GB**. Chromium needs headroom.

---

## 5. Railway — Celery beat

This is the scheduler (every 60s tick, per-candidate interval in the task).

1. **New Service** → same repo, **Root Directory:** `backend`
2. **Start command:**

```bash
celery -A app.workers.celery_app beat --loglevel=info
```

3. Same env vars as the worker (`REDIS_URL` is required).
4. **Run only one beat instance.** Two beats will double-schedule scrapes.
5. ~512 MB is enough.

---

## 6. Vercel — frontend

1. Open [vercel.com](https://vercel.com) → **Add New** → **Project** → the same GitHub repo.
2. **Root Directory:** `frontend` (Edit, not the repo root).
3. Framework: Next.js (auto-detected).
4. **Environment Variables** (Production + Preview):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Railway API origin, **no trailing slash**, e.g. `https://autoapply-api-production.up.railway.app` |

5. Deploy.
6. Copy the Vercel URL (and custom domain if you add one).
7. Go back to Railway and set `APP_URL` and `CORS_ORIGINS` to that URL, then **redeploy the API** (CORS is read at boot).

If the browser shows a CORS error, the Vercel origin is missing from `CORS_ORIGINS` (include `https://` and no trailing slash).

---

## 7. Smoke test

1. `https://<api>/health` → `{"ok":true}`
2. `https://<api>/docs` → Swagger loads
3. Open the Vercel site → Register → check Resend for OTP
4. Activate with an admin invite code
5. Connect a portal, **Scrape Now** — remaining count should drop
6. Railway **worker** logs should show Celery consuming when Auto-Apply is on
7. Railway **beat** logs should show the 60s tick

---

## 8. Custom domain (optional)

**Frontend:** Vercel → Project → Domains → add `app.yourdomain.com`.

**API:** Railway API service → custom domain `api.yourdomain.com`, then set:

- Vercel `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`
- Railway `APP_URL=https://app.yourdomain.com`
- Railway `CORS_ORIGINS=https://app.yourdomain.com`

Redeploy both.

---

## 9. What not to do

- Do not expose Postgres or Redis publicly unless you must. Use Railway private URLs.
- Do not run two beat services.
- Do not change `ENCRYPTION_KEY` after candidates have saved portal passwords.
- Do not put `NEXT_PUBLIC_API_URL` with a trailing slash.
- Local `--reload` / `pool=solo` flags are for Windows/dev only.

---

## Local reminder (unchanged)

```bash
# backend
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# worker
python -m celery -A app.workers.celery_app worker --loglevel=info --pool=solo

# beat (optional locally)
python -m celery -A app.workers.celery_app beat --loglevel=info

# frontend
cd frontend
npm run dev
```
