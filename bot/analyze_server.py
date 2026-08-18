import os
import httpx
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv()

TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
GUILD = "1492925235769508021"
BASE  = "https://discord.com/api/v10"
H     = {"Authorization": f"Bot {TOKEN}"}

with httpx.Client(timeout=15) as c:
    channels = c.get(f"{BASE}/guilds/{GUILD}/channels", headers=H).json()
    roles    = c.get(f"{BASE}/guilds/{GUILD}/roles",    headers=H).json()
    guild    = c.get(f"{BASE}/guilds/{GUILD}?with_counts=true", headers=H).json()

TIPO = {0: "texto", 2: "voz", 5: "anuncio", 13: "stage", 15: "forum"}

cats = {ch["id"]: ch["name"] for ch in channels if ch["type"] == 4}

by_cat = defaultdict(list)
for ch in sorted(channels, key=lambda x: (x.get("parent_id") or "", x.get("position", 0))):
    if ch["type"] == 4:
        continue
    tipo = TIPO.get(ch["type"], str(ch["type"]))
    cat  = cats.get(ch.get("parent_id", ""), "(sem categoria)")
    by_cat[cat].append(f"  [{tipo}] #{ch['name']}")

print(f"=== SERVIDOR: {guild['name']} ===")
print(f"Membros: {guild.get('approximate_member_count', '?')} | Online: {guild.get('approximate_presence_count', '?')}")
print()

print("=== CANAIS ===")
for cat, chs in by_cat.items():
    print(f"[{cat}]")
    for ch in chs:
        print(ch)
    print()

print("=== CARGOS (do maior para menor) ===")
for r in sorted(roles, key=lambda x: -x["position"]):
    print(f"  {r['name']} (posicao {r['position']})")
