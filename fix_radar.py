"""One-time backfill: compute the Multi-Bagger Radar (top 10 by DNA score)
and embed it in the LATEST scan's payload."""
import json
import re
from datetime import datetime

from scanner import compute_multibagger_radar, supabase


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

radar = compute_multibagger_radar(top_n=10)
print(f"\nGot {len(radar)} stocks in the Radar.")
if not radar:
    print("No radar data computed.")
    exit(0)

for i, x in enumerate(radar, 1):
    print(f"  #{i:2} {x['ticker']:7} DNA {x['dna_score']:5.1f} | "
          f"RS6 {x.get('rs_6mo', 0):+.0f}% | rev {x.get('revenue_growth_pct', '—')} | "
          f"{x['appearances']} apps")

r = supabase.table("weekly_scans").select("stocks_json").eq("week_label", TARGET_WEEK).execute()
if not r.data:
    print(f"Latest scan {TARGET_WEEK} not found.")
    exit(1)

payload = json.loads(r.data[0]["stocks_json"])
payload["radar"] = radar
supabase.table("weekly_scans").update({
    "stocks_json": json.dumps(payload)
}).eq("week_label", TARGET_WEEK).execute()

print(f"\nDone. Radar saved into {TARGET_WEEK} payload.")
