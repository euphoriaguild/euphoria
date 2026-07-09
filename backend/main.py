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


async def _build_guilds_from_rankings(rankings_data: list) -> list:
    """Fallback: constrói dados de guilda a partir do ranking já scrapeado."""
    guild_map: dict = {g: {"name": g, "master": "", "points": 0, "members": []} for g in ALLIANCE_GUILDS}
    for r in rankings_data:
        g = r.get("guild", "")
        if g in guild_map:
            guild_map[g]["members"].append({
                "name": r["name"], "char_class": r["char_class"],
                "resets": r["resets"], "level": 0,
                "member_level": "Member", "guild": g,
            })
    return [
        {"name": g, "master": m["master"], "points": m["points"],
         "member_count": len(m["members"]), "members": m["members"]}
        for g, m in guild_map.items() if m["members"]
    ]


async def refresh_cache():
    """Atualiza o cache com dados frescos."""
    logger.info("Atualizando cache do ranking...")
    rankings_data = await scrape_rankings("resets")
    if rankings_data:
        _cache["rankings"] = rankings_data
        _cache["last_ranking_update"] = datetime.now(timezone.utc)

    logger.info("Atualizando cache das guildas...")
    guilds = await scrape_all_alliance_guilds()
    guilds = [g for g in guilds if g]  # remove None

    # Fallback: se scraping de guilda falhou/retornou vazio, usa o ranking
    total_scraped = sum(len(g.get("members", [])) for g in guilds)
    if total_scraped == 0 and _cache["rankings"]:
        logger.warning("Scraping de guilda retornou vazio — usando ranking como fallback.")
        guilds = await _build_guilds_from_rankings(_cache["rankings"])

    for g in guilds:
        _cache["guilds"][g["name"]] = g

    all_members = [m for g in guilds for m in g["members"]]
    total_members = len(all_members)
    total_resets = sum(m["resets"] for m in all_members)
    top = max(all_members, key=lambda m: m["resets"]) if all_members else None

    _cache["alliance"] = {
        "guilds": guilds,
        "total_members": total_members,
        "total_resets": total_resets,
        "top_reset": top,
        "online_count": 0,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }
    _cache["last_guild_update"] = datetime.now(timezone.utc)
    logger.info(f"Cache atualizado — {total_members} membros, {len(_cache['rankings'])} no ranking.")


async def ensure_tables():
    """Cria as tabelas necessárias se não existirem (DDL via pg_meta)."""
    tables_sql = [
        """CREATE TABLE IF NOT EXISTS world_boss_checkins (
            id           BIGSERIAL PRIMARY KEY,
            clerk_id     TEXT NOT NULL,
            nick_mudomix TEXT NOT NULL,
            guild        TEXT,
            boss_date    DATE NOT NULL,
            boss_name    TEXT NOT NULL,
            created_at   TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (clerk_id, boss_date)
        )""",
        """CREATE TABLE IF NOT EXISTS world_boss_parties (
            id          BIGSERIAL PRIMARY KEY,
            boss_date   DATE NOT NULL UNIQUE,
            boss_name   TEXT NOT NULL,
            parties     JSONB NOT NULL DEFAULT '[]',
            updated_by  TEXT,
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS raffle_history (
            id           BIGSERIAL PRIMARY KEY,
            item         TEXT NOT NULL,
            winner       TEXT NOT NULL,
            participants TEXT[] NOT NULL DEFAULT '{}',
            drawn_at     TIMESTAMPTZ DEFAULT NOW()
        )""",
    ]
    async with httpx.AsyncClient() as client:
        for sql in tables_sql:
            try:
                resp = await client.post(
                    f"{SUPABASE_URL}/pg_meta/v1/query",
                    headers={
                        "apikey": SUPABASE_SERVICE_ROLE_KEY,
                        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={"query": sql},
                    timeout=15,
                )
                if resp.status_code < 300:
                    logger.info(f"Tabela verificada/criada OK (status {resp.status_code})")
                else:
                    logger.warning(f"pg_meta retornou {resp.status_code}: {resp.text[:200]}")
            except Exception as e:
                logger.warning(f"Não foi possível criar tabela via pg_meta: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_tables()
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


# ── Raffle ────────────────────────────────────────────────────

@app.get("/api/raffle/history")
async def get_raffle_history(_user: dict = Depends(require_auth)):
    """Retorna os últimos 20 sorteios."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/raffle_history",
            headers=supabase_headers(),
            params={"order": "drawn_at.desc", "limit": "20"},
        )
        if resp.status_code >= 400:
            return []
    return resp.json()


class RaffleEntry(BaseModel):
    item: str
    winner: str
    participants: list[str]


@app.post("/api/raffle/save")
async def save_raffle(body: RaffleEntry, _user: dict = Depends(require_auth)):
    """Salva um sorteio no histórico."""
    clerk_id = _user.get("sub")
    async with httpx.AsyncClient() as client:
        # Busca nick do staff que fez o sorteio
        conducted_by = None
        prof_resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={"clerk_id": f"eq.{clerk_id}", "select": "nick_mudomix", "limit": "1"},
        )
        if prof_resp.status_code == 200 and prof_resp.json():
            conducted_by = prof_resp.json()[0].get("nick_mudomix")

        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/raffle_history",
            headers={**supabase_headers(), "Prefer": "return=representation"},
            json={
                "prize": body.item,
                "winner_nick": body.winner,
                "participants": body.participants,
                "conducted_by": conducted_by,
            },
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=f"Erro ao salvar: {resp.text}")
    data = resp.json()
    return data[0] if isinstance(data, list) and data else {"ok": True}


# ── Profiles ───────────────────────────────────────────────────

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
                "approved_at": "is.null",
                "select": "clerk_id,discord_username,avatar_url,nick_mudomix,guild,role,created_at",
                "order": "created_at.asc",
            },
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)

    return resp.json()


# ── World Boss ────────────────────────────────────────────────────────────────

from zoneinfo import ZoneInfo

BRASILIA = ZoneInfo("America/Sao_Paulo")

# Escala semanal dos bosses (weekday: 0=Seg, 1=Ter, 2=Qua, 3=Qui, 4=Sex, 5=Sab, 6=Dom)
BOSS_SCHEDULE: dict[int, str | None] = {
    0: "Phoenix",
    1: "Hell Maine",
    2: "Phoenix",
    3: "Kayn",
    4: None,          # Sexta — day off
    5: "Hydra",
    6: "Zaikan",
}

BOSS_IMAGES: dict[str, str] = {
    "Phoenix":   "🔥",
    "Hell Maine": "🔮",
    "Kayn":      "⚔️",
    "Hydra":     "🐍",
    "Zaikan":    "💀",
}


def get_brasilia_now() -> datetime:
    return datetime.now(BRASILIA)


def today_boss() -> dict:
    """Retorna informações do boss do dia atual (horário de Brasília)."""
    now_br = get_brasilia_now()
    boss_name = BOSS_SCHEDULE.get(now_br.weekday())

    boss_date = now_br.date().isoformat()
    event_time = now_br.replace(hour=20, minute=30, second=0, microsecond=0).isoformat()

    # Check-in abre a meia-noite do dia do boss e fecha às 20:30
    checkin_open = boss_name is not None and (
        now_br.hour < 20 or (now_br.hour == 20 and now_br.minute < 30)
    )

    return {
        "boss_name": boss_name,
        "boss_date": boss_date,
        "emoji": BOSS_IMAGES.get(boss_name, "👾") if boss_name else None,
        "event_time": event_time,
        "checkin_open": checkin_open,
        "weekday": now_br.weekday(),
    }


@app.get("/api/worldboss/today")
async def get_worldboss_today(_user: dict = Depends(require_auth)):
    """Retorna informações do boss do dia atual."""
    return today_boss()


@app.post("/api/worldboss/checkin")
async def worldboss_checkin(user: dict = Depends(require_auth)):
    """Registra check-in do usuário para o boss de hoje."""
    info = today_boss()
    if not info["boss_name"]:
        raise HTTPException(status_code=400, detail="Hoje é dia de descanso (sexta-feira).")
    if not info["checkin_open"]:
        raise HTTPException(status_code=400, detail="Check-in encerrado para hoje.")

    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        # Busca perfil do usuário
        profile_resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={"clerk_id": f"eq.{clerk_id}", "select": "nick_mudomix,guild,role"},
        )
        rows = profile_resp.json()
        if not rows:
            raise HTTPException(status_code=404, detail="Perfil não encontrado.")
        profile = rows[0]
        if profile.get("role") not in ("member", "staff", "admin"):
            raise HTTPException(status_code=403, detail="Perfil ainda não aprovado.")

        # Insere check-in (UPSERT para evitar duplicata)
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/world_boss_checkins",
            headers={**supabase_headers(), "Prefer": "resolution=ignore-duplicates,return=representation"},
            json={
                "clerk_id": clerk_id,
                "nick_mudomix": profile["nick_mudomix"],
                "guild": profile.get("guild"),
                "boss_date": info["boss_date"],
                "boss_name": info["boss_name"],
            },
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)
        data = resp.json()
        already_exists = len(data) == 0
    return {"ok": True, "already_checked_in": already_exists}


@app.delete("/api/worldboss/checkin")
async def worldboss_cancel_checkin(user: dict = Depends(require_auth)):
    """Cancela check-in do usuário para o boss de hoje."""
    info = today_boss()
    if not info["checkin_open"]:
        raise HTTPException(status_code=400, detail="Check-in encerrado.")

    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{SUPABASE_URL}/rest/v1/world_boss_checkins",
            headers=supabase_headers(),
            params={
                "clerk_id": f"eq.{clerk_id}",
                "boss_date": f"eq.{info['boss_date']}",
            },
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)
    return {"ok": True}


@app.get("/api/worldboss/checkins")
async def get_worldboss_checkins(
    date: Optional[str] = None,
    _user: dict = Depends(require_auth),
):
    """Retorna todos os check-ins de uma data (padrão: hoje)."""
    if not date:
        date = get_brasilia_now().date().isoformat()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/world_boss_checkins",
            headers=supabase_headers(),
            params={
                "boss_date": f"eq.{date}",
                "select": "id,nick_mudomix,guild,boss_name,created_at",
                "order": "created_at.asc",
            },
        )
        if resp.status_code >= 400:
            return []
    return resp.json()


class PartiesPayload(BaseModel):
    parties: list[dict]  # [{name: "PT1", members: ["player1", ...]}, ...]


@app.put("/api/worldboss/parties")
async def save_worldboss_parties(body: PartiesPayload, user: dict = Depends(require_auth)):
    """Admin salva as partys do boss do dia."""
    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        check = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={"clerk_id": f"eq.{clerk_id}", "select": "role"},
        )
        rows = check.json()
        if not rows or rows[0].get("role") not in ("staff", "admin"):
            raise HTTPException(status_code=403, detail="Acesso restrito a staff/admin.")

        info = today_boss()
        record = {
            "boss_date": info["boss_date"],
            "boss_name": info["boss_name"] or "off",
            "parties": body.parties,
            "updated_by": clerk_id,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/world_boss_parties",
            headers={**supabase_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
            json=record,
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)
    return {"ok": True}


@app.get("/api/worldboss/parties")
async def get_worldboss_parties(
    date: Optional[str] = None,
    _user: dict = Depends(require_auth),
):
    """Retorna as partys configuradas para uma data (padrão: hoje)."""
    if not date:
        date = get_brasilia_now().date().isoformat()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/world_boss_parties",
            headers=supabase_headers(),
            params={"boss_date": f"eq.{date}", "select": "parties,boss_name,updated_at"},
        )
        if resp.status_code >= 400:
            return {"parties": [], "boss_name": None}
        data = resp.json()
    if data:
        return data[0]
    return {"parties": [], "boss_name": None}


# ── Profiles ─────────────────────────────────────────────────────────────────

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
