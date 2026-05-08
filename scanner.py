"""
Stock Scout - Weekly Scanner
- Real weekly % change (Friday-to-Friday close) using yfinance
- Buzz from Reddit (free JSON API) + StockTwits (free API)
- No Apify, no paid APIs
- Saves to Supabase, sends email via Resend
"""

import os
import json
import time
import random
import re
import requests
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from supabase import create_client

# ============== CONFIG ==============
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"]
RESEND_API_KEY = os.environ["RESEND_API_KEY"]
BOSS_EMAIL = os.environ["BOSS_EMAIL"]
MIN_MARKET_CAP = int(os.environ.get("MIN_MARKET_CAP", "500000000"))  # 500M default
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "https://stock-scout-phi.vercel.app")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

EARLY_SIGNAL_KEYWORDS = [
    "unusual volume", "unusual activity", "unusual options",
    "someone knows", "insider", "big calls", "calls printing",
    "why is", "what happened", "what's happening",
    "takeover", "merger", "buyout", "acquisition", "rumor",
    "catalyst", "breakout", "squeeze", "short squeeze",
    "upgrade", "downgrade", "fda", "approval", "contract",
    "partnership", "deal", "earnings", "beat", "guidance",
    "moving", "spiking", "running", "pumping", "ripping",
]


# ============== UTILITIES ==============
def clean_text(text, max_len=140):
    if not text:
        return ""
    text = re.sub(r"http\S+|www\.\S+|\[\S+?\]\(\S+?\)", "", text)
    text = re.sub(r"[*#\[\]\\]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_len:
        text = text[: max_len - 3] + "..."
    return text


def get_two_fridays():
    """Return the two most recent Fridays as datetime objects.
    - this_friday  = most recent Friday (could be today if today is Friday)
    - prev_friday  = the Friday before that (7 days earlier)
    
    Example: run on Sunday 11.05 → this_friday=09.05, prev_friday=02.05
    Example: run on Friday 09.05 → this_friday=09.05, prev_friday=02.05
    Example: run on Friday 08.05 (today) → this_friday=08.05, prev_friday=01.05
    """
    today = datetime.now()
    # weekday(): Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
    if today.weekday() == 4:  # Friday itself
        this_friday = today
    elif today.weekday() < 4:  # Mon-Thu → previous Friday is last week's
        days_back = today.weekday() + 3  # to last week's Friday
        this_friday = today - timedelta(days=days_back)
    else:  # Sat=5, Sun=6 → most recent Friday is this week's
        days_back = today.weekday() - 4
        this_friday = today - timedelta(days=days_back)
    prev_friday = this_friday - timedelta(days=7)
    # Strip time
    this_friday = this_friday.replace(hour=0, minute=0, second=0, microsecond=0)
    prev_friday = prev_friday.replace(hour=0, minute=0, second=0, microsecond=0)
    return prev_friday, this_friday


def get_week_label():
    """Week label = prev_friday to this_friday. e.g. '01.05-08.05.2025'"""
    prev_friday, this_friday = get_two_fridays()
    return f"{prev_friday.strftime('%d.%m')}-{this_friday.strftime('%d.%m.%Y')}"


def get_ua():
    return random.choice(USER_AGENTS)


# ============== TICKER UNIVERSE ==============
def get_ticker_universe():
    """Pull ~3000 US tickers: S&P 500 + NASDAQ + NYSE listings.
    Uses NASDAQ Trader public file - reliable and free."""
    print("Fetching ticker universe...")
    tickers = set()

    # NASDAQ-listed
    try:
        url = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
        r = requests.get(url, headers={"User-Agent": get_ua()}, timeout=20)
        if r.status_code == 200:
            for line in r.text.split("\n")[1:]:
                parts = line.split("|")
                if len(parts) >= 4 and parts[0] and not parts[0].startswith("File Creation"):
                    sym = parts[0].strip()
                    test_issue = parts[3].strip() if len(parts) > 3 else "N"
                    # Skip test issues and ETFs
                    if test_issue == "N" and sym.isascii() and "$" not in sym and "." not in sym:
                        tickers.add(sym)
        print(f"  NASDAQ: {len(tickers)} tickers")
    except Exception as e:
        print(f"  NASDAQ fetch failed: {e}")

    # Other (NYSE etc.)
    try:
        url = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
        r = requests.get(url, headers={"User-Agent": get_ua()}, timeout=20)
        if r.status_code == 200:
            before = len(tickers)
            for line in r.text.split("\n")[1:]:
                parts = line.split("|")
                if len(parts) >= 7 and parts[0] and not parts[0].startswith("File Creation"):
                    sym = parts[0].strip()
                    test_issue = parts[6].strip() if len(parts) > 6 else "N"
                    if test_issue == "N" and sym.isascii() and "$" not in sym and "." not in sym:
                        tickers.add(sym)
            print(f"  NYSE/Other: +{len(tickers) - before} tickers")
    except Exception as e:
        print(f"  Other listings fetch failed: {e}")

    print(f"Total universe: {len(tickers)} tickers")
    return sorted(tickers)


# ============== PRICE DATA (BATCH) ==============
def fetch_weekly_changes(tickers):
    """For each ticker: get last 2 weeks of daily closes, compute % change
    from PREVIOUS Friday close to THIS Friday close.
    Uses exact Friday dates (not '5 days back')."""
    prev_friday, this_friday = get_two_fridays()
    print(f"Weekly window: {prev_friday.strftime('%d.%m.%Y')} (Fri close) → {this_friday.strftime('%d.%m.%Y')} (Fri close)")
    print(f"Fetching prices for {len(tickers)} tickers (batched)...")

    # yfinance can handle ~200 tickers per call efficiently
    BATCH = 200
    # Pull a buffer: 3 days before prev_friday → 1 day after this_friday
    start = prev_friday - timedelta(days=3)
    end = this_friday + timedelta(days=1)

    def find_close_on_or_before(closes_series, target_date):
        """Find the last close on or before target_date.
        Handles holidays - if Friday was a holiday, takes Thursday."""
        # closes_series.index is DatetimeIndex
        target = pd.Timestamp(target_date.date())
        valid = closes_series[closes_series.index.normalize() <= target]
        if len(valid) == 0:
            return None
        return float(valid.iloc[-1])

    all_data = {}
    for i in range(0, len(tickers), BATCH):
        batch = tickers[i : i + BATCH]
        print(f"  Batch {i // BATCH + 1}/{(len(tickers) + BATCH - 1) // BATCH} ({len(batch)} tickers)...")
        try:
            df = yf.download(
                tickers=" ".join(batch),
                start=start.strftime("%Y-%m-%d"),
                end=end.strftime("%Y-%m-%d"),
                progress=False,
                auto_adjust=True,
                threads=True,
                group_by="ticker",
            )
            if df.empty:
                continue

            # Process each ticker in the batch
            for t in batch:
                try:
                    if len(batch) == 1:
                        ticker_df = df
                    else:
                        if t not in df.columns.get_level_values(0):
                            continue
                        ticker_df = df[t]

                    if ticker_df.empty or "Close" not in ticker_df.columns:
                        continue

                    closes = ticker_df["Close"].dropna()
                    volumes = ticker_df["Volume"].dropna() if "Volume" in ticker_df.columns else pd.Series()

                    if len(closes) < 2:
                        continue

                    # Take EXACT Friday closes (or the trading day on/before Friday)
                    this_close = find_close_on_or_before(closes, this_friday)
                    prev_close = find_close_on_or_before(closes, prev_friday)

                    if this_close is None or prev_close is None or prev_close <= 0:
                        continue

                    pct = ((this_close - prev_close) / prev_close) * 100
                    avg_vol = int(volumes.mean()) if len(volumes) > 0 else 0

                    all_data[t] = {
                        "ticker": t,
                        "price": round(this_close, 2),
                        "prev_price": round(prev_close, 2),
                        "change_pct": round(pct, 2),
                        "volume": avg_vol,
                    }
                except Exception:
                    continue
        except Exception as e:
            print(f"  Batch failed: {e}")
            continue

        time.sleep(0.5)  # gentle rate limit

    print(f"Got price data for {len(all_data)} tickers")
    return all_data


def enrich_with_market_cap(price_data, top_n=80):
    """Take top gainers by % change, fetch market cap + name for each.
    Returns only those passing MIN_MARKET_CAP filter."""
    # Sort by % gain
    sorted_data = sorted(price_data.values(), key=lambda x: x["change_pct"], reverse=True)
    candidates = sorted_data[:top_n]

    print(f"Enriching top {len(candidates)} gainers with market cap...")
    enriched = []
    for c in candidates:
        try:
            t = c["ticker"]
            info = yf.Ticker(t).fast_info
            mcap = info.get("market_cap") or 0
            if mcap < MIN_MARKET_CAP:
                continue
            # Get the longer name
            try:
                full_info = yf.Ticker(t).info
                name = full_info.get("shortName") or full_info.get("longName") or t
            except Exception:
                name = t

            enriched.append(
                {
                    "ticker": t,
                    "name": name,
                    "change_pct": c["change_pct"],
                    "price": c["price"],
                    "volume": c["volume"],
                    "market_cap": int(mcap),
                }
            )
            print(f"  {t}: +{c['change_pct']}% | ${mcap/1e9:.2f}B")
            if len(enriched) >= 30:
                break
        except Exception as e:
            print(f"  {c['ticker']}: skip ({e})")
            continue
        time.sleep(0.3)

    return enriched


# ============== BUZZ - REDDIT (FREE) ==============
def fetch_reddit_buzz(ticker, name):
    """Fetch posts mentioning the ticker from Reddit's free JSON API.
    Searches both ticker and across investing subreddits."""
    posts = []
    subreddits = ["wallstreetbets", "stocks", "investing", "StockMarket", "pennystocks"]

    for sub in subreddits:
        try:
            url = f"https://www.reddit.com/r/{sub}/search.json"
            params = {
                "q": ticker,
                "restrict_sr": "1",
                "sort": "hot",
                "t": "week",
                "limit": 25,
            }
            r = requests.get(
                url,
                params=params,
                headers={"User-Agent": get_ua()},
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                children = data.get("data", {}).get("children", [])
                for c in children:
                    d = c.get("data", {})
                    title = d.get("title", "")
                    body = d.get("selftext", "") or ""
                    text = f"{title} {body}"
                    # Verify ticker is actually mentioned (case-sensitive for $TICKER, also raw word)
                    if (
                        f"${ticker}" in text
                        or re.search(rf"\b{re.escape(ticker)}\b", text)
                    ):
                        posts.append(
                            {
                                "title": clean_text(title),
                                "subreddit": sub,
                                "upvotes": d.get("ups", 0),
                                "num_comments": d.get("num_comments", 0),
                                "url": f"https://reddit.com{d.get('permalink', '')}",
                                "created": d.get("created_utc", 0),
                            }
                        )
            time.sleep(2)  # be nice to Reddit
        except Exception as e:
            print(f"    Reddit r/{sub} {ticker}: {e}")
            time.sleep(3)
            continue

    # Dedup by title
    seen = set()
    unique = []
    for p in posts:
        key = p["title"][:60].lower()
        if key not in seen:
            seen.add(key)
            unique.append(p)
    return unique


def score_post(text, ticker):
    text_lower = text.lower()
    score = 0
    if ticker.lower() in text_lower or f"${ticker.lower()}" in text_lower:
        score += 3
    for kw in EARLY_SIGNAL_KEYWORDS:
        if kw in text_lower:
            score += 2
    if "?" in text:
        score += 1
    if 15 < len(text) < 200:
        score += 1
    return score


# ============== BUZZ - STOCKTWITS (FREE) ==============
def fetch_stocktwits(ticker):
    out = {"count": 0, "bullish": 0, "bearish": 0, "sentiment_pct": 50}
    try:
        url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json"
        r = requests.get(url, headers={"User-Agent": get_ua()}, timeout=10)
        if r.status_code == 200:
            data = r.json()
            msgs = data.get("messages", [])
            out["count"] = len(msgs)
            for m in msgs:
                sent = (
                    m.get("entities", {}).get("sentiment", {}) or {}
                ).get("basic")
                if sent == "Bullish":
                    out["bullish"] += 1
                elif sent == "Bearish":
                    out["bearish"] += 1
            tot = out["bullish"] + out["bearish"]
            if tot > 0:
                out["sentiment_pct"] = round(out["bullish"] / tot * 100)
    except Exception as e:
        print(f"    StockTwits {ticker}: {e}")
    return out


# ============== BUZZ AGGREGATION ==============
def calculate_buzz_score(reddit_count, stocktwits_count, top_posts):
    total = reddit_count + stocktwits_count
    if total > 100:
        score = 10
    elif total > 50:
        score = 9
    elif total > 25:
        score = 8
    elif total > 12:
        score = 7
    elif total > 6:
        score = 6
    elif total > 3:
        score = 5
    elif total > 0:
        score = 4
    else:
        score = 1

    early_signals = sum(1 for p in top_posts if p.get("interest_score", 0) >= 5)
    if early_signals >= 2:
        score = min(10, score + 2)
    elif early_signals >= 1:
        score = min(10, score + 1)
    return score


def build_buzz(ticker, name):
    print(f"  Buzz for {ticker}...")
    reddit_posts = fetch_reddit_buzz(ticker, name)
    st = fetch_stocktwits(ticker)

    # Score and pick top quotes
    for p in reddit_posts:
        p["interest_score"] = score_post(p["title"], ticker)
    reddit_posts.sort(key=lambda x: (x["interest_score"], x["upvotes"]), reverse=True)

    quotes = [
        {
            "text": p["title"],
            "subreddit": p["subreddit"],
            "upvotes": p["upvotes"],
            "url": p["url"],
        }
        for p in reddit_posts[:3]
    ]

    # Topics
    topics = []
    for p in reddit_posts:
        for kw in EARLY_SIGNAL_KEYWORDS:
            if kw in p["title"].lower() and kw not in topics:
                topics.append(kw)
                if len(topics) >= 3:
                    break
        if len(topics) >= 3:
            break

    score = calculate_buzz_score(len(reddit_posts), st["count"], reddit_posts)

    return {
        "reddit_count": len(reddit_posts),
        "stocktwits_count": st["count"],
        "total_count": len(reddit_posts) + st["count"],
        "score": score,
        "sentiment_pct": st["sentiment_pct"],
        "bullish": st["bullish"],
        "bearish": st["bearish"],
        "quotes": quotes,
        "topics": topics,
    }


# ============== STREAK / HISTORY ==============
def get_previous_week_data():
    try:
        r = (
            supabase.table("weekly_scans")
            .select("*")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if r.data:
            data = json.loads(r.data[0]["stocks_json"])
            stocks = data.get("stocks", data) if isinstance(data, dict) else data
            return {s["ticker"]: s for s in stocks if isinstance(s, dict)}
    except Exception as e:
        print(f"Previous week error: {e}")
    return {}


def save_to_supabase(stocks, bonus, week_label):
    try:
        supabase.table("weekly_scans").insert(
            {
                "week_label": week_label,
                "stocks_json": json.dumps({"stocks": stocks, "bonus": bonus}),
                "created_at": datetime.now().isoformat(),
            }
        ).execute()
        print(f"Saved: {week_label}")
    except Exception as e:
        print(f"Save error: {e}")


# ============== EMAIL ==============
def send_email(stocks, bonus, week_label):
    returning = sum(1 for s in stocks if s.get("streak", 1) >= 2)
    rows = ""
    for i, s in enumerate(stocks, 1):
        streak = s.get("streak", 1)
        if streak >= 4:
            badge = '<span style="background:#FCEBEB;color:#791F1F;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">4+ weeks</span>'
        elif streak >= 3:
            badge = f'<span style="background:#FAEEDA;color:#633806;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">{streak} weeks</span>'
        elif streak >= 2:
            badge = f'<span style="background:#EAF3DE;color:#27500A;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">{streak} weeks</span>'
        else:
            badge = '<span style="background:#f0f0f0;color:#888;padding:3px 10px;border-radius:12px;font-size:11px">New</span>'

        buzz = s.get("buzz", {})
        mcap = round(s["market_cap"] / 1_000_000_000, 2)
        bscore = buzz.get("score", 0)
        buzz_color = "#097c3e" if bscore >= 7 else "#cc8800" if bscore >= 4 else "#888"

        quotes = buzz.get("quotes", [])
        quote_html = ""
        if quotes:
            q = quotes[0]
            quote_html = f'<div style="font-size:11px;color:#555;font-style:italic;margin-top:4px;padding:4px 8px;background:#f5f5f5;border-radius:4px;border-left:2px solid #FF4500">"{q["text"]}"</div>'

        rows += f"""<tr style="border-bottom:1px solid #f0f0f0">
<td style="padding:10px 14px;color:#999;font-size:13px">{i}</td>
<td style="padding:10px 14px"><div style="font-size:15px;font-weight:700;color:#1a1a2e">{s["ticker"]}</div><div style="font-size:11px;color:#999;margin-top:2px">{s["name"]}</div>{quote_html}</td>
<td style="padding:10px 14px"><span style="font-size:18px;font-weight:800;color:#097c3e">+{s["change_pct"]}%</span></td>
<td style="padding:10px 14px;color:#555;font-size:13px">${mcap}B</td>
<td style="padding:10px 14px;text-align:center">
<span style="font-size:14px;font-weight:700;color:{buzz_color}">{bscore}/10</span>
<div style="font-size:10px;color:#aaa;margin-top:2px">R:{buzz.get("reddit_count",0)} ST:{buzz.get("stocktwits_count",0)}</div>
</td>
<td style="padding:10px 14px">{badge}</td>
</tr>"""

    bonus_html = ""
    if bonus:
        bonus_cards = "".join(
            [
                f'<div style="background:white;border:1px solid #e8e8e8;border-radius:10px;padding:14px 16px;flex:1;min-width:220px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:16px;font-weight:700;color:#1a1a2e">{b["ticker"]}</span><span style="background:#FAEEDA;color:#633806;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">Buzz Alert</span></div><div style="font-size:12px;color:#666">{b["name"]}</div><div style="font-size:12px;color:#097c3e;font-weight:600;margin-top:6px">+{b["change_pct"]}% · {b.get("buzz",{}).get("total_count",0)} signals</div></div>'
                for b in bonus[:3]
            ]
        )
        bonus_html = f'<div style="padding:20px 24px;background:#f8f9fa;border-top:1px solid #eee"><div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Bonus — Worth Watching</div><div style="display:flex;gap:12px;flex-wrap:wrap">{bonus_cards}</div></div>'

    html = f"""<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f5;font-family:Arial,sans-serif">
<div style="max-width:720px;margin:0 auto">
<div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px;border-radius:16px 16px 0 0">
<h1 style="color:white;margin:0;font-size:22px;font-weight:800">📈 Stock Scout</h1>
<p style="color:#aaa;margin:6px 0 0;font-size:13px">{week_label} · Weekly Top Gainers</p>
</div>
<div style="background:#097c3e;padding:12px 24px">
<span style="color:white;font-size:13px;font-weight:600">{returning} stocks returning · Min cap: ${MIN_MARKET_CAP//1_000_000}M</span>
</div>
<div style="background:white">
<table style="width:100%;border-collapse:collapse">
<thead><tr style="background:#f8f9fa;border-bottom:2px solid #eee">
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999">#</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999">STOCK</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999">GAIN</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999">MKT CAP</th>
<th style="padding:10px 14px;text-align:center;font-size:11px;color:#999">BUZZ</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999">TREND</th>
</tr></thead>
<tbody>{rows}</tbody>
</table>
</div>
{bonus_html}
<div style="background:#1a1a2e;padding:24px;border-radius:0 0 16px 16px;text-align:center">
<a href="{DASHBOARD_URL}" style="background:#097c3e;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Open Full Dashboard</a>
</div>
</div></body></html>"""

    try:
        r = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": "Stock Scout <onboarding@resend.dev>",
                "to": [BOSS_EMAIL],
                "subject": f"📈 Stock Scout — {week_label}",
                "html": html,
            },
            timeout=20,
        )
        print(f"Email: {r.status_code}")
        if r.status_code >= 300:
            print(f"  Error: {r.text[:200]}")
    except Exception as e:
        print(f"Email error: {e}")


# ============== MAIN ==============
def main():
    print("=" * 50)
    print("STOCK SCOUT - Weekly Scan")
    print("=" * 50)
    week_label = get_week_label()
    print(f"Week: {week_label}\n")

    # 1. Universe
    universe = get_ticker_universe()
    if not universe:
        print("FATAL: no tickers")
        return

    # 2. Weekly price changes
    price_data = fetch_weekly_changes(universe)
    if not price_data:
        print("FATAL: no price data")
        return

    # 3. Filter to gainers only and enrich top with market cap
    gainers = [p for p in price_data.values() if p["change_pct"] > 0]
    print(f"\nTotal gainers: {len(gainers)}")

    # Sort and enrich top 80 (we'll filter to ~30 with mcap >= MIN)
    gainers_dict = {g["ticker"]: g for g in gainers}
    enriched = enrich_with_market_cap(gainers_dict, top_n=80)

    if not enriched:
        print("FATAL: no stocks passed market cap filter")
        return

    # Top 20 + bonus candidates (positions 20-30)
    top20 = enriched[:20]
    bonus_candidates = enriched[20:30]
    print(f"\nTOP 20 + {len(bonus_candidates)} bonus candidates")

    # 4. Buzz for top 20
    print("\n--- Fetching buzz ---")
    for s in top20:
        s["buzz"] = build_buzz(s["ticker"], s["name"])
        print(
            f"{s['ticker']}: R={s['buzz']['reddit_count']} ST={s['buzz']['stocktwits_count']} score={s['buzz']['score']}"
        )

    # 5. Streak from previous week
    prev = get_previous_week_data()
    for s in top20:
        s["streak"] = prev.get(s["ticker"], {}).get("streak", 0) + 1 if s["ticker"] in prev else 1

    # 6. Bonus: pick those with highest buzz from candidates
    print("\n--- Bonus buzz ---")
    bonus_with_buzz = []
    for b in bonus_candidates:
        b["buzz"] = build_buzz(b["ticker"], b["name"])
        if b["buzz"]["total_count"] >= 3:
            bonus_with_buzz.append(b)
    bonus_with_buzz.sort(key=lambda x: x["buzz"]["score"], reverse=True)
    bonus = bonus_with_buzz[:3]

    # 7. Save and send
    save_to_supabase(top20, bonus, week_label)
    send_email(top20, bonus, week_label)
    print("\n=== DONE ===")


if __name__ == "__main__":
    main()
