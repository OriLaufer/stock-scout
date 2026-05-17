"""
One-time fix: update backtest.week in the 08.05-15.05.2026 scan
from "08.05-15.05.2026" to "01.05-08.05.2026" (the selection week).
"""
import os
import json
from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

TARGET_WEEK = "08.05-15.05.2026"
CORRECT_BACKTEST_WEEK = "01.05-08.05.2026"

r = supabase.table("weekly_scans").select("*").eq("week_label", TARGET_WEEK).execute()
if not r.data:
    print(f"Row {TARGET_WEEK} not found.")
    exit(1)

row = r.data[0]
payload = json.loads(row["stocks_json"])

if "backtest" not in payload:
    print("No backtest field found in this row.")
    exit(1)

current_label = payload["backtest"].get("week")
print(f"Current backtest.week: {current_label}")

if current_label == CORRECT_BACKTEST_WEEK:
    print("Already correct, nothing to do.")
    exit(0)

payload["backtest"]["week"] = CORRECT_BACKTEST_WEEK
print(f"Updated backtest.week to: {CORRECT_BACKTEST_WEEK}")

supabase.table("weekly_scans").update({
    "stocks_json": json.dumps(payload)
}).eq("week_label", TARGET_WEEK).execute()

print("Done. Supabase updated successfully.")
