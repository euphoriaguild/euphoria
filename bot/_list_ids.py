import os
import httpx
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
GUILD = "1492925235769508021"
BASE  = "https://discord.com/api/v10"
H     = {"Authorization": f"Bot {TOKEN}"}

with httpx.Client(timeout=15) as c:
    chs   = c.get(f"{BASE}/guilds/{GUILD}/channels", headers=H).json()
    roles = c.get(f"{BASE}/guilds/{GUILD}/roles",    headers=H).json()

for ch in sorted(chs, key=lambda x: x.get("position", 0)):
    print(f'{ch["id"]} | tipo={ch["type"]} | parent={ch.get("parent_id","-")} | {ch["name"]}')

print()
for r in roles:
    print(f'ROLE {r["id"]} | {r["name"]}')
