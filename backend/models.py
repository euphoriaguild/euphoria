from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class GuildMember(BaseModel):
    name: str
    char_class: str
    resets: int
    level: int
    member_level: str  # "Master" | "Member"
    guild: str


class CharacterProfile(BaseModel):
    name: str
    char_class: str
    resets: int
    level: int
    map: Optional[str] = None
    status: Optional[str] = None  # "Online" | "Offline"
    guild: Optional[str] = None
    guild_master: Optional[str] = None
    avatar_url: Optional[str] = None
    equipment: list[str] = []
    profile_blocked: bool = False
    blocked_until: Optional[str] = None


class GuildInfo(BaseModel):
    name: str
    master: str
    points: int
    member_count: int
    members: list[GuildMember] = []


class RankingEntry(BaseModel):
    position: int
    name: str
    char_class: str
    guild: Optional[str] = None
    resets: int
    country: Optional[str] = None
    vip: bool = False
    online: bool = False


class AllianceData(BaseModel):
    guilds: list[GuildInfo]
    total_members: int
    total_resets: int
    top_reset: Optional[GuildMember] = None
    online_count: int = 0
    last_updated: datetime
