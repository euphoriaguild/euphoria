"""Auth sessions + resolução de usuário por Discord (SQL Server)."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import db


def get_user_id_by_discord_id(discord_id: str) -> str | None:
    row = db.fetch_one(
        "SELECT user_id FROM dbo.profiles WHERE discord_id = ?",
        [discord_id],
    )
    if not row:
        return None
    return str(row["user_id"])


def ensure_user_for_discord(
    discord_id: str,
    discord_username: str | None,
    avatar_url: str | None,
) -> str:
    """
    Retorna user_id existente (por discord_id) ou cria app_users.
    Não cria profiles completo — isso fica no /configurar (POST /api/profile).
    Se já existe profile, atualiza username/avatar.
    """
    existing = get_user_id_by_discord_id(discord_id)
    if existing:
        db.execute(
            """
            UPDATE dbo.profiles
            SET discord_username = COALESCE(?, discord_username),
                avatar_url = COALESCE(?, avatar_url)
            WHERE user_id = ?
            """,
            [discord_username, avatar_url, existing],
        )
        return existing

    user_id = str(uuid.uuid4())
    db.ensure_app_user(user_id)
    # Stub mínimo para amarrar discord_id antes do setup completo
    db.execute(
        """
        INSERT INTO dbo.profiles (
          user_id, discord_id, discord_username, avatar_url, role
        ) VALUES (?, ?, ?, ?, N'pending')
        """,
        [user_id, discord_id, discord_username, avatar_url],
    )
    return user_id


def create_auth_session(
    user_id: str,
    refresh_hash: str,
    expires_at: datetime,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> str:
    rows = db.execute_returning(
        """
        INSERT INTO dbo.auth_sessions (
          user_id, refresh_hash, user_agent, ip_address, expires_at
        )
        OUTPUT INSERTED.id
        VALUES (?, ?, ?, ?, ?)
        """,
        [user_id, refresh_hash, user_agent, ip_address, expires_at],
    )
    return str(rows[0]["id"]) if rows else ""


def get_session_by_refresh_hash(refresh_hash: str) -> dict[str, Any] | None:
    return db.fetch_one(
        """
        SELECT id, user_id, refresh_hash, expires_at, revoked_at
        FROM dbo.auth_sessions
        WHERE refresh_hash = ?
        """,
        [refresh_hash],
    )


def touch_session(session_id: str) -> None:
    db.execute(
        """
        UPDATE dbo.auth_sessions
        SET last_used_at = SYSUTCDATETIME()
        WHERE id = ?
        """,
        [session_id],
    )


def revoke_session(session_id: str) -> None:
    db.execute(
        """
        UPDATE dbo.auth_sessions
        SET revoked_at = SYSUTCDATETIME()
        WHERE id = ? AND revoked_at IS NULL
        """,
        [session_id],
    )


def revoke_session_by_refresh_hash(refresh_hash: str) -> None:
    db.execute(
        """
        UPDATE dbo.auth_sessions
        SET revoked_at = SYSUTCDATETIME()
        WHERE refresh_hash = ? AND revoked_at IS NULL
        """,
        [refresh_hash],
    )


def revoke_all_sessions_for_user(user_id: str) -> int:
    return db.execute(
        """
        UPDATE dbo.auth_sessions
        SET revoked_at = SYSUTCDATETIME()
        WHERE user_id = ? AND revoked_at IS NULL
        """,
        [user_id],
    )


def rotate_refresh(
    old_hash: str,
    new_hash: str,
    new_expires_at: datetime,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> str | None:
    """Revoga sessão antiga e cria nova; retorna user_id ou None se inválida."""
    row = get_session_by_refresh_hash(old_hash)
    if not row or row.get("revoked_at"):
        return None
    expires = row.get("expires_at")
    if isinstance(expires, str):
        try:
            expires = datetime.fromisoformat(expires.replace("Z", "+00:00"))
        except ValueError:
            return None
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires is not None and expires < datetime.now(timezone.utc):
        revoke_session(str(row["id"]))
        return None

    user_id = str(row["user_id"])
    revoke_session(str(row["id"]))
    create_auth_session(user_id, new_hash, new_expires_at, user_agent, ip_address)
    return user_id
