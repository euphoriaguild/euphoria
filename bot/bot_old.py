"""
Euphoria Discord Bot — Verificação de novos membros
Fluxo:
  1. Seleciona a guilda (Select Menu)
  2. Bot busca membros da guilda no mudomix.com
  3. Usuário digita parte do nick → bot filtra e mostra Select Menu com sugestões
  4. Confirma o nick → verifica classe/resets no mudomix.com
  5. Pergunta recrutador e se é iniciante
  6. Formata nick: "NickMU - ᴄʟᴀꜱꜱᴇ", atribui cargo Pendente, cria perfil no Supabase
"""

import discord
import discord.ui
import asyncio
import os
import re
import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
BACKEND_URL = os.getenv("BACKEND_URL", "https://euphoria-xd29.onrender.com")

VERIFICATION_CHANNEL_ID = int(os.getenv("VERIFICATION_CHANNEL_ID", "0"))
PENDING_ROLE_ID         = int(os.getenv("PENDING_ROLE_ID", "0"))
ROLE_MEMBRO             = int(os.getenv("ROLE_MEMBRO", "0"))

# Cargos por guilda — mapeamento direto
GUILD_ROLES: dict[str, int] = {
    "Euphoria":  int(os.getenv("ROLE_EUPHORIA", "0")),
    "Euphor1a":  int(os.getenv("ROLE_EUPHORIA", "0")),  # extensão da Euphoria, mesmo cargo
    "HellBoyz":  int(os.getenv("ROLE_HELLBOYZ", "0")),
}
ROLE_LIDER      = int(os.getenv("ROLE_LIDER", "0"))
ALLIANCE_GUILDS = ["Euphoria", "Euphor1a", "HellBoyz"]

CLASS_MAP = {
    "dark lord": "ᴅʟ", "dark lord combination": "ᴅʟ", "lord emperor": "ᴅʟ",
    "blade knight": "ʙᴋ", "blade master": "ʙᴋ",
    "dark wizard": "ᴅᴡ", "soul master": "ᴅᴡ", "grand master": "ᴅᴡ",
    "elf": "ᴇʟꜰ", "dark elf": "ᴇʟꜰ", "high elf": "ᴇʟꜰ", "muse elf": "ᴇʟꜰ",
    "magic gladiator": "ᴍɢ", "duel master": "ᴍɢ",
    "summoner": "ꜱᴍ", "dimension master": "ꜱᴍ",
    "rage fighter": "ʀꜰ", "fist master": "ʀꜰ",
    "gun crusher": "ɢᴄ", "rune wizard": "ʀᴡ",
}

SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

MU_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
}

intents = discord.Intents.default()
intents.members = True
intents.message_content = True
bot = discord.Client(intents=intents)

sessions: dict[int, dict] = {}


# ── Helpers ────────────────────────────────────────────────────────────────

def get_class_abbrev(char_class: str) -> str:
    key = char_class.lower().strip()
    for name, abbrev in CLASS_MAP.items():
        if name in key or key in name:
            return abbrev
    return char_class[:3].upper() if char_class else "?"


async def fetch_guild_members(guild_name: str) -> list[dict]:
    """Busca membros de uma guilda via backend (aproveita o cache existente)."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{BACKEND_URL}/api/guild/{guild_name}")
            if resp.status_code == 200:
                data = resp.json()
                return data.get("members", [])
    except Exception:
        pass
    return []


async def scrape_character(nick: str) -> dict | None:
    """Busca dados do personagem via mudomix.com."""
    url = f"https://mudomix.com/profile/character/{nick}"
    try:
        async with httpx.AsyncClient(headers=MU_HEADERS, timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None
            soup = BeautifulSoup(resp.text, "lxml")
            if soup.find(string=re.compile(r"Profile blocked|bloqueado", re.IGNORECASE)):
                return None
            data: dict = {"name": nick}
            for table in soup.select("table"):
                for row in table.find_all("tr"):
                    cells = row.find_all("td")
                    if len(cells) == 2:
                        k = cells[0].get_text(strip=True).lower()
                        v = cells[1].get_text(strip=True)
                        if "personagem" in k: data["name"] = v
                        elif "classe" in k:   data["char_class"] = v
                        elif "resets" in k:   data["resets"] = int(v) if v.isdigit() else 0
                        elif "level" in k:    data["level"] = int(v) if v.isdigit() else 0
                        elif "guild" in k or "guilda" in k: data["guild"] = v
            return data if "char_class" in data else None
    except Exception:
        return None


async def save_profile(member: discord.Member, session: dict):
    """Cria ou atualiza o perfil no Supabase."""
    discord_id = str(member.id)
    async with httpx.AsyncClient() as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=SUPABASE_HEADERS,
            params={"discord_id": f"eq.{discord_id}", "limit": "1"},
        )
        exists = r.status_code == 200 and len(r.json()) > 0
        if not exists:
            await client.post(
                f"{SUPABASE_URL}/rest/v1/profiles",
                headers=SUPABASE_HEADERS,
                json={
                    "discord_id": discord_id,
                    "discord_username": str(member),
                    "nick_mudomix": session["nick"],
                    "guild": session["guild"],
                    "role": "pending",
                    "recruiter": session.get("recruiter", ""),
                    "is_beginner": session.get("beginner", False),
                },
            )


# ── Views (componentes interativos) ────────────────────────────────────────

class GuildSelectView(discord.ui.View):
    """Select Menu para escolher a guilda da aliança."""
    def __init__(self, member: discord.Member):
        super().__init__(timeout=120)
        self.member = member
        self.chosen: str | None = None

        options = [discord.SelectOption(label=g, value=g) for g in ALLIANCE_GUILDS]
        options.append(discord.SelectOption(label="Nenhuma (não sou da aliança)", value="Nenhuma"))

        select = discord.ui.Select(placeholder="Selecione sua guilda...", options=options)
        select.callback = self._callback
        self.add_item(select)

    async def _callback(self, interaction: discord.Interaction):
        if interaction.user != self.member:
            await interaction.response.send_message("❌ Esse menu não é para você.", ephemeral=True)
            return
        self.chosen = interaction.data["values"][0]
        await interaction.response.defer()
        self.stop()


class NickSelectView(discord.ui.View):
    """Select Menu com sugestões de nick filtradas da guilda."""
    def __init__(self, member: discord.Member, options: list[discord.SelectOption]):
        super().__init__(timeout=120)
        self.member = member
        self.chosen: str | None = None

        select = discord.ui.Select(
            placeholder="Selecione seu personagem...",
            options=options[:25],  # Discord limita a 25 opções
        )
        select.callback = self._callback
        self.add_item(select)

        # Botão para digitar manualmente caso não apareça na lista
        btn = discord.ui.Button(label="Meu nick não está na lista", style=discord.ButtonStyle.secondary)
        btn.callback = self._manual
        self.add_item(btn)

    async def _callback(self, interaction: discord.Interaction):
        if interaction.user != self.member:
            await interaction.response.send_message("❌ Esse menu não é para você.", ephemeral=True)
            return
        self.chosen = interaction.data["values"][0]
        await interaction.response.defer()
        self.stop()

    async def _manual(self, interaction: discord.Interaction):
        if interaction.user != self.member:
            await interaction.response.send_message("❌ Esse menu não é para você.", ephemeral=True)
            return
        self.chosen = "__manual__"
        await interaction.response.defer()
        self.stop()


class ConfirmNickView(discord.ui.View):
    """Botões de confirmação do nick encontrado."""
    def __init__(self, member: discord.Member):
        super().__init__(timeout=120)
        self.member = member
        self.confirmed: bool | None = None

    @discord.ui.button(label="✅ Confirmar", style=discord.ButtonStyle.success)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.member:
            await interaction.response.send_message("❌ Esse botão não é para você.", ephemeral=True)
            return
        self.confirmed = True
        await interaction.response.defer()
        self.stop()

    @discord.ui.button(label="❌ Não sou eu", style=discord.ButtonStyle.danger)
    async def deny(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.member:
            await interaction.response.send_message("❌ Esse botão não é para você.", ephemeral=True)
            return
        self.confirmed = False
        await interaction.response.defer()
        self.stop()


# ── Fluxo principal de verificação ─────────────────────────────────────────

async def ask(channel: discord.TextChannel, user: discord.Member, content: str, timeout: int = 120) -> str | None:
    """Pergunta simples via texto."""
    await channel.send(content)
    def check(m: discord.Message):
        return m.author == user and m.channel == channel
    try:
        msg = await bot.wait_for("message", check=check, timeout=timeout)
        return msg.content.strip()
    except asyncio.TimeoutError:
        await channel.send("⏱️ Tempo esgotado. Digite `!verificar` para recomeçar.")
        return None


async def run_verification(member: discord.Member, channel: discord.TextChannel):
    uid = member.id
    sessions[uid] = {}

    await channel.send(embed=discord.Embed(
        title="👋 Bem-vindo à Euphoria!",
        description=(
            f"Olá, {member.mention}! Vou fazer algumas perguntas rápidas para liberar seu acesso.\n\n"
            "Use os menus abaixo — você tem **2 minutos** para cada etapa."
        ),
        color=0xC9A84C,
    ))
    await asyncio.sleep(1)

    # ── ETAPA 1: Selecionar guilda ──────────────────────────────
    guild_view = GuildSelectView(member)
    await channel.send("**1/4** — Qual guilda da aliança você faz parte?", view=guild_view)
    await guild_view.wait()

    if guild_view.chosen is None:
        await channel.send("⏱️ Tempo esgotado. Digite `!verificar` para recomeçar.")
        sessions.pop(uid, None); return

    chosen_guild = guild_view.chosen
    sessions[uid]["guild"] = chosen_guild

    # ── ETAPA 2: Selecionar nick da guilda ──────────────────────
    char_data: dict | None = None
    nick: str = ""

    if chosen_guild != "Nenhuma":
        loading = await channel.send(f"🔍 Buscando membros da **{chosen_guild}**...")
        members_list = await fetch_guild_members(chosen_guild)
        await loading.delete()

        if members_list:
            # Monta opções para o Select Menu
            options = [
                discord.SelectOption(
                    label=m["name"][:100],
                    value=m["name"],
                    description=m.get("char_class", "")[:100],
                )
                for m in members_list if m.get("name")
            ]

            nick_view = NickSelectView(member, options)
            await channel.send(
                f"**2/4** — Selecione seu personagem da **{chosen_guild}**:",
                view=nick_view,
            )
            await nick_view.wait()

            if nick_view.chosen is None:
                await channel.send("⏱️ Tempo esgotado. Digite `!verificar` para recomeçar.")
                sessions.pop(uid, None); return

            if nick_view.chosen == "__manual__":
                # Digitar manualmente
                nick = await ask(channel, member, "Digite o seu **nick exato** no MU Domix:") or ""
            else:
                nick = nick_view.chosen
        else:
            # Não conseguiu buscar membros → digitar manualmente
            nick = await ask(channel, member, "**2/4** — Digite o seu **nick no MU Domix**:") or ""
    else:
        nick = await ask(channel, member, "**2/4** — Digite o seu **nick no MU Domix**:") or ""

    if not nick:
        sessions.pop(uid, None); return

    # ── Verificar o nick no mudomix.com ─────────────────────────
    verifying = await channel.send(f"🔍 Verificando **{nick}** no servidor...")
    char_data = await scrape_character(nick)
    await verifying.delete()

    if not char_data:
        await channel.send(
            f"❌ Personagem **{nick}** não encontrado no MU Domix.\n"
            "Digite `!verificar` para tentar novamente."
        )
        sessions.pop(uid, None); return

    # Confirmar identidade
    char_class = char_data.get("char_class", "")
    class_abbrev = get_class_abbrev(char_class)

    embed_found = discord.Embed(title="Encontrei esse personagem:", color=0x2ECC71)
    embed_found.add_field(name="Nick",    value=char_data.get("name", nick), inline=True)
    embed_found.add_field(name="Classe",  value=f"{char_class} ({class_abbrev})", inline=True)
    embed_found.add_field(name="Resets",  value=str(char_data.get("resets", 0)), inline=True)
    if char_data.get("guild"):
        embed_found.add_field(name="Guilda no jogo", value=char_data["guild"], inline=True)

    confirm_view = ConfirmNickView(member)
    await channel.send(embed=embed_found, view=confirm_view)
    await confirm_view.wait()

    if not confirm_view.confirmed:
        await channel.send("Tudo bem! Digite `!verificar` para recomeçar com o nick correto.")
        sessions.pop(uid, None); return

    sessions[uid]["nick"]         = char_data.get("name", nick)
    sessions[uid]["char_class"]   = char_class
    sessions[uid]["class_abbrev"] = class_abbrev

    # ── ETAPA 3: Quem recrutou ──────────────────────────────────
    recruiter = await ask(
        channel, member,
        "**3/4** — Quem te recrutou para a aliança?\n> (Nick do jogador, ou `Nenhum`)"
    )
    if not recruiter:
        sessions.pop(uid, None); return
    sessions[uid]["recruiter"] = recruiter

    # ── ETAPA 4: Iniciante? ─────────────────────────────────────
    beginner_raw = await ask(
        channel, member,
        "**4/4** — Você é iniciante no MU? Responda `sim` ou `não`."
    )
    if not beginner_raw:
        sessions.pop(uid, None); return
    sessions[uid]["beginner"] = beginner_raw.lower() in ("sim", "s", "yes")

    # ── Formatar nick e finalizar ───────────────────────────────
    formatted_nick = f"{sessions[uid]['nick']} - {class_abbrev}"

    try:
        await member.edit(nick=formatted_nick)
    except discord.Forbidden:
        pass

    guild_server = member.guild

    # Cargos a atribuir
    roles_to_add = []

    # 1. Cargo Pendente (aguardando aprovação da staff na plataforma)
    if PENDING_ROLE_ID:
        r = guild_server.get_role(PENDING_ROLE_ID)
        if r: roles_to_add.append(r)

    # 2. Cargo Membro (acesso geral)
    if ROLE_MEMBRO:
        r = guild_server.get_role(ROLE_MEMBRO)
        if r: roles_to_add.append(r)

    # 3. Cargo da guilda específica (acesso às salas da guilda)
    guild_role_id = GUILD_ROLES.get(sessions[uid]["guild"], 0)
    if guild_role_id:
        r = guild_server.get_role(guild_role_id)
        if r: roles_to_add.append(r)

    if roles_to_add:
        try:
            await member.add_roles(*roles_to_add)
        except discord.Forbidden:
            pass  # Bot precisa ter cargo acima dos que vai atribuir

    await save_profile(member, sessions[uid])

    await channel.send(embed=discord.Embed(
        title="🎉 Verificação concluída!",
        description=(
            f"Seu nick foi atualizado para **{formatted_nick}**.\n\n"
            "Sua solicitação foi enviada para a **staff da Euphoria**.\n"
            "⏳ Aguarde a aprovação para ter acesso ao servidor completo!"
        ),
        color=0xC9A84C,
    ).add_field(name="Guilda", value=sessions[uid]["guild"], inline=True
    ).add_field(name="Recrutador", value=sessions[uid]["recruiter"], inline=True))

    sessions.pop(uid, None)


# ── Eventos ─────────────────────────────────────────────────────────────────

@bot.event
async def on_ready():
    print(f"✅ Bot online: {bot.user} (ID: {bot.user.id})")


@bot.event
async def on_member_join(member: discord.Member):
    channel = bot.get_channel(VERIFICATION_CHANNEL_ID)
    if not channel:
        return
    guild = member.guild
    overwrites = {
        guild.default_role: discord.PermissionOverwrite(read_messages=False),
        member: discord.PermissionOverwrite(read_messages=True, send_messages=True),
        guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True),
    }
    verify_channel = await guild.create_text_channel(
        name=f"verificar-{member.name}",
        overwrites=overwrites,
        category=channel.category,
        reason="Verificação de novo membro",
    )
    await channel.send(f"👤 {member.mention} entrou! Verificação em {verify_channel.mention}.")
    await run_verification(member, verify_channel)
    await asyncio.sleep(30)
    try:
        await verify_channel.delete(reason="Verificação concluída")
    except Exception:
        pass


@bot.event
async def on_message(message: discord.Message):
    if message.author.bot or not message.guild:
        return
    if message.content.lower() == "!verificar":
        sessions.pop(message.author.id, None)
        guild = message.guild
        overwrites = {
            guild.default_role: discord.PermissionOverwrite(read_messages=False),
            message.author: discord.PermissionOverwrite(read_messages=True, send_messages=True),
            guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True),
        }
        verify_channel = await guild.create_text_channel(
            name=f"verificar-{message.author.name}",
            overwrites=overwrites,
            category=message.channel.category,
            reason="Re-verificação",
        )
        await message.channel.send(f"✅ Canal criado: {verify_channel.mention}")
        await run_verification(message.author, verify_channel)
        await asyncio.sleep(30)
        try:
            await verify_channel.delete()
        except Exception:
            pass


if __name__ == "__main__":
    bot.run(DISCORD_BOT_TOKEN)


import discord
import asyncio
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

VERIFICATION_CHANNEL_ID = int(os.getenv("VERIFICATION_CHANNEL_ID", "0"))
PENDING_ROLE_ID         = int(os.getenv("PENDING_ROLE_ID", "0"))

# Classes do MU → abreviação em unicode small caps
CLASS_MAP = {
    "dark lord":        "ᴅʟ",
    "dark lord combination": "ᴅʟ",
    "summoner":         "ꜱᴍ",
    "elf":              "ᴇʟꜰ",
    "dark elf":         "ᴇʟꜰ",
    "magic gladiator":  "ᴍɢ",
    "dark wizard":      "ᴅᴡ",
    "blade knight":     "ʙᴋ",
    "blade master":     "ʙᴋ",
    "soul master":      "ᴅᴡ",
    "grand master":     "ᴅᴡ",
    "high elf":         "ᴇʟꜰ",
    "muse elf":         "ᴇʟꜰ",
    "duel master":      "ᴍɢ",
    "lord emperor":     "ᴅʟ",
    "dimension master": "ꜱᴍ",
    "rage fighter":     "ʀꜰ",
    "fist master":      "ʀꜰ",
    "gun crusher":      "ɢᴄ",
    "light wizard":     "ᴅᴡ",
    "mirage lancer":    "ᴅᴡ",
    "rune wizard":      "ʀᴡ",
}

SUPABASE_HEADERS = {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

intents = discord.Intents.default()
intents.members = True
intents.message_content = True

bot = discord.Client(intents=intents)

# Sessões de verificação em andamento: {user_id: {dados}}
sessions: dict[int, dict] = {}


def get_class_abbrev(char_class: str) -> str:
    """Retorna a abreviação unicode da classe."""
    key = char_class.lower().strip()
    for name, abbrev in CLASS_MAP.items():
        if name in key or key in name:
            return abbrev
    return char_class[:3].upper()


async def ask(channel: discord.TextChannel, user: discord.Member, content: str, timeout: int = 120) -> str | None:
    """Envia uma pergunta e aguarda a resposta do usuário."""
    await channel.send(content)

    def check(m: discord.Message):
        return m.author == user and m.channel == channel

    try:
        msg = await bot.wait_for("message", check=check, timeout=timeout)
        return msg.content.strip()
    except asyncio.TimeoutError:
        await channel.send("⏱️ Tempo esgotado. Digite `!verificar` para recomeçar.")
        return None


async def run_verification(member: discord.Member, channel: discord.TextChannel):
    """Executa o fluxo completo de verificação."""
    uid = member.id
    sessions[uid] = {}

    embed_intro = discord.Embed(
        title="👋 Bem-vindo à Euphoria!",
        description=(
            f"Olá, {member.mention}! Vou fazer algumas perguntas para liberar seu acesso.\n\n"
            "Responda diretamente aqui nesse canal. Você tem **2 minutos** para cada resposta."
        ),
        color=0xC9A84C,
    )
    await channel.send(embed=embed_intro)
    await asyncio.sleep(1)

    # ── Pergunta 1: Nick no MU ─────────────────────────────────
    nick = await ask(channel, member, "**1/4** — Qual o seu **nick no MU Domix**?")
    if not nick:
        sessions.pop(uid, None)
        return

    # Verificação via scraping
    wait_msg = await channel.send("🔍 Verificando seu personagem no servidor...")
    char_data = await scrape_character_async(nick)

    if not char_data:
        await wait_msg.delete()
        await channel.send(
            f"❌ Personagem **{nick}** não encontrado no MU Domix. "
            "Verifique o nick e digite `!verificar` para tentar novamente."
        )
        sessions.pop(uid, None)
        return

    await wait_msg.delete()

    char_class = char_data.get("char_class", "")
    char_guild = char_data.get("guild", "")
    class_abbrev = get_class_abbrev(char_class)

    embed_found = discord.Embed(
        title="✅ Personagem encontrado!",
        color=0x2ECC71,
    )
    embed_found.add_field(name="Nick", value=char_data.get("name", nick), inline=True)
    embed_found.add_field(name="Classe", value=f"{char_class} ({class_abbrev})", inline=True)
    embed_found.add_field(name="Resets", value=str(char_data.get("resets", 0)), inline=True)
    if char_guild:
        embed_found.add_field(name="Guilda no jogo", value=char_guild, inline=True)
    await channel.send(embed=embed_found)

    sessions[uid]["nick"] = char_data.get("name", nick)
    sessions[uid]["char_class"] = char_class
    sessions[uid]["class_abbrev"] = class_abbrev
    sessions[uid]["char_guild"] = char_guild

    # ── Pergunta 2: Guilda na aliança ─────────────────────────
    guild_answer = await ask(
        channel, member,
        "**2/4** — Qual guilda da aliança você faz parte?\n"
        "> Euphoria · Euphor1a · HellBoyz\n"
        "> (Se não faz parte de nenhuma, escreva `Nenhuma`)"
    )
    if not guild_answer:
        sessions.pop(uid, None)
        return
    sessions[uid]["guild"] = guild_answer

    # ── Pergunta 3: Quem recrutou ──────────────────────────────
    recruiter = await ask(
        channel, member,
        "**3/4** — Quem te recrutou para a aliança? (Nick do jogador ou `Nenhum`)"
    )
    if not recruiter:
        sessions.pop(uid, None)
        return
    sessions[uid]["recruiter"] = recruiter

    # ── Pergunta 4: Iniciante? ─────────────────────────────────
    beginner = await ask(
        channel, member,
        "**4/4** — Você é iniciante no MU? Responda `sim` ou `não`."
    )
    if not beginner:
        sessions.pop(uid, None)
        return
    sessions[uid]["beginner"] = beginner.lower() in ("sim", "s", "yes")

    # ── Formata o nick ─────────────────────────────────────────
    formatted_nick = f"{sessions[uid]['nick']} - {class_abbrev}"
    sessions[uid]["formatted_nick"] = formatted_nick

    # Renomeia no Discord
    try:
        await member.edit(nick=formatted_nick)
    except discord.Forbidden:
        pass  # Bot sem permissão de renomear (ex: dono do servidor)

    # ── Atribui cargo Pendente ─────────────────────────────────
    guild_server = member.guild
    pending_role = guild_server.get_role(PENDING_ROLE_ID)
    if pending_role:
        await member.add_roles(pending_role)

    # ── Cria perfil no Supabase como pending ───────────────────
    discord_id   = str(member.id)
    discord_user = str(member)  # ex: "usuario#0"

    async with httpx.AsyncClient() as client:
        # Verifica se já existe
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            headers=SUPABASE_HEADERS,
            params={"discord_id": f"eq.{discord_id}", "limit": "1"},
        )
        exists = r.status_code == 200 and len(r.json()) > 0

        if not exists:
            await client.post(
                f"{SUPABASE_URL}/rest/v1/profiles",
                headers=SUPABASE_HEADERS,
                json={
                    "discord_id": discord_id,
                    "discord_username": discord_user,
                    "nick_mudomix": sessions[uid]["nick"],
                    "guild": sessions[uid]["guild"],
                    "role": "pending",
                    "recruiter": sessions[uid]["recruiter"],
                    "is_beginner": sessions[uid]["beginner"],
                },
            )

    # ── Mensagem final ─────────────────────────────────────────
    embed_done = discord.Embed(
        title="🎉 Verificação concluída!",
        description=(
            f"Seu nick foi atualizado para **{formatted_nick}**.\n\n"
            "Sua solicitação foi enviada para a **staff da Euphoria**. "
            "Assim que aprovado, você terá acesso completo ao servidor.\n\n"
            "⏳ Aguarde a aprovação!"
        ),
        color=0xC9A84C,
    )
    embed_done.add_field(name="Guilda informada", value=sessions[uid]["guild"], inline=True)
    embed_done.add_field(name="Recrutador", value=sessions[uid]["recruiter"], inline=True)
    await channel.send(embed=embed_done)

    sessions.pop(uid, None)


async def scrape_character_async(nick: str) -> dict | None:
    """Busca dados do personagem via mudomix.com."""
    import re
    from bs4 import BeautifulSoup

    url = f"https://mudomix.com/profile/character/{nick}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9",
    }
    try:
        async with httpx.AsyncClient(headers=headers, timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None
            soup = BeautifulSoup(resp.text, "lxml")

            # Verifica bloqueio
            if soup.find(string=re.compile(r"Profile blocked|bloqueado", re.IGNORECASE)):
                return None

            profile_data: dict = {"name": nick}
            for table in soup.select("table"):
                for row in table.find_all("tr"):
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
                        elif "guild" in key or "guilda" in key:
                            profile_data["guild"] = val

            return profile_data if "char_class" in profile_data else None
    except Exception:
        return None


# ── Eventos ────────────────────────────────────────────────────

@bot.event
async def on_ready():
    print(f"✅ Bot online: {bot.user} (ID: {bot.user.id})")


@bot.event
async def on_member_join(member: discord.Member):
    """Quando alguém entra no servidor, manda para o canal de verificação."""
    channel = bot.get_channel(VERIFICATION_CHANNEL_ID)
    if not channel:
        return

    # Cria canal privado temporário para a verificação (apenas esse membro)
    guild = member.guild
    overwrites = {
        guild.default_role: discord.PermissionOverwrite(read_messages=False),
        member: discord.PermissionOverwrite(read_messages=True, send_messages=True),
        guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True),
    }
    verify_channel = await guild.create_text_channel(
        name=f"verificar-{member.name}",
        overwrites=overwrites,
        category=channel.category,
        reason="Verificação de novo membro",
    )

    # Avisa no canal principal de verificação
    await channel.send(
        f"👤 {member.mention} entrou no servidor! "
        f"Sua verificação está em {verify_channel.mention}."
    )

    # Inicia o fluxo no canal privado
    await run_verification(member, verify_channel)

    # Aguarda 30s e apaga o canal temporário
    await asyncio.sleep(30)
    try:
        await verify_channel.delete(reason="Verificação concluída")
    except Exception:
        pass


@bot.event
async def on_message(message: discord.Message):
    """Comando manual para reiniciar verificação."""
    if message.author.bot:
        return

    if message.content.lower() == "!verificar":
        # Apaga canal antigo da pessoa se existir e cria novo
        guild = message.guild
        if not guild:
            return

        # Remove sessão anterior
        sessions.pop(message.author.id, None)

        overwrites = {
            guild.default_role: discord.PermissionOverwrite(read_messages=False),
            message.author: discord.PermissionOverwrite(read_messages=True, send_messages=True),
            guild.me: discord.PermissionOverwrite(read_messages=True, send_messages=True),
        }
        verify_channel = await guild.create_text_channel(
            name=f"verificar-{message.author.name}",
            overwrites=overwrites,
            category=message.channel.category,
            reason="Re-verificação solicitada",
        )
        await message.channel.send(f"✅ Canal criado: {verify_channel.mention}")
        await run_verification(message.author, verify_channel)
        await asyncio.sleep(30)
        try:
            await verify_channel.delete()
        except Exception:
            pass


if __name__ == "__main__":
    bot.run(DISCORD_BOT_TOKEN)
