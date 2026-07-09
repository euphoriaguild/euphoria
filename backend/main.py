from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
import os
import httpx
from dotenv import load_dotenv
from pydantic import BaseModel

from scraper import (
    scrape_guild,
    scrape_character,
    scrape_rankings,
    scrape_all_alliance_guilds,
    ALLIANCE_GUILDS,
)
from auth import require_auth, get_current_user

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID", "")


async def is_in_discord_guild(discord_id: str) -> bool:
    """Verifica se o usuário (pelo Discord ID) é membro do servidor da guilda."""
    if not DISCORD_BOT_TOKEN or not DISCORD_GUILD_ID or not discord_id:
        return True  # Se não configurado, permite acesso
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://discord.com/api/v10/guilds/{DISCORD_GUILD_ID}/members/{discord_id}",
            headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"},
            timeout=10,
        )
        return resp.status_code == 200


def supabase_headers() -> dict:
    """Headers de autenticação com service_role para escrever no Supabase."""
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

# Cache em memória (substitua por Redis/Supabase em produção)
_cache: dict = {
    "guilds": {},
    "rankings": [],
    "alliance": None,
    "last_guild_update": None,
    "last_ranking_update": None,
}

CACHE_TTL_SECONDS = 300  # 5 minutos


async def refresh_cache():
    """Atualiza o cache com dados frescos."""
    logger.info("Atualizando cache das guildas...")
    guilds = await scrape_all_alliance_guilds()
    for g in guilds:
        _cache["guilds"][g["name"]] = g

    total_members = sum(len(g["members"]) for g in guilds)
    total_resets = sum(
        m["resets"] for g in guilds for m in g["members"]
    )
    all_members = [m for g in guilds for m in g["members"]]
    top = max(all_members, key=lambda m: m["resets"]) if all_members else None

    _cache["alliance"] = {
        "guilds": guilds,
        "total_members": total_members,
        "total_resets": total_resets,
        "top_reset": top,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }
    _cache["last_guild_update"] = datetime.now(timezone.utc)

    logger.info("Atualizando cache do ranking...")
    _cache["rankings"] = await scrape_rankings("resets")
    _cache["last_ranking_update"] = datetime.now(timezone.utc)
    logger.info("Cache atualizado com sucesso.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Carrega cache na inicialização
    await refresh_cache()
    yield


app = FastAPI(
    title="Euphoria Guild API",
    description="API de dados da aliança Euphoria no MU Domix Season 2",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://euphoria-one-zeta.vercel.app",
        "http://localhost:5173",  # desenvolvimento local
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


def cache_stale(key: str, ttl: int = CACHE_TTL_SECONDS) -> bool:
    ts = _cache.get(key)
    if not ts:
        return True
    return (datetime.now(timezone.utc) - ts).total_seconds() > ttl


# ─── ROTAS ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "Euphoria Guild Platform API", "version": "1.0.0"}


@app.get("/api/alliance")
async def get_alliance(
    background_tasks: BackgroundTasks,
    _user: dict = Depends(require_auth),
):
    """Retorna dados consolidados de toda a aliança."""
    if cache_stale("last_guild_update"):
        background_tasks.add_task(refresh_cache)
    if not _cache["alliance"]:
        await refresh_cache()
    return _cache["alliance"]


@app.get("/api/guilds")
async def list_guilds(_user: dict = Depends(require_auth)):
    """Lista todas as guildas da aliança."""
    if not _cache["guilds"]:
        await refresh_cache()
    return list(_cache["guilds"].values())


@app.get("/api/guilds/{guild_name}")
async def get_guild(guild_name: str, _user: dict = Depends(require_auth)):
    """Retorna dados de uma guilda específica."""
    # Tenta do cache primeiro
    for key in _cache["guilds"]:
        if key.lower() == guild_name.lower():
            return _cache["guilds"][key]

    # Busca em tempo real
    data = await scrape_guild(guild_name)
    if not data:
        raise HTTPException(status_code=404, detail=f"Guilda '{guild_name}' não encontrada")
    return data


@app.get("/api/guilds/{guild_name}/members")
async def get_guild_members(guild_name: str, _user: dict = Depends(require_auth)):
    """Retorna membros de uma guilda."""
    data = await get_guild(guild_name)
    return data.get("members", [])


@app.get("/api/members/all")
async def get_all_members(
    sort_by: str = "resets",
    order: str = "desc",
    _user: dict = Depends(require_auth),
):
    """Lista todos os membros de todas as guildas da aliança."""
    if not _cache["alliance"]:
        await refresh_cache()

    all_members = []
    for g in _cache["alliance"]["guilds"]:
        all_members.extend(g["members"])

    reverse = order.lower() == "desc"
    valid_sorts = {"resets", "level", "name", "guild", "char_class"}
    if sort_by not in valid_sorts:
        sort_by = "resets"

    all_members.sort(key=lambda m: m.get(sort_by, 0), reverse=reverse)
    return all_members


@app.get("/api/characters/{name}")
async def get_character(name: str, _user: dict = Depends(require_auth)):
    """Retorna o perfil completo de um personagem."""
    data = await scrape_character(name)
    if not data:
        raise HTTPException(status_code=404, detail=f"Personagem '{name}' não encontrado")
    return data


@app.get("/api/rankings")
async def get_rankings(
    mode: str = "resets",
    guild_filter: Optional[str] = None,
    background_tasks: BackgroundTasks = None,
    _user: dict = Depends(require_auth),
):
    """Retorna o ranking global. Pode filtrar por guilda."""
    if cache_stale("last_ranking_update") or not _cache["rankings"]:
        data = await scrape_rankings(mode)
        _cache["rankings"] = data
        _cache["last_ranking_update"] = datetime.now(timezone.utc)
    else:
        data = _cache["rankings"]

    if guild_filter:
        data = [r for r in data if r.get("guild", "").lower() == guild_filter.lower()]

    return data


@app.get("/api/rankings/alliance")
async def get_alliance_rankings(_user: dict = Depends(require_auth)):
    """Retorna apenas membros das guildas da aliança no ranking global."""
    guild_names_lower = [g.lower() for g in ALLIANCE_GUILDS]
    if not _cache["rankings"]:
        _cache["rankings"] = await scrape_rankings("resets")

    filtered = [
        r for r in _cache["rankings"]
        if r.get("guild", "").lower() in guild_names_lower
    ]
    return filtered


@app.post("/api/refresh")
async def force_refresh(_user: dict = Depends(require_auth)):
    """Força atualização do cache (admin)."""
    await refresh_cache()
    return {"message": "Cache atualizado com sucesso", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/stats/alliance")
async def get_alliance_stats(_user: dict = Depends(require_auth)):
    """Estatísticas gerais da aliança."""
    if not _cache["alliance"]:
        await refresh_cache()

    alliance = _cache["alliance"]
    all_members = [m for g in alliance["guilds"] for m in g["members"]]

    # Distribuição por classe
    class_dist: dict = {}
    for m in all_members:
        c = m["char_class"]
        class_dist[c] = class_dist.get(c, 0) + 1

    # Distribuição por guilda
    guild_dist = {g["name"]: len(g["members"]) for g in alliance["guilds"]}

    # Top 10 resets
    top10 = sorted(all_members, key=lambda m: m["resets"], reverse=True)[:10]

    return {
        "total_members": alliance["total_members"],
        "total_resets": alliance["total_resets"],
        "avg_resets": round(alliance["total_resets"] / max(alliance["total_members"], 1), 1),
        "class_distribution": class_dist,
        "guild_distribution": guild_dist,
        "top10_resets": top10,
        "last_updated": alliance["last_updated"],
    }


# ─── PERFIS DE USUÁRIOS ────────────────────────────────────────────────────────

class ProfilePayload(BaseModel):
    nick_mudomix: str
    guild: str
    discord_username: Optional[str] = None
    discord_id: Optional[str] = None
    avatar_url: Optional[str] = None


@app.get("/api/profile/me")
async def get_my_profile(user: dict = Depends(require_auth)):
    """Retorna o perfil do usuário autenticado."""
    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={"clerk_id": f"eq.{clerk_id}", "select": "*", "limit": "1"},
        )
        rows = resp.json()
        if not rows:
            raise HTTPException(status_code=404, detail="Perfil não encontrado")
        return rows[0]


@app.post("/api/profile")
async def save_profile(
    body: ProfilePayload,
    user: dict = Depends(require_auth),
):
    """Cria ou atualiza o perfil de um usuário Clerk no Supabase."""
    clerk_id = user.get("sub")
    if not clerk_id:
        raise HTTPException(status_code=401, detail="clerk_id ausente no token")

    # Verifica se o Discord ID do usuário está no servidor da guilda
    if body.discord_id:
        in_guild = await is_in_discord_guild(body.discord_id)
        if not in_guild:
            raise HTTPException(
                status_code=403,
                detail="Você precisa ser membro do servidor Discord da Euphoria para se cadastrar."
            )

    record = {
        "clerk_id": clerk_id,
        "nick_mudomix": body.nick_mudomix,
        "guild": body.guild,
        "discord_username": body.discord_username,
        "discord_id": body.discord_id,
        "avatar_url": body.avatar_url,
        "role": "pending",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers={**supabase_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
            json=record,
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=f"Erro ao salvar perfil: {resp.text}")

    return {"ok": True}


@app.get("/api/profile/pending")
async def get_pending_profiles(user: dict = Depends(require_auth)):
    """Retorna perfis aguardando aprovação (staff only)."""
    clerk_id = user.get("sub")
    # Verifica se o solicitante é staff/admin
    async with httpx.AsyncClient() as client:
        check = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={"clerk_id": f"eq.{clerk_id}", "select": "role"},
        )
        rows = check.json()
        if not rows or rows[0].get("role") not in ("staff", "admin"):
            raise HTTPException(status_code=403, detail="Acesso restrito a staff")

        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={
                "role": "eq.pending",
                "select": "clerk_id,discord_username,avatar_url,nick_mudomix,guild,created_at",
                "order": "created_at.asc",
            },
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)

    return resp.json()


class ApprovePayload(BaseModel):
    clerk_id: str
    role: str  # "member" | "staff" | "admin" | "rejected"


@app.post("/api/profile/approve")
async def approve_profile(
    body: ApprovePayload,
    user: dict = Depends(require_auth),
):
    """Aprova ou rejeita um perfil (staff only)."""
    requester_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        check = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={"clerk_id": f"eq.{requester_id}", "select": "role"},
        )
        rows = check.json()
        if not rows or rows[0].get("role") not in ("staff", "admin"):
            raise HTTPException(status_code=403, detail="Acesso restrito a staff")

        update_data: dict = {"role": body.role}
        if body.role not in ("pending", "rejected"):
            update_data["approved_at"] = datetime.now(timezone.utc).isoformat()

        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={"clerk_id": f"eq.{body.clerk_id}"},
            json=update_data,
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)

    return {"ok": True}
