"""
Usa Playwright para:
1. Carregar páginas do mudomix.com como um browser real (burla Cloudflare)
2. Interceptar todas as chamadas de rede para descobrir se há API interna
3. Extrair dados de personagem e guilda do HTML renderizado
"""

from playwright.sync_api import sync_playwright
import json

TARGET_CHAR  = "Morpheus"
TARGET_GUILD = "Euphoria"

api_calls = []


def on_request(request):
    url = request.url
    if "mudomix" in url and url != request.frame.url:
        api_calls.append({"type": "request", "method": request.method, "url": url})


def on_response(response):
    url = response.url
    ct  = response.headers.get("content-type", "")
    if "mudomix" in url and "json" in ct:
        try:
            body = response.json()
            api_calls.append({"type": "json_response", "url": url, "body": body})
        except Exception:
            pass


def fetch_character(page, nick: str) -> dict:
    url = f"https://mudomix.com/profile/character/{nick}"
    print(f"\n[Personagem] Acessando {url}")
    page.goto(url, wait_until="networkidle", timeout=30000)

    data = {}
    rows = page.query_selector_all("table tr")
    for row in rows:
        cells = row.query_selector_all("td")
        if len(cells) == 2:
            k = cells[0].inner_text().strip().lower()
            v = cells[1].inner_text().strip()
            if "personagem" in k: data["name"]       = v
            elif "classe"    in k: data["char_class"] = v
            elif "resets"    in k: data["resets"]     = int(v) if v.isdigit() else 0
            elif "level"     in k: data["level"]      = int(v) if v.isdigit() else 0
            elif "guild"     in k or "guilda" in k: data["guild"] = v

    print(f"  Dados extraídos: {data}")
    return data


def fetch_guild(page, guild_name: str) -> dict:
    url = f"https://mudomix.com/profile/guild/{guild_name}"
    print(f"\n[Guilda] Acessando {url}")
    page.goto(url, wait_until="networkidle", timeout=30000)

    members = []
    tables = page.query_selector_all("table")
    for table in tables:
        headers = [th.inner_text().strip().lower() for th in table.query_selector_all("th")]
        if "personagem" in headers or "classe" in headers:
            rows = table.query_selector_all("tr")
            for row in rows[1:]:
                cells = row.query_selector_all("td")
                if len(cells) >= 4:
                    name   = cells[0].inner_text().strip()
                    classe = cells[1].inner_text().strip()
                    resets = cells[2].inner_text().strip()
                    level  = cells[3].inner_text().strip()
                    if name:
                        members.append({
                            "name":       name,
                            "char_class": classe,
                            "resets":     int(resets) if resets.isdigit() else 0,
                            "level":      int(level)  if level.isdigit()  else 0,
                        })
            break

    print(f"  Membros encontrados: {len(members)}")
    if members:
        print(f"  Primeiros 3: {members[:3]}")
    return {"guild": guild_name, "members": members}


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        locale="pt-BR",
    )
    page = context.new_page()

    # Interceptar chamadas de rede
    page.on("request",  on_request)
    page.on("response", on_response)

    # Testar acesso
    char_data  = fetch_character(page, TARGET_CHAR)
    guild_data = fetch_guild(page, TARGET_GUILD)

    browser.close()

print("\n=== CHAMADAS DE REDE DETECTADAS ===")
if api_calls:
    for call in api_calls:
        print(json.dumps(call, ensure_ascii=False, indent=2))
else:
    print("Nenhuma chamada de API interna detectada — dados vêm direto do HTML.")

print("\n=== CONCLUSÃO ===")
if char_data and "char_class" in char_data:
    print("✅ Playwright consegue acessar dados de PERSONAGEM!")
else:
    print("❌ Não conseguiu dados de personagem")

if guild_data.get("members"):
    print("✅ Playwright consegue acessar dados de GUILDA!")
else:
    print("❌ Não conseguiu membros da guilda")
