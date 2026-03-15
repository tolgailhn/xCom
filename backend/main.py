"""
X AI Otomasyon - FastAPI Backend
"""
import sys
from pathlib import Path

# Ensure project root is in sys.path so 'backend.xxx' imports work
# regardless of which directory uvicorn is started from
_project_root = str(Path(__file__).parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from backend.api.auth import router as auth_router, auth_middleware
from backend.api.dashboard import router as dashboard_router
from backend.api.scanner import router as scanner_router
from backend.api.generator import router as generator_router
from backend.api.publish import router as publish_router
from backend.api.settings import router as settings_router
from backend.api.analytics import router as analytics_router
from backend.api.calendar import router as calendar_router
from backend.api.drafts import router as drafts_router
from backend.api.scheduler import router as scheduler_router
from backend.api.performance import router as performance_router
from backend.api.auto_reply import router as auto_reply_router
from backend.api.self_reply import router as self_reply_router
from backend.api.discovery import router as discovery_router

app = FastAPI(
    title="X AI Otomasyon API",
    version="1.0.0",
)

# CORS - frontend'in backend'e erismesi icin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tum origin'lere izin ver (dev mode)
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth middleware
app.add_middleware(BaseHTTPMiddleware, dispatch=auth_middleware)

# Routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(dashboard_router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(scanner_router, prefix="/api/scanner", tags=["scanner"])
app.include_router(generator_router, prefix="/api/generator", tags=["generator"])
app.include_router(publish_router, prefix="/api/publish", tags=["publish"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(calendar_router, prefix="/api/calendar", tags=["calendar"])
app.include_router(drafts_router, prefix="/api/drafts", tags=["drafts"])
app.include_router(scheduler_router, prefix="/api/scheduler", tags=["scheduler"])
app.include_router(performance_router, prefix="/api/performance", tags=["performance"])
app.include_router(auto_reply_router, prefix="/api/auto-reply", tags=["auto-reply"])
app.include_router(self_reply_router, prefix="/api/self-reply", tags=["self-reply"])
app.include_router(discovery_router, prefix="/api/discovery", tags=["discovery"])


@app.on_event("startup")
async def startup_event():
    from backend.scheduler_worker import start_scheduler
    start_scheduler()


@app.on_event("shutdown")
async def shutdown_event():
    from backend.scheduler_worker import stop_scheduler
    stop_scheduler()


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
