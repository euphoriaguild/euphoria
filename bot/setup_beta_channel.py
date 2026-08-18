"""
Script para configurar o canal de voz 'Closed Beta' no Discord.
Lê o token do bot do arquivo .env e usa a API do Discord diretamente.

Como usar:
  cd bot
  python setup_beta_channel.py
"""

import os
import httpx
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN    = os.getenv("DISCORD_BOT_TOKEN", "")
GUILD_ID     = "1492925235769508021"
CHANNEL_NAME = "closed-beta"

BASE = "https://discord.com/api/v10"
HEADERS = {
    "Authorization": f"Bot {BOT_TOKEN}",
    "Content-Type": "application/json",
}

VIEW_CHANNEL = 1 << 10
CONNECT      = 1 << 20


def main():
    if not BOT_TOKEN:
        print("ERRO: DISCORD_BOT_TOKEN não encontrado no .env")
        return

    with httpx.Client(timeout=15) as client:

        # 1. Buscar cargos do servidor para achar o ID do "Closed Beta"
        print("Buscando cargos do servidor...")
        r = client.get(f"{BASE}/guilds/{GUILD_ID}/roles", headers=HEADERS)
        r.raise_for_status()
        roles = r.json()

        closed_beta_role = next((role for role in roles if role["name"] == "Closed Beta"), None)
        everyone_role    = next((role for role in roles if role["name"] == "@everyone"), None)

        if not closed_beta_role:
            print("ERRO: Cargo 'Closed Beta' não encontrado. Crie o cargo antes de rodar este script.")
            return

        closed_beta_id = closed_beta_role["id"]
        everyone_id    = everyone_role["id"]
        print(f"  Cargo 'Closed Beta' encontrado: ID {closed_beta_id}")

        # 2. Verificar se o canal já existe
        print("Verificando canais existentes...")
        r = client.get(f"{BASE}/guilds/{GUILD_ID}/channels", headers=HEADERS)
        r.raise_for_status()
        channels = r.json()

        existing = next((c for c in channels if c["name"] == CHANNEL_NAME and c["type"] == 2), None)

        if existing:
            print(f"  Canal '{CHANNEL_NAME}' já existe (ID: {existing['id']}). Atualizando permissões...")
            channel_id = existing["id"]

            # Bloqueia @everyone
            r = client.put(
                f"{BASE}/channels/{channel_id}/permissions/{everyone_id}",
                headers=HEADERS,
                json={"type": 0, "deny": str(VIEW_CHANNEL | CONNECT), "allow": "0"},
            )
            r.raise_for_status()

            # Libera Closed Beta
            r = client.put(
                f"{BASE}/channels/{channel_id}/permissions/{closed_beta_id}",
                headers=HEADERS,
                json={"type": 0, "allow": str(VIEW_CHANNEL | CONNECT), "deny": "0"},
            )
            r.raise_for_status()
            print("  Permissões atualizadas!")

        else:
            # 3. Criar o canal de voz privado com permissões já definidas
            print(f"  Criando canal de voz '{CHANNEL_NAME}'...")
            payload = {
                "name": CHANNEL_NAME,
                "type": 2,  # 2 = canal de voz
                "user_limit": 20,
                "permission_overwrites": [
                    {
                        "id": everyone_id,
                        "type": 0,
                        "deny": str(VIEW_CHANNEL | CONNECT),
                        "allow": "0",
                    },
                    {
                        "id": closed_beta_id,
                        "type": 0,
                        "allow": str(VIEW_CHANNEL | CONNECT),
                        "deny": "0",
                    },
                ],
            }
            r = client.post(f"{BASE}/guilds/{GUILD_ID}/channels", headers=HEADERS, json=payload)
            if r.status_code == 403:
                print(f"\nERRO 403: O bot não tem permissão de 'Gerenciar Canais' no servidor.")
                print("  Solução: Vá em Configurações do Servidor → Integrações → clique no bot")
                print("           e ative a permissão 'Gerenciar Canais'.")
                return
            r.raise_for_status()
            channel_id = r.json()["id"]
            print(f"  Canal criado com sucesso! ID: {channel_id}")

        print("\nPronto!")
        print(f"  Canal de voz '{CHANNEL_NAME}' configurado.")
        print(f"  Apenas membros com o cargo 'Closed Beta' podem ver e entrar.")
        print(f"  Limite de usuários: 20")
        print(f"\n  No Discord, arraste o canal para a categoria desejada.")


if __name__ == "__main__":
    main()
