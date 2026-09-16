"""
OAuth Discord (AUTH_PROVIDER=self) — start + callback helpers.
"""
from __future__ import annotations

import os
import secrets
from typing import Any
from urllib.parse import urlencode

import httpx
from dotenv import load_dotenv

load_dotenv()

DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET", "")
DISCORD_REDIRECT_URI = os.getenv(
    "DISCORD_REDIRECT_URI",
    "http://127.0.0.1:8000/api/auth/discord/callback",
)
DISCORD_API = "https://discord.com/api/v10"
DISCORD_AUTHORIZE = "https://discord.com/api/oauth2/authorize"
DISCORD_TOKEN = "https://discord.com/api/oauth2/token"


def oauth_configured() -> bool:
    return bool(DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI)


def new_oauth_state() -> str:
    return secrets.token_urlsafe(24)


def authorize_url(state: str) -> str:
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": DISCORD_REDIRECT_URI,
        "scope": "identify",
        "state": state,
        "prompt": "none",
    }
    # prompt=none tenta SSO silencioso; se falhar Discord mostra login.
    # Em primeiro acesso pode precisar prompt=consent — usamos consent no primeiro?
    # Melhor: sem prompt forçado (omit) para UX padrão.
    params.pop("prompt", None)
    return f"{DISCORD_AUTHORIZE}?{urlencode(params)}"


async def exchange_code(code: str) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            DISCORD_TOKEN,
            data={
                "client_id": DISCORD_CLIENT_ID,
                "client_secret": DISCORD_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": DISCORD_REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=20,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Discord token error {resp.status_code}: {resp.text}")
        return resp.json()


async def fetch_discord_user(access_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{DISCORD_API}/users/@me",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=15,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Discord user error {resp.status_code}: {resp.text}")
        return resp.json()


def discord_avatar_url(user: dict[str, Any]) -> str | None:
    uid = user.get("id")
    avatar = user.get("avatar")
    if not uid:
        return None
    if avatar:
        return f"https://cdn.discordapp.com/avatars/{uid}/{avatar}.png"
    # default avatar
    try:
        idx = (int(uid) >> 22) % 6
    except ValueError:
        idx = 0
    return f"https://cdn.discordapp.com/embed/avatars/{idx}.png"
