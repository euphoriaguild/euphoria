"""
Lê o cookie cf_clearance do Cloudflare diretamente do Edge instalado
e usa para fazer requests ao mudomix.com via httpx.

Pré-requisito: abrir mudomix.com no Edge pelo menos uma vez
               para o Cloudflare gerar o cookie cf_clearance.
"""

import os
import shutil
import sqlite3
import tempfile
import httpx
from pathlib import Path
from bs4 import BeautifulSoup

EDGE_COOKIES_PATH = Path(os.environ["LOCALAPPDATA"]) / "Microsoft" / "Edge" / "User Data" / "Default" / "Network" / "Cookies"

def get_edge_cookies(domain: str) -> dict:
    """Lê cookies do Edge para um domínio específico (sem descriptografar)."""
    if not EDGE_COOKIES_PATH.exists():
        print(f"Arquivo de cookies do Edge não encontrado: {EDGE_COOKIES_PATH}")
        return {}

    # Copia o arquivo para não travar com o Edge aberto
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = tmp.name
    shutil.copy2(EDGE_COOKIES_PATH, tmp_path)

    cookies = {}
    try:
        conn = sqlite3.connect(tmp_path)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name, value FROM cookies WHERE host_key LIKE ?",
            (f"%{domain}%",)
        )
        for name, value in cursor.fetchall():
            if value:  # só pega valores não criptografados
                cookies[name] = value
        conn.close()
    except Exception as e:
        print(f"Erro ao ler cookies: {e}")
    finally:
        os.unlink(tmp_path)

    return cookies


def scrape_character(nick: str, cookies: dict) -> dict:
    url = f"https://mudomix.com/profile/character/{nick}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
    }
    r = httpx.get(url, headers=headers, cookies=cookies, follow_redirects=True, timeout=15)
    print(f"  Status: {r.status_code}")
    if r.status_code != 200:
        return {}

    soup = BeautifulSoup(r.text, "lxml")
    data = {}
    for row in soup.select("table tr"):
        cells = row.find_all("td")
        if len(cells) == 2:
            k = cells[0].get_text(strip=True).lower()
            v = cells[1].get_text(strip=True)
            if "classe"   in k: data["char_class"] = v
            elif "resets" in k: data["resets"]     = v
            elif "level"  in k: data["level"]      = v
            elif "guild"  in k or "guilda" in k: data["guild"] = v
    return data


# ── Main ──────────────────────────────────────────────────────────────────
print("Lendo cookies do Edge...")
cookies = get_edge_cookies("mudomix.com")
print(f"Cookies encontrados: {list(cookies.keys())}")

if not cookies.get("cf_clearance"):
    print("\n⚠️  Cookie 'cf_clearance' não encontrado.")
    print("   Abra o Edge, acesse https://mudomix.com e espere carregar.")
    print("   Depois rode este script novamente.")
else:
    print(f"\n✅ cf_clearance encontrado! Testando acesso...")
    data = scrape_character("Morpheus", cookies)
    if data:
        print(f"✅ Dados do personagem: {data}")
    else:
        print("❌ Não conseguiu extrair dados mesmo com os cookies")
