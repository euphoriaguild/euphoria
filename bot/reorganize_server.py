"""
Script de reorganização completa do servidor Euphoria MU Online.

Estrutura final:
  📋 INFORMAÇÕES  → informações, regras-bc, estatuto-interno
  👋 ENTRADA      → recepção, verificação, 🔊 Visitantes
  💬 GERAL        → geral, tft2k-alt, 🔊 Lobby, Sala do lazer, Sala da Paz, AFK
  ⚔️ GUILD        → pt-boss, box-4-itens, checklist, 🔊 Reunião, Sala de UP, Negócios,
                    Spartans, 7PKADOS, HellBoyz, GGup
  🏆 EVENTOS      → 🔊 WBOSS, PT - Illusion Temple
  📺 LIVES        → 🔊 canais de live stream
  🔒 STAFF        → 🔊 Reunião Staff  (privado - só Moderador)
  🔐 CLOSED BETA  → 🔊 closed-beta   (privado - só Closed Beta)
"""

import os
import time
import httpx
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
GUILD = "1492925235769508021"
BASE  = "https://discord.com/api/v10"
H     = {"Authorization": f"Bot {TOKEN}", "Content-Type": "application/json"}

# IDs conhecidos
ROLE_EVERYONE    = "1492925235769508021"
ROLE_MODERADOR   = "1492936025637523536"
ROLE_CLOSED_BETA = "1535019295006785546"

VIEW_CHANNEL = 1024       # 1 << 10
CONNECT      = 1048576    # 1 << 20

# Canais existentes (por ID)
CANAL = {
    "geral":              "1492925236981530626",
    "Visitantes":         "1492933228036620440",
    "recepção":           "1492933142196256859",
    "WBOSS":              "1493333518284095680",
    "Reunião Staff":      "1492925679866478702",
    "estatuto-interno":   "1500853754487111811",
    "regras-bc":          "1492925452157718701",
    "Reunião":            "1492933896831242431",
    "Sala do lazer":      "1492925236981530627",
    "pt-boss":            "1492940615715917925",
    "box-4-itens-interesse": "1493997972650856578",
    "Sala da Paz":        "1521544147218071602",
    "informações":        "1492951939183415549",
    "Lobby":              "1521334848357138432",
    "tft2k-alt":          "1501765668624928930",
    "Sala de UP #1":      "1523489725040689172",
    "Spartans":           "1513693004928385024",
    "checklist-participacao": "1504877143987851375",
    "7PKADOS":            "1527080973668323338",
    "HellBoyz":           "1520960479130943638",
    "verificação":        "1524849491554074854",
    "GGup - INICIANTES":  "1511047225638256781",
    "Negócios":           "1513033639208816700",
    "PT - Illusion Temple (VIP)": "1496219575300395008",
    "live-arcaaah":       "1505945746720034928",
    "live-weedyrp":       "1527311320590975148",
    "live-v77rj":         "1527311777568653312",
    "live-tchominhas":    "1528168691815022644",
    "AFK":                "1492934171868532988",
    "closed-beta":        "1535023442678775868",
    # categorias antigas
    "cat-texto":          "1492925236981530624",
    "cat-voz":            "1492925236981530625",
}

# Permissões privadas (bloqueia everyone, libera cargo específico)
def perms_privado(role_id: str):
    return [
        {"id": ROLE_EVERYONE, "type": 0, "deny": str(VIEW_CHANNEL | CONNECT), "allow": "0"},
        {"id": role_id,       "type": 0, "allow": str(VIEW_CHANNEL | CONNECT), "deny": "0"},
    ]


def move_channel(client: httpx.Client, channel_id: str, parent_id: str, position: int):
    r = client.patch(
        f"{BASE}/channels/{channel_id}",
        headers=H,
        json={"parent_id": parent_id, "position": position},
    )
    if r.status_code not in (200, 204):
        print(f"  AVISO ao mover {channel_id}: {r.status_code} {r.text[:120]}")
    time.sleep(0.4)  # evitar rate limit


def create_category(client: httpx.Client, name: str, position: int, overwrites=None) -> str:
    payload = {"name": name, "type": 4, "position": position}
    if overwrites:
        payload["permission_overwrites"] = overwrites
    r = client.post(f"{BASE}/guilds/{GUILD}/channels", headers=H, json=payload)
    r.raise_for_status()
    cat_id = r.json()["id"]
    print(f"  Categoria criada: {name} (ID {cat_id})")
    time.sleep(0.4)
    return cat_id


def delete_channel(client: httpx.Client, channel_id: str, name: str):
    r = client.delete(f"{BASE}/channels/{channel_id}", headers=H)
    if r.status_code in (200, 204):
        print(f"  Removida categoria antiga: {name}")
    else:
        print(f"  AVISO ao deletar {name}: {r.status_code}")
    time.sleep(0.4)


def main():
    if not TOKEN:
        print("ERRO: DISCORD_BOT_TOKEN não encontrado no .env")
        return

    print("=== REORGANIZAÇÃO DO SERVIDOR EUPHORIA MU ONLINE ===\n")

    with httpx.Client(timeout=20) as c:

        # ── 1. Criar categorias novas ──────────────────────────────────
        print("[ 1/3 ] Criando categorias...")

        cat_info    = create_category(c, "📋 INFORMAÇÕES",  0)
        cat_entrada = create_category(c, "👋 ENTRADA",       1)
        cat_geral   = create_category(c, "💬 GERAL",         2)
        cat_guild   = create_category(c, "⚔️  GUILD",        3)
        cat_eventos = create_category(c, "🏆 EVENTOS",       4)
        cat_lives   = create_category(c, "📺 LIVES",         5)
        cat_staff   = create_category(c, "🔒 STAFF",         6, overwrites=perms_privado(ROLE_MODERADOR))
        cat_beta    = create_category(c, "🔐 CLOSED BETA",   7, overwrites=perms_privado(ROLE_CLOSED_BETA))

        # ── 2. Mover canais para as categorias corretas ────────────────
        print("\n[ 2/3 ] Movendo canais...")

        moves = [
            # (canal_key, categoria_id, posicao)
            ("informações",               cat_info,    0),
            ("regras-bc",                 cat_info,    1),
            ("estatuto-interno",          cat_info,    2),

            ("recepção",                  cat_entrada, 0),
            ("verificação",               cat_entrada, 1),
            ("Visitantes",                cat_entrada, 2),

            ("geral",                     cat_geral,   0),
            ("tft2k-alt",                 cat_geral,   1),
            ("Lobby",                     cat_geral,   2),
            ("Sala do lazer",             cat_geral,   3),
            ("Sala da Paz",               cat_geral,   4),
            ("AFK",                       cat_geral,   5),

            ("pt-boss",                   cat_guild,   0),
            ("box-4-itens-interesse",     cat_guild,   1),
            ("checklist-participacao",    cat_guild,   2),
            ("Reunião",                   cat_guild,   3),
            ("Sala de UP #1",             cat_guild,   4),
            ("Negócios",                  cat_guild,   5),
            ("Spartans",                  cat_guild,   6),
            ("7PKADOS",                   cat_guild,   7),
            ("HellBoyz",                  cat_guild,   8),
            ("GGup - INICIANTES",         cat_guild,   9),

            ("WBOSS",                     cat_eventos, 0),
            ("PT - Illusion Temple (VIP)", cat_eventos, 1),

            ("live-arcaaah",              cat_lives,   0),
            ("live-weedyrp",              cat_lives,   1),
            ("live-v77rj",                cat_lives,   2),
            ("live-tchominhas",           cat_lives,   3),

            ("Reunião Staff",             cat_staff,   0),
            ("closed-beta",               cat_beta,    0),
        ]

        for key, cat_id, pos in moves:
            ch_id = CANAL.get(key)
            if not ch_id:
                print(f"  AVISO: canal '{key}' não encontrado, pulando")
                continue
            move_channel(c, ch_id, cat_id, pos)
            print(f"  ✓ #{key} → categoria")

        # ── 3. Deletar categorias antigas (agora vazias) ───────────────
        print("\n[ 3/3 ] Removendo categorias antigas...")
        delete_channel(c, CANAL["cat-texto"], "Canais de Texto")
        delete_channel(c, CANAL["cat-voz"],   "Canais de Voz")

        print("\n✅ Reorganização concluída!")
        print("   Arraste as categorias no Discord para ajustar a ordem se necessário.")


if __name__ == "__main__":
    main()
