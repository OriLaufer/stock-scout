"""One-time: generate THE VERDICT (AI analyst's written opinion) from the
latest scan's existing data and save it into that scan's payload.

Needs ANTHROPIC_API_KEY in the environment."""
import json
import re
from datetime import datetime

from scanner import generate_ai_verdict, supabase


def _parse_week_end(label):
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", label)
    if not m:
        return datetime(2000, 1, 1)
    return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))


_all = supabase.table("weekly_scans").select("week_label").execute()
if not _all.data:
    print("No scans found."); exit(1)
TARGET_WEEK = max((row["week_label"] for row in _all.data), key=_parse_week_end)
print(f"Auto-detected latest week: {TARGET_WEEK}")

r = supabase.table("weekly_scans").select("stocks_json").eq("week_label", TARGET_WEEK).execute()
if not r.data:
    print(f"Scan {TARGET_WEEK} not found."); exit(1)

payload = json.loads(r.data[0]["stocks_json"])
top_picks    = payload.get("stocks", []) or []
trend        = payload.get("trend") or []
radar        = payload.get("radar") or []
rising_stars = payload.get("rising_stars") or []

print(f"Data: {len(top_picks)} picks, {len(trend)} trend, {len(radar)} radar, {len(rising_stars)} rising stars")
print("\nGenerating verdict (Claude + web search, may take 30-60s)...")

verdict = generate_ai_verdict(top_picks, trend, radar, rising_stars)
if not verdict:
    print("No verdict generated (check ANTHROPIC_API_KEY).")
    exit(0)

print("\n===== THE VERDICT =====\n")
print(verdict["text"])
print(f"\n(model: {verdict['model']})")

payload["verdict"] = verdict
supabase.table("weekly_scans").update({
    "stocks_json": json.dumps(payload)
}).eq("week_label", TARGET_WEEK).execute()

print(f"\nDone. Verdict saved into {TARGET_WEEK}.")
