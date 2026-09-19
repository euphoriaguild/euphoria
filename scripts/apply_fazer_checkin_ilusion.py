"""Aplica CREATE OR ALTER dbo.fazer_checkin (VIP/GERAL + limites)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import pyodbc

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")

SQL = r"""
CREATE OR ALTER PROCEDURE dbo.fazer_checkin
  @p_player NVARCHAR(100),
  @p_canal  NVARCHAR(50),
  @p_evento DATETIMEOFFSET
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @v_player NVARCHAR(100) = LTRIM(RTRIM(@p_player));
  DECLARE @v_count INT;
  DECLARE @v_limite INT;

  IF @v_player IS NULL OR @v_player = N''
  BEGIN
    SELECT N'{"ok":false,"message":"Nome do personagem inválido."}' AS result;
    RETURN;
  END

  IF @p_canal IS NULL OR @p_canal NOT IN (
    N'bc1', N'bc2', N'bc3', N'bc4', N'bc5', N'bc6', N'bc7',
    N'ilusion_vip', N'ilusion_geral'
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

  SET @v_limite = CASE
    WHEN @p_canal IN (N'ilusion_vip', N'ilusion_geral') THEN 5
    ELSE 10
  END;

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

  IF @v_count >= @v_limite
  BEGIN
    SELECT N'{"ok":false,"message":"Sala cheia (limite de jogadores)."}' AS result;
    RETURN;
  END

  BEGIN TRY
    INSERT INTO dbo.checkins (player, canal, evento)
    VALUES (@v_player, @p_canal, @p_evento);

    SELECT N'{"ok":true,"message":"Check-in realizado!"}' AS result;
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() IN (2627, 2601)
      SELECT N'{"ok":false,"message":"Você já está inscrito neste canal para este evento."}' AS result;
    ELSE
      THROW;
  END CATCH
END
"""


def connect() -> pyodbc.Connection:
    host = os.getenv("SQLSERVER_HOST")
    port = os.getenv("SQLSERVER_PORT", "1433")
    database = os.getenv("SQLSERVER_DATABASE")
    user = os.getenv("SQLSERVER_USER")
    password = os.getenv("SQLSERVER_PASSWORD")
    drivers = set(pyodbc.drivers())
    driver = next(
        (
            d
            for d in (
                "ODBC Driver 18 for SQL Server",
                "ODBC Driver 17 for SQL Server",
                "SQL Server",
            )
            if d in drivers
        ),
        None,
    )
    if not driver:
        raise RuntimeError(f"Sem ODBC Driver: {sorted(drivers)}")
    if driver == "SQL Server":
        cs = (
            f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={database};"
            f"UID={user};PWD={password};Connection Timeout=15;"
        )
    else:
        cs = (
            f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={database};"
            f"UID={user};PWD={password};Encrypt=yes;TrustServerCertificate=yes;"
            f"Connection Timeout=15;"
        )
    return pyodbc.connect(cs, autocommit=True)


def main() -> int:
    cn = connect()
    cur = cn.cursor()
    cur.execute(SQL)
    print("OK: dbo.fazer_checkin atualizada (ilusion_vip/geral, limites 5/10)")
    cn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
