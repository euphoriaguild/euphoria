"""Smoke test S1–S5 against SQL Server (no FastAPI auth)."""
from __future__ import annotations

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import db
import store


def main() -> None:
    h = db.healthcheck()
    assert h.get("ok"), h
    print("OK health", h.get("database"), h.get("driver"))

    profiles = store.get_approved_profiles()
    print("OK approved_profiles", len(profiles))

    print("OK donation_amount", store.get_donation_weekly_amount())
    print("OK statute", store.get_statute() is not None)
    print("OK alts_visibility", store.get_alts_visibility())
    print("OK raffle_open", store.get_open_raffle())
    print("OK wb_checkins_today", len(store.list_wb_checkins(date.today().isoformat())))

    fut = datetime.now(timezone.utc) + timedelta(days=1)
    r = store.fazer_checkin("SMOKE_TEST_BOT", "bc1", fut)
    print("OK fazer_checkin", r)
    assert r.get("ok") is True, r

    listed = store.list_checkins_from(datetime.now(timezone.utc).isoformat())
    mine = [c for c in listed if c.get("player") == "SMOKE_TEST_BOT"]
    assert mine, "checkin not listed"
    print("OK list_checkins", len(listed), "mine", mine[0])

    # duplicate should fail gracefully
    r2 = store.fazer_checkin("SMOKE_TEST_BOT", "bc1", fut)
    print("OK duplicate", r2)
    assert r2.get("ok") is False

    db.execute("DELETE FROM dbo.checkins WHERE player = ?", ["SMOKE_TEST_BOT"])
    print("OK cleanup")
    print("SMOKE S1-S5 DATA LAYER OK")


if __name__ == "__main__":
    main()
