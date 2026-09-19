"""
Repositórios SQL Server — dados da aplicação Euphoria (sem PostgREST).
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

import db


# ── Profiles ─────────────────────────────────────────────────────────────────

def get_approved_profiles() -> list[dict]:
    return db.fetch_all(
        """
        SELECT nick_mudomix, guild, char_class, resets, level, role, approved_at
        FROM dbo.profiles
        WHERE approved_at IS NOT NULL
        ORDER BY resets DESC
        """
    )


def get_profile_by_user_id(user_id: str) -> dict | None:
    return db.fetch_one("SELECT * FROM dbo.profiles WHERE user_id = ?", [user_id])


def get_requester_profile(user_id: str) -> dict | None:
    return db.fetch_one(
        """
        SELECT nick_mudomix, char_class, role, approved_at
        FROM dbo.profiles
        WHERE user_id = ?
        """,
        [user_id],
    )


def get_profiles_by_guild(guild_name: str) -> list[dict]:
    return db.fetch_all(
        """
        SELECT nick_mudomix, char_class, resets, level, guild, role
        FROM dbo.profiles
        WHERE approved_at IS NOT NULL AND LOWER(guild) = LOWER(?)
        ORDER BY resets DESC
        """,
        [guild_name],
    )


_SORT_COLS = {"resets", "level", "nick_mudomix", "guild", "char_class"}


def get_approved_members_sorted(sort_col: str, direction: str) -> list[dict]:
    col = sort_col if sort_col in _SORT_COLS else "resets"
    dir_sql = "DESC" if direction.lower() == "desc" else "ASC"
    return db.fetch_all(
        f"""
        SELECT nick_mudomix, char_class, resets, level, guild
        FROM dbo.profiles
        WHERE approved_at IS NOT NULL
        ORDER BY {col} {dir_sql}
        """
    )


def upsert_profile(record: dict) -> None:
    user_id = record["user_id"]
    db.ensure_app_user(user_id)
    existing = get_profile_by_user_id(user_id)
    if existing:
        db.execute(
            """
            UPDATE dbo.profiles SET
              nick_mudomix = ?,
              guild = ?,
              phone = ?,
              discord_username = COALESCE(?, discord_username),
              discord_id = COALESCE(?, discord_id),
              avatar_url = COALESCE(?, avatar_url),
              char_class = COALESCE(?, char_class),
              resets = COALESCE(?, resets),
              level = COALESCE(?, level),
              last_synced = COALESCE(?, last_synced)
            WHERE user_id = ?
            """,
            [
                record.get("nick_mudomix"),
                record.get("guild"),
                record.get("phone"),
                record.get("discord_username"),
                record.get("discord_id"),
                record.get("avatar_url"),
                record.get("char_class"),
                record.get("resets"),
                record.get("level"),
                record.get("last_synced"),
                user_id,
            ],
        )
    else:
        db.execute(
            """
            INSERT INTO dbo.profiles (
              user_id, nick_mudomix, guild, phone, discord_username, discord_id,
              avatar_url, role, char_class, resets, level, last_synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                user_id,
                record.get("nick_mudomix"),
                record.get("guild"),
                record.get("phone"),
                record.get("discord_username"),
                record.get("discord_id"),
                record.get("avatar_url"),
                record.get("role", "pending"),
                record.get("char_class"),
                record.get("resets", 0),
                record.get("level", 0),
                record.get("last_synced"),
            ],
        )


def get_pending_profiles() -> list[dict]:
    return db.fetch_all(
        """
        SELECT user_id, discord_username, avatar_url, nick_mudomix, guild, role, created_at
        FROM dbo.profiles
        WHERE approved_at IS NULL
        ORDER BY created_at ASC
        """
    )


def approve_profile(user_id: str, role: str, approved_at: Optional[str]) -> None:
    if approved_at is not None:
        db.execute(
            "UPDATE dbo.profiles SET role = ?, approved_at = ? WHERE user_id = ?",
            [role, approved_at, user_id],
        )
    else:
        db.execute(
            "UPDATE dbo.profiles SET role = ? WHERE user_id = ?",
            [role, user_id],
        )


def complete_onboarding(user_id: str, completed_at: str) -> None:
    db.execute(
        """
        UPDATE dbo.profiles
        SET onboarding_completed_at = ?
        WHERE user_id = ?
          AND approved_at IS NOT NULL
          AND onboarding_completed_at IS NULL
        """,
        [completed_at, user_id],
    )


def update_member_by_nick(nick: str, fields: dict) -> None:
    allowed = {"char_class", "resets", "level"}
    sets = []
    params: list[Any] = []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k} = ?")
            params.append(v)
    if not sets:
        return
    params.append(nick)
    db.execute(
        f"UPDATE dbo.profiles SET {', '.join(sets)} WHERE nick_mudomix = ?",
        params,
    )


def get_all_profiles_admin() -> list[dict]:
    return db.fetch_all(
        """
        SELECT nick_mudomix, char_class, resets, level, role, discord_username, approved_at
        FROM dbo.profiles
        ORDER BY nick_mudomix ASC
        """
    )


def get_member_profile_by_nick(nick: str) -> dict | None:
    return db.fetch_one(
        """
        SELECT nick_mudomix, guild, char_class, resets, level, role, avatar_url,
               equip_set, equip_weapon, equip_accessory
        FROM dbo.profiles
        WHERE nick_mudomix = ?
        """,
        [nick],
    )


def approved_nick_exists(nick: str) -> bool:
    row = db.fetch_one(
        """
        SELECT 1 AS x FROM dbo.profiles
        WHERE LOWER(nick_mudomix) = LOWER(?)
          AND approved_at IS NOT NULL
        """,
        [nick],
    )
    return row is not None


def update_equipment_by_nick(nick: str, fields: dict) -> None:
    allowed = {"equip_set", "equip_weapon", "equip_accessory"}
    sets = []
    params: list[Any] = []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k} = ?")
            params.append(v)
    if not sets:
        return
    params.append(nick)
    db.execute(
        f"UPDATE dbo.profiles SET {', '.join(sets)} WHERE nick_mudomix = ?",
        params,
    )


def get_classes_by_nicks(nicks: list[str]) -> dict[str, Optional[str]]:
    if not nicks:
        return {}
    placeholders = ",".join("?" for _ in nicks)
    rows = db.fetch_all(
        f"SELECT nick_mudomix, char_class FROM dbo.profiles WHERE nick_mudomix IN ({placeholders})",
        nicks,
    )
    return {r["nick_mudomix"]: r.get("char_class") for r in rows}


# ── World Boss ───────────────────────────────────────────────────────────────

def insert_wb_checkin(
    user_id: str,
    nick: str,
    guild: Optional[str],
    char_class: Optional[str],
    boss_date: str,
    boss_name: str,
) -> bool:
    db.ensure_app_user(user_id)
    exists = db.fetch_one(
        "SELECT 1 AS x FROM dbo.world_boss_checkins WHERE user_id = ? AND boss_date = ?",
        [user_id, boss_date],
    )
    if exists:
        return False
    db.execute(
        """
        INSERT INTO dbo.world_boss_checkins
          (user_id, nick_mudomix, guild, char_class, boss_date, boss_name)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [user_id, nick, guild, char_class, boss_date, boss_name],
    )
    return True


def delete_wb_checkin(user_id: str, boss_date: str) -> None:
    db.execute(
        "DELETE FROM dbo.world_boss_checkins WHERE user_id = ? AND boss_date = ?",
        [user_id, boss_date],
    )


def list_wb_checkins(boss_date: str) -> list[dict]:
    return db.fetch_all(
        """
        SELECT id, nick_mudomix, guild, char_class, boss_name, created_at
        FROM dbo.world_boss_checkins
        WHERE boss_date = ?
        ORDER BY created_at ASC
        """,
        [boss_date],
    )


def list_wb_checkins_since(start_date: str) -> list[dict]:
    return db.fetch_all(
        """
        SELECT nick_mudomix, char_class, boss_date, boss_name
        FROM dbo.world_boss_checkins
        WHERE boss_date >= ?
        ORDER BY boss_date ASC
        """,
        [start_date],
    )


def upsert_wb_parties(
    boss_date: str,
    boss_name: str,
    parties_list: list,
    updated_by: str,
) -> None:
    parties_json = json.dumps(parties_list, ensure_ascii=False)
    existing = db.fetch_one(
        "SELECT id FROM dbo.world_boss_parties WHERE boss_date = ?",
        [boss_date],
    )
    if existing:
        db.execute(
            """
            UPDATE dbo.world_boss_parties
            SET boss_name = ?, parties = ?, updated_by = ?, updated_at = SYSUTCDATETIME()
            WHERE boss_date = ?
            """,
            [boss_name, parties_json, updated_by, boss_date],
        )
    else:
        db.execute(
            """
            INSERT INTO dbo.world_boss_parties (boss_date, boss_name, parties, updated_by)
            VALUES (?, ?, ?, ?)
            """,
            [boss_date, boss_name, parties_json, updated_by],
        )


def get_wb_parties(boss_date: str) -> dict | None:
    return db.fetch_one(
        """
        SELECT parties, boss_name, updated_at
        FROM dbo.world_boss_parties
        WHERE boss_date = ?
        """,
        [boss_date],
    )


# ── Raffle ───────────────────────────────────────────────────────────────────

def list_raffle_history(limit: int, offset: int) -> list[dict]:
    return db.fetch_all(
        """
        SELECT * FROM dbo.raffle_history
        ORDER BY created_at DESC
        OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
        """,
        [offset, limit],
    )


def insert_raffle_history(
    prize: str,
    winner_nick: str,
    conducted_by: Optional[str],
    participants_list: list,
) -> dict | None:
    participants_json = json.dumps(participants_list, ensure_ascii=False)
    rows = db.execute_returning(
        """
        INSERT INTO dbo.raffle_history (prize, winner_nick, conducted_by, participants)
        OUTPUT INSERTED.*
        VALUES (?, ?, ?, ?)
        """,
        [prize, winner_nick, conducted_by, participants_json],
    )
    return rows[0] if rows else None


def get_open_raffle() -> dict | None:
    return db.fetch_one(
        """
        SELECT TOP 1 * FROM dbo.raffles
        WHERE status = N'open'
        ORDER BY created_at DESC
        """
    )


def list_raffle_entries(raffle_id: int) -> list[dict]:
    return db.fetch_all(
        """
        SELECT nick_mudomix, user_id, created_at
        FROM dbo.raffle_entries
        WHERE raffle_id = ?
        ORDER BY created_at ASC
        """,
        [raffle_id],
    )


def close_open_raffles() -> None:
    db.execute("UPDATE dbo.raffles SET status = N'closed' WHERE status = N'open'")


def create_raffle(prize: str, created_by: str) -> dict | None:
    rows = db.execute_returning(
        """
        INSERT INTO dbo.raffles (prize, status, created_by)
        OUTPUT INSERTED.*
        VALUES (?, N'open', ?)
        """,
        [prize, created_by],
    )
    return rows[0] if rows else None


def update_raffle_prize(raffle_id: int, prize: str) -> None:
    db.execute("UPDATE dbo.raffles SET prize = ? WHERE id = ?", [prize, raffle_id])


def join_raffle(raffle_id: int, user_id: str, nick: str) -> None:
    db.ensure_app_user(user_id)
    exists = db.fetch_one(
        "SELECT 1 AS x FROM dbo.raffle_entries WHERE raffle_id = ? AND user_id = ?",
        [raffle_id, user_id],
    )
    if exists:
        return
    db.execute(
        """
        INSERT INTO dbo.raffle_entries (raffle_id, user_id, nick_mudomix)
        VALUES (?, ?, ?)
        """,
        [raffle_id, user_id, nick],
    )


def leave_raffle(raffle_id: int, user_id: str) -> None:
    db.execute(
        "DELETE FROM dbo.raffle_entries WHERE raffle_id = ? AND user_id = ?",
        [raffle_id, user_id],
    )


def draw_raffle(raffle_id: int, winner_nick: str) -> None:
    db.execute(
        """
        UPDATE dbo.raffles
        SET status = N'drawn', winner_nick = ?
        WHERE id = ?
        """,
        [winner_nick, raffle_id],
    )


# ── Donations ────────────────────────────────────────────────────────────────

def get_donation_weekly_amount() -> str | None:
    row = db.fetch_one(
        """
        SELECT TOP 1 weekly_amount FROM dbo.donation_config
        ORDER BY id DESC
        """
    )
    return row["weekly_amount"] if row else None


def list_approved_nicks_classes() -> list[dict]:
    return db.fetch_all(
        """
        SELECT nick_mudomix, char_class, role
        FROM dbo.profiles
        WHERE approved_at IS NOT NULL
        ORDER BY nick_mudomix ASC
        """
    )


def list_donations_for_week(week_start: str) -> list[dict]:
    return db.fetch_all(
        "SELECT nick_mudomix FROM dbo.donations WHERE week_start = ?",
        [week_start],
    )


def insert_donation_config(weekly_amount: str, updated_by: str) -> None:
    db.execute(
        "INSERT INTO dbo.donation_config (weekly_amount, updated_by) VALUES (?, ?)",
        [weekly_amount, updated_by],
    )


def mark_donation(week_start: str, nick: str, marked_by: Optional[str]) -> None:
    exists = db.fetch_one(
        "SELECT 1 AS x FROM dbo.donations WHERE week_start = ? AND nick_mudomix = ?",
        [week_start, nick],
    )
    if exists:
        return
    db.execute(
        """
        INSERT INTO dbo.donations (week_start, nick_mudomix, marked_by)
        VALUES (?, ?, ?)
        """,
        [week_start, nick, marked_by],
    )


def unmark_donation(week_start: str, nick: str) -> None:
    db.execute(
        "DELETE FROM dbo.donations WHERE week_start = ? AND nick_mudomix = ?",
        [week_start, nick],
    )


# ── Alts ─────────────────────────────────────────────────────────────────────

def get_alts_visibility() -> bool:
    row = db.fetch_one(
        """
        SELECT TOP 1 visible_to_members FROM dbo.alts_config
        ORDER BY id DESC
        """
    )
    if not row:
        return False
    return bool(row["visible_to_members"])


def insert_alts_visibility(visible: bool, updated_by: str) -> None:
    db.execute(
        "INSERT INTO dbo.alts_config (visible_to_members, updated_by) VALUES (?, ?)",
        [1 if visible else 0, updated_by],
    )


def list_alts_all() -> list[dict]:
    return db.fetch_all("SELECT * FROM dbo.alt_accounts ORDER BY main_nick ASC")


def list_alts_for_main(main_nick: str) -> list[dict]:
    return db.fetch_all(
        """
        SELECT * FROM dbo.alt_accounts
        WHERE side = N'euphoria' AND LOWER(main_nick) = LOWER(?)
        ORDER BY main_nick ASC
        """,
        [main_nick],
    )


def insert_alt(
    main_nick: str,
    alt_nick: Optional[str],
    side: str,
    notes: Optional[str],
    created_by: Optional[str],
    main_class: Optional[str] = None,
) -> dict | None:
    if main_class is not None:
        rows = db.execute_returning(
            """
            INSERT INTO dbo.alt_accounts (main_nick, alt_nick, side, notes, created_by, main_class)
            OUTPUT INSERTED.*
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [main_nick, alt_nick, side, notes, created_by, main_class],
        )
    else:
        rows = db.execute_returning(
            """
            INSERT INTO dbo.alt_accounts (main_nick, alt_nick, side, notes, created_by)
            OUTPUT INSERTED.*
            VALUES (?, ?, ?, ?, ?)
            """,
            [main_nick, alt_nick, side, notes, created_by],
        )
    return rows[0] if rows else None


def get_alt_by_id(alt_id: int) -> dict | None:
    return db.fetch_one("SELECT * FROM dbo.alt_accounts WHERE id = ?", [alt_id])


def update_alt(alt_id: int, fields: dict) -> None:
    allowed = {"main_nick", "alt_nick", "side", "main_class", "notes"}
    sets = []
    params: list[Any] = []
    for k, v in fields.items():
        if k in allowed:
            sets.append(f"{k} = ?")
            params.append(v)
    if not sets:
        return
    params.append(alt_id)
    db.execute(f"UPDATE dbo.alt_accounts SET {', '.join(sets)} WHERE id = ?", params)


def delete_alt(alt_id: int) -> None:
    db.execute("DELETE FROM dbo.alt_accounts WHERE id = ?", [alt_id])


# ── Statute ──────────────────────────────────────────────────────────────────

def get_statute() -> dict | None:
    return db.fetch_one(
        """
        SELECT TOP 1 content, updated_by, updated_at
        FROM dbo.guild_statute
        ORDER BY id DESC
        """
    )


def insert_statute(content: str, updated_by: Optional[str]) -> None:
    db.execute(
        "INSERT INTO dbo.guild_statute (content, updated_by) VALUES (?, ?)",
        [content, updated_by],
    )


# ── BC / IT Checkins ─────────────────────────────────────────────────────────

def list_checkins_from(evento_from: Any) -> list[dict]:
    return db.fetch_all(
        """
        SELECT id, player, canal, evento, created_at
        FROM dbo.checkins
        WHERE evento >= ?
        ORDER BY created_at ASC
        """,
        [evento_from],
    )


def count_checkins(canal: str, evento: Any) -> int:
    row = db.fetch_one(
        """
        SELECT COUNT(*) AS c
        FROM dbo.checkins
        WHERE canal = ? AND evento = ?
        """,
        [canal, evento],
    )
    return int(row["c"]) if row else 0


def player_ja_inscrito_ilusion(player: str, evento: Any) -> bool:
    row = db.fetch_one(
        """
        SELECT 1 AS x FROM dbo.checkins
        WHERE player = ?
          AND evento = ?
          AND canal IN (N'ilusion_vip', N'ilusion_geral')
        """,
        [player, evento],
    )
    if row:
        return True
    # Legado: mesmo relógio de parede gravado com offset +00:00 por engano
    if hasattr(evento, "astimezone"):
        import event_schedule as es
        wall = evento.astimezone(es.BRT)
        row = db.fetch_one(
            """
            SELECT 1 AS x FROM dbo.checkins
            WHERE player = ?
              AND canal IN (N'ilusion_vip', N'ilusion_geral')
              AND DATEPART(year, SWITCHOFFSET(evento, '-03:00')) = ?
              AND DATEPART(month, SWITCHOFFSET(evento, '-03:00')) = ?
              AND DATEPART(day, SWITCHOFFSET(evento, '-03:00')) = ?
              AND DATEPART(hour, SWITCHOFFSET(evento, '-03:00')) = ?
              AND DATEPART(minute, SWITCHOFFSET(evento, '-03:00')) = ?
            """,
            [player, wall.year, wall.month, wall.day, wall.hour, wall.minute],
        )
        # Também tenta match literal no wall clock do valor armazenado (offset errado)
        if not row:
            row = db.fetch_one(
                """
                SELECT 1 AS x FROM dbo.checkins
                WHERE player = ?
                  AND canal IN (N'ilusion_vip', N'ilusion_geral')
                  AND DATEPART(year, evento) = ?
                  AND DATEPART(month, evento) = ?
                  AND DATEPART(day, evento) = ?
                  AND DATEPART(hour, evento) = ?
                  AND DATEPART(minute, evento) = ?
                """,
                [player, wall.year, wall.month, wall.day, wall.hour, wall.minute],
            )
    return bool(row)


def delete_checkin(player: str, canal: str, evento: Any) -> int:
    return db.execute(
        """
        DELETE FROM dbo.checkins
        WHERE player = ? AND canal = ? AND evento = ?
        """,
        [player, canal, evento],
    )


def delete_checkin_legado_wallclock(player: str, canal: str, evento_brt: Any) -> int:
    """Apaga inscrição legada gravada com o mesmo HH:MM de parede e offset errado."""
    return db.execute(
        """
        DELETE FROM dbo.checkins
        WHERE player = ? AND canal = ?
          AND DATEPART(year, evento) = ?
          AND DATEPART(month, evento) = ?
          AND DATEPART(day, evento) = ?
          AND DATEPART(hour, evento) = ?
          AND DATEPART(minute, evento) = ?
        """,
        [
            player,
            canal,
            evento_brt.year,
            evento_brt.month,
            evento_brt.day,
            evento_brt.hour,
            evento_brt.minute,
        ],
    )


def fazer_checkin(player: str, canal: str, evento: Any) -> dict:
    if isinstance(evento, str):
        # pyodbc aceita datetime; ISO string ok for DATETIMEOFFSET on modern drivers
        try:
            evento = datetime.fromisoformat(evento.replace("Z", "+00:00"))
        except ValueError:
            pass
    rows = db.execute_proc("dbo.fazer_checkin", [player, canal, evento])
    if not rows:
        return {"ok": False, "message": "Sem resposta da procedure."}
    raw = rows[0].get("result")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"ok": False, "message": raw}
    return {"ok": False, "message": "Resposta inválida da procedure."}
