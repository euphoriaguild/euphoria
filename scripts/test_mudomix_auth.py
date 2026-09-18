"""Smoke: login na API MU Domix e status do token."""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from external_api import mudomix_api, MudomixAuthError  # noqa: E402


async def main() -> None:
    print("configured:", mudomix_api.configured)
    print("status before:", mudomix_api.status())
    try:
        token = await mudomix_api.login(force=True)
        print("login ok, token_len:", len(token))
        print("status after:", mudomix_api.status())
        # 2ª chamada deve reutilizar cache
        t2 = await mudomix_api.login(force=False)
        print("cache reuse:", t2 == token)
    except MudomixAuthError as exc:
        print("FAIL:", exc)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
