"""One-time fix: compute recommendation scores for the current scan
and update Supabase, so the dashboard shows the Identity Card immediately.

Themes were removed — only float + volume + earnings are scored (the signals
we know are reliable from forensic analysis)."""
import os
import json
import time
import yfinance as yf
from datetime import datetime
from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

TARGET_WEEK = "08.05-15.05.2026"

# ---- Load current scan ----
print(f"Loading {TARGET_WEEK} from Supabase...")
r = supabase.table("weekly_scans").select("*").eq("week_label", TARGET_WEEK).execute()
if not r.data:
    print(f"Row {TARGET_WEEK} not found.")
    exit(1)

row = r.data[0]
payload = json.loads(row["stocks_json"])
stocks = payload.get("stocks", payload) if isinstance(payload, dict) else payload
print(f"Found {len(stocks)} stocks.\n")

# ---- Top 5 ----
top5 = sorted(stocks, key=lambda s: s.get("change_pct", 0), reverse=True)[:5]
top5_tickers = {s["ticker"] for s in top5}
print(f"Top 5: {sorted(top5_tickers)}\n")

# ---- Score each top 5 ----
print("Fetching signals + scoring top 5...")
time.sleep(3)

scored_by_ticker = {}
for stock in top5:
    t = stock["ticker"]
    score = 0
    signals = {}
    catalysts = []

    try:
        time.sleep(1.5)
        obj = yf.Ticker(t)

        # Float (the killer signal)
        try:
            info = obj.info
            fl = info.get("floatShares") or 0
            if fl:
                float_m = round(fl / 1e6, 1)
                signals["float_m"] = float_m
                if float_m < 15:
                    score += 5
                    catalysts.append(f"🔥 Tiny float ({float_m}M)")
                elif float_m < 30:
                    score += 3
                    catalysts.append(f"Small float ({float_m}M)")
                elif float_m < 60:
                    score += 1
                elif float_m > 100:
                    score -= 1
            sp = info.get("shortPercentOfFloat") or 0
            if sp:
                signals["short_pct"] = round(float(sp) * 100, 1)
        except Exception as e:
            print(f"    {t}: info error — {e}")

        # Volume ratio (week vs 3-month daily avg)
        fi = obj.fast_info
        avg_vol = getattr(fi, "three_month_average_volume", None)
        if avg_vol and avg_vol > 0 and stock.get("volume", 0) > 0:
            ratio = stock["volume"] / (avg_vol * 5)
            signals["volume_ratio"] = round(ratio, 2)
            if ratio >= 4.0:
                score += 2
                catalysts.append(f"Volume {ratio:.1f}x avg")
            elif ratio >= 2.0:
                score += 1
                catalysts.append(f"Volume {ratio:.1f}x avg")

        # Earnings within next 7 days
        try:
            cal = obj.calendar
            next_earn = None
            if isinstance(cal, dict):
                ed = cal.get("Earnings Date")
                if isinstance(ed, list) and ed:
                    next_earn = ed[0]
                elif ed:
                    next_earn = ed
            if next_earn:
                earn_date = next_earn if isinstance(next_earn, datetime) else datetime.combine(next_earn, datetime.min.time())
                days_to = (earn_date - datetime.now()).days
                if 0 <= days_to <= 7:
                    score += 1
                    catalysts.append(f"📊 Earnings in {days_to}d")
                    signals["earnings_in_days"] = days_to
        except Exception:
            pass

        # Display-only: close location, 52W distance
        hist = obj.history(period="10d", interval="1d")
        if not hist.empty:
            wh = float(hist["High"].max())
            wl = float(hist["Low"].min())
            wc = float(hist["Close"].iloc[-1])
            rng = wh - wl
            if rng > 0:
                signals["close_location_pct"] = round((wc - wl) / rng * 100, 1)
        high_52w = getattr(fi, "fifty_two_week_high", None)
        if high_52w and stock.get("price", 0) > 0:
            signals["dist_from_52w_high_pct"] = round((high_52w - stock["price"]) / high_52w * 100, 1)

    except Exception as e:
        print(f"  {t}: error — {e}")

    scored_by_ticker[t] = {
        "rec_score":     max(0, score),
        "rec_signals":   signals,
        "rec_catalysts": catalysts,
    }
    print(f"  {t}: score={score} | float={signals.get('float_m', 'N/A')}M | vol={signals.get('volume_ratio', 'N/A')}x")

# ---- Pick the winner ----
best_ticker = None
if scored_by_ticker:
    best_ticker = max(scored_by_ticker, key=lambda k: scored_by_ticker[k]["rec_score"])
    best = scored_by_ticker[best_ticker]
    print(f"\n🔥 PICK FOR NEXT WEEK: {best_ticker} (score {best['rec_score']})")
    print(f"   Why: {' · '.join(best['rec_catalysts']) or 'no strong catalysts'}\n")

# ---- Write back to all 20 (strip any old themes too) ----
for s in stocks:
    t = s["ticker"]
    # Clean any leftover theme fields
    s.pop("themes", None)
    if t in scored_by_ticker:
        s.update(scored_by_ticker[t])
        s["recommended"] = (t == best_ticker)
    else:
        s["rec_score"] = 0
        s["rec_signals"] = {}
        s["rec_catalysts"] = []
        s["recommended"] = False

# ---- Save ----
payload["stocks"] = stocks
supabase.table("weekly_scans").update({
    "stocks_json": json.dumps(payload)
}).eq("week_label", TARGET_WEEK).execute()

print("Done. Supabase updated.")
