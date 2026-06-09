"""One-time: re-send the email report for the LATEST scan (the Sunday report),
without re-running a scan. Goes to BOSS_EMAIL — set that to your own address
to receive it, then forward to the boss."""
import json
import re
from datetime import datetime

from scanner import send_email, compute_backtest, supabase, BOSS_EMAIL


def _parse_week_end(label):
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", label)
    if not m:
        return datetime(2000, 1, 1)
    return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))


_all = supabase.table("weekly_scans").select("week_label").execute()
if not _all.data:
    print("No scans found.")
    exit(1)
TARGET_WEEK = max((row["week_label"] for row in _all.data), key=_parse_week_end)
print(f"Latest week: {TARGET_WEEK}")
print(f"Sending to: {BOSS_EMAIL}")

r = supabase.table("weekly_scans").select("stocks_json").eq("week_label", TARGET_WEEK).execute()
if not r.data:
    print("Scan not found.")
    exit(1)

payload = json.loads(r.data[0]["stocks_json"])
stocks = payload.get("stocks", payload) if isinstance(payload, dict) else payload
bonus = payload.get("bonus", []) if isinstance(payload, dict) else []

print("Computing backtest track record...")
backtest = compute_backtest()

print("Sending email...")
send_email(stocks, bonus, TARGET_WEEK, backtest=backtest)
print("Done. Check your inbox (and spam).")
