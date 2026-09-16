-- Euphoria — Auth própria (Fase A1)
-- Sessões / refresh tokens. Aplicar no database euphoria (SQL Server).
-- Desenho: docs/FASE_A0_AUTH_VPS.md

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'dbo.auth_sessions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.auth_sessions (
    id             UNIQUEIDENTIFIER NOT NULL
                   CONSTRAINT PK_auth_sessions PRIMARY KEY
                   CONSTRAINT DF_auth_sessions_id DEFAULT NEWSEQUENTIALID(),
    user_id        UNIQUEIDENTIFIER NOT NULL
                   CONSTRAINT FK_auth_sessions_app_users
                     REFERENCES dbo.app_users(id) ON DELETE CASCADE,
    refresh_hash   CHAR(64) NOT NULL,
    user_agent     NVARCHAR(512) NULL,
    ip_address     NVARCHAR(64) NULL,
    expires_at     DATETIMEOFFSET NOT NULL,
    created_at     DATETIMEOFFSET NOT NULL
                   CONSTRAINT DF_auth_sessions_created_at DEFAULT SYSUTCDATETIME(),
    last_used_at   DATETIMEOFFSET NULL,
    revoked_at     DATETIMEOFFSET NULL
  );

  CREATE INDEX IX_auth_sessions_user
    ON dbo.auth_sessions (user_id)
    WHERE revoked_at IS NULL;

  CREATE UNIQUE INDEX UX_auth_sessions_refresh_hash
    ON dbo.auth_sessions (refresh_hash)
    WHERE revoked_at IS NULL;
END
GO

-- Garante no máximo um profile por discord_id (login estável)
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UX_profiles_discord_id' AND object_id = OBJECT_ID(N'dbo.profiles')
)
BEGIN
  -- Remove índice non-unique antigo se existir
  IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'idx_profiles_discord_id' AND object_id = OBJECT_ID(N'dbo.profiles')
  )
    DROP INDEX idx_profiles_discord_id ON dbo.profiles;

  CREATE UNIQUE INDEX UX_profiles_discord_id
    ON dbo.profiles (discord_id)
    WHERE discord_id IS NOT NULL;
END
GO
