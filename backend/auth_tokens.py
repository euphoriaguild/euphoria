"""
Emissão / validação de JWT próprio (AUTH_PROVIDER=self).
"""
from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ISSUER = os.getenv("JWT_ISSUER", "euphoria-api")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "euphoria-app")
ACCESS_TOKEN_TTL_SEC = int(os.getenv("ACCESS_TOKEN_TTL_SEC", "3600"))
REFRESH_TOKEN_TTL_SEC = int(os.getenv("REFRESH_TOKEN_TTL_SEC", "2592000"))


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def issue_access_token(*, user_id: str, discord_id: str) -> tuple[str, int]:
    if not JWT_SECRET or len(JWT_SECRET) < 32:
        raise RuntimeError("JWT_SECRET deve ter pelo menos 32 caracteres")
    now = datetime.now(timezone.utc)
    exp = now + timedelta(seconds=ACCESS_TOKEN_TTL_SEC)
    payload = {
        "sub": user_id,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "discord_id": discord_id,
        "typ": "access",
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return token, ACCESS_TOKEN_TTL_SEC


def decode_access_token(token: str) -> dict[str, Any]:
    if not JWT_SECRET:
        raise jwt.InvalidTokenError("JWT_SECRET não configurado")
    return jwt.decode(
        token,
        JWT_SECRET,
        algorithms=["HS256"],
        audience=JWT_AUDIENCE,
        issuer=JWT_ISSUER,
        options={"require": ["sub", "exp", "iat"]},
    )


def refresh_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=REFRESH_TOKEN_TTL_SEC)
