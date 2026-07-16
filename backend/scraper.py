import httpx
from bs4 import BeautifulSoup
from typing import Optional
import re
import logging

logger = logging.getLogger(__name__)

BASE_URL = "https://mudomix.com"
ALLIANCE_GUILDS = ["Euphoria", "Euphor1a", "Jackson5", "HellBoyz"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9",
}


async def fetch_page(url: str) -> Optional[BeautifulSoup]:
    """Busca uma página individual (ex: perfil de personagem)."""
    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        logger.warning(f"Erro ao buscar {url}: {e}")
        return None


async def scrape_guild(guild_name: str) -> Optional[dict]:
    """Scrapa a página da guilda e retorna dados básicos + lista de membros."""
    url = f"{BASE_URL}/profile/guild/{guild_name}"
    soup = await fetch_page(url)
    if not soup:
        return None

    try:
        # Info básica da guilda
        info_rows = soup.select("table tr")
        guild_info = {}
        for row in info_rows:
            cells = row.find_all("td")
            if len(cells) == 2:
                key = cells[0].get_text(strip=True).lower()
                val = cells[1].get_text(strip=True)
                if "guild" in key:
                    guild_info["name"] = val
                elif "mestre" in key:
                    guild_info["master"] = val
                elif "pontuação" in key or "pontuacao" in key:
                    guild_info["points"] = int(val) if val.isdigit() else 0
                elif "membros" in key:
                    guild_info["member_count"] = int(val) if val.isdigit() else 0

        # Tabela de membros
        members = []
        member_tables = soup.select("table")
        for table in member_tables:
            headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
            if "personagem" in headers or "classe" in headers:
                for row in table.find_all("tr")[1:]:
                    cells = row.find_all("td")
                    if len(cells) >= 4:
                        name = cells[0].get_text(strip=True)
                        char_class = cells[1].get_text(strip=True)
                        resets_txt = cells[2].get_text(strip=True)
                        level_txt = cells[3].get_text(strip=True)
                        member_level = cells[4].get_text(strip=True) if len(cells) > 4 else "Member"
                        if name:
                            members.append({
                                "name": name,
                                "char_class": char_class,
                                "resets": int(resets_txt) if resets_txt.isdigit() else 0,
                                "level": int(level_txt) if level_txt.isdigit() else 0,
                                "member_level": member_level,
                                "guild": guild_name,
                            })
                break  # só a primeira tabela de membros

        return {
            "name": guild_info.get("name", guild_name),
            "master": guild_info.get("master", ""),
            "points": guild_info.get("points", 0),
            "member_count": guild_info.get("member_count", len(members)),
            "members": members,
        }

    except Exception as e:
        logger.error(f"Erro ao parsear guild {guild_name}: {e}")
        return None


async def scrape_character(name: str) -> Optional[dict]:
    """Scrapa o perfil individual de um personagem."""
    url = f"{BASE_URL}/profile/character/{name}"
    soup = await fetch_page(url)
    if not soup:
        return None

    try:
        # Verifica se o perfil está bloqueado
        blocked_text = soup.find(string=re.compile(r"Profile blocked", re.IGNORECASE))
        if not blocked_text:
            blocked_text = soup.find(string=re.compile(r"bloqueado", re.IGNORECASE))

        if blocked_text:
            # Extrai data de desbloqueio se disponível
            blocked_until = None
            date_match = re.search(r"(\d{2}/\d{2}/\d{4})", str(blocked_text))
            if date_match:
                blocked_until = date_match.group(1)
            return {
                "name": name,
                "profile_blocked": True,
                "blocked_until": blocked_until,
                "char_class": "",
                "resets": 0,
                "level": 0,
            }

        # Parse dos dados do perfil
        profile_data = {}
        info_tables = soup.select("table")
        for table in info_tables:
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all("td")
                if len(cells) == 2:
                    key = cells[0].get_text(strip=True).lower()
                    val = cells[1].get_text(strip=True)
                    if "personagem" in key:
                        profile_data["name"] = val
                    elif "classe" in key:
                        profile_data["char_class"] = val
                    elif "resets" in key:
                        profile_data["resets"] = int(val) if val.isdigit() else 0
                    elif "level" in key:
                        profile_data["level"] = int(val) if val.isdigit() else 0
                    elif "mapa" in key:
                        profile_data["map"] = val
                    elif "situação" in key or "situacao" in key or "status" in key:
                        profile_data["status"] = val

        # Equipamentos
        equipment = []
        for img in soup.select(".equipamentos img, [class*='equip'] img"):
            alt = img.get("alt", "")
            if alt and alt not in equipment:
                equipment.append(alt)

        # Avatar
        avatar = None
        avatar_img = soup.select_one("img[src*='avatar']")
        if avatar_img:
            avatar = avatar_img.get("src", "")

        # Guilda
        guild_info = {}
        guild_link = soup.find("a", href=re.compile(r"/profile/guild/"))
        if guild_link:
            guild_info["guild"] = guild_link.get_text(strip=True)

        return {
            "name": profile_data.get("name", name),
            "char_class": profile_data.get("char_class", ""),
            "resets": profile_data.get("resets", 0),
            "level": profile_data.get("level", 0),
            "map": profile_data.get("map"),
            "status": profile_data.get("status"),
            "guild": guild_info.get("guild"),
            "avatar_url": avatar,
            "equipment": equipment,
            "profile_blocked": False,
        }

    except Exception as e:
        logger.error(f"Erro ao parsear personagem {name}: {e}")
        return None


async def scrape_rankings(mode: str = "resets") -> list[dict]:
    """Scrapa o ranking global do servidor."""
    url = f"{BASE_URL}/rankings/{mode}"
    soup = await fetch_page(url)
    if not soup:
        return []

    rankings = []
    try:
        tables = soup.select("table")
        for table in tables:
            rows = table.find_all("tr")[1:]
            for row in rows:
                cells = row.find_all("td")
                if len(cells) >= 4:
                    pos_text = cells[0].get_text(strip=True)
                    # Célula de nome pode conter flags/badges
                    name_cell = cells[1]
                    name = name_cell.find("a")
                    if name:
                        name = name.get_text(strip=True)
                    else:
                        name = name_cell.get_text(strip=True).split()[0]

                    char_class = cells[2].get_text(strip=True)
                    guild_cell = cells[3].get_text(strip=True)
                    score = cells[4].get_text(strip=True) if len(cells) > 4 else "0"

                    # VIP e online da célula de nome
                    name_html = str(name_cell)
                    is_vip = "vip" in name_html.lower()
                    is_online = "ON" in name_html

                    try:
                        pos = int(pos_text)
                    except ValueError:
                        continue

                    rankings.append({
                        "position": pos,
                        "name": name,
                        "char_class": char_class,
                        "guild": guild_cell if guild_cell else None,
                        "resets": int(score) if score.isdigit() else 0,
                        "vip": is_vip,
                        "online": is_online,
                    })
        return rankings
    except Exception as e:
        logger.error(f"Erro ao parsear ranking: {e}")
        return []


async def scrape_all_alliance_guilds() -> list[dict]:
    """Busca dados de todas as guildas da aliança em paralelo."""
    tasks = [scrape_guild(g) for g in ALLIANCE_GUILDS]
    results = await asyncio.gather(*tasks)
    return [r for r in results if r is not None]
