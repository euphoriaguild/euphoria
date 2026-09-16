"""
Camada de acesso ao SQL Server (VPS).

Helpers: healthcheck, fetch_all/one, execute, execute_proc, serialize JSON.
"""
from __future__ import annotations

import json
import os
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Generator, Iterable, Optional, Sequence

import pyodbc
from dotenv import load_dotenv

load_dotenv()

_PREFERRED_DRIVERS = (
    "ODBC Driver 18 for SQL Server",
    "ODBC Driver 17 for SQL Server",
    "SQL Server",
)


def pick_driver() -> str:
    installed = set(pyodbc.drivers())
    for name in _PREFERRED_DRIVERS:
        if name in installed:
            return name
    raise RuntimeError(
        "Nenhum ODBC Driver SQL Server encontrado. Instalados: "
        + (", ".join(sorted(installed)) or "(nenhum)")
    )


def build_connection_string(driver: Optional[str] = None) -> str:
    explicit = os.getenv("SQLSERVER_CONNECTION_STRING", "").strip()
    if explicit and "DRIVER=" in explicit.upper():
        return explicit

    driver = driver or pick_driver()
    host = os.getenv("SQLSERVER_HOST", "127.0.0.1")
    port = os.getenv("SQLSERVER_PORT", "1433")
    database = os.getenv("SQLSERVER_DATABASE", "euphoria")
    user = os.getenv("SQLSERVER_USER", "")
    password = os.getenv("SQLSERVER_PASSWORD", "")
    encrypt = os.getenv("SQLSERVER_ENCRYPT", "yes")
    trust = os.getenv("SQLSERVER_TRUST_SERVER_CERTIFICATE", "yes")

    if not user or not password:
        raise RuntimeError("SQLSERVER_USER / SQLSERVER_PASSWORD não configurados no .env")

    if driver == "SQL Server":
        return (
            f"DRIVER={{{driver}}};"
            f"SERVER={host},{port};"
            f"DATABASE={database};"
            f"UID={user};"
            f"PWD={password};"
            f"Connection Timeout=15;"
        )

    return (
        f"DRIVER={{{driver}}};"
        f"SERVER={host},{port};"
        f"DATABASE={database};"
        f"UID={user};"
        f"PWD={password};"
        f"Encrypt={encrypt};"
        f"TrustServerCertificate={trust};"
        f"Connection Timeout=15;"
    )


@contextmanager
def get_connection() -> Generator[pyodbc.Connection, None, None]:
    conn = pyodbc.connect(build_connection_string())
    try:
        yield conn
    finally:
        conn.close()


def serialize_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, str) and len(value) >= 2 and value[0] in "[{":
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _rows_to_dicts(cursor: pyodbc.Cursor) -> list[dict[str, Any]]:
    if cursor.description is None:
        return []
    cols = [col[0] for col in cursor.description]
    out: list[dict[str, Any]] = []
    for row in cursor.fetchall():
        out.append({c: serialize_value(v) for c, v in zip(cols, row)})
    return out


def fetch_all(sql: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, list(params or []))
        return _rows_to_dicts(cur)


def fetch_one(sql: str, params: Sequence[Any] | None = None) -> dict[str, Any] | None:
    rows = fetch_all(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: Sequence[Any] | None = None) -> int:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, list(params or []))
        conn.commit()
        return cur.rowcount if cur.rowcount is not None else 0


def execute_returning(
    sql: str, params: Sequence[Any] | None = None
) -> list[dict[str, Any]]:
    """Executa SQL com SELECT/OUTPUT e retorna linhas (com commit)."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, list(params or []))
        rows = _rows_to_dicts(cur)
        conn.commit()
        return rows


def execute_many_in_txn(statements: list[tuple[str, Sequence[Any] | None]]) -> None:
    with get_connection() as conn:
        cur = conn.cursor()
        for sql, params in statements:
            cur.execute(sql, list(params or []))
        conn.commit()


def execute_proc(proc_name: str, params: Iterable[Any] | None = None) -> list[dict[str, Any]]:
    params = list(params or [])
    placeholders = ", ".join("?" for _ in params)
    sql = f"EXEC {proc_name} {placeholders}" if placeholders else f"EXEC {proc_name}"
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = _rows_to_dicts(cur)
        conn.commit()
        return rows


def healthcheck() -> dict[str, Any]:
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT 1 AS ok, @@SERVERNAME AS server_name, DB_NAME() AS database_name, SUSER_SNAME() AS login_name"
        )
        row = cur.fetchone()
        return {
            "ok": bool(row and row[0] == 1),
            "server_name": row[1] if row else None,
            "database": row[2] if row else None,
            "login": row[3] if row else None,
            "driver": pick_driver(),
        }


def ensure_app_user(user_id: str) -> None:
    """Garante dbo.app_users.id antes de FKs (profiles, world_boss, raffle_entries)."""
    execute(
        """
        IF NOT EXISTS (SELECT 1 FROM dbo.app_users WHERE id = ?)
            INSERT INTO dbo.app_users (id) VALUES (?)
        """,
        [user_id, user_id],
    )
