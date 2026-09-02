# AutoApply

Job auto-application SaaS: FastAPI backend, Next.js frontend, Celery + Redis for scheduled scrape and Auto-Apply.

## Local development

```bash
# API (from backend/)
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend (from frontend/)
npm run dev

# Celery worker (from backend/)
python -m celery -A app.workers.celery_app worker --loglevel=info --pool=solo
```

Copy `backend/.env.example` to `backend/.env` (or a root `.env`) and `frontend/.env.example` to `frontend/.env.local`.

API: http://127.0.0.1:8000  
App: http://localhost:3000

Or `docker-compose up -d` for Postgres, Redis, API, worker, and beat.

## Production

**Backend → Railway, frontend → Vercel.** Follow **[DEPLOY.md](./DEPLOY.md)** for the full checklist (Postgres, Redis, API, worker, beat, CORS, env vars).

## Stack

- **Backend:** FastAPI, SQLAlchemy, Celery, Redis, Playwright
- **Frontend:** Next.js, TypeScript, Tailwind
- **Data:** PostgreSQL (Railway or Neon)
