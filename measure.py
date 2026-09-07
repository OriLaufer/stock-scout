#!/usr/bin/env python3
"""MEASURE THE PICKS — the half of the system that was missing.

Every week the scanner produces a ranked list and an argument for why each name
is on it. Nothing ever checked whether the argument was right. The entry gates
are the one exception: they were measured against 109 real forward returns, and
that measurement is the only reason we stopped buying at +100%.

This does the same for everything else. It fills in what each pick actually did
after 4, 12 and 26 weeks, and then asks the question the system cannot answer
today: WHICH PART of the score did the work?

    python measure.py --backfill   # build history from past scans (run once)
    python measure.py              # fill forward returns for anything ripe
    python measure.py --analyse    # which components predicted returns

Requires sql/picks_log.sql to have been run once in Supabase.
"""
import os
import sys
import json
import argparse
import statistics
from datetime import datetime, timedelta, timezone

import pandas as pd
import yfinance as yf
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"]
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Components to test, and the raw facts worth testing on their own. The point of
# separating them is that a component can score well and still predict nothing.
COMPONENTS = ["s_entry", "s_leadership", "s_theme", "s_structure", "s_climb",
              "s_confirmation", "s_business", "s_analyst", "s_room", "conviction"]
RAW_FACTS = ["pct_above_50dma", "rs_vs_spy_6mo", "ret_6mo_at_pick", "rs_score",
             "rev_yoy_pct", "gross_margin_pct", "operating_margin_pct",
             "runway_quarters", "analyst_count", "target_upside_pct",
             "short_pct", "legs", "market_cap"]

HE = {"s_entry": "נקודת כניסה", "s_leadership": "הובלה מול השוק", "s_theme": "תמה",
      "s_structure": "מבנה העלייה", "s_climb": "איכות הטיפוס",
      "s_confirmation": "אישור מעדשות", "s_business": "העסק",
      "s_analyst": "יעד אנליסטים", "s_room": "מקום לרוץ", "conviction": "הציון הכולל",
      "pct_above_50dma": "% מעל ממוצע 50", "rs_vs_spy_6mo": "עודף מול השוק",
      "rev_yoy_pct": "צמיחת הכנסות", "gross_margin_pct": "מרווח גולמי",
      "operating_margin_pct": "מרווח תפעולי", "runway_quarters": "מסלול מזומנים",
      "analyst_count": "מס' אנליסטים", "target_upside_pct": "מרווח ליעד",
      "short_pct": "% בשורט", "legs": "מס' לגים", "market_cap": "שווי שוק",
      "rs_score": "ציון כוכב עולה", "ret_6mo_at_pick": "תשואת 6 חודשים בכניסה"}


# ------------------------------------------------------------------ backfill
def backfill():
    """Rebuild picks_log from the shortlists already sitting in weekly_scans.

    Thirty weeks of picks are already stored — they just were not stored in a
    shape anything could measure. Reading them back means we can start asking
    the question NOW instead of in three months."""
    try:
        r = (supabase.table("weekly_scans")
             .select("week_label,created_at,stocks_json")
             .order("created_at", desc=False).limit(200).execute())
    except Exception as e:
        print(f"read failed: {type(e).__name__}: {e}")
        return 1

    # THREE SOURCES, IN ORDER OF HOW MUCH THEY KNOW.
    #
    # The shortlist carries every score component but only exists in the newest
    # scan; entry_zone in three. Rising Stars is in EVERY scan going back months,
    # and while it lacks the conviction breakdown it has the two things that
    # matter most — a ticker and the price we saw it at. That is enough to ask
    # "did our picks make money", which is the question that produced the -89.5%
    # finding in the first place, and it can be answered today instead of in
    # December. Richest source wins per ticker per week; the rest fill the gaps.
    SOURCES = [("shortlist", "shortlist"),
               ("entry_zone", "entry_zone"),
               ("rising_stars", "rising_stars")]

    rows, weeks, claimed = [], 0, set()
    for scan in (r.data or []):
        try:
            payload = json.loads(scan["stocks_json"])   # tolerant of legacy NaN
        except Exception:
            continue
        picks, counted = [], False
        for key, label in SOURCES:
            for p in (payload.get(key) or []):
                t = p.get("ticker")
                if not t or not p.get("price"):
                    continue
                if (t, scan["week_label"]) in claimed:
                    continue
                claimed.add((t, scan["week_label"]))
                picks.append((p, label))
                counted = True
        if counted:
            weeks += 1
        if not picks:
            continue
        pick_date = (scan.get("created_at") or "")[:10] or None
        for i, (p, source) in enumerate(picks[:60], 1):
            b = p.get("business") or {}
            st = p.get("structure") or {}
            th = p.get("theme") or {}
            cb = p.get("conviction_breakdown") or {}
            plan = p.get("plan") or {}
            thesis = plan.get("thesis_plan") or {}
            rows.append({
                "id": f"{p['ticker']}-{scan['week_label']}",
                "ticker": p["ticker"], "week_label": scan["week_label"],
                "source": source,
                "pick_date": pick_date, "rank_in_week": i,
                "price": p.get("price"), "market_cap": p.get("market_cap"),
                "sector": p.get("sector"), "industry": p.get("industry"),
                "name": (p.get("name") or "")[:120],
                "conviction": p.get("conviction"),
                "rs_score": p.get("rs_score"),
                "ret_6mo_at_pick": p.get("ret_6mo"),
                "s_entry": cb.get("entry"), "s_leadership": cb.get("leadership"),
                "s_theme": cb.get("theme"), "s_structure": cb.get("structure"),
                "s_climb": cb.get("climb"), "s_confirmation": cb.get("confirmation"),
                "s_business": cb.get("business"), "s_analyst": cb.get("analyst_bonus"),
                "s_room": cb.get("room"),
                "pct_above_50dma": p.get("pct_above_50dma"),
                "pct_above_200dma": p.get("pct_above_200dma"),
                "rs_vs_spy_6mo": p.get("rs_vs_spy_6mo"),
                "rev_yoy_pct": b.get("rev_yoy_pct"), "rev_qoq_pct": b.get("rev_qoq_pct"),
                "gross_margin_pct": b.get("gross_margin_pct"),
                "operating_margin_pct": b.get("operating_margin_pct"),
                "runway_quarters": b.get("runway_quarters"),
                "self_funding": b.get("self_funding"),
                "analyst_count": p.get("analyst_count"),
                "target_upside_pct": p.get("target_upside_pct"),
                "short_pct": p.get("short_pct"),
                "legs": st.get("legs"), "higher_lows": st.get("higher_lows"),
                "structure_position": st.get("position"),
                "theme_industry": th.get("industry"),
                "theme_trajectory": th.get("trajectory"),
                "theme_members": th.get("member_count"),
                "stop_price": plan.get("stop_price"),
                "thesis_stop_price": thesis.get("stop_price"),
                "target_1": plan.get("target_1"), "target_2": plan.get("target_2"),
            })

    if not rows:
        print("nothing to backfill")
        return 0
    seen, uniq = set(), []
    for row in rows:                       # keep the earliest sighting of each
        if row["id"] in seen:
            continue
        seen.add(row["id"]); uniq.append(row)

    ok = 0
    for i in range(0, len(uniq), 200):
        chunk = uniq[i:i + 200]
        try:
            supabase.table("picks_log").upsert(chunk).execute()
            ok += len(chunk)
        except Exception as e:
            print(f"  chunk {i//200} failed: {type(e).__name__}: {e}")
    print(f"backfilled {ok} picks from {weeks} weekly scans")
    return 0


# ------------------------------------------------------------------ measure
def measure():
    """Fill in what actually happened after each pick."""
    try:
        r = (supabase.table("picks_log")
             .select("*").is_("measured_at", "null")
             .order("pick_date", desc=False).limit(2000).execute())
    except Exception as e:
        print(f"read failed: {type(e).__name__}: {e}")
        return 1
    pending = [x for x in (r.data or []) if x.get("pick_date") and x.get("price")]
    if not pending:
        print("nothing pending")
        return 0

    today = datetime.now(timezone.utc).date()
    ripe = [p for p in pending
            if (today - datetime.fromisoformat(p["pick_date"]).date()).days >= 28]
    print(f"{len(pending)} unmeasured, {len(ripe)} old enough (28d+) to measure")
    if not ripe:
        return 0

    by_ticker = {}
    for p in ripe:
        by_ticker.setdefault(p["ticker"], []).append(p)
    tickers = sorted(by_ticker)
    earliest = min(datetime.fromisoformat(p["pick_date"]).date() for p in ripe)

    print(f"downloading {len(tickers)} tickers from {earliest}...")
    try:
        raw = yf.download(tickers, start=earliest - timedelta(days=5),
                          end=today + timedelta(days=1), progress=False,
                          auto_adjust=True, group_by="ticker", threads=True)
    except Exception as e:
        print(f"download failed: {type(e).__name__}: {e}")
        return 1

    updates = []
    for t in tickers:
        try:
            df = raw[t] if len(tickers) > 1 else raw
            closes = df["Close"].dropna()
            if closes.empty:
                continue
        except Exception:
            continue

        for p in by_ticker[t]:
            d0 = datetime.fromisoformat(p["pick_date"]).date()
            fwd = closes[closes.index.normalize() >= pd.Timestamp(d0)]
            if len(fwd) < 5:
                continue
            entry = float(p["price"])
            age_days = (today - d0).days

            def at_week(w):
                seg = fwd[fwd.index.normalize() <= pd.Timestamp(d0 + timedelta(weeks=w))]
                return float(seg.iloc[-1]) if len(seg) else None

            u = {"id": p["id"], "measured_at": datetime.now(timezone.utc).isoformat()}
            for w, key in ((4, "4w"), (12, "12w"), (26, "26w")):
                if age_days >= w * 7:
                    px = at_week(w)
                    if px:
                        u[f"px_{key}"] = round(px, 4)
                        u[f"ret_{key}"] = round((px - entry) / entry * 100, 2)

            # Path, not just endpoints: a pick that doubled and gave it all back
            # is a different lesson from one that ground upward.
            path = fwd[fwd.index.normalize() <= pd.Timestamp(d0 + timedelta(weeks=12))]
            if len(path) >= 5:
                hi, lo = float(path.max()), float(path.min())
                u["max_gain_12w"] = round((hi - entry) / entry * 100, 2)
                u["max_drawdown_12w"] = round((lo - entry) / entry * 100, 2)
                if p.get("stop_price"):
                    u["stop_hit_12w"] = bool(lo <= float(p["stop_price"]))
                if p.get("thesis_stop_price"):
                    u["thesis_stop_hit_12w"] = bool(lo <= float(p["thesis_stop_price"]))

            # Only mark measured once the 12-week window is genuinely complete,
            # so a half-finished row is never treated as a finished result.
            if age_days < 84:
                u.pop("measured_at")
            updates.append(u)

    ok = 0
    for i in range(0, len(updates), 100):
        chunk = updates[i:i + 100]
        for u in chunk:
            try:
                supabase.table("picks_log").update(
                    {k: v for k, v in u.items() if k != "id"}).eq("id", u["id"]).execute()
                ok += 1
            except Exception as e:
                print(f"  {u['id']}: {type(e).__name__}")
    print(f"updated {ok} rows")
    return 0


# ------------------------------------------------------------------ analyse
def _split_test(rows, field, ret_key):
    """Median split: did the top half of this field beat the bottom half?"""
    vals = [(r[field], r[ret_key]) for r in rows
            if r.get(field) is not None and r.get(ret_key) is not None]
    if len(vals) < 12:
        return None
    vals.sort(key=lambda x: x[0])
    mid = len(vals) // 2
    lo = [v[1] for v in vals[:mid]]
    hi = [v[1] for v in vals[-mid:]]
    if not lo or not hi:
        return None
    return {
        "n": len(vals),
        "lo_mean": statistics.mean(lo), "hi_mean": statistics.mean(hi),
        "lo_med": statistics.median(lo), "hi_med": statistics.median(hi),
        "spread": statistics.mean(hi) - statistics.mean(lo),
        "hi_winrate": 100.0 * sum(1 for x in hi if x > 0) / len(hi),
        "lo_winrate": 100.0 * sum(1 for x in lo if x > 0) / len(lo),
    }


def analyse(ret_key="ret_12w"):
    try:
        r = supabase.table("picks_log").select("*").limit(5000).execute()
    except Exception as e:
        print(f"read failed: {type(e).__name__}: {e}")
        return 1
    rows = [x for x in (r.data or []) if x.get(ret_key) is not None]
    if len(rows) < 12:
        print(f"only {len(rows)} measured picks with {ret_key} — "
              f"too few to conclude anything. Run --backfill and --measure first, "
              f"or wait for more weeks to ripen.")
        return 0

    rets = [x[ret_key] for x in rows]
    print("=" * 78)
    print(f"WHAT ACTUALLY HAPPENED — {len(rows)} picks measured at {ret_key}")
    print("=" * 78)
    print(f"  mean {statistics.mean(rets):+.1f}%   median {statistics.median(rets):+.1f}%   "
          f"win rate {100*sum(1 for x in rets if x>0)/len(rets):.0f}%")
    best = sorted(rows, key=lambda x: -x[ret_key])[:5]
    worst = sorted(rows, key=lambda x: x[ret_key])[:5]
    print("  best:  " + ", ".join(f"{x['ticker']} {x[ret_key]:+.0f}%" for x in best))
    print("  worst: " + ", ".join(f"{x['ticker']} {x[ret_key]:+.0f}%" for x in worst))

    # The lists know different amounts, so never average them together silently.
    by_src = {}
    for x in rows:
        by_src.setdefault(x.get("source") or "?", []).append(x[ret_key])
    if len(by_src) > 1:
        print("\n  by list:")
        for s, v in sorted(by_src.items(), key=lambda kv: -len(kv[1])):
            print(f"    {s:<14} n={len(v):<5} mean {statistics.mean(v):+6.1f}%  "
                  f"median {statistics.median(v):+6.1f}%  "
                  f"win {100*sum(1 for x in v if x>0)/len(v):.0f}%")

    # The entry-quality lesson, re-tested on whatever data we now have: the
    # -89.5% bucket is the reason the gates exist, so keep checking it holds.
    buckets = [("<20%", -1e9, 20), ("20-50%", 20, 50), ("50-80%", 50, 80),
               ("80-150%", 80, 150), (">150%", 150, 1e9)]
    have = [x for x in rows if x.get("ret_6mo_at_pick") is not None]
    if len(have) >= 20:
        print("\n  by how far it had ALREADY run when we picked it (6-month return):")
        for label, lo, hi in buckets:
            v = [x[ret_key] for x in have if lo <= x["ret_6mo_at_pick"] < hi]
            if len(v) >= 5:
                print(f"    already up {label:<9} n={len(v):<5} → mean {statistics.mean(v):+6.1f}%")

    for title, fields in (("SCORE COMPONENTS", COMPONENTS), ("RAW FACTS", RAW_FACTS)):
        print(f"\n{title} — top half vs bottom half of each")
        print(f"  {'':<22}{'n':>5}{'bottom':>9}{'top':>9}{'spread':>9}   verdict")
        results = []
        for f in fields:
            t = _split_test(rows, f, ret_key)
            if t:
                results.append((f, t))
        for f, t in sorted(results, key=lambda x: -x[1]["spread"]):
            # With samples this small a spread inside a few points is noise; say so
            # rather than dressing it up as a finding.
            v = ("מנבא" if t["spread"] >= 8 else
                 "אולי" if t["spread"] >= 3 else
                 "לא מנבא" if abs(t["spread"]) < 3 else "הפוך!")
            print(f"  {HE.get(f, f):<22}{t['n']:>5}{t['lo_mean']:>+8.1f}%"
                  f"{t['hi_mean']:>+8.1f}%{t['spread']:>+8.1f}%   {v}")

    # Did the stops help or hurt? The whole reason they exist is the -33%.
    hit = [x for x in rows if x.get("stop_hit_12w") is True]
    miss = [x for x in rows if x.get("stop_hit_12w") is False]
    if len(hit) >= 5 and len(miss) >= 5:
        print(f"\nSTOPS — did they cut losers or winners?")
        print(f"  hit the stop within 12w:  n={len(hit):<4} mean {statistics.mean([x[ret_key] for x in hit]):+.1f}%")
        print(f"  never hit the stop:       n={len(miss):<4} mean {statistics.mean([x[ret_key] for x in miss]):+.1f}%")

    print(f"\n{'-'*78}\nNOTE: with {len(rows)} samples nothing here is statistically strong. "
          f"Treat a spread\nunder ~8 points as noise, and re-run as more weeks ripen.")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", action="store_true", help="populate from past scans")
    ap.add_argument("--analyse", action="store_true", help="which components predicted returns")
    ap.add_argument("--horizon", default="ret_12w", choices=["ret_4w", "ret_12w", "ret_26w"])
    args = ap.parse_args()

    if args.backfill:
        return backfill()
    if args.analyse:
        return analyse(args.horizon)
    return measure()


if __name__ == "__main__":
    sys.exit(main())
