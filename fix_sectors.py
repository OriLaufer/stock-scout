"""
One-time fix: fetch sector/industry for each stock in the current weekly scan
and update Supabase with the missing data.
"""
import os
import json
import time
import yfinance as yf
from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

TARGET_WEEK = "08.05-15.05.2026"

r = supabase.table("weekly_scans").select("*").eq("week_label", TARGET_WEEK).execute()
if not r.data:
    print(f"Row {TARGET_WEEK} not found.")
    exit(1)

row = r.data[0]
payload = json.loads(row["stocks_json"])
stocks = payload.get("stocks", [])

print(f"Fetching sectors for {len(stocks)} stocks...")
time.sleep(3)

for i, stock in enumerate(stocks):
    t = stock["ticker"]
    if stock.get("sector"):
        print(f"  {t}: already has sector '{stock['sector']}', skipping")
        continue
    try:
        time.sleep(0.5)
        info = yf.Ticker(t).info
        sector   = info.get("sector") or ""
        industry = info.get("industry") or ""
        name     = info.get("longName") or info.get("shortName") or stock.get("name", t)
        stock["sector"]   = sector
        stock["industry"] = industry
        if name and len(name) <= 60:
            stock["name"] = name
        elif name:
            stock["name"] = name[:57] + "..."
        print(f"  {t}: sector='{sector}'")
    except Exception as e:
        print(f"  {t}: failed — {e}")

payload["stocks"] = stocks
supabase.table("weekly_scans").update({
    "stocks_json": json.dumps(payload)
}).eq("week_label", TARGET_WEEK).execute()

print("\nDone. Supabase updated with sector data.")
