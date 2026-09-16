"""
Testa conexão TCP + login no SQL Server da VPS.
Uso (na pasta backend, com .env preenchido):

  pip install pyodbc python-dotenv
  python ../scripts/test_sqlserver_connection.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    print("Instale: pip install python-dotenv")
    sys.exit(1)

try:
    import pyodbc
except ImportError:
    print("Instale: pip install pyodbc")
    print("Também é necessário o ODBC Driver 17 ou 18 for SQL Server no Windows.")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")


def pick_driver() -> str:
    preferred = [
        "ODBC Driver 18 for SQL Server",
        "ODBC Driver 17 for SQL Server",
        "SQL Server",
    ]
    installed = set(pyodbc.drivers())
    for name in preferred:
        if name in installed:
            return name
    raise RuntimeError(
        "Nenhum ODBC Driver SQL Server encontrado. Instalados: "
        + (", ".join(sorted(installed)) or "(nenhum)")
    )


def build_conn_str(driver: str) -> str:
    host = os.getenv("SQLSERVER_HOST", "YOUR_SQLSERVER_HOST")
    port = os.getenv("SQLSERVER_PORT", "1433")
    database = os.getenv("SQLSERVER_DATABASE", "euphoria")
    user = os.getenv("SQLSERVER_USER", "")
    password = os.getenv("SQLSERVER_PASSWORD", "")
    encrypt = os.getenv("SQLSERVER_ENCRYPT", "yes")
    trust = os.getenv("SQLSERVER_TRUST_SERVER_CERTIFICATE", "yes")

    # Driver legado "SQL Server" não usa Encrypt= da mesma forma
    if driver == "SQL Server":
        return (
            f"DRIVER={{{driver}}};"
            f"SERVER={host},{port};"
            f"DATABASE={database};"
            f"UID={user};"
            f"PWD={password};"
            f"Connection Timeout=15;"
        )

    return (
        f"DRIVER={{{driver}}};"
        f"SERVER={host},{port};"
        f"DATABASE={database};"
        f"UID={user};"
        f"PWD={password};"
        f"Encrypt={encrypt};"
        f"TrustServerCertificate={trust};"
        f"Connection Timeout=15;"
    )


def main() -> int:
    host = os.getenv("SQLSERVER_HOST", "YOUR_SQLSERVER_HOST")
    port = os.getenv("SQLSERVER_PORT", "1433")
    database = os.getenv("SQLSERVER_DATABASE", "euphoria")
    user = os.getenv("SQLSERVER_USER", "")
    password = os.getenv("SQLSERVER_PASSWORD", "")

    if not user or not password:
        print("ERRO: SQLSERVER_USER / SQLSERVER_PASSWORD ausentes no backend/.env")
        return 1

    driver = pick_driver()
    conn_str = build_conn_str(driver)

    print(f"Driver : {driver}")
    print(f"Server : {host},{port}")
    print(f"Database: {database}")
    print(f"User   : {user}")
    print("Conectando...")

    try:
        conn = pyodbc.connect(conn_str)
    except pyodbc.Error as exc:
        print("FALHA na conexão:")
        print(exc)
        print(
            "\nChecklist: firewall VPS (TCP 1433), SQL remoto habilitado, "
            "usuário/senha, database correto."
        )
        return 2

    try:
        cur = conn.cursor()
        cur.execute("SELECT @@SERVERNAME, @@VERSION, DB_NAME(), SUSER_SNAME()")
        server_name, version, db_name, login_name = cur.fetchone()
        print("OK — conexão estabelecida")
        print(f"  @@SERVERNAME : {server_name}")
        print(f"  DB_NAME()    : {db_name}")
        print(f"  SUSER_SNAME(): {login_name}")
        print(f"  @@VERSION    : {str(version).splitlines()[0]}")

        print("\nDatabases visíveis:")
        cur.execute(
            "SELECT name FROM sys.databases WHERE name NOT IN ('tempdb') ORDER BY name"
        )
        for (name,) in cur.fetchall():
            print(f"  - {name}")

        print("\nTabelas em dbo (database atual):")
        cur.execute(
            """
            SELECT TOP 30 TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = 'dbo'
            ORDER BY TABLE_NAME
            """
        )
        tables = [r[0] for r in cur.fetchall()]
        if not tables:
            print("  (nenhuma tabela dbo — talvez o Initial Catalog esteja errado)")
        else:
            for t in tables:
                print(f"  - {t}")
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
