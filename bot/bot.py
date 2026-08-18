"""
Euphoria Discord Bot — Verificação de novos membros (v2)
Fluxo simplificado:
  1. Usuário digita o nick no MU
  2. Seleciona a classe (ELF, BK, DL, MG, SM)
  3. Informa quem recrutou
  4. Informa se é iniciante
  5. Formata nick: "NickMU - ᴄʟᴀꜱꜱᴇ", atribui cargo Pendente, cria perfil no Supabase
"""

import discord
import discord.ui
import asyncio
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

VERIFICATION_CHANNEL_ID = int(os.getenv("VERIFICATION_CHANNEL_ID", "0"))
PENDING_ROLE_ID = int(os.getenv("PENDING_ROLE_ID", "0"))
ROLE_MEMBRO = int(os.getenv("ROLE_MEMBRO", "0"))

# Classes disponíveis e suas abreviações em unicode small caps
CLASSES = {
    "ELF": "ᴇʟꜰ",
    "BK": "ʙᴋ",
    "DL": "ᴅʟ",
    "MG": "ᴍɢ",
    "SM": "ꜱᴍ",
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

sessions: dict[int, dict] = {}


# ── Views (componentes interativos) ────────────────────────────────────────

class ClassSelectView(discord.ui.View):
    """Select Menu para escolher a classe."""
    def __init__(self, member: discord.Member):
        super().__init__(timeout=120)
        self.member = member
        self.chosen: str | None = None

        options = [
            discord.SelectOption(label="ELF", value="ELF", description="Fairy Elf / Muse Elf / High Elf"),
            discord.SelectOption(label="BK", value="BK", description="Blade Knight / Blade Master"),
            discord.SelectOption(label="DL", value="DL", description="Dark Lord / Lord Emperor"),
            discord.SelectOption(label="MG", value="MG", description="Magic Gladiator / Duel Master"),
            discord.SelectOption(label="SM", value="SM", description="Summoner / Dimension Master"),
        ]

        select = discord.ui.Select(placeholder="Selecione sua classe...", options=options)
        select.callback = self._callback
        self.add_item(select)

    async def _callback(self, interaction: discord.Interaction):
        if interaction.user != self.member:
            await interaction.response.send_message("❌ Esse menu não é para você.", ephemeral=True)
            return
        self.chosen = interaction.data["values"][0]
        await interaction.response.defer()
        self.stop()


class YesNoView(discord.ui.View):
    """Botões Sim/Não."""
    def __init__(self, member: discord.Member):
        super().__init__(timeout=120)
        self.member = member
        self.answer: bool | None = None

    @discord.ui.button(label="Sim", style=discord.ButtonStyle.success)
    async def yes(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.member:
            await interaction.response.send_message("❌ Esse botão não é para você.", ephemeral=True)
            return
        self.answer = True
        await interaction.response.defer()
        self.stop()

    @discord.ui.button(label="Não", style=discord.ButtonStyle.secondary)
    async def no(self, interaction: discord.Interaction, button: discord.ui.Button):
        if interaction.user != self.member:
            await interaction.response.send_message("❌ Esse botão não é para você.", ephemeral=True)
            return
        self.answer = False
        await interaction.response.defer()
        self.stop()


# ── Helpers ────────────────────────────────────────────────────────────────

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


async def save_profile(member: discord.Member, session: dict):
    """Cria perfil no Supabase."""
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
                    "char_class": session["char_class"],
                    "role": "pending",
                    "recruiter": session.get("recruiter", ""),
                    "is_beginner": session.get("beginner", False),
                },
            )


# ── Fluxo de verificação ───────────────────────────────────────────────────

async def run_verification(member: discord.Member, channel: discord.TextChannel):
    uid = member.id
    sessions[uid] = {}

    await channel.send(embed=discord.Embed(
        title="👋 Bem-vindo à Euphoria!",
        description=(
            f"Olá, {member.mention}! Vou fazer algumas perguntas rápidas para liberar seu acesso.\n\n"
            "Você tem **2 minutos** para cada etapa."
        ),
        color=0xC9A84C,
    ))
    await asyncio.sleep(1)

    # ── ETAPA 1: Nick no MU ─────────────────────────────────────
    nick = await ask(channel, member, "**1/4** — Qual o seu **nick no MU Domix**?")
    if not nick:
        sessions.pop(uid, None)
        return
    sessions[uid]["nick"] = nick

    # ── ETAPA 2: Classe ─────────────────────────────────────────
    class_view = ClassSelectView(member)
    await channel.send("**2/4** — Qual sua classe principal?", view=class_view)
    await class_view.wait()

    if class_view.chosen is None:
        await channel.send("⏱️ Tempo esgotado. Digite `!verificar` para recomeçar.")
        sessions.pop(uid, None)
        return

    char_class = class_view.chosen
    class_abbrev = CLASSES[char_class]
    sessions[uid]["char_class"] = char_class
    sessions[uid]["class_abbrev"] = class_abbrev

    # ── ETAPA 3: Recrutador ─────────────────────────────────────
    recruiter = await ask(
        channel, member,
        "**3/4** — Quem te recrutou para a Euphoria?\n> (Nick do jogador, ou `Nenhum`)"
    )
    if not recruiter:
        sessions.pop(uid, None)
        return
    sessions[uid]["recruiter"] = recruiter

    # ── ETAPA 4: Iniciante ──────────────────────────────────────
    beginner_view = YesNoView(member)
    await channel.send("**4/4** — Você é iniciante no MU?", view=beginner_view)
    await beginner_view.wait()

    if beginner_view.answer is None:
        await channel.send("⏱️ Tempo esgotado. Digite `!verificar` para recomeçar.")
        sessions.pop(uid, None)
        return
    sessions[uid]["beginner"] = beginner_view.answer

    # ── Formatar nick e finalizar ───────────────────────────────
    formatted_nick = f"{nick} - {class_abbrev}"

    try:
        await member.edit(nick=formatted_nick)
    except discord.Forbidden:
        pass

    guild_server = member.guild
    roles_to_add = []

    # Cargo Pendente
    if PENDING_ROLE_ID:
        r = guild_server.get_role(PENDING_ROLE_ID)
        if r:
            roles_to_add.append(r)

    # Cargo Membro
    if ROLE_MEMBRO:
        r = guild_server.get_role(ROLE_MEMBRO)
        if r:
            roles_to_add.append(r)

    if roles_to_add:
        try:
            await member.add_roles(*roles_to_add)
        except discord.Forbidden:
            pass

    await save_profile(member, sessions[uid])

    await channel.send(embed=discord.Embed(
        title="🎉 Verificação concluída!",
        description=(
            f"Seu nick foi atualizado para **{formatted_nick}**.\n\n"
            "Sua solicitação foi enviada para a **staff da Euphoria**.\n"
            "⏳ Aguarde a aprovação para ter acesso ao servidor completo!"
        ),
        color=0xC9A84C,
    ).add_field(name="Nick", value=nick, inline=True
    ).add_field(name="Classe", value=f"{char_class} ({class_abbrev})", inline=True
    ).add_field(name="Recrutador", value=recruiter, inline=True))

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
