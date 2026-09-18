"""
Agregação de membros das guildas Euphoria / Euph0ria / Euphor1a via API MU Domix.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from external_api import mudomix_api, MudomixAuthError
import store

logger = logging.getLogger(__name__)

# Ordem tipada — prioridade na ordenação inicial (Euphoria primeiro)
ALLIANCE_GUILD_NAMES: tuple[str, ...] = ("Euphoria", "Euph0ria", "Euphor1a")

_GUILD_SORT_RANK = {name.lower(): i for i, name in enumerate(ALLIANCE_GUILD_NAMES)}


def _parse_int(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, int):
        return value
    digits = re.sub(r"[^\d]", "", str(value))
    try:
        return int(digits) if digits else 0
    except ValueError:
        return 0


def _normalize_class(classe: str | None) -> str:
    raw = (classe or "").strip()
    if not raw:
        return ""
    low = raw.lower()
    mapping = {
        "magic gladiator": "Magic Gladiator",
        "blade knight": "Blade Knight",
        "dark knight": "Dark Knight",
        "soul master": "Soul Master",
        "dark wizard": "Dark Wizard",
        "muse elf": "Muse Elf",
        "fairy elf": "Fairy Elf",
        "dark lord": "Dark Lord",
        "summoner": "Summoner",
        "rage fighter": "Rage Fighter",
        "grow lancer": "Grow Lancer",
    }
    return mapping.get(low, raw)


async def _fetch_guild(nome: str) -> dict[str, Any]:
    resp = await mudomix_api.request("GET", f"/api/guildas/{nome}")
    if resp.status_code >= 400:
        logger.warning("guilda %s HTTP %s: %s", nome, resp.status_code, resp.text[:200])
        return {"nomeGuilda": nome, "encontrado": False, "membros": [], "erro": resp.text[:200]}
    data = resp.json()
    data["_requested_name"] = nome
    return data


async def fetch_alliance_members() -> dict[str, Any]:
    """
    Busca as 3 guildas em paralelo, unifica membros e cruza com profiles do site.
    """
    if not mudomix_api.configured:
        raise MudomixAuthError("API MU Domix não configurada")

    results = await asyncio.gather(
        *[_fetch_guild(name) for name in ALLIANCE_GUILD_NAMES],
        return_exceptions=True,
    )

    registered = {
        (p.get("nick_mudomix") or "").strip().lower(): p
        for p in store.list_approved_nicks_classes()
        if p.get("nick_mudomix")
    }

    members: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    seen: set[str] = set()

    for name, result in zip(ALLIANCE_GUILD_NAMES, results):
        if isinstance(result, Exception):
            logger.exception("Falha ao buscar guilda %s", name)
            errors.append({"guilda": name, "erro": str(result)})
            continue
        if not result.get("encontrado"):
            errors.append({
                "guilda": name,
                "erro": result.get("mensagemErro") or result.get("erro") or "não encontrada",
            })
        guild_label = result.get("nomeGuilda") or name
        for raw in result.get("membros") or []:
            nick = (raw.get("nomeChar") or "").strip()
            if not nick:
                continue
            key = nick.lower()
            # Mesmo nick em mais de uma guilda: mantém a primeira na ordem tipada
            if key in seen:
                continue
            seen.add(key)
            profile = registered.get(key)
            members.append({
                "name": nick,
                "guild": guild_label,
                "char_class": _normalize_class(raw.get("classe")),
                "resets": _parse_int(raw.get("resets")),
                "level": _parse_int(raw.get("level")),
                "online": bool(raw.get("online")),
                "status_texto": raw.get("statusTexto"),
                "mapa": raw.get("mapa"),
                "mapa_coordenadas": raw.get("mapaCoordenadas"),
                "em_safe_zone": bool(raw.get("emSafeZone")),
                "avatar_url": raw.get("avatarUrl"),
                "site_registered": profile is not None,
                "site_role": profile.get("role") if profile else None,
                "site_class": profile.get("char_class") if profile else None,
            })

    # Ordenação inicial: resets DESC, depois guild Euphoria (rank), depois nome
    members.sort(
        key=lambda m: (
            -int(m["resets"]),
            _GUILD_SORT_RANK.get(str(m["guild"]).lower(), 99),
            str(m["name"]).lower(),
        )
    )

    class_dist: dict[str, int] = {}
    guild_dist: dict[str, int] = {}
    online_count = 0
    registered_count = 0
    for m in members:
        cls = m["char_class"] or "Desconhecida"
        class_dist[cls] = class_dist.get(cls, 0) + 1
        g = m["guild"] or "?"
        guild_dist[g] = guild_dist.get(g, 0) + 1
        if m["online"]:
            online_count += 1
        if m["site_registered"]:
            registered_count += 1

    return {
        "guilds": list(ALLIANCE_GUILD_NAMES),
        "members": members,
        "total": len(members),
        "online_count": online_count,
        "offline_count": len(members) - online_count,
        "site_registered_count": registered_count,
        "class_distribution": class_dist,
        "guild_distribution": guild_dist,
        "errors": errors,
    }
