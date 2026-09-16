from fastapi import FastAPI, HTTPException, Depends, Response, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.requests import Request
from contextlib import asynccontextmanager
import logging
import re
from datetime import datetime, timezone
from typing import Optional
import os
from urllib.parse import quote
import httpx
from dotenv import load_dotenv
from pydantic import BaseModel
from zoneinfo import ZoneInfo

from scraper import scrape_character, ALLIANCE_GUILDS
from auth import require_auth, get_current_user, AUTH_PROVIDER
import db as mssql
import store
import store_auth
import oauth_discord
import auth_tokens

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
DISCORD_GUILD_ID = os.getenv("DISCORD_GUILD_ID", "")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://127.0.0.1:5173").rstrip("/")
OAUTH_STATE_COOKIE = "oauth_state"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "").lower() in ("1", "true", "yes")


def _cors_origins() -> list[str]:
    """Origens CORS. Env CORS_ORIGINS=url1,url2 sobrescreve/estende o default."""
    defaults = [
        "https://euphoria-one-zeta.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    extra = os.getenv("CORS_ORIGINS", "").strip()
    if not extra:
        # inclui FRONTEND_ORIGIN se diferente
        if FRONTEND_ORIGIN and FRONTEND_ORIGIN not in defaults:
            return defaults + [FRONTEND_ORIGIN]
        return defaults
    origins = [o.strip().rstrip("/") for o in extra.split(",") if o.strip()]
    # sempre permite FRONTEND_ORIGIN
    if FRONTEND_ORIGIN and FRONTEND_ORIGIN not in origins:
        origins.append(FRONTEND_ORIGIN)
    return origins


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


# ── Helpers de dados de perfis ───────────────────────────────────────────────

def get_approved_profiles() -> list[dict]:
    """Busca todos os perfis aprovados. Fonte de verdade para rankings e stats."""
    return store.get_approved_profiles()


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
    yield  # sem scraping em startup — dados vêm do SQL Server on-demand


app = FastAPI(
    title="Euphoria Guild API",
    description="API de dados da aliança Euphoria no MU Domix Season 2",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Garante que QUALQUER erro (mesmo bugs inesperados) volte como JSON com detalhe,
    em vez do 'Internal Server Error' padrão sem corpo — assim o frontend sempre
    consegue mostrar a mensagem real do erro."""
    logger.exception("Erro não tratado em %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": f"Erro interno: {exc}"})


def cache_stale(key: str, ttl: int = 300) -> bool:
    return True  # sem cache local — dados sempre frescos do SQL Server


# ── Helpers de autorização e perfil ──────────────────────────────────────────

def _get_requester_profile(user_id: str) -> dict:
    """Retorna o perfil do usuário autenticado (nick, role, char_class)."""
    profile = store.get_requester_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    return profile


def _require_staff(profile: dict):
    if profile.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=403, detail="Acesso restrito a staff")


def _require_member(profile: dict):
    """Permite qualquer membro aprovado (não exige staff)."""
    if profile.get("approved_at") is None and profile.get("role") not in ("member", "staff", "admin"):
        raise HTTPException(status_code=403, detail="Apenas membros aprovados.")


def _get_alts_visibility() -> bool:
    return store.get_alts_visibility()


# ─── ROTAS ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "Euphoria Guild Platform API", "version": "1.0.0"}


@app.get("/api/health/db")
async def health_db():
    """Smoke test da conexão com SQL Server (VPS). Sem autenticação."""
    try:
        info = mssql.healthcheck()
        return info
    except Exception as exc:
        logger.exception("Health DB falhou")
        raise HTTPException(status_code=503, detail=f"SQL Server indisponível: {exc}") from exc


@app.get("/api/alliance")
async def get_alliance(_user: dict = Depends(require_auth)):
    """Retorna dados consolidados de toda a aliança a partir dos perfis aprovados."""
    profiles = get_approved_profiles()
    return profiles_to_alliance(profiles)


@app.get("/api/guilds")
async def list_guilds(_user: dict = Depends(require_auth)):
    """Lista todas as guildas da aliança com seus membros aprovados."""
    profiles = get_approved_profiles()
    alliance = profiles_to_alliance(profiles)
    return alliance["guilds"]


@app.get("/api/guilds/{guild_name}")
async def get_guild(guild_name: str, _user: dict = Depends(require_auth)):
    """Retorna membros aprovados de uma guilda específica."""
    profiles = store.get_profiles_by_guild(guild_name)
    if not profiles:
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
        for p in profiles
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

    profiles = store.get_approved_members_sorted(db_sort, direction)

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
    profiles = get_approved_profiles()
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
    """Compatibilidade — dados já são sempre frescos do SQL Server."""
    return {"message": "Dados atualizados", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/stats/alliance")
async def get_alliance_stats(_user: dict = Depends(require_auth)):
    """Estatísticas gerais da aliança baseadas nos perfis aprovados."""
    profiles = get_approved_profiles()
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
    phone: str
    discord_username: Optional[str] = None
    discord_id: Optional[str] = None
    avatar_url: Optional[str] = None


@app.get("/api/profile/me")
async def get_my_profile(user: dict = Depends(require_auth)):
    """Retorna o perfil do usuário autenticado."""
    user_id = user.get("sub")
    profile = store.get_profile_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil não encontrado")
    return profile


@app.post("/api/profile")
async def save_profile(
    body: ProfilePayload,
    user: dict = Depends(require_auth),
):
    """Cria ou atualiza o perfil de um usuário autenticado."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="user_id ausente no token")

    phone_digits = re.sub(r"\D", "", body.phone or "")
    if len(phone_digits) < 10 or len(phone_digits) > 11:
        raise HTTPException(status_code=400, detail="Telefone inválido. Use o formato (99) 99999-9999.")

    if body.discord_id:
        in_guild = await is_in_discord_guild(body.discord_id)
        if not in_guild:
            raise HTTPException(
                status_code=403,
                detail="Você precisa ser membro do servidor Discord da Euphoria para se cadastrar.",
            )

    record = {
        "user_id": user_id,
        "nick_mudomix": body.nick_mudomix,
        "guild": body.guild,
        "phone": body.phone.strip(),
        "discord_username": body.discord_username,
        "discord_id": body.discord_id,
        "avatar_url": body.avatar_url,
        "role": "pending",
    }

    char_data = await scrape_character(body.nick_mudomix)
    if char_data and not char_data.get("profile_blocked"):
        record["char_class"] = char_data.get("char_class", "")
        record["resets"] = char_data.get("resets", 0)
        record["level"] = char_data.get("level", 0)
        record["last_synced"] = datetime.now(timezone.utc).isoformat()

    try:
        store.upsert_profile(record)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar perfil: {exc}") from exc

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
    try:
        return store.list_raffle_history(limit, offset)
    except Exception:
        return []


class RaffleEntry(BaseModel):
    item: str
    winner: str
    participants: list[str]


@app.post("/api/raffle/save")
async def save_raffle(body: RaffleEntry, user: dict = Depends(require_auth)):
    """Salva um sorteio no histórico."""
    user_id = user.get("sub")
    conducted_by = None
    prof = store.get_requester_profile(user_id)
    if prof:
        conducted_by = prof.get("nick_mudomix")

    try:
        row = store.insert_raffle_history(body.item, body.winner, conducted_by, body.participants)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar: {exc}") from exc

    return row if row else {"ok": True}


# ── Profiles ───────────────────────────────────────────────────

@app.get("/api/profile/pending")
async def get_pending_profiles(user: dict = Depends(require_auth)):
    """Retorna perfis aguardando aprovação (staff only)."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    if me.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=403, detail="Acesso restrito a staff")
    return store.get_pending_profiles()


# ── World Boss ────────────────────────────────────────────────────────────────

BRASILIA = ZoneInfo("America/Sao_Paulo")

BOSS_SCHEDULE: dict[int, str | None] = {
    0: "Phoenix",
    1: "Hell Maine",
    2: "Phoenix",
    3: "Kayn",
    4: None,
    5: "Hydra",
    6: "Zaikan",
}

BOSS_IMAGES: dict[str, str] = {
    "Phoenix": "🔥",
    "Hell Maine": "🔮",
    "Kayn": "⚔️",
    "Hydra": "🐍",
    "Zaikan": "💀",
}


def get_brasilia_now() -> datetime:
    return datetime.now(BRASILIA)


def today_boss() -> dict:
    """Retorna informações do boss do dia atual (horário de Brasília)."""
    now_br = get_brasilia_now()
    boss_name = BOSS_SCHEDULE.get(now_br.weekday())

    boss_date = now_br.date().isoformat()
    event_time = now_br.replace(hour=20, minute=30, second=0, microsecond=0).isoformat()

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


def _iso_week_start() -> str:
    """Retorna a segunda-feira (início) da semana atual em Brasília, formato YYYY-MM-DD."""
    now = get_brasilia_now()
    monday = now.date().fromordinal(now.date().toordinal() - now.weekday())
    return monday.isoformat()


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

    user_id = user.get("sub")
    profile = store.get_profile_by_user_id(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")
    if profile.get("role") not in ("member", "staff", "admin"):
        raise HTTPException(status_code=403, detail="Perfil ainda não aprovado.")

    is_new = store.insert_wb_checkin(
        user_id,
        profile["nick_mudomix"],
        profile.get("guild"),
        profile.get("char_class"),
        info["boss_date"],
        info["boss_name"],
    )
    return {"ok": True, "already_checked_in": not is_new}


@app.delete("/api/worldboss/checkin")
async def worldboss_cancel_checkin(user: dict = Depends(require_auth)):
    """Cancela check-in do usuário para o boss de hoje."""
    info = today_boss()
    if not info["checkin_open"]:
        raise HTTPException(status_code=400, detail="Check-in encerrado.")

    user_id = user.get("sub")
    store.delete_wb_checkin(user_id, info["boss_date"])
    return {"ok": True}


@app.get("/api/worldboss/checkins")
async def get_worldboss_checkins(
    date: Optional[str] = None,
    _user: dict = Depends(require_auth),
):
    """Retorna todos os check-ins de uma data (padrão: hoje)."""
    if not date:
        date = get_brasilia_now().date().isoformat()

    checkins = store.list_wb_checkins(date)

    nicks = [c["nick_mudomix"] for c in checkins]
    if nicks:
        class_map = store.get_classes_by_nicks(nicks)
        for c in checkins:
            current = class_map.get(c["nick_mudomix"])
            if current:
                c["char_class"] = current

    return checkins


@app.get("/api/worldboss/report")
async def get_worldboss_report(
    days: int = 30,
    user: dict = Depends(require_auth),
):
    """Relatório de presença no World Boss: total de check-ins por membro e grade dos últimos N dias."""
    days = max(1, min(days, 90))
    user_id = user.get("sub")
    _get_requester_profile(user_id)

    today = get_brasilia_now().date()
    start_date = (today.fromordinal(today.toordinal() - (days - 1))).isoformat()

    checkins = store.list_wb_checkins_since(start_date)
    all_days = sorted({c["boss_date"] for c in checkins})

    by_member: dict[str, dict] = {}
    for c in checkins:
        nick = c["nick_mudomix"]
        if nick not in by_member:
            by_member[nick] = {
                "nick_mudomix": nick,
                "char_class": c.get("char_class") or "",
                "days": set(),
            }
        by_member[nick]["days"].add(c["boss_date"])

    nicks = list(by_member.keys())
    if nicks:
        class_map = store.get_classes_by_nicks(nicks)
        for nick, m in by_member.items():
            current = class_map.get(nick)
            if current:
                m["char_class"] = current

    members = [
        {
            "nick_mudomix": m["nick_mudomix"],
            "char_class": m["char_class"],
            "total": len(m["days"]),
            "attended_days": sorted(m["days"]),
        }
        for m in by_member.values()
    ]
    members.sort(key=lambda m: m["total"], reverse=True)

    return {"days": all_days, "members": members, "range_start": start_date, "range_end": today.isoformat()}


class PartiesPayload(BaseModel):
    parties: list[dict]


@app.put("/api/worldboss/parties")
async def save_worldboss_parties(body: PartiesPayload, user: dict = Depends(require_auth)):
    """Admin salva as partys do boss do dia."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    if me.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=403, detail="Acesso restrito a staff/admin.")

    info = today_boss()
    try:
        store.upsert_wb_parties(
            info["boss_date"],
            info["boss_name"] or "off",
            body.parties,
            user_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


@app.get("/api/worldboss/parties")
async def get_worldboss_parties(
    date: Optional[str] = None,
    _user: dict = Depends(require_auth),
):
    """Retorna as partys configuradas para uma data (padrão: hoje)."""
    if not date:
        date = get_brasilia_now().date().isoformat()

    data = store.get_wb_parties(date)
    if data:
        return data
    return {"parties": [], "boss_name": None}


class ApprovePayload(BaseModel):
    user_id: str
    role: str


@app.post("/api/profile/approve")
async def approve_profile(
    body: ApprovePayload,
    user: dict = Depends(require_auth),
):
    """Aprova ou rejeita um perfil (staff only)."""
    requester_id = user.get("sub")
    me = _get_requester_profile(requester_id)
    if me.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=403, detail="Acesso restrito a staff")

    approved_at = None
    if body.role not in ("pending", "rejected"):
        approved_at = datetime.now(timezone.utc).isoformat()

    try:
        store.approve_profile(body.user_id, body.role, approved_at)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


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
    me = _get_requester_profile(requester_id)
    if me.get("role") not in ("staff", "admin"):
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

    try:
        store.update_member_by_nick(nick, update_data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


@app.get("/api/members/all/admin")
async def get_all_members_admin(
    user: dict = Depends(require_auth),
):
    """Lista TODOS os membros (incluindo pending) para staff/admin."""
    requester_id = user.get("sub")
    me = _get_requester_profile(requester_id)
    if me.get("role") not in ("staff", "admin"):
        raise HTTPException(status_code=403, detail="Acesso restrito a staff")

    profiles = store.get_all_profiles_admin()

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


class EquipmentPayload(BaseModel):
    equip_set: Optional[str] = None
    equip_weapon: Optional[str] = None
    equip_accessory: Optional[str] = None


@app.get("/api/members/{nick}/profile")
async def get_member_profile(nick: str, user: dict = Depends(require_auth)):
    """Retorna o perfil interno (não-scraping) de um membro para visualização de qualquer usuário aprovado."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_member(me)

    member = store.get_member_profile_by_nick(nick)
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    member["is_me"] = member.get("nick_mudomix", "").lower() == (me.get("nick_mudomix") or "").lower()
    return member


@app.patch("/api/members/{nick}/equipment")
async def update_member_equipment(nick: str, body: EquipmentPayload, user: dict = Depends(require_auth)):
    """Membro atualiza seu próprio equipamento (set/shield, arma, acessório). Staff pode editar de qualquer um."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_member(me)
    is_staff = me.get("role") in ("staff", "admin")
    is_owner = (me.get("nick_mudomix") or "").lower() == nick.lower()
    if not is_staff and not is_owner:
        raise HTTPException(status_code=403, detail="Você só pode editar seu próprio equipamento.")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    try:
        store.update_equipment_by_nick(nick, update_data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


# ── Sorteio (self-service) ───────────────────────────────────────────────────

class RaffleCreatePayload(BaseModel):
    prize: str


@app.get("/api/raffle/active")
async def get_active_raffle(user: dict = Depends(require_auth)):
    """Retorna o sorteio ativo, seus participantes e se o usuário já entrou."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)

    raffle = store.get_open_raffle()
    if not raffle:
        return {"raffle": None, "participants": [], "joined": False, "my_nick": me.get("nick_mudomix")}

    entries = store.list_raffle_entries(raffle["id"])
    joined = any(e.get("user_id") == user_id for e in entries)

    return {
        "raffle": raffle,
        "participants": [e["nick_mudomix"] for e in entries],
        "joined": joined,
        "my_nick": me.get("nick_mudomix"),
    }


@app.post("/api/raffle/create")
async def create_raffle(body: RaffleCreatePayload, user: dict = Depends(require_auth)):
    """Qualquer membro abre um novo sorteio (fecha qualquer sorteio anterior aberto)."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_member(me)

    store.close_open_raffles()
    try:
        data = store.create_raffle(body.prize, user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return data if data else {"ok": True}


@app.post("/api/raffle/edit")
async def edit_raffle(body: RaffleCreatePayload, user: dict = Depends(require_auth)):
    """Qualquer membro edita o prêmio do sorteio ativo."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_member(me)

    raffle = store.get_open_raffle()
    if not raffle:
        raise HTTPException(status_code=400, detail="Nenhum sorteio aberto para editar.")

    try:
        store.update_raffle_prize(raffle["id"], body.prize)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


@app.post("/api/raffle/close")
async def close_raffle(user: dict = Depends(require_auth)):
    """Qualquer membro fecha/cancela o sorteio ativo sem sortear vencedor."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_member(me)

    try:
        store.close_open_raffles()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


@app.post("/api/raffle/join")
async def join_raffle(user: dict = Depends(require_auth)):
    """Usuário logado entra no sorteio ativo com o PRÓPRIO nick."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    if me.get("approved_at") is None and me.get("role") not in ("member", "staff", "admin"):
        raise HTTPException(status_code=403, detail="Apenas membros aprovados podem participar.")

    nick = me.get("nick_mudomix")
    if not nick:
        raise HTTPException(status_code=400, detail="Seu perfil não tem nick definido.")

    raffle = store.get_open_raffle()
    if not raffle:
        raise HTTPException(status_code=400, detail="Nenhum sorteio aberto no momento.")

    try:
        store.join_raffle(raffle["id"], user_id, nick)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True, "nick": nick}


@app.post("/api/raffle/leave")
async def leave_raffle(user: dict = Depends(require_auth)):
    """Usuário sai do sorteio ativo."""
    user_id = user.get("sub")
    raffle = store.get_open_raffle()
    if not raffle:
        return {"ok": True}

    store.leave_raffle(raffle["id"], user_id)
    return {"ok": True}


class RaffleDrawPayload(BaseModel):
    winner: str


@app.post("/api/raffle/draw")
async def draw_raffle(body: RaffleDrawPayload, user: dict = Depends(require_auth)):
    """Registra o vencedor e fecha o sorteio ativo."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_member(me)

    raffle = store.get_open_raffle()
    if not raffle:
        raise HTTPException(status_code=400, detail="Nenhum sorteio aberto.")

    entries = store.list_raffle_entries(raffle["id"])
    participants = [e["nick_mudomix"] for e in entries]

    store.draw_raffle(raffle["id"], body.winner)
    store.insert_raffle_history(
        raffle["prize"],
        body.winner,
        me.get("nick_mudomix"),
        participants,
    )

    return {"ok": True}


# ── Doações de Zen ───────────────────────────────────────────────────────────

class DonationConfigPayload(BaseModel):
    weekly_amount: str


class DonationTogglePayload(BaseModel):
    nick_mudomix: str
    paid: bool


@app.get("/api/donations")
async def get_donations(user: dict = Depends(require_auth)):
    """Retorna config da semana + lista de membros com status de doação."""
    user_id = user.get("sub")
    week = _iso_week_start()
    _get_requester_profile(user_id)

    weekly_amount = store.get_donation_weekly_amount() or "100kk"
    members = store.list_approved_nicks_classes()
    paid_nicks = {row["nick_mudomix"] for row in store.list_donations_for_week(week)}

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
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_staff(me)

    try:
        store.insert_donation_config(body.weekly_amount, user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


@app.post("/api/donations/toggle")
async def toggle_donation(body: DonationTogglePayload, user: dict = Depends(require_auth)):
    """Staff marca/desmarca a doação de um membro na semana atual."""
    user_id = user.get("sub")
    week = _iso_week_start()
    me = _get_requester_profile(user_id)
    _require_staff(me)

    try:
        if body.paid:
            store.mark_donation(week, body.nick_mudomix, me.get("nick_mudomix"))
        else:
            store.unmark_donation(week, body.nick_mudomix)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


# ── Contas & Alts ───────────────────────────────────────────────────────────

class AltCreatePayload(BaseModel):
    main_nick: str
    alt_nick: Optional[str] = None
    side: str = "euphoria"
    main_class: Optional[str] = None
    notes: Optional[str] = None


class AltUpdatePayload(BaseModel):
    main_nick: Optional[str] = None
    alt_nick: Optional[str] = None
    side: Optional[str] = None
    main_class: Optional[str] = None
    notes: Optional[str] = None


class AltsVisibilityPayload(BaseModel):
    visible_to_members: bool


@app.get("/api/alts/visibility")
async def get_alts_visibility(user: dict = Depends(require_auth)):
    """Retorna se a lista de alts está visível para membros comuns (qualquer autenticado pode checar)."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    is_staff = me.get("role") in ("staff", "admin")
    visible = _get_alts_visibility()
    return {"visible_to_members": visible, "is_staff": is_staff}


@app.post("/api/alts/visibility")
async def set_alts_visibility(body: AltsVisibilityPayload, user: dict = Depends(require_auth)):
    """Staff decide se os membros comuns podem ver a lista de alts."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_staff(me)

    try:
        store.insert_alts_visibility(body.visible_to_members, user_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


@app.get("/api/alts")
async def list_alts(user: dict = Depends(require_auth)):
    """Lista contas/alts. Staff sempre vê tudo; membros veem tudo se liberado, senão só suas próprias."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    my_nick = me.get("nick_mudomix")
    is_staff = me.get("role") in ("staff", "admin")
    is_approved = me.get("approved_at") is not None
    visible = _get_alts_visibility()

    if not is_staff and not is_approved:
        raise HTTPException(status_code=403, detail="Apenas membros aprovados podem acessar.")

    restricted_mode = not is_staff and not visible

    if restricted_mode:
        entries = store.list_alts_for_main(my_nick)
    else:
        entries = store.list_alts_all()

    euphoria_mains = {e["main_nick"] for e in entries if e.get("side") == "euphoria"}
    if euphoria_mains:
        class_map = store.get_classes_by_nicks(list(euphoria_mains))
        for e in entries:
            if e.get("side") == "euphoria":
                e["main_class"] = class_map.get(e["main_nick"]) or e.get("main_class")

    return {
        "visible_to_members": visible,
        "is_staff": is_staff,
        "restricted_mode": restricted_mode,
        "my_nick": my_nick,
        "entries": entries,
    }


@app.post("/api/alts")
async def create_alt(body: AltCreatePayload, user: dict = Depends(require_auth)):
    """Membro cadastra uma conta alt vinculada a um jogador (ou só a main, sem alt ainda)."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_member(me)
    my_nick = me.get("nick_mudomix")
    is_staff = me.get("role") in ("staff", "admin")
    visible = _get_alts_visibility()
    restricted_mode = not is_staff and not visible

    if body.side not in ("euphoria", "blacklist"):
        raise HTTPException(status_code=400, detail="side deve ser 'euphoria' ou 'blacklist'")

    if restricted_mode:
        if body.side == "blacklist":
            raise HTTPException(
                status_code=403,
                detail="Apenas staff pode adicionar à blacklist quando a lista está restrita.",
            )
        if body.main_nick.strip().lower() != my_nick.lower():
            raise HTTPException(
                status_code=403,
                detail="Você só pode adicionar contas vinculadas ao seu próprio nick.",
            )

    alt_nick = body.alt_nick.strip() if body.alt_nick and body.alt_nick.strip() else None

    try:
        data = store.insert_alt(
            body.main_nick.strip(),
            alt_nick,
            body.side,
            body.notes,
            me.get("nick_mudomix"),
            body.main_class,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return data if data else {"ok": True}


@app.patch("/api/alts/{alt_id}")
async def update_alt(alt_id: int, body: AltUpdatePayload, user: dict = Depends(require_auth)):
    """Membro edita uma conta/alt existente."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_member(me)
    my_nick = me.get("nick_mudomix")
    is_staff = me.get("role") in ("staff", "admin")
    visible = _get_alts_visibility()
    restricted_mode = not is_staff and not visible

    if restricted_mode:
        alt = store.get_alt_by_id(alt_id)
        if not alt:
            raise HTTPException(status_code=404, detail="Alt não encontrado")
        if alt.get("side") == "blacklist" or alt.get("main_nick", "").lower() != my_nick.lower():
            raise HTTPException(status_code=403, detail="Você só pode editar suas próprias contas.")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "side" in update_data and update_data["side"] not in ("euphoria", "blacklist"):
        raise HTTPException(status_code=400, detail="side deve ser 'euphoria' ou 'blacklist'")
    if not update_data:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    try:
        store.update_alt(alt_id, update_data)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


@app.delete("/api/alts/{alt_id}")
async def delete_alt(alt_id: int, user: dict = Depends(require_auth)):
    """Membro remove uma conta/alt."""
    user_id = user.get("sub")
    me = _get_requester_profile(user_id)
    _require_member(me)
    my_nick = me.get("nick_mudomix")
    is_staff = me.get("role") in ("staff", "admin")
    visible = _get_alts_visibility()
    restricted_mode = not is_staff and not visible

    if restricted_mode:
        alt = store.get_alt_by_id(alt_id)
        if not alt:
            raise HTTPException(status_code=404, detail="Alt não encontrado")
        if alt.get("side") == "blacklist" or alt.get("main_nick", "").lower() != my_nick.lower():
            raise HTTPException(status_code=403, detail="Você só pode remover suas próprias contas.")

    try:
        store.delete_alt(alt_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


# ── Estatuto Interno ──────────────────────────────────────────────────────────

class StatutePayload(BaseModel):
    content: str


@app.get("/api/statute")
async def get_statute(user: dict = Depends(require_auth)):
    """Retorna o estatuto interno vigente. Visível a qualquer membro aprovado."""
    me = _get_requester_profile(user.get("sub"))
    _require_member(me)

    row = store.get_statute()
    if not row:
        return {"content": "", "updated_by": None, "updated_at": None}
    return row


@app.put("/api/statute")
async def update_statute(body: StatutePayload, user: dict = Depends(require_auth)):
    """Atualiza o estatuto interno (staff/admin only)."""
    me = _get_requester_profile(user.get("sub"))
    _require_staff(me)

    try:
        store.insert_statute(body.content, me.get("nick_mudomix"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": True}


# ── Auth própria (Discord OAuth + JWT) — A1 ───────────────────────────────────

def _frontend_allowed(origin: str) -> bool:
    allowed = {
        FRONTEND_ORIGIN,
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    }
    return origin.rstrip("/") in {a.rstrip("/") for a in allowed}


class RefreshPayload(BaseModel):
    refresh_token: str


class LogoutPayload(BaseModel):
    refresh_token: Optional[str] = None


@app.get("/api/auth/provider")
async def auth_provider_info():
    return {
        "provider": AUTH_PROVIDER,
        "oauth_configured": oauth_discord.oauth_configured(),
    }


@app.get("/api/auth/discord/start")
async def auth_discord_start(response: Response):
    if not oauth_discord.oauth_configured():
        raise HTTPException(
            status_code=503,
            detail="OAuth Discord não configurado (DISCORD_CLIENT_ID / SECRET / REDIRECT_URI)",
        )
    state = oauth_discord.new_oauth_state()
    redirect = RedirectResponse(url=oauth_discord.authorize_url(state), status_code=302)
    redirect.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path="/",
    )
    return redirect


@app.get("/api/auth/discord/callback")
async def auth_discord_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    oauth_state: Optional[str] = Cookie(default=None, alias=OAUTH_STATE_COOKIE),
):
    if error:
        return RedirectResponse(
            url=f"{FRONTEND_ORIGIN}/entrar?error={quote(error)}",
            status_code=302,
        )
    if not code or not state:
        raise HTTPException(status_code=400, detail="code/state ausentes")
    if not oauth_state or oauth_state != state:
        raise HTTPException(status_code=400, detail="state OAuth inválido (CSRF)")

    try:
        token_data = await oauth_discord.exchange_code(code)
        discord_user = await oauth_discord.fetch_discord_user(token_data["access_token"])
    except Exception as exc:
        logger.exception("OAuth Discord falhou")
        return RedirectResponse(
            url=f"{FRONTEND_ORIGIN}/entrar?error={quote(str(exc)[:120])}",
            status_code=302,
        )

    discord_id = str(discord_user.get("id") or "")
    if not discord_id:
        raise HTTPException(status_code=400, detail="Discord não retornou id")

    username = discord_user.get("global_name") or discord_user.get("username")
    avatar = oauth_discord.discord_avatar_url(discord_user)

    try:
        user_id = store_auth.ensure_user_for_discord(discord_id, username, avatar)
        refresh_plain = auth_tokens.new_refresh_token()
        refresh_hash = auth_tokens.hash_refresh_token(refresh_plain)
        store_auth.create_auth_session(
            user_id,
            refresh_hash,
            auth_tokens.refresh_expiry(),
            user_agent=request.headers.get("user-agent"),
            ip_address=request.client.host if request.client else None,
        )
        access, expires_in = auth_tokens.issue_access_token(
            user_id=user_id, discord_id=discord_id
        )
    except Exception as exc:
        logger.exception("Falha ao criar sessão")
        raise HTTPException(status_code=500, detail=f"Falha ao criar sessão: {exc}") from exc

    if not _frontend_allowed(FRONTEND_ORIGIN):
        raise HTTPException(status_code=500, detail="FRONTEND_ORIGIN inválido")

    frag = (
        f"access_token={quote(access)}"
        f"&refresh_token={quote(refresh_plain)}"
        f"&expires_in={expires_in}"
        f"&token_type=bearer"
    )
    dest = RedirectResponse(
        url=f"{FRONTEND_ORIGIN}/auth/callback#{frag}",
        status_code=302,
    )
    dest.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    return dest


@app.post("/api/auth/refresh")
async def auth_refresh(body: RefreshPayload, request: Request):
    old_hash = auth_tokens.hash_refresh_token(body.refresh_token)
    new_plain = auth_tokens.new_refresh_token()
    new_hash = auth_tokens.hash_refresh_token(new_plain)
    user_id = store_auth.rotate_refresh(
        old_hash,
        new_hash,
        auth_tokens.refresh_expiry(),
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    if not user_id:
        raise HTTPException(status_code=401, detail="Refresh token inválido ou expirado")

    # discord_id do profile (opcional no JWT)
    prof = store.get_profile_by_user_id(user_id)
    discord_id = (prof or {}).get("discord_id") or ""
    access, expires_in = auth_tokens.issue_access_token(
        user_id=user_id, discord_id=str(discord_id)
    )
    return {
        "access_token": access,
        "refresh_token": new_plain,
        "expires_in": expires_in,
        "token_type": "bearer",
    }


@app.post("/api/auth/logout")
async def auth_logout(
    body: LogoutPayload,
    user: dict | None = Depends(get_current_user),
):
    if body.refresh_token:
        store_auth.revoke_session_by_refresh_hash(
            auth_tokens.hash_refresh_token(body.refresh_token)
        )
    if user and user.get("sub"):
        store_auth.revoke_all_sessions_for_user(str(user["sub"]))
    return {"ok": True}


@app.get("/api/auth/me")
async def auth_me(user: dict = Depends(require_auth)):
    return {
        "sub": user.get("sub"),
        "discord_id": user.get("discord_id"),
        "provider": AUTH_PROVIDER,
    }


# ── BC / IT Checkins ─────────────────────────────────────────────────────────

class CheckinPayload(BaseModel):
    player: str
    canal: str
    evento: str


@app.get("/api/checkins")
async def list_checkins(user: dict = Depends(require_auth)):
    now = datetime.now(timezone.utc).isoformat()
    return store.list_checkins_from(now)


@app.post("/api/checkins")
async def create_checkin(body: CheckinPayload, user: dict = Depends(require_auth)):
    result = store.fazer_checkin(body.player.strip(), body.canal, body.evento)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message", "Falha no check-in"))
    return result
