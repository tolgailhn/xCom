"""
Authentication API and middleware.
Simple password-based auth with JWT tokens.
"""
import hashlib
import hmac
import json
import time
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.config import get_settings

router = APIRouter()

# Token validity: 24 hours
TOKEN_EXPIRY = 86400


def _make_token(password: str, timestamp: int) -> str:
    """Create a simple HMAC token from password + timestamp."""
    msg = f"{password}:{timestamp}".encode()
    return hmac.new(password.encode(), msg, hashlib.sha256).hexdigest()


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    token: str
    expires_at: int


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Login with dashboard password, get a session token."""
    settings = get_settings()

    if not settings.app_password:
        # No password configured — allow access
        ts = int(time.time())
        return LoginResponse(
            token=_make_token("open", ts),
            expires_at=ts + TOKEN_EXPIRY,
        )

    if request.password != settings.app_password:
        raise HTTPException(status_code=401, detail="Yanlis sifre")

    ts = int(time.time())
    token = _make_token(settings.app_password, ts)
    return LoginResponse(token=token, expires_at=ts + TOKEN_EXPIRY)


def verify_token(token: str) -> bool:
    """Verify a session token is valid and not expired."""
    settings = get_settings()

    if not settings.app_password:
        return True  # No password = no auth required

    # Try all timestamps within the last TOKEN_EXPIRY seconds
    now = int(time.time())
    for offset in range(0, TOKEN_EXPIRY, 1):
        ts = now - offset
        expected = _make_token(settings.app_password, ts)
        if hmac.compare_digest(token, expected):
            return True
    return False


async def auth_middleware(request: Request, call_next):
    """Middleware to check auth token on /api/* routes (except /api/auth/*)."""
    path = request.url.path

    # Skip auth for these paths
    if (
        path.startswith("/api/auth/")
        or path == "/api/health"
        or path.startswith("/docs")
        or path.startswith("/openapi")
        or not path.startswith("/api/")
    ):
        return await call_next(request)

    # Skip auth for localhost/loopback requests (MCP server, local scripts)
    client_host = request.client.host if request.client else None
    if client_host in ("127.0.0.1", "::1", "localhost"):
        return await call_next(request)

    settings = get_settings()
    if not settings.app_password:
        return await call_next(request)

    # Check Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        if verify_token(token):
            return await call_next(request)

    return JSONResponse(
        status_code=401,
        content={"detail": "Yetkisiz erisim. Lutfen giris yapin."},
    )
