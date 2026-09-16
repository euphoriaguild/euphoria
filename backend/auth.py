"""
JWT verification — Auth própria (Discord OAuth + JWT HS256).

Cutover A2–A4: Supabase Auth removido do caminho de autenticação.
"""
from __future__ import annotations

from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os
from dotenv import load_dotenv

load_dotenv()

# Mantido por compatibilidade de imports; sempre "self" após A4.
AUTH_PROVIDER = os.getenv("AUTH_PROVIDER", "self").strip().lower() or "self"
AUTH_DEV_MODE = os.getenv("AUTH_DEV_MODE", "").lower() in ("1", "true", "yes")

security = HTTPBearer(auto_error=False)


def _decode_self(token: str) -> dict:
    from auth_tokens import decode_access_token

    payload = decode_access_token(token)
    if payload.get("typ") != "access":
        raise HTTPException(status_code=401, detail="Tipo de token inválido")
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Token sem subject (sub)")
    return payload


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
) -> dict | None:
    if not credentials:
        return None

    token = credentials.credentials

    if AUTH_DEV_MODE:
        try:
            return jwt.decode(token, options={"verify_signature": False})
        except Exception:
            return {"sub": "00000000-0000-0000-0000-000000000000"}

    try:
        return _decode_self(token)
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Token inválido: {e}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token inválido: {e}") from e


def require_auth(user: dict | None = Depends(get_current_user)) -> dict:
    if user is None:
        raise HTTPException(status_code=401, detail="Autenticação necessária")
    if not user.get("sub"):
        raise HTTPException(status_code=401, detail="Token sem subject (sub)")
    return user
