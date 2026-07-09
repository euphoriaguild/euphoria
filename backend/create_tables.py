"""Run once to create the World Boss and Raffle tables in Supabase."""
import httpx
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://YOUR_PROJECT.supabase.co")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

TABLES = [
    ("world_boss_checkins", """
        CREATE TABLE IF NOT EXISTS world_boss_checkins (
            id           BIGSERIAL PRIMARY KEY,
            clerk_id     TEXT NOT NULL,
            nick_mudomix TEXT NOT NULL,
            guild        TEXT,
            boss_date    DATE NOT NULL,
            boss_name    TEXT NOT NULL,
            created_at   TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE (clerk_id, boss_date)
        )
    """),
    ("world_boss_parties", """
        CREATE TABLE IF NOT EXISTS world_boss_parties (
            id          BIGSERIAL PRIMARY KEY,
            boss_date   DATE NOT NULL UNIQUE,
            boss_name   TEXT NOT NULL,
            parties     JSONB NOT NULL DEFAULT '[]',
            updated_by  TEXT,
            updated_at  TIMESTAMPTZ DEFAULT NOW()
        )
    """),
    ("raffle_history", """
        CREATE TABLE IF NOT EXISTS raffle_history (
            id           BIGSERIAL PRIMARY KEY,
            item         TEXT NOT NULL,
            winner       TEXT NOT NULL,
            participants TEXT[] NOT NULL DEFAULT '{}',
            drawn_at     TIMESTAMPTZ DEFAULT NOW()
        )
    """),
]

async def main():
    headers = {
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=20) as client:
        # Try pg_meta first
        for name, sql in TABLES:
            r = await client.post(
                f"{SUPABASE_URL}/pg_meta/v1/query",
                headers=headers,
                json={"query": sql.strip()},
            )
            if r.status_code in (200, 201):
                print(f"[OK] {name} — status {r.status_code}")
            else:
                print(f"[pg_meta {r.status_code}] {name}: {r.text[:150]}")
                # Fallback: verify table exists via REST
                check = await client.get(
                    f"{SUPABASE_URL}/rest/v1/{name}?limit=1",
                    headers=headers,
                )
                if check.status_code == 200:
                    print(f"  → tabela {name} já existe (verificado via REST)")
                else:
                    print(f"  → tabela {name} NÃO existe: {check.text[:100]}")

asyncio.run(main())
