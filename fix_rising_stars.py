"""One-time backfill: run the full-market Rising Stars scan (quiet base-builders
with strong 6-month relative strength) and save into the latest scan's payload.

This re-downloads the universe + 6mo history, so it takes a while (~10-15 min)."""
import json
import re
from datetime import datetime

from scanner import (
    get_ticker_universe, fetch_weekly_changes, compute_rising_stars, supabase
)


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
print(f"Auto-detected latest week: {TARGET_WEEK}")

print("\nFetching universe...")
universe, names = get_ticker_universe()
if not universe:
    print("No universe.")
    exit(1)

print("\nFetching 6mo price data for the whole universe (this is the slow part)...")
price_data = fetch_weekly_changes(universe)
if not price_data:
    print("No price data.")
    exit(1)

print("\nComputing Rising Stars...")
rising_stars = compute_rising_stars(price_data, names, target=20)
print(f"\nGot {len(rising_stars)} rising stars.")
if not rising_stars:
    print("No rising stars computed.")
    exit(0)

for i, s in enumerate(rising_stars, 1):
    print(f"  #{i:2} {s['ticker']:7} score {s['rs_score']:5.1f} | 6mo {s['ret_6mo']}% | "
          f"${s['market_cap']/1e9:.2f}B | {s['sector']}")

r = supabase.table("weekly_scans").select("stocks_json").eq("week_label", TARGET_WEEK).execute()
if not r.data:
    print(f"Latest scan {TARGET_WEEK} not found.")
    exit(1)

payload = json.loads(r.data[0]["stocks_json"])
payload["rising_stars"] = rising_stars
supabase.table("weekly_scans").update({
    "stocks_json": json.dumps(payload)
}).eq("week_label", TARGET_WEEK).execute()

print(f"\nDone. Rising Stars saved into {TARGET_WEEK} payload.")
