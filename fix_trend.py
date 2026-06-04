"""One-time backfill: compute The Trend (top 10 by compound return across
all weekly scans) and embed it in the LATEST scan's payload."""
import os
import json
import re
from datetime import datetime

# Import the heavy lifters from scanner (env vars must be set when this runs)
from scanner import compute_the_trend, supabase


def _parse_week_end(label):
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", label)
    if not m:
        return datetime(2000, 1, 1)
    return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))


# Find latest scan
_all = supabase.table("weekly_scans").select("week_label").execute()
if not _all.data:
    print("No scans found.")
    exit(1)
TARGET_WEEK = max((row["week_label"] for row in _all.data), key=_parse_week_end)
print(f"Auto-detected latest week: {TARGET_WEEK}")

# Run the trend computation
trend = compute_the_trend(top_n=10)
print(f"\nGot {len(trend)} stocks in The Trend.")

if not trend:
    print("No trend data computed (need >=2 weeks of scans).")
    exit(0)

# Print summary
for i, t in enumerate(trend, 1):
    print(f"  #{i} {t['ticker']:7} — full compound {t['full_compound_pct']:+.1f}% | "
          f"scan compound {t['scan_compound_pct']:+.1f}% | "
          f"{t['scan_appearances']}/{t['total_weeks']} weeks in our scans")

# Save into latest scan's payload
r = supabase.table("weekly_scans").select("stocks_json").eq("week_label", TARGET_WEEK).execute()
if not r.data:
    print(f"Latest scan {TARGET_WEEK} not found.")
    exit(1)

payload = json.loads(r.data[0]["stocks_json"])
payload["trend"] = trend

supabase.table("weekly_scans").update({
    "stocks_json": json.dumps(payload)
}).eq("week_label", TARGET_WEEK).execute()

print(f"\nDone. Trend saved into {TARGET_WEEK} payload.")
