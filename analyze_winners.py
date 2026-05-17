"""
Forensic analysis: for each historical week's top 5 picks,
find the actual next-week winner and compare its signals
against the 4 losers'. Identifies WHICH signals discriminate.

Output:
  - Per-week table showing all 5 with signals + marking the winner
  - Aggregate summary: avg/median for each signal, winners vs losers
"""
import os
import json
import re
import time
import statistics
import yfinance as yf
from datetime import datetime, timedelta
from supabase import create_client

supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])


def parse_week_end(label):
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", label)
    if not m:
        return datetime(2000, 1, 1)
    return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))


def get_signals_at_selection(ticker, sel_end):
    """Fetch signals that were true at the END of selection week.
    sel_end is the Friday close of the selection week."""
    sel_start = sel_end - timedelta(days=7)
    try:
        obj = yf.Ticker(ticker)
        time.sleep(0.6)
        # Daily OHLCV of the selection week (with buffer)
        hist = obj.history(
            start=(sel_start - timedelta(days=3)).strftime("%Y-%m-%d"),
            end=(sel_end + timedelta(days=2)).strftime("%Y-%m-%d"),
            interval="1d",
        )
        if hist.empty:
            return None

        sig = {}
        # --- Weekly close location ---
        wh = float(hist["High"].max())
        wl = float(hist["Low"].min())
        wc = float(hist["Close"].iloc[-1])
        rng = wh - wl
        if rng > 0:
            sig["close_loc"] = round((wc - wl) / rng * 100, 1)

        # --- Friday volume vs week avg ---
        if len(hist) >= 3:
            avg_vol = float(hist["Volume"].iloc[:-1].mean())
            fri_vol = float(hist["Volume"].iloc[-1])
            if avg_vol > 0:
                sig["fri_vol_ratio"] = round(fri_vol / avg_vol, 2)

        # --- Daily momentum trajectory (rising or fading?) ---
        if len(hist) >= 4:
            closes = hist["Close"].iloc[-4:].tolist()
            # Is each day higher than previous?
            rising_days = sum(1 for i in range(1, len(closes)) if closes[i] > closes[i-1])
            sig["rising_days"] = rising_days  # 0-3

        # --- fast_info: 52W high, avg volume ---
        try:
            fi = obj.fast_info
            high_52w = getattr(fi, "fifty_two_week_high", None)
            if high_52w and wc > 0:
                sig["dist_52w_pct"] = round((high_52w - wc) / high_52w * 100, 1)
            avg_3m = getattr(fi, "three_month_average_volume", None)
            if avg_3m and avg_3m > 0:
                week_vol = float(hist["Volume"].sum())
                sig["vol_ratio_3m"] = round(week_vol / (avg_3m * 5), 2)
        except Exception:
            pass

        # --- .info: float, short, sector ---
        try:
            info = obj.info
            float_shares = info.get("floatShares") or 0
            if float_shares:
                sig["float_m"] = round(float_shares / 1e6, 1)
            short_pct = info.get("shortPercentOfFloat") or 0
            if short_pct:
                sig["short_pct"] = round(float(short_pct) * 100, 1)
            d2c = info.get("shortRatio") or 0
            if d2c:
                sig["days_to_cover"] = round(d2c, 1)
            sig["sector"] = info.get("sector") or ""
        except Exception:
            pass

        return sig
    except Exception as e:
        print(f"    Error for {ticker}: {type(e).__name__}")
        return None


def get_next_week_change(ticker, sel_end, next_end):
    """Compute % change from sel_end Friday close to next_end Friday close."""
    try:
        obj = yf.Ticker(ticker)
        time.sleep(0.4)
        h = obj.history(
            start=(sel_end - timedelta(days=2)).strftime("%Y-%m-%d"),
            end=(next_end + timedelta(days=2)).strftime("%Y-%m-%d"),
        )
        if len(h) < 2:
            return None
        start_p = float(h["Close"].iloc[0])
        end_p = float(h["Close"].iloc[-1])
        if start_p > 0:
            return round((end_p - start_p) / start_p * 100, 2)
    except Exception:
        pass
    return None


# ============== LOAD SCANS ==============
print("Loading scans from Supabase...")
r = supabase.table("weekly_scans").select("*").execute()
scans = []
seen_labels = set()
for row in r.data:
    label = row["week_label"]
    if label in seen_labels:
        continue
    seen_labels.add(label)
    try:
        payload = json.loads(row["stocks_json"])
        stocks = payload.get("stocks", payload) if isinstance(payload, dict) else payload
        scans.append({"label": label, "stocks": stocks})
    except Exception:
        continue

scans.sort(key=lambda s: parse_week_end(s["label"]))
print(f"Loaded {len(scans)} unique scans\n")

if len(scans) < 2:
    print("Need at least 2 scans to analyze.")
    exit(0)

# ============== ANALYZE EACH PAIR ==============
all_records = []
for i in range(len(scans) - 1):
    sel = scans[i]
    nxt = scans[i + 1]
    sel_end = parse_week_end(sel["label"])
    nxt_end = parse_week_end(nxt["label"])

    # Skip if not exactly 7 days apart (gaps in data)
    gap = (nxt_end - sel_end).days
    if gap < 5 or gap > 10:
        print(f"Skipping {sel['label']} → {nxt['label']} (gap {gap} days)")
        continue

    top5 = sorted(sel["stocks"], key=lambda s: s.get("change_pct", 0), reverse=True)[:5]
    if len(top5) < 5:
        continue

    print(f"\n=== {sel['label']} → {nxt['label']} ===")

    # Get next-week performance for each
    perf = []
    for s in top5:
        t = s["ticker"]
        npc = get_next_week_change(t, sel_end, nxt_end)
        if npc is None:
            npc = 0
        perf.append({"ticker": t, "next_pct": npc, "stock": s})

    winner = max(perf, key=lambda x: x["next_pct"])

    # Get signals for each
    print(f"{'':2} {'TICKER':7} {'NEXT':>8} {'CLOSE_LOC':>10} {'FRI_VOL':>8} {'RISE':>5} {'52W':>6} {'VOL3M':>6} {'FLOAT_M':>8} {'SHORT':>6} {'D2C':>5} SECTOR")
    print("-" * 110)
    for p in perf:
        sig = get_signals_at_selection(p["ticker"], sel_end) or {}
        is_winner = (p["ticker"] == winner["ticker"])
        marker = "★" if is_winner else " "
        print(
            f" {marker} {p['ticker']:7} {p['next_pct']:+7.2f}% "
            f"{sig.get('close_loc', 0):>9}% "
            f"{sig.get('fri_vol_ratio', 0):>7} "
            f"{sig.get('rising_days', 0):>5} "
            f"{sig.get('dist_52w_pct', 0):>5}% "
            f"{sig.get('vol_ratio_3m', 0):>6} "
            f"{sig.get('float_m', 0):>8} "
            f"{sig.get('short_pct', 0):>5}% "
            f"{sig.get('days_to_cover', 0):>5} "
            f"{sig.get('sector', '')[:18]}"
        )
        all_records.append({
            "week": sel["label"],
            "ticker": p["ticker"],
            "is_winner": is_winner,
            "next_pct": p["next_pct"],
            "signals": sig,
        })


# ============== AGGREGATE PATTERNS ==============
print("\n\n" + "=" * 70)
print("PATTERN ANALYSIS: Winners vs Losers")
print("=" * 70)

winners = [r for r in all_records if r["is_winner"]]
losers  = [r for r in all_records if not r["is_winner"]]

print(f"\nTotal weeks analyzed: {len(winners)}")
print(f"Winners: {len(winners)} | Losers: {len(losers)}\n")

SIGNALS_TO_COMPARE = [
    "close_loc", "fri_vol_ratio", "rising_days", "dist_52w_pct",
    "vol_ratio_3m", "float_m", "short_pct", "days_to_cover",
]

print(f"{'SIGNAL':22} {'WIN_AVG':>10} {'WIN_MED':>10} {'LOS_AVG':>10} {'LOS_MED':>10} {'DELTA':>10} {'DIRECTION'}")
print("-" * 95)
for sig in SIGNALS_TO_COMPARE:
    w_vals = [r["signals"].get(sig) for r in winners if r["signals"].get(sig) not in (None, 0)]
    l_vals = [r["signals"].get(sig) for r in losers  if r["signals"].get(sig) not in (None, 0)]
    if len(w_vals) < 2 or len(l_vals) < 4:
        print(f"  {sig:20} insufficient data (w={len(w_vals)}, l={len(l_vals)})")
        continue
    w_avg = statistics.mean(w_vals)
    w_med = statistics.median(w_vals)
    l_avg = statistics.mean(l_vals)
    l_med = statistics.median(l_vals)
    delta = w_med - l_med
    direction = "↑ winners higher" if delta > 0 else "↓ winners lower" if delta < 0 else "="
    print(f"  {sig:20} {w_avg:>9.1f} {w_med:>9.1f}  {l_avg:>9.1f} {l_med:>9.1f}  {delta:>+9.1f}  {direction}")

# Sector distribution
print("\n\nSECTOR BREAKDOWN OF WINNERS:")
sector_counts = {}
for w in winners:
    sec = w["signals"].get("sector", "Unknown")
    sector_counts[sec] = sector_counts.get(sec, 0) + 1
for sec, cnt in sorted(sector_counts.items(), key=lambda x: -x[1]):
    print(f"  {sec:30} {cnt}")

print("\nDone.")
