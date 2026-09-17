"""Apply onboarding_completed_at DDL to SQL Server."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

import db  # noqa: E402

SQL_PATH = ROOT / "supabase" / "onboarding_profiles.sqlserver.sql"


def split_batches(text: str) -> list[str]:
    batches: list[str] = []
    buf: list[str] = []
    for line in text.splitlines():
        if line.strip().upper() == "GO":
            chunk = "\n".join(buf).strip()
            if chunk:
                batches.append(chunk)
            buf = []
        else:
            buf.append(line)
    chunk = "\n".join(buf).strip()
    if chunk:
        batches.append(chunk)
    return batches


def main() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    with db.get_connection() as conn:
        cur = conn.cursor()
        for i, batch in enumerate(split_batches(sql), 1):
            print(f"batch {i}...")
            cur.execute(batch)
        conn.commit()
    row = db.fetch_one(
        """
        SELECT COL_LENGTH(N'dbo.profiles', N'onboarding_completed_at') AS col_len,
               (SELECT COUNT(*) FROM dbo.profiles
                WHERE approved_at IS NOT NULL AND onboarding_completed_at IS NOT NULL) AS backfilled
        """
    )
    print("result:", row)
    print("DDL OK")


if __name__ == "__main__":
    main()
