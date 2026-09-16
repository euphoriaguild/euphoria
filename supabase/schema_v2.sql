-- ============================================================================
-- Euphoria v2 — Schema completo (greenfield)
-- Projeto alvo: euphoria-v2 (uheimvkdrhbgjtbkykow)
-- Identidade: Supabase Auth (user_id UUID) — SEM clerk_id
-- Dados: vazios (apenas seeds de config/estatuto)
--
-- Como aplicar:
--   1. Supabase Dashboard do projeto v2 → SQL Editor → New query
--   2. Cole TODO este arquivo → Run
--   3. Database → Replication → habilite Realtime na tabela `checkins`
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_username  TEXT,
  discord_id        TEXT,
  avatar_url        TEXT,
  nick_mudomix      TEXT,
  guild             TEXT,
  role              TEXT NOT NULL DEFAULT 'pending'
                    CHECK (role IN ('pending', 'member', 'staff', 'admin', 'rejected')),
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  char_class        TEXT,
  resets            INTEGER DEFAULT 0,
  level             INTEGER DEFAULT 0,
  last_synced       TIMESTAMPTZ,
  phone             TEXT,
  equip_set         TEXT,
  equip_weapon      TEXT,
  equip_accessory   TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_nick_mudomix
  ON public.profiles (lower(nick_mudomix))
  WHERE nick_mudomix IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_discord_id
  ON public.profiles (discord_id)
  WHERE discord_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

-- ---------------------------------------------------------------------------
-- 2) checkins (Blood Castle / Ilusion Temple)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checkins (
  id         BIGSERIAL PRIMARY KEY,
  player     TEXT NOT NULL,
  canal      TEXT NOT NULL,
  evento     TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player, canal, evento)
);

CREATE INDEX IF NOT EXISTS idx_checkins_evento ON public.checkins (evento);
CREATE INDEX IF NOT EXISTS idx_checkins_canal_evento ON public.checkins (canal, evento);

-- ---------------------------------------------------------------------------
-- 3) World Boss
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.world_boss_checkins (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nick_mudomix TEXT NOT NULL,
  guild        TEXT,
  boss_date    DATE NOT NULL,
  boss_name    TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  char_class   TEXT,
  UNIQUE (user_id, boss_date)
);

CREATE INDEX IF NOT EXISTS idx_wb_checkins_date ON public.world_boss_checkins (boss_date);

CREATE TABLE IF NOT EXISTS public.world_boss_parties (
  id         BIGSERIAL PRIMARY KEY,
  boss_date  DATE NOT NULL UNIQUE,
  boss_name  TEXT NOT NULL,
  parties    JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.world_boss_history (
  id            BIGSERIAL PRIMARY KEY,
  boss_name     TEXT NOT NULL,
  killed_at     TIMESTAMPTZ NOT NULL,
  killed_by     TEXT,
  loot          TEXT[],
  notes         TEXT,
  registered_by TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4) Sorteios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.raffles (
  id          BIGSERIAL PRIMARY KEY,
  prize       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'closed', 'drawn')),
  winner_nick TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.raffle_entries (
  id           BIGSERIAL PRIMARY KEY,
  raffle_id    BIGINT NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nick_mudomix TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (raffle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_raffle_entries_raffle ON public.raffle_entries (raffle_id);

CREATE TABLE IF NOT EXISTS public.raffle_history (
  id            BIGSERIAL PRIMARY KEY,
  winner_nick   TEXT NOT NULL,
  winner_guild  TEXT,
  prize         TEXT NOT NULL,
  conducted_by  TEXT,
  participants  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5) Doações
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.donation_config (
  id            BIGSERIAL PRIMARY KEY,
  weekly_amount TEXT NOT NULL DEFAULT '100kk',
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.donations (
  id           BIGSERIAL PRIMARY KEY,
  week_start   DATE NOT NULL,
  nick_mudomix TEXT NOT NULL,
  marked_by    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, nick_mudomix)
);

CREATE INDEX IF NOT EXISTS idx_donations_week ON public.donations (week_start);

-- ---------------------------------------------------------------------------
-- 6) Contas & Alts / Blacklist
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alt_accounts (
  id         BIGSERIAL PRIMARY KEY,
  main_nick  TEXT NOT NULL,
  alt_nick   TEXT,                          -- nullable (código permite main sem alt)
  side       TEXT NOT NULL DEFAULT 'euphoria'
             CHECK (side IN ('euphoria', 'blacklist')),
  notes      TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  main_class TEXT
);

CREATE INDEX IF NOT EXISTS idx_alt_accounts_main ON public.alt_accounts (main_nick);
CREATE INDEX IF NOT EXISTS idx_alt_accounts_side ON public.alt_accounts (side);

CREATE TABLE IF NOT EXISTS public.alts_config (
  id                 BIGSERIAL PRIMARY KEY,
  visible_to_members BOOLEAN NOT NULL DEFAULT false,
  updated_by         TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7) Estatuto
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.guild_statute (
  id         BIGSERIAL PRIMARY KEY,
  content    TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 8) Invasões (estrutura preservada; sem UI no código atual)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invasion_history (
  id            BIGSERIAL PRIMARY KEY,
  invasion_type TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ,
  result        TEXT,
  notes         TEXT,
  registered_by TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 9) RPC fazer_checkin (BC / Ilusion)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fazer_checkin(
  p_player TEXT,
  p_canal  TEXT,
  p_evento TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canais_validos TEXT[] := ARRAY[
    'bc1','bc2','bc3','bc4','bc5','bc6','bc7','ilusion'
  ];
  v_count INTEGER;
  v_player TEXT := trim(p_player);
BEGIN
  IF v_player IS NULL OR v_player = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Nome do personagem inválido.');
  END IF;

  IF p_canal IS NULL OR NOT (p_canal = ANY (v_canais_validos)) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Canal inválido.');
  END IF;

  IF p_evento IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Evento inválido.');
  END IF;

  -- Já inscrito neste canal/evento?
  IF EXISTS (
    SELECT 1 FROM public.checkins
    WHERE player = v_player AND canal = p_canal AND evento = p_evento
  ) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você já está inscrito neste canal para este evento.');
  END IF;

  -- Limite 10 por sala/evento
  SELECT COUNT(*) INTO v_count
  FROM public.checkins
  WHERE canal = p_canal AND evento = p_evento;

  IF v_count >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sala cheia (limite de 10 jogadores).');
  END IF;

  INSERT INTO public.checkins (player, canal, evento)
  VALUES (v_player, p_canal, p_evento);

  RETURN jsonb_build_object('ok', true, 'message', 'Check-in realizado!');
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você já está inscrito neste canal para este evento.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.fazer_checkin(TEXT, TEXT, TIMESTAMPTZ) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 10) RLS
-- Backend usa service_role (bypassa RLS).
-- Anon: leitura de checkins + RPC fazer_checkin.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_boss_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_boss_parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_boss_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donation_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alt_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alts_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guild_statute ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invasion_history ENABLE ROW LEVEL SECURITY;

-- checkins: leitura pública (legado); escrita só via RPC SECURITY DEFINER
DROP POLICY IF EXISTS checkins_select_public ON public.checkins;
CREATE POLICY checkins_select_public
  ON public.checkins FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 11) Seeds
-- ---------------------------------------------------------------------------
INSERT INTO public.donation_config (weekly_amount)
SELECT '100kk'
WHERE NOT EXISTS (SELECT 1 FROM public.donation_config);

INSERT INTO public.alts_config (visible_to_members)
SELECT false
WHERE NOT EXISTS (SELECT 1 FROM public.alts_config);

INSERT INTO public.guild_statute (content, updated_by)
SELECT $$================== ESTATUTO INTERNO - GUILD EUPHORIA ==================

Nota da Liderança: O crescimento da Euphoria depende da disciplina e colaboração de todos. O uso do cupom e a presença nos eventos garantem o retorno em prêmios para você.

CAPÍTULO I - Da Composição e Admissão

Art. 1º – São considerados membros integrantes da Euphoria todos os jogadores que possuírem seus personagens principais vinculados à Guild e que participem ativamente de eventos e Bosses.
Art. 2º – Para admissão na Guild (Recrute), o candidato deve preencher os seguintes requisitos mínimos:
  I. Possuir no mínimo 200 Resets no personagem principal.
  II. Ter disponibilidade de horário para participação nos eventos coletivos.
  III. Possuir e utilizar obrigatoriamente o Discord para coordenação.

CAPÍTULO II - Do Código de Conduta e Convivência

Art. 3º – É terminantemente proibido o ataque (PK) contra membros da Euphoria ou suas contas secundárias (ALTs) alocadas na HellFire ou Euphoria2.
Art. 4º – O uso do Discord é obrigatório durante a execução de todos os eventos (BC, Illusion Temple e World Boss). A comunicação vocal ou auditiva é essencial para o sucesso das estratégias.
Art. 5º – É dever de todo membro buscar a evolução constante do personagem, visando atingir o máximo de resets possíveis para fortalecer a Guild.
Art. 6º – Protocolo de Comunicação em Eventos:
  §1º – Durante a realização de eventos, os membros devem restringir a comunicação ao máximo, mantendo o canal limpo.
  §2º – Deve-se priorizar a audição das orientações dos Líderes de PT.
  §3º – É terminantemente proibido interromper as calls ou poluir o áudio com assuntos paralelos durante a execução do evento.

CAPÍTULO III - Dos Eventos e Check-in

Art. 7º – A participação nos eventos é gerida via check-in no site da sala BC.
  §1º – O check-in abre 25 minutos antes do evento, limitado aos 10 primeiros, sendo 5 no servidor VIP e 5 no servidor PRINCIPAL.
  §2º – No Illusion Temple (Sala BC1), o check-in é com o Nick Principal, mas a entrada deve ser feita com a conta Principal + uma Secundária (ALT).
  §3º – Contas secundárias (ALTs) só entram no Blood Castle se não houver personagens principais interessados.

CAPÍTULO IV - Dos Requisitos para Participação em Drops

Art. 8º – Para estar apto a receber drops, participar da distribuição de itens ou sorteios de cashback, o membro deve cumprir um dos seguintes critérios de atividade:
  I. Ter realizado o mínimo de 5 resets diários; OU
  II. Possuir um personagem com 300+ resets.
  Parágrafo Único: Membros que não atingirem a meta de atividade diária ou o patamar de resets estipulado não terão direito à reivindicação de itens de eventos ou Bosses.

CAPÍTULO V - Das Penalidades

Art. 9º – O descumprimento do check-in sem aviso prévio acarreta suspensão de 24h a 1 semana.
Art. 10º – No Illusion Temple, se a ausência de um membro impedir o início do evento, este deverá restituir todas as entradas gastas pelos demais jogadores (diretamente ou via Baú da Guild).

CAPÍTULO VI - Da Distribuição de Drops e Itens

Art. 11º – Blood Castle: Cada player recebe suas boxes (2x +1, 2x +2, 2x +3).
Art. 12º – Illusion Temple: Cada player recebe boxes aleatórias (+1 a +5).
Art. 13º – World Boss: As Boxes obtidas serão contabilizadas e distribuídas aos participantes do evento mediante sorteio.
Art. 14º – Itens End Game (Raros (Armas, Shield e Asas lvl2)), oriundos das invasões de Dourados, Penas e Monarch:
  §1º – Antes de entregar o item raro para o membro, a Guild vai upar o item para +13 ou criar a Asa/Capa usando os materiais que droparam.
  §2º – A distribuição desses itens não será por sorteio livre. Terá prioridade quem estiver no topo dos seguintes critérios (um ajudando a somar pontos com o outro):
    I – Quem tiver os melhores itens atualmente (ou seja, quem estiver mais perto de precisar desse upgrade);
    II – Quem tiver mais resets e status no personagem;
    III – Quem tiver a maior participação em todos os Bosses da Guild.
  §3º – A distribuição funciona em Sistema de Cascata: o membro que ganhar o item novo é obrigado a passar o seu item antigo (o que foi substituído) para o próximo membro da lista que também cumpra os critérios.
  §4º – Se houver um empate total (membros com os mesmos itens, com status full e com a mesma participação no Boss), aí sim o item será decidido por meio de um sorteio feito apenas entre esses jogadores empatados.

Art. 15º – Das partes de Set com adicionais "Luck + Damage Decrease (DD)" oriundas da Box of Kundun +5 (Box 5):
  §1º – A participação na roleta (sorteio) desses itens é restrita exclusivamente aos membros que já possuam o seu set Tier 4 com os atributos Luck+DD já upados para o level +13.
  §2º – Critério de Prioridade por Progressão de Set: O membro que possuir a maior quantidade de peças prontas (Luck+DD+13) terá prioridade absoluta sobre o item dropado, caso seja a peça faltante para completar o seu set.
    Exemplo: Se um membro possui 3 peças prontas e faltam apenas Helm e Pants, ao dropar a Pants, o item será repassado diretamente a ele, sem a necessidade de roleta.
  §3º – Em caso de empate entre membros que precisem da mesma peça e que possuam exatamente a mesma quantidade de peças prontas do set, o item será decidido por roleta exclusivamente entre os membros empatados.

Art. 16º – Personagens principais têm prioridade absoluta sobre contas secundárias em qualquer distribuição.

CAPÍTULO VII - Gestão de Itens e Propriedade da Guild

Art. 17º – A Asa Level 2 e a Capa de DL são de propriedade coletiva da Guild Euphoria, ficando sob concessão de uso para o membro que atender aos critérios estabelecidos no Art. 14º, §2º, deste estatuto.
Art. 18º – Da Concessão de Uso (Carência): Ao receber um item raro da Guild, o membro detém apenas a concessão de uso pelo prazo de 45 dias.
  §1º – Durante este período, o item permanece como propriedade da Guild.
  §2º – Caso o membro saia da Guild antes do prazo de 45 dias, o item deve ser obrigatoriamente devolvido ao Baú da Guild.
  §3º – Após o cumprimento do prazo de 45 dias de permanência e atividade, a propriedade do item é transferida definitivamente ao player.$$, 'sistema'
WHERE NOT EXISTS (SELECT 1 FROM public.guild_statute);

-- ---------------------------------------------------------------------------
-- 12) Reload PostgREST schema cache
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
