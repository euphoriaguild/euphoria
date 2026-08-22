-- ============================================================================
-- Migração: Contas & Alts (organização de contas alternativas de players)
-- Rode este SQL no Supabase (SQL Editor) uma única vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS alt_accounts (
  id         BIGSERIAL PRIMARY KEY,
  main_nick  TEXT NOT NULL,
  alt_nick   TEXT NOT NULL,
  side       TEXT NOT NULL DEFAULT 'euphoria',  -- 'euphoria' (nossa guild) | 'enemy' (guild inimiga)
  notes      TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alt_accounts_main ON alt_accounts(main_nick);
CREATE INDEX IF NOT EXISTS idx_alt_accounts_side ON alt_accounts(side);

-- Config de visibilidade: controla se membros comuns (não-staff) podem ver a lista
CREATE TABLE IF NOT EXISTS alts_config (
  id                 BIGSERIAL PRIMARY KEY,
  visible_to_members BOOLEAN NOT NULL DEFAULT false,
  updated_by         TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estado inicial: oculto para membros (apenas staff/admin vê)
INSERT INTO alts_config (visible_to_members) VALUES (false)
ON CONFLICT DO NOTHING;
