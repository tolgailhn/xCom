"""
X AI Otomasyon - FastAPI Backend
"""
import sys
import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager

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
from backend.api.auto_reply import router as auto_reply_router

_logger = logging.getLogger("auto_reply_scheduler")


async def _auto_reply_loop():
    """Background loop that runs auto self-reply on configured interval."""
    await asyncio.sleep(30)  # initial delay to let app fully start
    while True:
        try:
            from backend.modules.style_manager import load_auto_reply_settings
            settings = load_auto_reply_settings()
            interval = max(settings.get("check_interval_minutes", 30), 15) * 60

            if settings.get("enabled"):
                from backend.modules.auto_reply import run_auto_reply_cycle
                result = await asyncio.to_thread(run_auto_reply_cycle)
                _logger.info(f"Auto-reply cycle done: {result}")

            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            break
        except Exception as e:
            _logger.error(f"Auto-reply loop error: {e}")
            await asyncio.sleep(300)  # 5 min cooldown on error


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_auto_reply_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="X AI Otomasyon API",
    version="1.0.0",
    lifespan=lifespan,
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
app.include_router(auto_reply_router, prefix="/api/auto-reply", tags=["auto-reply"])


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
