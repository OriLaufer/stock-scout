"""One-time fix: compute V3 Conviction Scores for the LATEST scan and
update Supabase so the dashboard shows the new categories immediately.

V3 = gate (close < 60% rejects) + strength/weakness signals + honest
decision categories (pick / candidate / possible / avoid / no_pick)."""
import os
import json
import re
import time
import yfinance as yf
from datetime import datetime
from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])


def _parse_week_end(label):
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", label)
    if not m:
        return datetime(2000, 1, 1)
    return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))


# ---- Find latest scan ----
_all = supabase.table("weekly_scans").select("week_label").execute()
if not _all.data:
    print("No scans found."); exit(1)
TARGET_WEEK = max((row["week_label"] for row in _all.data), key=_parse_week_end)
print(f"Auto-detected latest week: {TARGET_WEEK}")

# ---- Load current scan ----
r = supabase.table("weekly_scans").select("*").eq("week_label", TARGET_WEEK).execute()
if not r.data:
    print(f"Row {TARGET_WEEK} not found."); exit(1)
row = r.data[0]
payload = json.loads(row["stocks_json"])
stocks = payload.get("stocks", payload) if isinstance(payload, dict) else payload
print(f"Found {len(stocks)} stocks.\n")


# ---- Baseline data (float, short, 52W) for ALL 20 ----
print(f"Fetching baseline data for all {len(stocks)} stocks...")
baseline_signals = {}
for stock in stocks:
    t = stock["ticker"]
    bsig = {}
    time.sleep(1.2)
    obj = yf.Ticker(t)
    price = stock.get("price", 0)
    high_52w = low_52w = None

    try:
        info = obj.info
        fl = info.get("floatShares") or 0
        if fl:
            bsig["float_m"] = round(fl / 1e6, 1)
        sp = info.get("shortPercentOfFloat") or 0
        if sp:
            bsig["short_pct"] = round(float(sp) * 100, 1)
        high_52w = info.get("fiftyTwoWeekHigh") or None
        low_52w  = info.get("fiftyTwoWeekLow")  or None
    except Exception:
        pass

    if not (high_52w and low_52w):
        try:
            fi = obj.fast_info
            if not high_52w:
                high_52w = getattr(fi, "year_high", None) or getattr(fi, "fifty_two_week_high", None)
            if not low_52w:
                low_52w  = getattr(fi, "year_low", None)  or getattr(fi, "fifty_two_week_low", None)
        except Exception:
            pass

    if not (high_52w and low_52w):
        try:
            h1y = obj.history(period="1y", interval="1d")
            if not h1y.empty:
                high_52w = high_52w or float(h1y["High"].max())
                low_52w  = low_52w  or float(h1y["Low"].min())
        except Exception:
            pass

    if high_52w:
        bsig["high_52w"] = round(float(high_52w), 2)
        if price > 0:
            # Symmetrical with gain_from_52w_low_pct: % the stock needs to GAIN from current
            # price to retest the 52W high. This is the trader's framing — upside potential.
            bsig["gain_to_52w_high_pct"] = round((high_52w - price) / price * 100, 1)
            bsig["dist_from_52w_high_pct"] = round((high_52w - price) / high_52w * 100, 1)
    if low_52w:
        bsig["low_52w"] = round(float(low_52w), 2)
        if price > 0 and low_52w > 0:
            bsig["gain_from_52w_low_pct"] = round((price - low_52w) / low_52w * 100, 1)
    if high_52w and low_52w and high_52w > low_52w and price > 0:
        bsig["pos_in_52w_range_pct"] = round((price - low_52w) / (high_52w - low_52w) * 100, 1)

    baseline_signals[t] = bsig
    print(f"  {t}: float={bsig.get('float_m', 'N/A')}M | 52W=${bsig.get('low_52w', '—')}-${bsig.get('high_52w', '—')}")


# ---- Sector counts for hot-sector bonus ----
sector_counts = {}
for s in stocks:
    sec = s.get("sector") or ""
    if sec:
        sector_counts[sec] = sector_counts.get(sec, 0) + 1


# ---- Top 5 ----
top5 = sorted(stocks, key=lambda s: s.get("change_pct", 0), reverse=True)[:5]
top5_tickers = {s["ticker"] for s in top5}
print(f"\nTop 5: {sorted(top5_tickers)}\n")


# ---- V3 Conviction signals ----
print("Computing V3 Conviction Scores...")
scored_list = []

for stock in top5:
    t = stock["ticker"]
    time.sleep(1.5)
    obj = yf.Ticker(t)
    signals = dict(baseline_signals.get(t) or {})
    plus, minus = [], []
    rejected = False

    # Pull volume_ratio (display + may be referenced)
    try:
        fi = obj.fast_info
        avg_vol = getattr(fi, "three_month_average_volume", None)
        if avg_vol and avg_vol > 0 and stock.get("volume", 0) > 0:
            signals["volume_ratio"] = round(stock["volume"] / (avg_vol * 5), 2)
    except Exception:
        pass

    # Pull 30-day daily history for V3 signals
    try:
        hist = obj.history(period="30d", interval="1d")
    except Exception:
        hist = None

    # Close in range (last 5 days)
    close_loc = None
    if hist is not None and not hist.empty and len(hist) >= 5:
        last5 = hist.tail(5)
        wh = float(last5["High"].max())
        wl = float(last5["Low"].min())
        wc = float(last5["Close"].iloc[-1])
        if wh > wl:
            close_loc = (wc - wl) / (wh - wl) * 100
            signals["close_location_pct"] = round(close_loc, 1)

    # ============ STAGE 1: THE GATE ============
    if close_loc is not None and close_loc < 60:
        rejected = True
        signals["rejected_reason"] = f"Weak close ({close_loc:.0f}% of weekly range)"

    if not rejected:
        # ============ STAGE 2: STRENGTH + WEAKNESS ============
        if close_loc is not None:
            if close_loc >= 90:
                plus.append(("close>90%", 3))
            elif close_loc >= 70:
                plus.append(("close 70-90%", 1))

        # Volume pattern (last 5 days)
        if hist is not None and not hist.empty and len(hist) >= 5:
            vols = hist["Volume"].tail(5).tolist()
            if len(vols) == 5 and all(v > 0 for v in vols):
                fri_vol  = vols[-1]
                week_avg = sum(vols) / 5
                first_half  = sum(vols[:2])
                second_half = sum(vols[2:])

                if week_avg > 0:
                    fri_ratio = fri_vol / week_avg
                    signals["fri_vol_ratio_week"] = round(fri_ratio, 2)
                    if fri_ratio >= 3:
                        plus.append(("Fri vol >3x week avg (institutional)", 2))
                    elif fri_ratio >= 1:
                        plus.append(("Fri vol > week avg", 1))
                    elif fri_ratio < 0.5:
                        minus.append(("Fri vol <50% week avg (climax)", -2))

                if second_half > first_half * 1.2:
                    plus.append(("Volume building thru week", 1))

        # Above 20-day MA
        if hist is not None and not hist.empty and len(hist) >= 20:
            ma20 = float(hist["Close"].tail(20).mean())
            last_close = float(hist["Close"].iloc[-1])
            signals["ma20"] = round(ma20, 2)
            if last_close > ma20:
                plus.append(("Above 20-day MA", 1))

        # 4-week breakout
        if hist is not None and not hist.empty and len(hist) >= 25:
            prior_high = float(hist["High"].iloc[-25:-5].max())
            this_close = float(hist["Close"].iloc[-1])
            if this_close > prior_high:
                plus.append(("Breakout above 4-week high", 1))

        # Earnings within 7 days
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
                    plus.append((f"Earnings in {days_to}d", 1))
                    signals["earnings_in_days"] = days_to
        except Exception:
            pass

        # Hot sector bonus
        sec = stock.get("sector") or ""
        if sec and sector_counts.get(sec, 0) >= 2:
            plus.append((f"Hot sector ({sec}: {sector_counts[sec]} in top 20)", 1))

        # Extension penalty
        gain_low = signals.get("gain_from_52w_low_pct")
        if gain_low is not None:
            if gain_low > 200:
                minus.append(("Overextended (+200% from 52W low)", -2))
            elif gain_low > 100:
                minus.append(("Extended (+100% from 52W low)", -1))

        # Large float penalty
        fm = signals.get("float_m")
        if fm is not None and fm > 500:
            minus.append(("Float > 500M", -1))

    plus_total  = sum(v for _, v in plus)
    minus_total = sum(v for _, v in minus)
    total = 0 if rejected else (plus_total + minus_total)

    catalysts = [f"+{v} {label}" for label, v in plus] + [f"{v} {label}" for label, v in minus]
    signals["score_breakdown"] = {
        "plus":  [(label, v) for label, v in plus],
        "minus": [(label, v) for label, v in minus],
        "plus_total":  plus_total,
        "minus_total": minus_total,
    }
    signals["rejected"] = rejected

    scored_list.append({
        "ticker":         t,
        "rec_score":      round(total, 2),
        "rec_signals":    signals,
        "rec_catalysts":  catalysts[:5],
        "rec_rejected":   rejected,
    })

    status = "REJECTED" if rejected else f"score={total} (+{plus_total}, {minus_total})"
    print(f"  {t}: {status}")


# ---- Decision ----
eligible = [s for s in scored_list if not s["rec_rejected"]]
best_ticker = None
category = "no_pick"
label = "No Pick This Week"
emoji = "⚠️"
gap = 0

if eligible:
    es = sorted(eligible, key=lambda x: x["rec_score"], reverse=True)
    top = es[0]
    gap = top["rec_score"] - (es[1]["rec_score"] if len(es) > 1 else 0)
    if top["rec_score"] >= 5 and gap >= 3:
        category, label, emoji = "pick", "Pick for Next Week", "🔥"
        best_ticker = top["ticker"]
    elif top["rec_score"] >= 3 and gap >= 1.5:
        category, label, emoji = "candidate", "Best Candidate", "✨"
        best_ticker = top["ticker"]
    elif top["rec_score"] >= 1:
        category = "possible"; label = "No clear pick"
    else:
        category = "avoid"; label = "All weak"

print(f"\n{emoji} {label}" + (f": {best_ticker} (score {top['rec_score']}, gap +{gap:.2f})" if best_ticker else ""))


# ---- Write back ----
scored_map = {s["ticker"]: s for s in scored_list}
for s in stocks:
    t = s["ticker"]
    s.pop("themes", None)
    if t in scored_map:
        r = scored_map[t]
        s["rec_score"]      = r["rec_score"]
        s["rec_signals"]    = r["rec_signals"]
        s["rec_catalysts"]  = r["rec_catalysts"]
        s["rec_rejected"]   = r["rec_rejected"]
        s["recommended"]    = (t == best_ticker)
        s["rec_category"]   = "rejected" if r["rec_rejected"] else (
            category if t == best_ticker else (
                "possible" if r["rec_score"] >= 1 else "avoid"
            )
        )
        s["rec_gap"]        = round(gap, 2)
        s["rec_decision"]   = {"category": category, "label": label, "emoji": emoji}
    else:
        s["rec_score"]      = 0
        s["rec_signals"]    = baseline_signals.get(t, {})
        s["rec_catalysts"]  = []
        s["rec_rejected"]   = False
        s["recommended"]    = False

payload["stocks"] = stocks
supabase.table("weekly_scans").update({
    "stocks_json": json.dumps(payload)
}).eq("week_label", TARGET_WEEK).execute()

print("\nDone. Supabase updated with V3 Conviction scores.")
