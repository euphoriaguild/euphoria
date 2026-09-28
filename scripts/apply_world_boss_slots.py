"""World Boss por slot: unicidade (user_id, boss_date, boss_name) e parties (boss_date, boss_name)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from apply_fazer_checkin_ilusion import connect  # noqa: E402

FIND_UNIQUE = """
SELECT kc.name, STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS cols
FROM sys.key_constraints kc
JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE kc.type = 'UQ' AND kc.parent_object_id = OBJECT_ID(?)
GROUP BY kc.name
"""


def migrate(cur, table: str, old_cols: str, new_name: str, new_cols: str) -> None:
    rows = cur.execute(FIND_UNIQUE, table).fetchall()
    existing = {r.name: r.cols for r in rows}
    if new_name in existing:
        print(f"{table}: {new_name} já existe")
    else:
        cur.execute(f"ALTER TABLE {table} ADD CONSTRAINT {new_name} UNIQUE ({new_cols})")
        print(f"{table}: criada {new_name} ({new_cols})")
    for name, cols in existing.items():
        if cols == old_cols and name != new_name:
            cur.execute(f"ALTER TABLE {table} DROP CONSTRAINT {name}")
            print(f"{table}: removida {name} ({cols})")


def main() -> int:
    cn = connect()
    cur = cn.cursor()
    migrate(cur, "dbo.world_boss_checkins", "user_id,boss_date",
            "UQ_wb_checkins_user_slot", "user_id, boss_date, boss_name")
    migrate(cur, "dbo.world_boss_parties", "boss_date",
            "UQ_wb_parties_slot", "boss_date, boss_name")
    cur.execute("""
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_wb_checkins_slot'
                       AND object_id = OBJECT_ID(N'dbo.world_boss_checkins'))
          CREATE INDEX idx_wb_checkins_slot ON dbo.world_boss_checkins (boss_date, boss_name);
    """)
    print("OK: índice idx_wb_checkins_slot")
    cn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
