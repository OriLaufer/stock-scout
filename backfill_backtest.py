"""
Backfill real backtest data for all existing scans.
For each scan, fetches actual next-week price performance of the top 5 picks using yfinance.
Run once; scanner.py handles new scans going forward automatically.
"""
import os
import json
import re
import time
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def parse_week_end(label):
    m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", label)
    if not m:
        return None
    return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))


def fetch_week_change(ticker, start_friday, end_friday):
    """Actual % change from start_friday close to end_friday close.
    Uses Ticker.history() — always returns clean single-level DataFrame."""
    try:
        hist = yf.Ticker(ticker).history(
            start=(start_friday - timedelta(days=4)).strftime("%Y-%m-%d"),
            end=(end_friday + timedelta(days=1)).strftime("%Y-%m-%d"),
        )
        if hist.empty or "Close" not in hist.columns:
            return None

        closes = hist["Close"].dropna()

        # history() index is timezone-aware — strip tz for comparison
        if closes.index.tz is not None:
            idx_norm = closes.index.tz_localize(None).normalize()
        else:
            idx_norm = closes.index.normalize()

        def on_or_before(target):
            ts = pd.Timestamp(target.date())
            valid = closes[idx_norm <= ts]
            if len(valid) == 0:
                return None
            val = valid.iloc[-1]
            # Guard against Series (shouldn't happen with history(), but be safe)
            return float(val.iloc[0]) if hasattr(val, 'iloc') else float(val)

        start_close = on_or_before(start_friday)
        end_close   = on_or_before(end_friday)
        if not start_close or not end_close or start_close <= 0:
            return None
        return round((end_close - start_close) / start_close * 100, 2)
    except Exception as e:
        print(f"    yfinance error {ticker}: {e}")
        return None


def main():
    print("=" * 55)
    print("BACKFILL BACKTEST — fetching real next-week prices")
    print("=" * 55)

    r = supabase.table("weekly_scans").select("*").order("created_at", desc=False).execute()
    all_rows = r.data or []
    print(f"Raw rows from Supabase: {len(all_rows)}")
    if all_rows:
        print(f"Row keys: {list(all_rows[0].keys())}")

    # Parse + deduplicate (keep earliest row per week_label)
    processed = []
    seen = set()
    for row in all_rows:
        label = row["week_label"]
        if label in seen:
            continue
        seen.add(label)
        try:
            parsed = json.loads(row["stocks_json"])
            stocks = parsed.get("stocks", parsed) if isinstance(parsed, dict) else parsed
            already_has = bool(parsed.get("backtest")) if isinstance(parsed, dict) else False
            processed.append({
                "week_label":   label,
                "week_end":     parse_week_end(label),
                "stocks":       stocks,
                "parsed":       parsed if isinstance(parsed, dict) else {"stocks": stocks},
                "already_done": already_has,
            })
            status = "✓ has backtest" if already_has else "  needs backtest"
            print(f"  {label}  {status}")
        except Exception as e:
            print(f"  Parse error {label}: {e}")

    processed.sort(key=lambda s: s["week_end"] or datetime(2000, 1, 1))
    print(f"Found {len(processed)} unique scans\n")

    updated = 0
    skipped = 0
    all_entries = []

    for i in range(len(processed) - 1):
        this = processed[i]
        nxt  = processed[i + 1]

        # Skip if already backfilled
        if this["already_done"]:
            print(f"SKIP {this['week_label']} — backtest already present")
            skipped += 1
            continue

        this_end = this["week_end"]
        next_end = nxt["week_end"]
        if not this_end or not next_end:
            print(f"SKIP {this['week_label']} — could not parse dates")
            skipped += 1
            continue

        print(f"\n[{i+1}/{len(processed)-1}] {this['week_label']}  →  {nxt['week_label']}")

        top5 = sorted(this["stocks"], key=lambda s: s.get("change_pct", 0), reverse=True)[:5]
        picks = []

        for s in top5:
            ticker = s["ticker"]
            actual = fetch_week_change(ticker, this_end, next_end)
            sign   = f"{actual:+.2f}%" if actual is not None else "N/A"
            print(f"  {ticker:8s}  selected +{s.get('change_pct',0):.2f}%  →  next week: {sign}")
            picks.append({
                "ticker":      ticker,
                "prev_gain":   round(s.get("change_pct", 0), 2),
                "actual_gain": actual,
            })
            time.sleep(0.3)  # gentle rate limit

        valid = [p for p in picks if p["actual_gain"] is not None]
        if not valid:
            print("  No valid price data — skipping")
            skipped += 1
            continue

        wins    = sum(1 for p in valid if p["actual_gain"] > 0)
        avg     = round(sum(p["actual_gain"] for p in valid) / len(valid), 2)
        bt_entry = {
            "week":      this["week_label"],
            "picks":     picks,
            "wins":      wins,
            "total":     len(valid),
            "avg_gain":  avg,
        }
        print(f"  ✓ {wins}/{len(valid)} wins  |  avg {avg:+.2f}%")

        all_entries.append(bt_entry)
        updated += 1

    # Save ALL backtest weeks as a single record in ticker_buzz table
    # Uses existing table — no new schema needed
    if all_entries:
        try:
            resp = supabase.table("ticker_buzz").upsert({
                "ticker":     "__BACKTEST__",
                "buzz_json":  json.dumps(all_entries),
                "updated_at": datetime.utcnow().isoformat(),
            }).execute()
            rows = len(resp.data) if resp.data else 0
            print(f"\nSaved {len(all_entries)} weeks to ticker_buzz.__BACKTEST__ ({rows} row affected)")
        except Exception as e:
            print(f"\nSupabase save error: {e}")
    else:
        print("\nNo entries to save.")

    print(f"\n{'='*55}")
    print(f"Done — {updated} weeks computed, {skipped} skipped")
    print(f"{'='*55}")


if __name__ == "__main__":
    main()
