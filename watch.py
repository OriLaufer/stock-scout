#!/usr/bin/env python3
"""THE WATCHMAN — checks what we actually OWN, every trading day.

Everything else in this system answers "what should we buy?". Nothing answered
"what is happening to what we already bought?", and that is the gap that cost us
33%: the picks were not the problem, the absence of an exit was. Every report
prints a stop level and then nobody ever looks at it again.

This runs daily, reads the open positions out of the shared journal, recomputes
the SAME levels the scanner publishes (same function, so they can never drift
apart), and emails ONLY when something actually happened. Silence means nothing
happened — which is the normal case and should not fill an inbox.

What counts as something happening:
    thesis broken   - closed under the 200-day average. The reason to hold is gone.
    stop breached   - closed under the mechanical 2xATR stop.
    invalidated     - closed under the 50-day average, which is the whole premise.
    target reached  - hit the computed 2R or 4R level.
    violent day     - a move large enough that we should know before Monday.
    earnings soon   - a report lands within a week; that is when theses break.

Run:  python watch.py            (uses the shared journal)
      python watch.py --tickers SITM,HNGE,FENC   (ad-hoc, no journal needed)
      python watch.py --dry      (print, never send)
"""
import os
import sys
import json
import argparse
from datetime import datetime, timedelta, timezone

import requests
import pandas as pd
import yfinance as yf
from supabase import create_client

import scanner   # reuse the exact level logic — one source of truth

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"]
RESEND_API_KEY = os.environ["RESEND_API_KEY"]
TO_EMAILS = [e.strip() for e in os.environ.get("WATCH_EMAIL",
                os.environ.get("BOSS_EMAIL", "")).split(",") if e.strip()]
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "https://stock-scout-phi.vercel.app")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


# ---------------------------------------------------------------- positions
def open_positions():
    """Open trades from the shared journal, newest first, de-duplicated.

    The journal is the only place the team records what it actually bought, so
    it is the only honest answer to 'what do we own'. A ticker held more than
    once is averaged into a single position, because the stop applies to the
    holding, not to each purchase."""
    try:
        r = supabase.table("shared_journal").select("data").limit(500).execute()
    except Exception as e:
        print(f"journal read failed: {type(e).__name__}: {e}")
        return []

    agg = {}
    for row in (r.data or []):
        d = row.get("data") or {}
        t = (d.get("ticker") or "").upper().strip()
        px, qty = d.get("entry_price"), d.get("quantity")
        if not t or not px:
            continue
        try:
            px = float(px)
            qty = float(qty or 1)
        except (TypeError, ValueError):
            continue
        if px <= 0 or qty <= 0:
            continue
        a = agg.setdefault(t, {"ticker": t, "name": d.get("name") or t,
                               "cost": 0.0, "qty": 0.0, "entry_date": d.get("entry_date")})
        a["cost"] += px * qty
        a["qty"] += qty
        if d.get("entry_date") and (not a["entry_date"] or d["entry_date"] < a["entry_date"]):
            a["entry_date"] = d["entry_date"]

    out = []
    for a in agg.values():
        a["entry_price"] = round(a["cost"] / a["qty"], 4)
        out.append(a)
    return sorted(out, key=lambda x: x["ticker"])


# ---------------------------------------------------------------- market data
def market_state(tickers):
    """Price, ATR and distance from both moving averages — the inputs _trade_plan
    needs, computed exactly the way the scanner computes them."""
    if not tickers:
        return {}
    end = datetime.now(timezone.utc) + timedelta(days=1)
    start = end - timedelta(days=420)
    try:
        raw = yf.download(tickers, start=start.date(), end=end.date(),
                          progress=False, auto_adjust=True, group_by="ticker",
                          threads=True)
    except Exception as e:
        print(f"price download failed: {type(e).__name__}: {e}")
        return {}

    out = {}
    for t in tickers:
        try:
            df = raw[t] if len(tickers) > 1 else raw
            closes = df["Close"].dropna()
            highs, lows = df["High"].dropna(), df["Low"].dropna()
            if len(closes) < 60:
                continue
            price = float(closes.iloc[-1])
            prev = float(closes.iloc[-2]) if len(closes) >= 2 else price
            ma50 = float(closes.tail(50).mean())
            ma200 = float(closes.tail(200).mean()) if len(closes) >= 200 else None

            tr = pd.concat([highs - lows,
                            (highs - closes.shift()).abs(),
                            (lows - closes.shift()).abs()], axis=1).max(axis=1)
            atr = float(tr.tail(14).mean())

            hi_6mo = float(closes.tail(126).max())
            out[t] = {
                "ticker": t, "price": round(price, 2),
                "day_pct": round((price - prev) / prev * 100, 2) if prev else 0.0,
                "atr14": atr,
                "ma50": ma50, "ma200": ma200,
                "pct_above_50dma": round((price - ma50) / ma50 * 100, 1),
                "pct_above_200dma": (round((price - ma200) / ma200 * 100, 1)
                                     if ma200 else None),
                "pct_off_6mo_high": round((price - hi_6mo) / hi_6mo * 100, 1),
                "week_pct": (round((price - float(closes.iloc[-6])) / float(closes.iloc[-6]) * 100, 1)
                             if len(closes) >= 6 else None),
            }
        except Exception:
            continue
    return out


def next_earnings(ticker):
    """Days until the next scheduled report, when Yahoo knows one."""
    try:
        cal = yf.Ticker(ticker).calendar
        dates = None
        if isinstance(cal, dict):
            dates = cal.get("Earnings Date")
        elif cal is not None and not cal.empty and "Earnings Date" in cal.index:
            dates = list(cal.loc["Earnings Date"].values)
        if not dates:
            return None
        d = dates[0] if isinstance(dates, (list, tuple)) else dates
        d = pd.Timestamp(d).date()
        return (d - datetime.now(timezone.utc).date()).days
    except Exception:
        return None


# ---------------------------------------------------------------- the check
def assess(pos, st):
    """Compare a held position against its own published levels.

    Severity is deliberately blunt: 'exit' events are the ones that were decided
    in advance and are the entire reason we survive a bad week. Everything else
    is information."""
    events = []
    price = st["price"]
    entry = pos.get("entry_price")
    plan = scanner._trade_plan(st) or {}
    thesis = plan.get("thesis_plan") or {}

    pnl_pct = round((price - entry) / entry * 100, 1) if entry else None

    # --- the levels that were set in advance ---
    t_stop = thesis.get("stop_price")
    if t_stop and price <= t_stop:
        events.append(("exit", f"סגרה מתחת לסטופ התזה (${t_stop:.2f}) — "
                               f"הסיבה להחזיק כבר לא מתקיימת"))
    elif plan.get("stop_price") and price <= plan["stop_price"]:
        events.append(("exit", f"סגרה מתחת לסטופ המחושב (${plan['stop_price']:.2f})"))

    if st.get("ma200") and price < st["ma200"]:
        events.append(("exit", f"מתחת לממוצע 200 יום (${st['ma200']:.2f})"))
    elif st["pct_above_50dma"] < 0:
        events.append(("warn", f"ירדה מתחת לממוצע 50 יום (${st['ma50']:.2f}) — "
                               f"התנאי שבגללו נכנסנו כבר לא מתקיים"))

    # --- the good side, also decided in advance ---
    for key, label in (("target_2", "יעד שני"), ("target_1", "יעד ראשון")):
        lvl = plan.get(key)
        if lvl and price >= lvl:
            events.append(("good", f"הגיעה ל{label} (${lvl:.2f})"))
            break

    # --- things worth knowing before Monday ---
    if st["day_pct"] <= -8:
        events.append(("warn", f"ירידה של {st['day_pct']:.1f}% ביום אחד"))
    elif st["day_pct"] >= 10:
        events.append(("good", f"עלייה של {st['day_pct']:+.1f}% ביום אחד"))

    if st.get("pct_off_6mo_high", -99) >= -1:
        events.append(("good", "בשיא של חצי שנה"))

    days = next_earnings(pos["ticker"])
    if days is not None and 0 <= days <= 7:
        events.append(("warn", f"דוח רבעוני בעוד {days} ימים — "
                               f"זה הרגע שבו תזות נשברות"))

    return {
        "ticker": pos["ticker"], "name": pos.get("name") or pos["ticker"],
        "price": price, "entry": entry, "pnl_pct": pnl_pct,
        "day_pct": st["day_pct"], "week_pct": st.get("week_pct"),
        "ext50": st["pct_above_50dma"], "ext200": st.get("pct_above_200dma"),
        "stop": plan.get("stop_price"), "stop_pct": plan.get("stop_pct"),
        "thesis_stop": t_stop,
        "target_1": plan.get("target_1"), "target_2": plan.get("target_2"),
        "earnings_in": days,
        "events": events,
        "worst": ("exit" if any(s == "exit" for s, _ in events)
                  else "warn" if any(s == "warn" for s, _ in events)
                  else "good" if events else "quiet"),
    }


# ---------------------------------------------------------------- email
SEV = {"exit": ("#7F1D1D", "#FEE2E2", "🔴"),
       "warn": ("#78350F", "#FEF3C7", "🟠"),
       "good": ("#14532D", "#DCFCE7", "🟢")}


def build_email(rows, when):
    live = [r for r in rows if r["events"]]
    exits = [r for r in live if r["worst"] == "exit"]
    head = (f"{len(exits)} פוזיציות חצו רמת יציאה" if exits
            else f"{len(live)} עדכונים בתיק")

    def card(r):
        bits = []
        for sev, text in r["events"]:
            fg, bg, icon = SEV[sev]
            bits.append(
                f'<div style="background:{bg};color:{fg};border-radius:6px;'
                f'padding:8px 12px;margin:5px 0;font-size:14px">{icon} {text}</div>')
        pnl = (f'<span style="color:{"#15803D" if (r["pnl_pct"] or 0) >= 0 else "#B91C1C"};'
               f'font-weight:700">{r["pnl_pct"]:+.1f}%</span>'
               if r["pnl_pct"] is not None else "—")
        lvls = []
        if r["stop"]:
            lvls.append(f'סטופ ${r["stop"]:.2f}')
        if r["thesis_stop"]:
            lvls.append(f'סטופ תזה ${r["thesis_stop"]:.2f}')
        if r["target_1"]:
            lvls.append(f'יעד ${r["target_1"]:.2f}')
        return f"""
        <div style="border:1px solid #E5E7EB;border-radius:10px;padding:16px;margin:12px 0">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <div><b style="font-size:19px">{r['ticker']}</b>
                 <span style="color:#6B7280;font-size:13px">&nbsp;{r['name'][:40]}</span></div>
            <div style="font-size:16px">${r['price']:.2f} &nbsp; {pnl}</div>
          </div>
          {''.join(bits)}
          <div style="color:#6B7280;font-size:12px;margin-top:8px">
            כניסה ${r['entry']:.2f} · {r['ext50']:+.1f}% מעל ממוצע 50 · {' · '.join(lvls)}
          </div>
        </div>"""

    quiet = [r["ticker"] for r in rows if not r["events"]]
    quiet_html = (f'<p style="color:#6B7280;font-size:13px">שקט: {", ".join(quiet)}</p>'
                  if quiet else "")

    return f"""<!doctype html><html dir="rtl"><body style="margin:0;background:#F9FAFB;
      font-family:-apple-system,Segoe UI,Arial,sans-serif;padding:24px">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
        <div style="font-size:12px;color:#6B7280;letter-spacing:.1em">STOCK SCOUT · מעקב תיק</div>
        <h1 style="font-size:22px;margin:8px 0 4px">{head}</h1>
        <div style="color:#6B7280;font-size:13px;margin-bottom:18px">{when}</div>
        {''.join(card(r) for r in live)}
        {quiet_html}
        <div style="border-top:1px solid #E5E7EB;margin-top:20px;padding-top:14px;
                    color:#6B7280;font-size:12px;line-height:1.7">
          הרמות מחושבות מאותו כלל שבדוחות (2×ATR, ממוצעים נעים) —
          <b>הן לא הוראה למכור</b>. מסמך מעקב, לא ייעוץ השקעות.
          <br><a href="{DASHBOARD_URL}" style="color:#2563EB">פתיחת הדשבורד</a>
        </div>
      </div></body></html>"""


def send(subject, html):
    if not TO_EMAILS:
        print("no recipients configured (WATCH_EMAIL / BOSS_EMAIL)")
        return False
    try:
        r = requests.post("https://api.resend.com/emails",
                          headers={"Authorization": f"Bearer {RESEND_API_KEY}",
                                   "Content-Type": "application/json"},
                          json={"from": "Stock Scout <onboarding@resend.dev>",
                                "to": TO_EMAILS, "subject": subject, "html": html},
                          timeout=30)
        ok = r.status_code < 300
        print(f"email {'sent' if ok else 'FAILED'} ({r.status_code}) to {', '.join(TO_EMAILS)}")
        if not ok:
            print(r.text[:400])
        return ok
    except Exception as e:
        print(f"email error: {type(e).__name__}: {e}")
        return False


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", help="comma list, bypasses the journal")
    ap.add_argument("--dry", action="store_true", help="print only, never send")
    args = ap.parse_args()

    if args.tickers:
        positions = [{"ticker": t.strip().upper(), "name": t.strip().upper(),
                      "entry_price": None, "qty": 0}
                     for t in args.tickers.split(",") if t.strip()]
    else:
        positions = open_positions()

    if not positions:
        print("no open positions — nothing to watch")
        return 0

    tickers = [p["ticker"] for p in positions]
    print(f"watching {len(tickers)}: {', '.join(tickers)}")
    state = market_state(tickers)
    if not state:
        print("FATAL: no market data")
        return 1

    rows = []
    for p in positions:
        st = state.get(p["ticker"])
        if not st:
            print(f"  {p['ticker']}: no data")
            continue
        # An ad-hoc ticker has no entry price; treat today's price as the mark so
        # the level checks still run and only the P&L line is blank.
        if p.get("entry_price") is None:
            p["entry_price"] = st["price"]
        r = assess(p, st)
        rows.append(r)
        tags = " | ".join(f"[{s}] {t}" for s, t in r["events"]) or "quiet"
        print(f"  {r['ticker']:<6} ${r['price']:>8.2f}  {r['day_pct']:+6.2f}%  {tags}")

    live = [r for r in rows if r["events"]]
    when = datetime.now(timezone.utc).strftime("%d.%m.%Y")

    # Persist a daily snapshot: this is also the raw material for measuring, later,
    # whether our exit rules actually saved money or only cut winners short.
    try:
        supabase.table("shared_journal").upsert({
            "id": f"watch-{datetime.now(timezone.utc).date()}",
            "data": {"kind": "watch_snapshot", "date": when, "rows": rows},
        }).execute()
    except Exception as e:
        print(f"(snapshot save skipped: {type(e).__name__})")

    if not live:
        print("all quiet — no email sent")
        return 0

    exits = sum(1 for r in live if r["worst"] == "exit")
    subject = (f"🔴 {exits} פוזיציות חצו רמת יציאה" if exits
               else f"מעקב תיק — {len(live)} עדכונים")
    html = build_email(rows, when)
    if args.dry:
        print(f"\n[dry] would send: {subject}")
        return 0
    return 0 if send(subject, html) else 1


if __name__ == "__main__":
    sys.exit(main())
