-- Onboarding pós-aprovação: flag em dbo.profiles
-- Idempotente.

IF COL_LENGTH(N'dbo.profiles', N'onboarding_completed_at') IS NULL
BEGIN
  ALTER TABLE dbo.profiles
    ADD onboarding_completed_at DATETIMEOFFSET NULL;
END
GO

-- Membros já aprovados não devem cair no onboarding
UPDATE dbo.profiles
SET onboarding_completed_at = COALESCE(approved_at, SYSUTCDATETIME())
WHERE approved_at IS NOT NULL
  AND onboarding_completed_at IS NULL;
GO
