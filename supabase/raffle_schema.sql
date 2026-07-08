-- ============================================================
-- Tabela de histórico de sorteios
-- ============================================================
create table if not exists public.raffle_history (
  id            bigserial primary key,
  item          text not null,
  winner        text not null,
  participants  text[] not null,
  drawn_by      uuid references auth.users(id),
  drawn_at      timestamptz default now()
);

alter table public.raffle_history enable row level security;

-- Leitura: apenas membros aprovados
drop policy if exists "raffle_read" on public.raffle_history;
create policy "raffle_read"
  on public.raffle_history for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('member', 'staff', 'admin')
    )
  );

-- Inserção: apenas membros aprovados
drop policy if exists "raffle_insert" on public.raffle_history;
create policy "raffle_insert"
  on public.raffle_history for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('member', 'staff', 'admin')
    )
  );
