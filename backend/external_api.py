"""
Cliente da API externa MU Domix (aplicacao_teste).

Login JWT + renovação automática ~4h (margem de 2 min antes do exp).
Credenciais via env — NÃO hardcodar em produção.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Optional

import httpx
import jwt
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

MUDOMIX_API_BASE_URL = os.getenv("MUDOMIX_API_BASE_URL", "").rstrip("/")
MUDOMIX_API_USER = os.getenv("MUDOMIX_API_USER", "").strip()
MUDOMIX_API_PASSWORD = os.getenv("MUDOMIX_API_PASSWORD", "").strip()

# Renova antes do exp oficial (segundos)
_TOKEN_SKEW_SEC = 120
_DEFAULT_TTL_SEC = 4 * 3600  # 4h se o JWT não trouxer exp


class MudomixAuthError(Exception):
    pass


class MudomixApiClient:
    """Singleton de sessão: login + token cacheado + retry em 401."""

    def __init__(self) -> None:
        self._token: Optional[str] = None
        self._expires_at: float = 0.0
        self._perfil: Optional[str] = None
        self._lock = asyncio.Lock()

    @property
    def configured(self) -> bool:
        return bool(MUDOMIX_API_BASE_URL and MUDOMIX_API_USER and MUDOMIX_API_PASSWORD)

    def status(self) -> dict[str, Any]:
        now = time.time()
        remaining = max(0, int(self._expires_at - now)) if self._token else 0
        return {
            "configured": self.configured,
            "authenticated": bool(self._token) and remaining > 0,
            "perfil": self._perfil,
            "expires_in_sec": remaining,
            "base_url": MUDOMIX_API_BASE_URL,
        }

    def _expiry_from_token(self, token: str) -> float:
        try:
            payload = jwt.decode(token, options={"verify_signature": False})
            exp = payload.get("exp")
            if isinstance(exp, (int, float)):
                return float(exp)
        except Exception:
            logger.warning("Não foi possível ler exp do JWT MU Domix; usando TTL padrão 4h")
        return time.time() + _DEFAULT_TTL_SEC

    async def login(self, *, force: bool = False) -> str:
        """Obtém token válido (reutiliza cache se ainda válido)."""
        async with self._lock:
            now = time.time()
            if (
                not force
                and self._token
                and now < (self._expires_at - _TOKEN_SKEW_SEC)
            ):
                return self._token
            return await self._login_unlocked()

    async def _login_unlocked(self) -> str:
        if not self.configured:
            raise MudomixAuthError(
                "MUDOMIX_API_USER / MUDOMIX_API_PASSWORD não configurados no .env"
            )

        url = f"{MUDOMIX_API_BASE_URL}/api/auth/login"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    url,
                    json={
                        "username": MUDOMIX_API_USER,
                        "senha": MUDOMIX_API_PASSWORD,
                    },
                    headers={"Accept": "application/json"},
                )
        except httpx.HTTPError as exc:
            raise MudomixAuthError(f"Falha de rede no login MU Domix: {exc}") from exc

        if resp.status_code >= 400:
            detail = resp.text[:300]
            raise MudomixAuthError(f"Login MU Domix HTTP {resp.status_code}: {detail}")

        data = resp.json()
        token = data.get("token")
        if not token:
            raise MudomixAuthError("Login MU Domix sem campo token na resposta")

        self._token = token
        self._perfil = data.get("perfil")
        self._expires_at = self._expiry_from_token(token)
        logger.info(
            "MU Domix login ok (perfil=%s, expira_em=%.0fs)",
            self._perfil,
            self._expires_at - time.time(),
        )
        return token

    async def get_token(self) -> str:
        return await self.login(force=False)

    async def request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: Optional[dict] = None,
        timeout: float = 30.0,
    ) -> httpx.Response:
        """
        Chamada autenticada. Em 401, faz login de novo e repete 1x.
        path: relativo à base (ex.: /api/guildas/Euph0ria)
        """
        if not path.startswith("/"):
            path = "/" + path
        url = f"{MUDOMIX_API_BASE_URL}{path}"

        async def _do(token: str) -> httpx.Response:
            async with httpx.AsyncClient(timeout=timeout) as client:
                return await client.request(
                    method.upper(),
                    url,
                    json=json,
                    params=params,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Accept": "application/json",
                    },
                )

        token = await self.get_token()
        resp = await _do(token)
        if resp.status_code == 401:
            logger.info("MU Domix 401 — renovando token e repetindo")
            token = await self.login(force=True)
            resp = await _do(token)
        return resp


# Instância compartilhada pelo app
mudomix_api = MudomixApiClient()
