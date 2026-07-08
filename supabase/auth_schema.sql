-- ─────────────────────────────────────────────────────────────────────────────
-- Euphoria Platform — Schema compatível com Clerk Auth
-- ATENÇÃO: O Clerk gerencia autenticação; o Supabase armazena apenas perfis.
--          NÃO há FK para auth.users. A PK é o clerk_id (string do Clerk).
-- Rode no SQL Editor do Supabase.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── TABELA PROFILES ─────────────────────────────────────────────────────────
-- Primeiro remova tabela antiga se existir (tenha cuidado em produção!)
drop table if exists public.profiles cascade;

create table public.profiles (
  clerk_id          text primary key,          -- user.id do Clerk (ex: user_2abc...)
  discord_username  text,                       -- username Discord (sem #tag no novo formato)
  discord_id        text,                       -- ID numérico do Discord
  avatar_url        text,                       -- URL do avatar
  nick_mudomix      text,                       -- Nick no MU Domix
  guild             text,                       -- Guilda: Euphoria | Euphor1a | Jackson5 | HellBoyz
  role              text not null default 'pending',  -- pending | member | staff | admin | rejected
  approved_at       timestamptz,
  created_at        timestamptz not null default now()
);

-- Índices
create index profiles_role_idx  on public.profiles(role);
create index profiles_guild_idx on public.profiles(guild);

-- RLS: O backend usa service_role key (bypassa RLS).
-- O frontend NÃO lê diretamente profiles via anon key — tudo via backend.
alter table public.profiles enable row level security;

-- ─── TABELA RAFFLE_HISTORY ────────────────────────────────────────────────────
drop table if exists public.raffle_history cascade;

create table public.raffle_history (
  id            bigserial primary key,
  winner_nick   text not null,
  winner_guild  text,
  prize         text not null,
  conducted_by  text,                          -- clerk_id do staff
  participants  int not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.raffle_history enable row level security;

-- Leitura pública (qualquer membro autenticado pode ver histórico)
create policy "raffle_select_all" on public.raffle_history
  for select using (true);

-- ─── TABELA WORLD_BOSS_HISTORY ────────────────────────────────────────────────
drop table if exists public.world_boss_history cascade;

create table public.world_boss_history (
  id            bigserial primary key,
  boss_name     text not null,
  killed_at     timestamptz not null,
  killed_by     text,
  loot          text[],
  notes         text,
  registered_by text,
  created_at    timestamptz not null default now()
);

alter table public.world_boss_history enable row level security;

create policy "boss_select_all" on public.world_boss_history
  for select using (true);

-- ─── TABELA INVASION_HISTORY ─────────────────────────────────────────────────
drop table if exists public.invasion_history cascade;

create table public.invasion_history (
  id            bigserial primary key,
  invasion_type text not null,
  started_at    timestamptz not null,
  ended_at      timestamptz,
  result        text,
  notes         text,
  registered_by text,
  created_at    timestamptz not null default now()
);

alter table public.invasion_history enable row level security;

create policy "invasion_select_all" on public.invasion_history
  for select using (true);
