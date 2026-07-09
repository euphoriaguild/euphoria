-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)

CREATE TABLE IF NOT EXISTS world_boss_checkins (
  id          BIGSERIAL PRIMARY KEY,
  clerk_id    TEXT NOT NULL,
  nick_mudomix TEXT NOT NULL,
  guild       TEXT,
  boss_date   DATE NOT NULL,
  boss_name   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (clerk_id, boss_date)   -- 1 check-in por pessoa por dia
);

CREATE TABLE IF NOT EXISTS world_boss_parties (
  id          BIGSERIAL PRIMARY KEY,
  boss_date   DATE NOT NULL UNIQUE,
  boss_name   TEXT NOT NULL,
  parties     JSONB NOT NULL DEFAULT '[]',
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
