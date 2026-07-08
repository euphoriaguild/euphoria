"""
Clerk JWT verification via JWKS.
Clerk emite JWTs RS256 — verificamos usando as chaves públicas do endpoint JWKS.
"""
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import httpx
import os
import time
from dotenv import load_dotenv

load_dotenv()

# Clerk publishable key format: pk_test_xxxx ou pk_live_xxxx
# JWKS URL: https://<frontend-api>.clerk.accounts.dev/.well-known/jwks.json
# Ou defina CLERK_JWKS_URL diretamente no .env
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "")

security = HTTPBearer(auto_error=False)

# Cache simples das chaves JWKS para não buscar a cada requisição
_jwks_cache: dict = {"keys": [], "fetched_at": 0}
_JWKS_TTL = 3600  # 1 hora


async def _get_jwks() -> list:
    """Busca e faz cache das chaves públicas do Clerk."""
    now = time.time()
    if _jwks_cache["keys"] and now - _jwks_cache["fetched_at"] < _JWKS_TTL:
        return _jwks_cache["keys"]

    if not CLERK_JWKS_URL:
        # Modo desenvolvimento: aceita sem verificar assinatura
        return []

    async with httpx.AsyncClient() as client:
        resp = await client.get(CLERK_JWKS_URL, timeout=10)
        resp.raise_for_status()
        data = resp.json()

    _jwks_cache["keys"] = data.get("keys", [])
    _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security),
) -> dict | None:
    """
    Verifica o JWT do Clerk no header Authorization: Bearer <token>.
    Retorna o payload decodificado ou None.
    """
    if not credentials:
        return None

    token = credentials.credentials

    # Sem CLERK_JWKS_URL configurado (dev), aceita qualquer token
    if not CLERK_JWKS_URL:
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            return payload
        except Exception:
            return {"sub": "dev", "role": "authenticated"}

    try:
        # Decodifica header para pegar kid
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        keys = await _get_jwks()
        key_data = next((k for k in keys if k.get("kid") == kid), None)

        if not key_data:
            # Tenta recarregar JWKS (chave pode ser nova)
            _jwks_cache["fetched_at"] = 0
            keys = await _get_jwks()
            key_data = next((k for k in keys if k.get("kid") == kid), None)

        if not key_data:
            raise HTTPException(status_code=401, detail="Chave JWT não encontrada")

        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key_data)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Token inválido: {e}")


def require_auth(user: dict | None = Depends(get_current_user)) -> dict:
    """Exige autenticação. Levanta 401 se não autenticado."""
    if user is None:
        raise HTTPException(status_code=401, detail="Autenticação necessária")
    return user
