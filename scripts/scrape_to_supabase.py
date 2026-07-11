"""
Scraper para GitHub Actions — executa a cada 30min e armazena dados no Supabase.
O backend lê diretamente do Supabase em vez de fazer scraping direto.
"""

import asyncio
import httpx
from bs4 import BeautifulSoup
import json
import os
import re
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BASE_URL = "https://mudomix.com"
ALLIANCE_GUILDS = ["Euphoria", "Euphor1a", "Jackson5", "HellBoyz"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}


async def fetch(url: str) -> BeautifulSoup | None:
    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=20, follow_redirects=True) as client:
            r = await client.get(url)
            if r.status_code == 200:
                return BeautifulSoup(r.text, "lxml")
            logger.warning(f"HTTP {r.status_code}: {url}")
    except Exception as e:
        logger.warning(f"Erro ao buscar {url}: {e}")
    return None


async def scrape_rankings() -> list:
    soup = await fetch(f"{BASE_URL}/rankings/resets")
    if not soup:
        return []
    rows = soup.select("table tbody tr")
    results = []
    for row in rows:
        cells = row.find_all("td")
        if len(cells) >= 4:
            results.append({
                "name": cells[1].get_text(strip=True) if len(cells) > 1 else "",
                "char_class": cells[2].get_text(strip=True) if len(cells) > 2 else "",
                "resets": int(cells[3].get_text(strip=True)) if len(cells) > 3 and cells[3].get_text(strip=True).isdigit() else 0,
                "guild": cells[4].get_text(strip=True) if len(cells) > 4 else "",
                "level": int(cells[5].get_text(strip=True)) if len(cells) > 5 and cells[5].get_text(strip=True).isdigit() else 0,
            })
    return results


async def scrape_guild(name: str) -> dict | None:
    soup = await fetch(f"{BASE_URL}/profile/guild/{name}")
    if not soup:
        return None
    try:
        guild_info: dict = {"name": name, "master": "", "points": 0, "members": []}
        for row in soup.select("table tr"):
            cells = row.find_all("td")
            if len(cells) == 2:
                k = cells[0].get_text(strip=True).lower()
                v = cells[1].get_text(strip=True)
                if "mestre" in k:
                    guild_info["master"] = v
                elif "pontuação" in k or "pontuacao" in k:
                    guild_info["points"] = int(v) if v.isdigit() else 0

        for row in soup.select("table tbody tr"):
            cells = row.find_all("td")
            if len(cells) >= 2:
                guild_info["members"].append({
                    "name": cells[0].get_text(strip=True),
                    "char_class": cells[1].get_text(strip=True) if len(cells) > 1 else "",
                    "resets": int(cells[2].get_text(strip=True)) if len(cells) > 2 and cells[2].get_text(strip=True).isdigit() else 0,
                    "level": int(cells[3].get_text(strip=True)) if len(cells) > 3 and cells[3].get_text(strip=True).isdigit() else 0,
                    "member_level": cells[4].get_text(strip=True) if len(cells) > 4 else "Member",
                    "guild": name,
                })
        guild_info["member_count"] = len(guild_info["members"])
        return guild_info
    except Exception as e:
        logger.warning(f"Erro ao parsear guilda {name}: {e}")
        return None


async def save_to_supabase(key: str, data: object):
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/data_cache",
            headers=SUPABASE_HEADERS,
            json={"key": key, "data": data, "updated_at": datetime.now(timezone.utc).isoformat()},
        )
        if r.status_code < 300:
            logger.info(f"Salvo: {key}")
        else:
            logger.error(f"Erro ao salvar {key}: {r.status_code} {r.text[:200]}")


async def main():
    logger.info("=== Iniciando scraping ===")

    rankings = await scrape_rankings()
    logger.info(f"Rankings: {len(rankings)} jogadores")
    await save_to_supabase("rankings", rankings)

    for guild_name in ALLIANCE_GUILDS:
        guild = await scrape_guild(guild_name)
        if guild:
            logger.info(f"Guilda {guild_name}: {len(guild['members'])} membros")
            await save_to_supabase(f"guild_{guild_name}", guild)
        else:
            logger.warning(f"Guilda {guild_name}: falhou")

    logger.info("=== Scraping concluído ===")


if __name__ == "__main__":
    asyncio.run(main())
