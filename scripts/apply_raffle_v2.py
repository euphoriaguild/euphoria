"""Sorteio v2: tier, criador, giro sincronizado e um único sorteio aberto."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from apply_fazer_checkin_ilusion import connect  # noqa: E402

RAFFLE_COLUMNS = {
    "item_tier": "NVARCHAR(10) NULL",
    "created_by_nick": "NVARCHAR(100) NULL",
    "participants_snapshot": "NVARCHAR(MAX) NULL",
    "winner_index": "INT NULL",
    "spin_offset": "FLOAT NULL",
    "spin_turns": "INT NULL",
    "spin_started_at": "DATETIMEOFFSET NULL",
    "spin_duration_s": "INT NULL",
    "closed_by_nick": "NVARCHAR(100) NULL",
    "closed_at": "DATETIMEOFFSET NULL",
}

HISTORY_COLUMNS = {
    "raffle_id": "BIGINT NULL",
    "item_tier": "NVARCHAR(10) NULL",
    "created_by_nick": "NVARCHAR(100) NULL",
    "raffle_created_at": "DATETIMEOFFSET NULL",
}


def add_columns(cur, table: str, columns: dict[str, str]) -> None:
    for name, ddl in columns.items():
        exists = cur.execute("SELECT COL_LENGTH(?, ?)", table, name).fetchone()[0]
        if exists is None:
            cur.execute(f"ALTER TABLE {table} ADD {name} {ddl}")
            print(f"{table}: coluna {name} criada")


def main() -> int:
    cn = connect()
    cur = cn.cursor()

    add_columns(cur, "dbo.raffles", RAFFLE_COLUMNS)
    add_columns(cur, "dbo.raffle_history", HISTORY_COLUMNS)

    tier_check = "item_tier IS NULL OR item_tier IN (N'T1', N'T2', N'T3', N'T4', N'T5', N'NA')"
    for table, name in (("dbo.raffles", "CK_raffles_item_tier"), ("dbo.raffle_history", "CK_raffle_history_item_tier")):
        if not cur.execute("SELECT 1 FROM sys.check_constraints WHERE name = ?", name).fetchone():
            cur.execute(f"ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({tier_check})")
            print(f"{table}: {name} criada")

    cur.execute("""
        UPDATE dbo.raffles SET status = N'closed', closed_at = SYSUTCDATETIME()
        WHERE status = N'open'
          AND id <> (SELECT MAX(id) FROM dbo.raffles WHERE status = N'open')
    """)
    if cur.rowcount:
        print(f"dbo.raffles: {cur.rowcount} sorteio(s) aberto(s) duplicado(s) fechado(s)")

    if not cur.execute(
        "SELECT 1 FROM sys.indexes WHERE name = N'UX_raffles_single_open' AND object_id = OBJECT_ID(N'dbo.raffles')"
    ).fetchone():
        cur.execute("CREATE UNIQUE INDEX UX_raffles_single_open ON dbo.raffles (status) WHERE status = N'open'")
        print("dbo.raffles: UX_raffles_single_open criado")

    print("OK: sorteio v2 aplicado")
    cn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
