-- ============================================================================
-- Migração: Sorteio self-service + Doações de Zen + classe no World Boss
-- Rode este SQL no Supabase (SQL Editor) uma única vez.
-- ============================================================================

-- ── World Boss: adiciona coluna de classe nos check-ins ────────────────────
ALTER TABLE world_boss_checkins ADD COLUMN IF NOT EXISTS char_class TEXT;

-- ── Sorteios (self-service) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS raffles (
  id          BIGSERIAL PRIMARY KEY,
  prize       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',   -- open | closed | drawn
  winner_nick TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raffle_entries (
  id           BIGSERIAL PRIMARY KEY,
  raffle_id    BIGINT NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  clerk_id     TEXT NOT NULL,
  nick_mudomix TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (raffle_id, clerk_id)
);

CREATE INDEX IF NOT EXISTS idx_raffle_entries_raffle ON raffle_entries(raffle_id);

-- ── Doações de Zen ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS donation_config (
  id            BIGSERIAL PRIMARY KEY,
  weekly_amount TEXT NOT NULL DEFAULT '100kk',
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Valor inicial padrão
INSERT INTO donation_config (weekly_amount) VALUES ('100kk')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS donations (
  id           BIGSERIAL PRIMARY KEY,
  week_start   DATE NOT NULL,                  -- segunda-feira da semana
  nick_mudomix TEXT NOT NULL,
  marked_by    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, nick_mudomix)
);

CREATE INDEX IF NOT EXISTS idx_donations_week ON donations(week_start);
