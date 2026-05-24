"""One-time fix: compute CONTINUOUS recommendation scores for the current scan
and update Supabase so the dashboard shows the Identity Card immediately."""
import os
import json
import time
import yfinance as yf
from datetime import datetime
from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])

TARGET_WEEK = "08.05-15.05.2026"


def float_score(fm):
    if fm is None or fm <= 0:    return 0.0
    if fm <= 10:                 return 5.0
    if fm < 75:                  return 5.0 * (75 - fm) / 65
    if fm < 250:                 return -(fm - 75) / 175
    return -1.0


def volume_score(r):
    if r is None or r <= 1: return 0.0
    if r < 2:               return r - 1
    if r < 5:               return 1.0 + (r - 2) / 3
    return 2.0


def confidence_level(scored):
    if not scored or len(scored) < 2:
        return "low", 0
    ordered = sorted([s.get("rec_score", 0) for s in scored], reverse=True)
    gap = ordered[0] - ordered[1]
    if gap >= 2.5: return "high", gap
    if gap >= 1.0: return "medium", gap
    return "low", gap


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

scored_list = []
for stock in top5:
    t = stock["ticker"]
    signals = {}
    catalysts = []
    f_sc = v_sc = e_sc = 0.0

    try:
        time.sleep(1.5)
        obj = yf.Ticker(t)

        # FLOAT (continuous)
        try:
            info = obj.info
            fl = info.get("floatShares") or 0
            if fl:
                fm = round(fl / 1e6, 1)
                signals["float_m"] = fm
                f_sc = float_score(fm)
                if fm <= 15:    catalysts.append(f"🔥 Tiny float ({fm}M)")
                elif fm <= 30:  catalysts.append(f"Small float ({fm}M)")
                elif fm >= 150: catalysts.append(f"⚠️ Large float ({fm}M)")
            sp = info.get("shortPercentOfFloat") or 0
            if sp:
                signals["short_pct"] = round(float(sp) * 100, 1)
        except Exception as e:
            print(f"    {t}: info error — {e}")

        # VOLUME (continuous)
        fi = obj.fast_info
        avg_vol = getattr(fi, "three_month_average_volume", None)
        if avg_vol and avg_vol > 0 and stock.get("volume", 0) > 0:
            ratio = stock["volume"] / (avg_vol * 5)
            signals["volume_ratio"] = round(ratio, 2)
            v_sc = volume_score(ratio)
            if ratio >= 2.0:
                catalysts.append(f"Volume {ratio:.1f}x avg")

        # EARNINGS (binary)
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
                    e_sc = 1.0
                    catalysts.append(f"📊 Earnings in {days_to}d")
                    signals["earnings_in_days"] = days_to
        except Exception:
            pass

        # DISPLAY-ONLY
        hist = obj.history(period="10d", interval="1d")
        if not hist.empty:
            wh = float(hist["High"].max())
            wl = float(hist["Low"].min())
            wc = float(hist["Close"].iloc[-1])
            rng = wh - wl
            if rng > 0:
                signals["close_location_pct"] = round((wc - wl) / rng * 100, 1)
        # 52-week range — raw values + position in range
        high_52w = getattr(fi, "fifty_two_week_high", None)
        low_52w  = getattr(fi, "fifty_two_week_low", None)
        price    = stock.get("price", 0)
        if high_52w:
            signals["high_52w"] = round(float(high_52w), 2)
            if price > 0:
                signals["dist_from_52w_high_pct"] = round((high_52w - price) / high_52w * 100, 1)
        if low_52w:
            signals["low_52w"] = round(float(low_52w), 2)
            if price > 0 and low_52w > 0:
                signals["gain_from_52w_low_pct"] = round((price - low_52w) / low_52w * 100, 1)
        if high_52w and low_52w and high_52w > low_52w and price > 0:
            signals["pos_in_52w_range_pct"] = round((price - low_52w) / (high_52w - low_52w) * 100, 1)

    except Exception as e:
        print(f"  {t}: error — {e}")

    total = round(max(0, f_sc + v_sc + e_sc), 2)
    signals["score_breakdown"] = {
        "float":    round(f_sc, 2),
        "volume":   round(v_sc, 2),
        "earnings": round(e_sc, 2),
    }
    rec = {
        "rec_score":     total,
        "rec_signals":   signals,
        "rec_catalysts": catalysts,
    }
    scored_list.append({"ticker": t, **rec})
    print(f"  {t}: score={total} (float={f_sc:.2f} + vol={v_sc:.2f} + earn={e_sc:.2f})")

# ---- Pick winner + confidence ----
best_ticker = None
conf_label, gap = ("low", 0)
if scored_list:
    best = max(scored_list, key=lambda x: x["rec_score"])
    best_ticker = best["ticker"]
    conf_label, gap = confidence_level(scored_list)
    emoji = {"high": "🔥", "medium": "✨", "low": "⚠️"}[conf_label]
    print(f"\n{emoji} PICK FOR NEXT WEEK: {best_ticker} "
          f"(score {best['rec_score']}, gap +{gap:.2f}, confidence={conf_label})")
    print(f"   Why: {' · '.join(best['rec_catalysts']) or 'no strong catalysts'}\n")

# ---- Write back ----
scored_map = {s["ticker"]: s for s in scored_list}
for s in stocks:
    t = s["ticker"]
    s.pop("themes", None)
    if t in scored_map:
        s["rec_score"]      = scored_map[t]["rec_score"]
        s["rec_signals"]    = scored_map[t]["rec_signals"]
        s["rec_catalysts"]  = scored_map[t]["rec_catalysts"]
        s["recommended"]    = (t == best_ticker)
        s["rec_confidence"] = conf_label
        s["rec_gap"]        = round(gap, 2)
    else:
        s["rec_score"] = 0
        s["rec_signals"] = {}
        s["rec_catalysts"] = []
        s["recommended"] = False
        s["rec_confidence"] = "low"
        s["rec_gap"] = 0

payload["stocks"] = stocks
supabase.table("weekly_scans").update({
    "stocks_json": json.dumps(payload)
}).eq("week_label", TARGET_WEEK).execute()

print("Done. Supabase updated.")
