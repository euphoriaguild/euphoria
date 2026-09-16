-- ============================================================================
-- Euphoria v2 — Schema SQL Server (migração a partir de schema_v2.sql / Postgres)
--
-- Mapeamento principal:
--   UUID / auth.users(id)  → UNIQUEIDENTIFIER (FK opcional para dbo.app_users)
--   TEXT                   → NVARCHAR(MAX) ou NVARCHAR(n)
--   TIMESTAMPTZ / now()    → DATETIMEOFFSET / SYSUTCDATETIME()
--   BIGSERIAL              → BIGINT IDENTITY(1,1)
--   BOOLEAN                → BIT
--   JSONB                  → NVARCHAR(MAX) (JSON)
--   TEXT[]                 → NVARCHAR(MAX) (JSON array, ex.: ["item1","item2"])
--   RPC fazer_checkin      → PROCEDURE dbo.fazer_checkin
--   RLS / GRANT anon       → não equivalentes ao Supabase; segurança via app/API
--   NOTIFY pgrst           → removido (específico PostgREST)
--
-- Como aplicar (SSMS / Azure Data Studio):
--   1. Conecte no database destino
--   2. Execute este script por completo
-- ============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

-- ---------------------------------------------------------------------------
-- 0) Tabela de usuários (substitui auth.users do Supabase)
--    Preencha via sua camada de autenticação (ex.: GUID do IdP).
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.app_users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.app_users (
    id         UNIQUEIDENTIFIER NOT NULL
               CONSTRAINT PK_app_users PRIMARY KEY
               CONSTRAINT DF_app_users_id DEFAULT NEWSEQUENTIALID(),
    created_at DATETIMEOFFSET NOT NULL
               CONSTRAINT DF_app_users_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

-- ---------------------------------------------------------------------------
-- 1) profiles
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.profiles', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.profiles (
    user_id           UNIQUEIDENTIFIER NOT NULL
                      CONSTRAINT PK_profiles PRIMARY KEY
                      CONSTRAINT FK_profiles_app_users
                        REFERENCES dbo.app_users(id) ON DELETE CASCADE,
    discord_username  NVARCHAR(255) NULL,
    discord_id        NVARCHAR(64) NULL,
    avatar_url        NVARCHAR(1000) NULL,
    nick_mudomix      NVARCHAR(100) NULL,
    guild             NVARCHAR(100) NULL,
    role              NVARCHAR(20) NOT NULL
                      CONSTRAINT DF_profiles_role DEFAULT N'pending'
                      CONSTRAINT CK_profiles_role
                        CHECK (role IN (N'pending', N'member', N'staff', N'admin', N'rejected')),
    approved_at       DATETIMEOFFSET NULL,
    created_at        DATETIMEOFFSET NOT NULL
                      CONSTRAINT DF_profiles_created_at DEFAULT SYSUTCDATETIME(),
    char_class        NVARCHAR(100) NULL,
    resets            INT NULL CONSTRAINT DF_profiles_resets DEFAULT 0,
    level             INT NULL CONSTRAINT DF_profiles_level DEFAULT 0,
    last_synced       DATETIMEOFFSET NULL,
    phone             NVARCHAR(30) NULL,
    equip_set         NVARCHAR(200) NULL,
    equip_weapon      NVARCHAR(200) NULL,
    equip_accessory   NVARCHAR(200) NULL
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_profiles_nick_mudomix' AND object_id = OBJECT_ID(N'dbo.profiles'))
BEGIN
  CREATE UNIQUE INDEX idx_profiles_nick_mudomix
    ON dbo.profiles (nick_mudomix)
    WHERE nick_mudomix IS NOT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_profiles_discord_id' AND object_id = OBJECT_ID(N'dbo.profiles'))
BEGIN
  CREATE INDEX idx_profiles_discord_id
    ON dbo.profiles (discord_id)
    WHERE discord_id IS NOT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_profiles_role' AND object_id = OBJECT_ID(N'dbo.profiles'))
BEGIN
  CREATE INDEX idx_profiles_role ON dbo.profiles (role);
END
GO

-- ---------------------------------------------------------------------------
-- 2) checkins (Blood Castle / Ilusion Temple)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.checkins', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.checkins (
    id         BIGINT IDENTITY(1,1) NOT NULL
               CONSTRAINT PK_checkins PRIMARY KEY,
    player     NVARCHAR(100) NOT NULL,
    canal      NVARCHAR(50) NOT NULL,
    evento     DATETIMEOFFSET NOT NULL,
    created_at DATETIMEOFFSET NOT NULL
               CONSTRAINT DF_checkins_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_checkins_player_canal_evento UNIQUE (player, canal, evento)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_checkins_evento' AND object_id = OBJECT_ID(N'dbo.checkins'))
  CREATE INDEX idx_checkins_evento ON dbo.checkins (evento);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_checkins_canal_evento' AND object_id = OBJECT_ID(N'dbo.checkins'))
  CREATE INDEX idx_checkins_canal_evento ON dbo.checkins (canal, evento);
GO

-- ---------------------------------------------------------------------------
-- 3) World Boss
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.world_boss_checkins', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.world_boss_checkins (
    id           BIGINT IDENTITY(1,1) NOT NULL
                 CONSTRAINT PK_world_boss_checkins PRIMARY KEY,
    user_id      UNIQUEIDENTIFIER NOT NULL
                 CONSTRAINT FK_wb_checkins_app_users
                   REFERENCES dbo.app_users(id) ON DELETE CASCADE,
    nick_mudomix NVARCHAR(100) NOT NULL,
    guild        NVARCHAR(100) NULL,
    boss_date    DATE NOT NULL,
    boss_name    NVARCHAR(100) NOT NULL,
    created_at   DATETIMEOFFSET NULL
                 CONSTRAINT DF_wb_checkins_created_at DEFAULT SYSUTCDATETIME(),
    char_class   NVARCHAR(100) NULL,
    CONSTRAINT UQ_wb_checkins_user_date UNIQUE (user_id, boss_date)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_wb_checkins_date' AND object_id = OBJECT_ID(N'dbo.world_boss_checkins'))
  CREATE INDEX idx_wb_checkins_date ON dbo.world_boss_checkins (boss_date);
GO

IF OBJECT_ID(N'dbo.world_boss_parties', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.world_boss_parties (
    id         BIGINT IDENTITY(1,1) NOT NULL
               CONSTRAINT PK_world_boss_parties PRIMARY KEY,
    boss_date  DATE NOT NULL
               CONSTRAINT UQ_world_boss_parties_date UNIQUE,
    boss_name  NVARCHAR(100) NOT NULL,
    parties    NVARCHAR(MAX) NOT NULL
               CONSTRAINT DF_wb_parties_json DEFAULT N'[]'
               CONSTRAINT CK_wb_parties_json CHECK (ISJSON(parties) = 1),
    updated_by NVARCHAR(100) NULL,
    updated_at DATETIMEOFFSET NULL
               CONSTRAINT DF_wb_parties_updated_at DEFAULT SYSUTCDATETIME()
  );
END
GO

IF OBJECT_ID(N'dbo.world_boss_history', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.world_boss_history (
    id            BIGINT IDENTITY(1,1) NOT NULL
                  CONSTRAINT PK_world_boss_history PRIMARY KEY,
    boss_name     NVARCHAR(100) NOT NULL,
    killed_at     DATETIMEOFFSET NOT NULL,
    killed_by     NVARCHAR(100) NULL,
    loot          NVARCHAR(MAX) NULL  -- JSON array, ex.: ["Box","Jewel"]
                  CONSTRAINT CK_wb_history_loot_json CHECK (loot IS NULL OR ISJSON(loot) = 1),
    notes         NVARCHAR(MAX) NULL,
    registered_by NVARCHAR(100) NULL,
    created_at    DATETIMEOFFSET NOT NULL
                  CONSTRAINT DF_wb_history_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

-- ---------------------------------------------------------------------------
-- 4) Sorteios
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.raffles', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.raffles (
    id          BIGINT IDENTITY(1,1) NOT NULL
                CONSTRAINT PK_raffles PRIMARY KEY,
    prize       NVARCHAR(500) NOT NULL,
    status      NVARCHAR(20) NOT NULL
                CONSTRAINT DF_raffles_status DEFAULT N'open'
                CONSTRAINT CK_raffles_status CHECK (status IN (N'open', N'closed', N'drawn')),
    winner_nick NVARCHAR(100) NULL,
    created_by  NVARCHAR(100) NULL,
    created_at  DATETIMEOFFSET NOT NULL
                CONSTRAINT DF_raffles_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

IF OBJECT_ID(N'dbo.raffle_entries', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.raffle_entries (
    id           BIGINT IDENTITY(1,1) NOT NULL
                 CONSTRAINT PK_raffle_entries PRIMARY KEY,
    raffle_id    BIGINT NOT NULL
                 CONSTRAINT FK_raffle_entries_raffles
                   REFERENCES dbo.raffles(id) ON DELETE CASCADE,
    user_id      UNIQUEIDENTIFIER NOT NULL
                 CONSTRAINT FK_raffle_entries_app_users
                   REFERENCES dbo.app_users(id) ON DELETE CASCADE,
    nick_mudomix NVARCHAR(100) NOT NULL,
    created_at   DATETIMEOFFSET NOT NULL
                 CONSTRAINT DF_raffle_entries_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_raffle_entries_raffle_user UNIQUE (raffle_id, user_id)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_raffle_entries_raffle' AND object_id = OBJECT_ID(N'dbo.raffle_entries'))
  CREATE INDEX idx_raffle_entries_raffle ON dbo.raffle_entries (raffle_id);
GO

IF OBJECT_ID(N'dbo.raffle_history', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.raffle_history (
    id            BIGINT IDENTITY(1,1) NOT NULL
                  CONSTRAINT PK_raffle_history PRIMARY KEY,
    winner_nick   NVARCHAR(100) NOT NULL,
    winner_guild  NVARCHAR(100) NULL,
    prize         NVARCHAR(500) NOT NULL,
    conducted_by  NVARCHAR(100) NULL,
    participants  NVARCHAR(MAX) NOT NULL
                  CONSTRAINT DF_raffle_history_participants DEFAULT N'[]'
                  CONSTRAINT CK_raffle_history_participants_json CHECK (ISJSON(participants) = 1),
    created_at    DATETIMEOFFSET NOT NULL
                  CONSTRAINT DF_raffle_history_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

-- ---------------------------------------------------------------------------
-- 5) Doações
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.donation_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.donation_config (
    id            BIGINT IDENTITY(1,1) NOT NULL
                  CONSTRAINT PK_donation_config PRIMARY KEY,
    weekly_amount NVARCHAR(50) NOT NULL
                  CONSTRAINT DF_donation_config_weekly DEFAULT N'100kk',
    updated_by    NVARCHAR(100) NULL,
    updated_at    DATETIMEOFFSET NOT NULL
                  CONSTRAINT DF_donation_config_updated_at DEFAULT SYSUTCDATETIME()
  );
END
GO

IF OBJECT_ID(N'dbo.donations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.donations (
    id           BIGINT IDENTITY(1,1) NOT NULL
                 CONSTRAINT PK_donations PRIMARY KEY,
    week_start   DATE NOT NULL,
    nick_mudomix NVARCHAR(100) NOT NULL,
    marked_by    NVARCHAR(100) NULL,
    created_at   DATETIMEOFFSET NOT NULL
                 CONSTRAINT DF_donations_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_donations_week_nick UNIQUE (week_start, nick_mudomix)
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_donations_week' AND object_id = OBJECT_ID(N'dbo.donations'))
  CREATE INDEX idx_donations_week ON dbo.donations (week_start);
GO

-- ---------------------------------------------------------------------------
-- 6) Contas & Alts / Blacklist
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.alt_accounts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.alt_accounts (
    id         BIGINT IDENTITY(1,1) NOT NULL
               CONSTRAINT PK_alt_accounts PRIMARY KEY,
    main_nick  NVARCHAR(100) NOT NULL,
    alt_nick   NVARCHAR(100) NULL,  -- nullable (main sem alt)
    side       NVARCHAR(20) NOT NULL
               CONSTRAINT DF_alt_accounts_side DEFAULT N'euphoria'
               CONSTRAINT CK_alt_accounts_side CHECK (side IN (N'euphoria', N'blacklist')),
    notes      NVARCHAR(MAX) NULL,
    created_by NVARCHAR(100) NULL,
    created_at DATETIMEOFFSET NOT NULL
               CONSTRAINT DF_alt_accounts_created_at DEFAULT SYSUTCDATETIME(),
    main_class NVARCHAR(100) NULL
  );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_alt_accounts_main' AND object_id = OBJECT_ID(N'dbo.alt_accounts'))
  CREATE INDEX idx_alt_accounts_main ON dbo.alt_accounts (main_nick);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'idx_alt_accounts_side' AND object_id = OBJECT_ID(N'dbo.alt_accounts'))
  CREATE INDEX idx_alt_accounts_side ON dbo.alt_accounts (side);
GO

IF OBJECT_ID(N'dbo.alts_config', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.alts_config (
    id                 BIGINT IDENTITY(1,1) NOT NULL
                       CONSTRAINT PK_alts_config PRIMARY KEY,
    visible_to_members BIT NOT NULL
                       CONSTRAINT DF_alts_config_visible DEFAULT 0,
    updated_by         NVARCHAR(100) NULL,
    updated_at         DATETIMEOFFSET NOT NULL
                       CONSTRAINT DF_alts_config_updated_at DEFAULT SYSUTCDATETIME()
  );
END
GO

-- ---------------------------------------------------------------------------
-- 7) Estatuto
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.guild_statute', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.guild_statute (
    id         BIGINT IDENTITY(1,1) NOT NULL
               CONSTRAINT PK_guild_statute PRIMARY KEY,
    content    NVARCHAR(MAX) NOT NULL,
    updated_by NVARCHAR(100) NULL,
    updated_at DATETIMEOFFSET NOT NULL
               CONSTRAINT DF_guild_statute_updated_at DEFAULT SYSUTCDATETIME()
  );
END
GO

-- ---------------------------------------------------------------------------
-- 8) Invasões
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.invasion_history', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.invasion_history (
    id            BIGINT IDENTITY(1,1) NOT NULL
                  CONSTRAINT PK_invasion_history PRIMARY KEY,
    invasion_type NVARCHAR(100) NOT NULL,
    started_at    DATETIMEOFFSET NOT NULL,
    ended_at      DATETIMEOFFSET NULL,
    result        NVARCHAR(200) NULL,
    notes         NVARCHAR(MAX) NULL,
    registered_by NVARCHAR(100) NULL,
    created_at    DATETIMEOFFSET NOT NULL
                  CONSTRAINT DF_invasion_history_created_at DEFAULT SYSUTCDATETIME()
  );
END
GO

-- ---------------------------------------------------------------------------
-- 9) PROCEDURE fazer_checkin (equivalente à RPC Postgres)
--    Retorna JSON: {"ok":true|false,"message":"..."}
--    Ex.: EXEC dbo.fazer_checkin @p_player=N'Nick', @p_canal=N'bc1', @p_evento=SYSUTCDATETIME();
-- ---------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.fazer_checkin
  @p_player NVARCHAR(100),
  @p_canal  NVARCHAR(50),
  @p_evento DATETIMEOFFSET
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @v_player NVARCHAR(100) = LTRIM(RTRIM(@p_player));
  DECLARE @v_count INT;
  DECLARE @result NVARCHAR(MAX);

  IF @v_player IS NULL OR @v_player = N''
  BEGIN
    SELECT N'{"ok":false,"message":"Nome do personagem inválido."}' AS result;
    RETURN;
  END

  IF @p_canal IS NULL OR @p_canal NOT IN (
    N'bc1', N'bc2', N'bc3', N'bc4', N'bc5', N'bc6', N'bc7', N'ilusion'
  )
  BEGIN
    SELECT N'{"ok":false,"message":"Canal inválido."}' AS result;
    RETURN;
  END

  IF @p_evento IS NULL
  BEGIN
    SELECT N'{"ok":false,"message":"Evento inválido."}' AS result;
    RETURN;
  END

  IF EXISTS (
    SELECT 1 FROM dbo.checkins
    WHERE player = @v_player AND canal = @p_canal AND evento = @p_evento
  )
  BEGIN
    SELECT N'{"ok":false,"message":"Você já está inscrito neste canal para este evento."}' AS result;
    RETURN;
  END

  SELECT @v_count = COUNT(*)
  FROM dbo.checkins
  WHERE canal = @p_canal AND evento = @p_evento;

  IF @v_count >= 10
  BEGIN
    SELECT N'{"ok":false,"message":"Sala cheia (limite de 10 jogadores)."}' AS result;
    RETURN;
  END

  BEGIN TRY
    INSERT INTO dbo.checkins (player, canal, evento)
    VALUES (@v_player, @p_canal, @p_evento);

    SELECT N'{"ok":true,"message":"Check-in realizado!"}' AS result;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2627, 2601)  -- unique violation
      SELECT N'{"ok":false,"message":"Você já está inscrito neste canal para este evento."}' AS result;
    ELSE
      THROW;
  END CATCH
END
GO

-- ---------------------------------------------------------------------------
-- 10) Seeds
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.donation_config)
  INSERT INTO dbo.donation_config (weekly_amount) VALUES (N'100kk');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.alts_config)
  INSERT INTO dbo.alts_config (visible_to_members) VALUES (0);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.guild_statute)
BEGIN
  INSERT INTO dbo.guild_statute (content, updated_by)
  VALUES (
N'================== ESTATUTO INTERNO - GUILD EUPHORIA ==================

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
  §3º – Após o cumprimento do prazo de 45 dias de permanência e atividade, a propriedade do item é transferida definitivamente ao player.',
  N'sistema'
  );
END
GO

PRINT N'schema_v2.sqlserver.sql aplicado com sucesso.';
GO
