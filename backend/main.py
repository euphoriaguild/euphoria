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

from scraper import scrape_character, ALLIANCE_GUILDS
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

# ── Helpers de dados de perfis ───────────────────────────────────────────────

async def get_approved_profiles() -> list[dict]:
    """Busca todos os perfis aprovados. Fonte de verdade para rankings e stats."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={
                "select": "nick_mudomix,guild,char_class,resets,level,role,approved_at",
                "approved_at": "not.is.null",
                "order": "resets.desc",
            },
        )
        if r.status_code == 200:
            return r.json()
        return []


def profiles_to_alliance(profiles: list[dict]) -> dict:
    """Converte lista de profiles aprovados no formato de aliança esperado pelo frontend."""
    guilds_map: dict[str, dict] = {
        g: {"name": g, "master": "", "points": 0, "members": []} for g in ALLIANCE_GUILDS
    }
    for p in profiles:
        g = p.get("guild", "")
        member = {
            "name": p.get("nick_mudomix", ""),
            "char_class": p.get("char_class") or "",
            "resets": p.get("resets") or 0,
            "level": p.get("level") or 0,
            "member_level": "Member",
            "guild": g,
        }
        if g in guilds_map:
            guilds_map[g]["members"].append(member)

    guilds = [
        {**v, "member_count": len(v["members"])}
        for v in guilds_map.values()
        if v["members"]
    ]
    all_members = [m for g in guilds for m in g["members"]]
    total_members = len(all_members)
    total_resets = sum(m["resets"] for m in all_members)
    top = max(all_members, key=lambda m: m["resets"]) if all_members else None

    return {
        "guilds": guilds,
        "total_members": total_members,
        "total_resets": total_resets,
        "top_reset": top,
        "online_count": 0,
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield  # sem scraping em startup — dados vêm do Supabase on-demand


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


def cache_stale(key: str, ttl: int = 300) -> bool:
    return True  # sem cache local — dados sempre frescos do Supabase


# ─── ROTAS ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "Euphoria Guild Platform API", "version": "1.0.0"}


@app.get("/api/alliance")
async def get_alliance(_user: dict = Depends(require_auth)):
    """Retorna dados consolidados de toda a aliança a partir dos perfis aprovados."""
    profiles = await get_approved_profiles()
    return profiles_to_alliance(profiles)


@app.get("/api/guilds")
async def list_guilds(_user: dict = Depends(require_auth)):
    """Lista todas as guildas da aliança com seus membros aprovados."""
    profiles = await get_approved_profiles()
    alliance = profiles_to_alliance(profiles)
    return alliance["guilds"]


@app.get("/api/guilds/{guild_name}")
async def get_guild(guild_name: str, _user: dict = Depends(require_auth)):
    """Retorna membros aprovados de uma guilda específica."""
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={
                "select": "nick_mudomix,char_class,resets,level,guild,role",
                "guild": f"ilike.{guild_name}",
                "approved_at": "not.is.null",
                "order": "resets.desc",
            },
        )
        if r.status_code != 200 or not r.json():
            raise HTTPException(status_code=404, detail=f"Guilda '{guild_name}' não encontrada")

        members = [
            {
                "name": p["nick_mudomix"],
                "char_class": p.get("char_class") or "",
                "resets": p.get("resets") or 0,
                "level": p.get("level") or 0,
                "member_level": "Member",
                "guild": p.get("guild", guild_name),
            }
            for p in r.json()
        ]
    return {"name": guild_name, "master": "", "points": 0, "member_count": len(members), "members": members}


@app.get("/api/guilds/{guild_name}/members")
async def get_guild_members(guild_name: str, _user: dict = Depends(require_auth)):
    data = await get_guild(guild_name, _user)
    return data["members"]


@app.get("/api/members/all")
async def get_all_members(
    sort_by: str = "resets",
    order: str = "desc",
    _user: dict = Depends(require_auth),
):
    """Lista todos os membros aprovados de todas as guildas."""
    valid_sorts = {"resets", "level", "nick_mudomix", "guild", "char_class"}
    db_sort = sort_by if sort_by in valid_sorts else "resets"
    direction = "desc" if order.lower() == "desc" else "asc"

    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={
                "select": "nick_mudomix,char_class,resets,level,guild",
                "approved_at": "not.is.null",
                "order": f"{db_sort}.{direction}",
            },
        )
        profiles = r.json() if r.status_code == 200 else []

    return [
        {
            "name": p["nick_mudomix"],
            "char_class": p.get("char_class") or "",
            "resets": p.get("resets") or 0,
            "level": p.get("level") or 0,
            "guild": p.get("guild", ""),
        }
        for p in profiles
    ]


@app.get("/api/characters/{name}")
async def get_character(name: str, _user: dict = Depends(require_auth)):
    """Retorna o perfil completo de um personagem (lookup individual no mudomix)."""
    data = await scrape_character(name)
    if not data:
        raise HTTPException(status_code=404, detail=f"Personagem '{name}' não encontrado")
    return data


@app.get("/api/rankings")
async def get_rankings(
    mode: str = "resets",
    guild_filter: Optional[str] = None,
    _user: dict = Depends(require_auth),
):
    """Ranking baseado nos perfis aprovados da plataforma."""
    profiles = await get_approved_profiles()
    members = [
        {
            "name": p["nick_mudomix"],
            "char_class": p.get("char_class") or "",
            "resets": p.get("resets") or 0,
            "level": p.get("level") or 0,
            "guild": p.get("guild", ""),
        }
        for p in profiles
    ]
    if guild_filter:
        members = [m for m in members if m["guild"].lower() == guild_filter.lower()]
    return members


@app.get("/api/rankings/alliance")
async def get_alliance_rankings(_user: dict = Depends(require_auth)):
    """Rankings apenas de membros aprovados das guildas da aliança."""
    return await get_rankings(_user=_user)


@app.post("/api/refresh")
async def force_refresh(_user: dict = Depends(require_auth)):
    """Compatibilidade — dados já são sempre frescos do Supabase."""
    return {"message": "Dados atualizados", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/stats/alliance")
async def get_alliance_stats(_user: dict = Depends(require_auth)):
    """Estatísticas gerais da aliança baseadas nos perfis aprovados."""
    profiles = await get_approved_profiles()
    alliance = profiles_to_alliance(profiles)
    all_members = [m for g in alliance["guilds"] for m in g["members"]]

    class_dist: dict = {}
    for m in all_members:
        c = m["char_class"] or "Desconhecida"
        class_dist[c] = class_dist.get(c, 0) + 1

    guild_dist = {g["name"]: len(g["members"]) for g in alliance["guilds"]}
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

    # Tenta buscar dados do personagem para popular char_class, resets, level
    char_data = await scrape_character(body.nick_mudomix)
    if char_data and not char_data.get("profile_blocked"):
        record["char_class"] = char_data.get("char_class", "")
        record["resets"] = char_data.get("resets", 0)
        record["level"] = char_data.get("level", 0)
        record["last_synced"] = datetime.now(timezone.utc).isoformat()

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
async def get_raffle_history(
    limit: int = 20,
    offset: int = 0,
    _user: dict = Depends(require_auth),
):
    """Retorna o histórico de sorteios (paginado)."""
    limit = max(1, min(limit, 200))
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/raffle_history",
            headers=supabase_headers(),
            params={
                "order": "created_at.desc",
                "limit": str(limit),
                "offset": str(offset),
            },
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
                "conducted_by": conducted_by,
                "participants": body.participants,
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
            params={"clerk_id": f"eq.{clerk_id}", "select": "nick_mudomix,guild,char_class,role"},
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
            params={"on_conflict": "clerk_id,boss_date"},
            json={
                "clerk_id": clerk_id,
                "nick_mudomix": profile["nick_mudomix"],
                "guild": profile.get("guild"),
                "char_class": profile.get("char_class"),
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
                "select": "id,nick_mudomix,guild,char_class,boss_name,created_at",
                "order": "created_at.asc",
            },
        )
        if resp.status_code >= 400:
            return []
        checkins = resp.json()

        # Enriquece com a classe atual do perfil (check-ins antigos podem não ter char_class)
        nicks = [c["nick_mudomix"] for c in checkins if not c.get("char_class")]
        if nicks:
            in_list = ",".join(f'"{n}"' for n in nicks)
            pr = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                headers=supabase_headers(),
                params={
                    "nick_mudomix": f"in.({in_list})",
                    "select": "nick_mudomix,char_class",
                },
            )
            class_map = {
                p["nick_mudomix"]: p.get("char_class")
                for p in (pr.json() if pr.status_code == 200 else [])
            }
            for c in checkins:
                if not c.get("char_class"):
                    c["char_class"] = class_map.get(c["nick_mudomix"])
    return checkins


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
            params={"on_conflict": "boss_date"},
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


# ── Update Member (Admin) ─────────────────────────────────────────────────────

class UpdateMemberPayload(BaseModel):
    nick_mudomix: str
    char_class: Optional[str] = None
    resets: Optional[int] = None
    level: Optional[int] = None


@app.patch("/api/members/{nick}")
async def update_member(
    nick: str,
    body: UpdateMemberPayload,
    user: dict = Depends(require_auth),
):
    """Atualiza dados de um membro (staff/admin only)."""
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

        update_data: dict = {}
        if body.char_class is not None:
            update_data["char_class"] = body.char_class
        if body.resets is not None:
            update_data["resets"] = body.resets
        if body.level is not None:
            update_data["level"] = body.level

        if not update_data:
            raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={"nick_mudomix": f"eq.{nick}"},
            json=update_data,
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)

    return {"ok": True}


@app.get("/api/members/all/admin")
async def get_all_members_admin(
    user: dict = Depends(require_auth),
):
    """Lista TODOS os membros (incluindo pending) para staff/admin."""
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

        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={
                "select": "nick_mudomix,char_class,resets,level,role,discord_username,approved_at",
                "order": "nick_mudomix.asc",
            },
        )
        profiles = resp.json() if resp.status_code == 200 else []

    return [
        {
            "name": p["nick_mudomix"],
            "char_class": p.get("char_class") or "",
            "resets": p.get("resets") or 0,
            "level": p.get("level") or 0,
            "role": p.get("role") or "pending",
            "discord": p.get("discord_username") or "",
            "approved": p.get("approved_at") is not None,
        }
        for p in profiles
    ]


# ── Helpers de autorização e perfil ──────────────────────────────────────────

async def _get_requester_profile(client: httpx.AsyncClient, clerk_id: str) -> dict:
    """Retorna o perfil do usuário autenticado (nick, role, char_class)."""
    resp = await client.get(
        f"{SUPABASE_URL}/rest/v1/profiles",
        headers=supabase_headers(),
        params={"clerk_id": f"eq.{clerk_id}", "select": "nick_mudomix,char_class,role,approved_at", "limit": "1"},
    )
    rows = resp.json() if resp.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    return rows[0]


def _require_staff(profile: dict):
    if profile.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=403, detail="Acesso restrito a staff")


def _require_member(profile: dict):
    """Permite qualquer membro aprovado (não exige staff)."""
    if profile.get("approved_at") is None and profile.get("role") not in ("member", "staff", "admin"):
        raise HTTPException(status_code=403, detail="Apenas membros aprovados.")


def _iso_week_start() -> str:
    """Retorna a segunda-feira (início) da semana atual em Brasília, formato YYYY-MM-DD."""
    now = get_brasilia_now()
    monday = now.date().fromordinal(now.date().toordinal() - now.weekday())
    return monday.isoformat()


# ── Sorteio (self-service) ───────────────────────────────────────────────────

class RaffleCreatePayload(BaseModel):
    prize: str


@app.get("/api/raffle/active")
async def get_active_raffle(user: dict = Depends(require_auth)):
    """Retorna o sorteio ativo, seus participantes e se o usuário já entrou."""
    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        me = await _get_requester_profile(client, clerk_id)

        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/raffles",
            headers=supabase_headers(),
            params={"status": "eq.open", "select": "*", "order": "created_at.desc", "limit": "1"},
        )
        raffles = r.json() if r.status_code == 200 else []
        if not raffles:
            return {"raffle": None, "participants": [], "joined": False, "my_nick": me.get("nick_mudomix")}

        raffle = raffles[0]
        p = await client.get(
            f"{SUPABASE_URL}/rest/v1/raffle_entries",
            headers=supabase_headers(),
            params={"raffle_id": f"eq.{raffle['id']}", "select": "nick_mudomix,clerk_id,created_at", "order": "created_at.asc"},
        )
        entries = p.json() if p.status_code == 200 else []
        joined = any(e.get("clerk_id") == clerk_id for e in entries)

    return {
        "raffle": raffle,
        "participants": [e["nick_mudomix"] for e in entries],
        "joined": joined,
        "my_nick": me.get("nick_mudomix"),
    }


@app.post("/api/raffle/create")
async def create_raffle(body: RaffleCreatePayload, user: dict = Depends(require_auth)):
    """Qualquer membro abre um novo sorteio (fecha qualquer sorteio anterior aberto)."""
    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        me = await _get_requester_profile(client, clerk_id)
        _require_member(me)

        # Fecha sorteios abertos anteriores
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/raffles",
            headers=supabase_headers(),
            params={"status": "eq.open"},
            json={"status": "closed"},
        )

        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/raffles",
            headers={**supabase_headers(), "Prefer": "return=representation"},
            json={"prize": body.prize, "status": "open", "created_by": clerk_id},
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)
        data = resp.json()
    return data[0] if isinstance(data, list) and data else {"ok": True}


@app.post("/api/raffle/edit")
async def edit_raffle(body: RaffleCreatePayload, user: dict = Depends(require_auth)):
    """Qualquer membro edita o prêmio do sorteio ativo."""
    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        me = await _get_requester_profile(client, clerk_id)
        _require_member(me)

        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/raffles",
            headers=supabase_headers(),
            params={"status": "eq.open", "select": "id", "order": "created_at.desc", "limit": "1"},
        )
        raffles = r.json() if r.status_code == 200 else []
        if not raffles:
            raise HTTPException(status_code=400, detail="Nenhum sorteio aberto para editar.")

        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/raffles",
            headers=supabase_headers(),
            params={"id": f"eq.{raffles[0]['id']}"},
            json={"prize": body.prize},
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)
    return {"ok": True}


@app.post("/api/raffle/close")
async def close_raffle(user: dict = Depends(require_auth)):
    """Qualquer membro fecha/cancela o sorteio ativo sem sortear vencedor."""
    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        me = await _get_requester_profile(client, clerk_id)
        _require_member(me)

        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/raffles",
            headers=supabase_headers(),
            params={"status": "eq.open"},
            json={"status": "closed"},
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)
    return {"ok": True}


@app.post("/api/raffle/join")
async def join_raffle(user: dict = Depends(require_auth)):
    """Usuário logado entra no sorteio ativo com o PRÓPRIO nick."""
    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        me = await _get_requester_profile(client, clerk_id)
        if me.get("approved_at") is None and me.get("role") not in ("member", "staff", "admin"):
            raise HTTPException(status_code=403, detail="Apenas membros aprovados podem participar.")

        nick = me.get("nick_mudomix")
        if not nick:
            raise HTTPException(status_code=400, detail="Seu perfil não tem nick definido.")

        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/raffles",
            headers=supabase_headers(),
            params={"status": "eq.open", "select": "id", "order": "created_at.desc", "limit": "1"},
        )
        raffles = r.json() if r.status_code == 200 else []
        if not raffles:
            raise HTTPException(status_code=400, detail="Nenhum sorteio aberto no momento.")
        raffle_id = raffles[0]["id"]

        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/raffle_entries",
            headers={**supabase_headers(), "Prefer": "resolution=ignore-duplicates,return=representation"},
            params={"on_conflict": "raffle_id,clerk_id"},
            json={"raffle_id": raffle_id, "clerk_id": clerk_id, "nick_mudomix": nick},
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)
    return {"ok": True, "nick": nick}


@app.post("/api/raffle/leave")
async def leave_raffle(user: dict = Depends(require_auth)):
    """Usuário sai do sorteio ativo."""
    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/raffles",
            headers=supabase_headers(),
            params={"status": "eq.open", "select": "id", "order": "created_at.desc", "limit": "1"},
        )
        raffles = r.json() if r.status_code == 200 else []
        if not raffles:
            return {"ok": True}
        raffle_id = raffles[0]["id"]
        await client.delete(
            f"{SUPABASE_URL}/rest/v1/raffle_entries",
            headers=supabase_headers(),
            params={"raffle_id": f"eq.{raffle_id}", "clerk_id": f"eq.{clerk_id}"},
        )
    return {"ok": True}


class RaffleDrawPayload(BaseModel):
    winner: str


@app.post("/api/raffle/draw")
async def draw_raffle(body: RaffleDrawPayload, user: dict = Depends(require_auth)):
    """Registra o vencedor e fecha o sorteio ativo."""
    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        me = await _get_requester_profile(client, clerk_id)
        _require_member(me)

        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/raffles",
            headers=supabase_headers(),
            params={"status": "eq.open", "select": "id,prize", "order": "created_at.desc", "limit": "1"},
        )
        raffles = r.json() if r.status_code == 200 else []
        if not raffles:
            raise HTTPException(status_code=400, detail="Nenhum sorteio aberto.")
        raffle = raffles[0]

        p = await client.get(
            f"{SUPABASE_URL}/rest/v1/raffle_entries",
            headers=supabase_headers(),
            params={"raffle_id": f"eq.{raffle['id']}", "select": "nick_mudomix"},
        )
        participants = [e["nick_mudomix"] for e in (p.json() if p.status_code == 200 else [])]

        # Marca sorteio como sorteado
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/raffles",
            headers=supabase_headers(),
            params={"id": f"eq.{raffle['id']}"},
            json={"status": "drawn", "winner_nick": body.winner},
        )

        # Salva no histórico
        await client.post(
            f"{SUPABASE_URL}/rest/v1/raffle_history",
            headers={**supabase_headers(), "Prefer": "return=representation"},
            json={
                "prize": raffle["prize"],
                "winner_nick": body.winner,
                "conducted_by": me.get("nick_mudomix"),
                "participants": participants,
            },
        )
    return {"ok": True}


# ── Doações de Zen ───────────────────────────────────────────────────────────

class DonationConfigPayload(BaseModel):
    weekly_amount: str  # ex: "100kk"


class DonationTogglePayload(BaseModel):
    nick_mudomix: str
    paid: bool


@app.get("/api/donations")
async def get_donations(user: dict = Depends(require_auth)):
    """Retorna config da semana + lista de membros com status de doação."""
    clerk_id = user.get("sub")
    week = _iso_week_start()
    async with httpx.AsyncClient() as client:
        await _get_requester_profile(client, clerk_id)  # garante autenticado

        # Config atual (valor semanal)
        cfg = await client.get(
            f"{SUPABASE_URL}/rest/v1/donation_config",
            headers=supabase_headers(),
            params={"select": "weekly_amount", "order": "id.desc", "limit": "1"},
        )
        cfg_rows = cfg.json() if cfg.status_code == 200 else []
        weekly_amount = cfg_rows[0]["weekly_amount"] if cfg_rows else "100kk"

        # Membros aprovados
        m = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=supabase_headers(),
            params={
                "select": "nick_mudomix,char_class",
                "approved_at": "not.is.null",
                "order": "nick_mudomix.asc",
            },
        )
        members = m.json() if m.status_code == 200 else []

        # Doações da semana atual
        d = await client.get(
            f"{SUPABASE_URL}/rest/v1/donations",
            headers=supabase_headers(),
            params={"week_start": f"eq.{week}", "select": "nick_mudomix"},
        )
        paid_nicks = {row["nick_mudomix"] for row in (d.json() if d.status_code == 200 else [])}

    return {
        "week_start": week,
        "weekly_amount": weekly_amount,
        "members": [
            {
                "nick_mudomix": mm["nick_mudomix"],
                "char_class": mm.get("char_class") or "",
                "paid": mm["nick_mudomix"] in paid_nicks,
            }
            for mm in members
        ],
    }


@app.post("/api/donations/config")
async def set_donation_config(body: DonationConfigPayload, user: dict = Depends(require_auth)):
    """Staff altera o valor semanal de doação."""
    clerk_id = user.get("sub")
    async with httpx.AsyncClient() as client:
        me = await _get_requester_profile(client, clerk_id)
        _require_staff(me)
        resp = await client.post(
            f"{SUPABASE_URL}/rest/v1/donation_config",
            headers={**supabase_headers(), "Prefer": "return=representation"},
            json={"weekly_amount": body.weekly_amount, "updated_by": clerk_id},
        )
        if resp.status_code >= 400:
            raise HTTPException(status_code=500, detail=resp.text)
    return {"ok": True}


@app.post("/api/donations/toggle")
async def toggle_donation(body: DonationTogglePayload, user: dict = Depends(require_auth)):
    """Staff marca/desmarca a doação de um membro na semana atual."""
    clerk_id = user.get("sub")
    week = _iso_week_start()
    async with httpx.AsyncClient() as client:
        me = await _get_requester_profile(client, clerk_id)
        _require_staff(me)

        if body.paid:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/donations",
                headers={**supabase_headers(), "Prefer": "resolution=ignore-duplicates,return=representation"},
                params={"on_conflict": "week_start,nick_mudomix"},
                json={
                    "week_start": week,
                    "nick_mudomix": body.nick_mudomix,
                    "marked_by": me.get("nick_mudomix"),
                },
            )
            if resp.status_code >= 400:
                raise HTTPException(status_code=500, detail=resp.text)
        else:
            await client.delete(
                f"{SUPABASE_URL}/rest/v1/donations",
                headers=supabase_headers(),
                params={"week_start": f"eq.{week}", "nick_mudomix": f"eq.{body.nick_mudomix}"},
            )
    return {"ok": True}
