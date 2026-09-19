"""Horários e janela de check-in BC / Ilusion Temple (Brasília)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

BRT = ZoneInfo("America/Sao_Paulo")
MINUTOS_ANTES = 25

# Espelha src/config.ts
HORARIOS_BC: list[tuple[int, int]] = [
    (0, 0),
    (4, 0),
    (8, 0),
    (12, 0),
    (16, 0),
    (20, 0),
]

HORARIOS_ILUSION: list[tuple[int, int]] = [
    (9, 30),
    (16, 30),
    (19, 30),
    (23, 30),
]

CANAIS_BC = ("bc1", "bc2", "bc3", "bc4", "bc5", "bc6", "bc7")
CANAIS_ILUSION = ("ilusion_vip", "ilusion_geral")
CANAIS_VALIDOS = CANAIS_BC + CANAIS_ILUSION

LIMITE_POR_CANAL = {
    **{c: 10 for c in CANAIS_BC},
    **{c: 5 for c in CANAIS_ILUSION},
}


def now_brt() -> datetime:
    return datetime.now(BRT)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def evento_para_db(evento: datetime) -> datetime:
    """
    Normaliza o slot do evento para UTC antes de gravar/comparar no SQL Server.
    Evita o driver ODBC legado gravar 02:10 BRT como 02:10+00:00 (offset errado).
    """
    if evento.tzinfo is None:
        evento = evento.replace(tzinfo=BRT)
    return evento.astimezone(timezone.utc)


def canal_valido(canal: str) -> bool:
    return canal in CANAIS_VALIDOS


def limite_canal(canal: str) -> int:
    return LIMITE_POR_CANAL.get(canal, 10)


def horarios_do_canal(canal: str) -> list[tuple[int, int]]:
    if canal in CANAIS_ILUSION:
        return HORARIOS_ILUSION
    return HORARIOS_BC


def _slot_hoje_ou_ontem(now: datetime, hour: int, minute: int) -> datetime:
    """Retorna o datetime do slot no dia de `now` (BRT)."""
    return now.replace(hour=hour, minute=minute, second=0, microsecond=0)


def evento_aberto(now: Optional[datetime] = None) -> Optional[datetime]:
    """
    Se o check-in está aberto para algum slot (qualquer modo), retorna o início do evento.
    Janela: [evento - 25min, evento].
    """
    now = now or now_brt()
    # Unir horários únicos de BC + IT
    slots: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    for h in HORARIOS_BC + HORARIOS_ILUSION:
        if h not in seen:
            seen.add(h)
            slots.append(h)

    for hour, minute in slots:
        for day_offset in (0, -1, 1):
            base = now + timedelta(days=day_offset)
            evento = _slot_hoje_ou_ontem(base, hour, minute)
            inicio = evento - timedelta(minutes=MINUTOS_ANTES)
            if inicio <= now <= evento:
                return evento
    return None


def evento_aberto_para_canal(canal: str, now: Optional[datetime] = None) -> Optional[datetime]:
    """Evento aberto apenas considerando os horários do modo do canal."""
    now = now or now_brt()
    for hour, minute in horarios_do_canal(canal):
        for day_offset in (0, -1, 1):
            base = now + timedelta(days=day_offset)
            evento = _slot_hoje_ou_ontem(base, hour, minute)
            inicio = evento - timedelta(minutes=MINUTOS_ANTES)
            if inicio <= now <= evento:
                return evento
    return None


def canais_ilusion_mesmo_evento(canal: str) -> tuple[str, ...]:
    if canal in CANAIS_ILUSION:
        return CANAIS_ILUSION
    return (canal,)
