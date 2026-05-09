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
    # Remove markdown links [text](url) entirely
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    # Remove plain URLs
    text = re.sub(r"https?://\S+|www\.\S+", "", text)
    # Remove markdown formatting characters
    text = re.sub(r"[*#_~`]", "", text)
    # Collapse whitespace
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


def _is_clean_ticker(sym):
    """Filter out warrants, preferred shares, units, but keep legit tickers like BRK.B."""
    if not sym or not sym.isascii():
        return False
    # Block clear warrants/units/rights/preferreds (typically end with W, U, R, or specific patterns)
    if sym.endswith(("W", "U", "R")) and len(sym) >= 5:
        return False
    if "$" in sym or " " in sym:
        return False
    # Allow dots (BRK.B etc.) but yfinance uses BRK-B format - normalize
    return True


def _normalize_ticker(sym):
    """Convert NASDAQ Trader format to yfinance format: BRK.B → BRK-B"""
    return sym.replace(".", "-")


# ============== TICKER UNIVERSE ==============
def get_ticker_universe():
    """Pull all US tickers: NASDAQ + NYSE + AMEX listings.
    Returns (sorted_tickers_list, names_dict).
    Uses NASDAQ Trader public file - reliable and free."""
    print("Fetching ticker universe...")
    tickers = set()
    names = {}

    # NASDAQ-listed
    try:
        url = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
        r = requests.get(url, headers={"User-Agent": get_ua()}, timeout=20)
        if r.status_code == 200:
            for line in r.text.split("\n")[1:]:
                parts = line.split("|")
                if len(parts) >= 4 and parts[0] and not parts[0].startswith("File Creation"):
                    sym = parts[0].strip()
                    name = parts[1].strip() if len(parts) > 1 else sym
                    test_issue = parts[3].strip() if len(parts) > 3 else "N"
                    etf_flag = parts[6].strip() if len(parts) > 6 else "N"
                    if test_issue == "N" and etf_flag == "N" and _is_clean_ticker(sym):
                        norm = _normalize_ticker(sym)
                        tickers.add(norm)
                        names[norm] = name
        print(f"  NASDAQ: {len(tickers)} tickers")
    except Exception as e:
        print(f"  NASDAQ fetch failed: {e}")

    # Other (NYSE, AMEX, etc.)
    try:
        url = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
        r = requests.get(url, headers={"User-Agent": get_ua()}, timeout=20)
        if r.status_code == 200:
            before = len(tickers)
            for line in r.text.split("\n")[1:]:
                parts = line.split("|")
                # otherlisted format: ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
                if len(parts) >= 7 and parts[0] and not parts[0].startswith("File Creation"):
                    sym = parts[0].strip()
                    name = parts[1].strip() if len(parts) > 1 else sym
                    etf_flag = parts[4].strip() if len(parts) > 4 else "N"
                    test_issue = parts[6].strip() if len(parts) > 6 else "N"
                    if test_issue == "N" and etf_flag == "N" and _is_clean_ticker(sym):
                        norm = _normalize_ticker(sym)
                        tickers.add(norm)
                        names[norm] = name
            print(f"  NYSE/Other: +{len(tickers) - before} tickers")
    except Exception as e:
        print(f"  Other listings fetch failed: {e}")

    print(f"Total universe: {len(tickers)} tickers")
    return sorted(tickers), names


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
                    
                    # Weekly total volume - sum of all trading days AFTER prev_friday up to this_friday
                    # This is what TradingView shows when you select "1 Week"
                    if len(volumes) > 0:
                        prev_ts = pd.Timestamp(prev_friday.date())
                        this_ts = pd.Timestamp(this_friday.date())
                        week_volumes = volumes[
                            (volumes.index.normalize() > prev_ts) &
                            (volumes.index.normalize() <= this_ts)
                        ]
                        weekly_vol = int(week_volumes.sum()) if len(week_volumes) > 0 else 0
                    else:
                        weekly_vol = 0

                    all_data[t] = {
                        "ticker": t,
                        "price": round(this_close, 2),
                        "prev_price": round(prev_close, 2),
                        "change_pct": round(pct, 2),
                        "volume": weekly_vol,
                    }
                except Exception:
                    continue
        except Exception as e:
            print(f"  Batch failed: {e}")
            continue

        time.sleep(0.5)  # gentle rate limit

    print(f"Got price data for {len(all_data)} tickers")
    return all_data


def find_top20_by_marketcap(price_data, names_dict):
    """Walk through gainers in order of % gain. For each one, check market cap.
    If passes filter → add to list. Stop when we have 20.
    Simple and direct - exactly what we want."""
    # Sort all gainers by % change (highest first)
    sorted_gainers = sorted(price_data.values(), key=lambda x: x["change_pct"], reverse=True)
    
    print(f"Walking through gainers (highest % first), filtering by market cap >= ${MIN_MARKET_CAP/1e6:.0f}M...")
    top20 = []
    checked = 0
    
    for c in sorted_gainers:
        if len(top20) >= 20:
            break
        checked += 1
        try:
            t = c["ticker"]
            info = yf.Ticker(t).fast_info
            mcap = info.get("market_cap") or info.get("marketCap") or 0
            
            if not mcap or mcap < MIN_MARKET_CAP:
                continue  # too small, skip
            
            name = names_dict.get(t, t)
            if len(name) > 60:
                name = name[:57] + "..."
            
            top20.append({
                "ticker": t,
                "name": name,
                "change_pct": c["change_pct"],
                "price": c["price"],
                "volume": c["volume"],
                "market_cap": int(mcap),
            })
            print(f"  [{len(top20)}/20] {t}: +{c['change_pct']}% | ${mcap/1e9:.2f}B | {name[:40]}")
        except Exception as e:
            # Couldn't fetch market cap - skip this one and move on
            continue
    
    print(f"Checked {checked} stocks to find {len(top20)} that pass market cap filter")
    return top20


# ============== BUZZ - APIFY (PAID, RELIABLE) ==============
APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")


def apify_run_actor(actor_id, run_input, timeout=180, target_items=None):
    """Run an Apify actor with INTELLIGENT control:
    1. Start the run async (returns immediately)
    2. Poll dataset progress
    3. Abort the run when we have enough items (saves money!)
    4. Return whatever was collected, even if run aborted/failed
    
    This solves two problems:
    - Actors that ignore maxItems and run forever (cost overrun)
    - Connection drops mid-run that lose all collected data
    """
    if not APIFY_TOKEN:
        return []
    
    actor_path = actor_id.replace("/", "~")
    headers = {"Content-Type": "application/json"}
    
    # === STEP 1: Start the run ===
    try:
        start_url = f"https://api.apify.com/v2/acts/{actor_path}/runs"
        r = requests.post(
            start_url,
            params={"token": APIFY_TOKEN},
            json=run_input,
            headers=headers,
            timeout=30,
        )
        if r.status_code not in (200, 201):
            print(f"    Apify {actor_id} start failed: HTTP {r.status_code} | {r.text[:200]}")
            return []
        run_data = r.json().get("data", {})
        run_id = run_data.get("id")
        dataset_id = run_data.get("defaultDatasetId")
        if not run_id or not dataset_id:
            print(f"    Apify {actor_id}: missing run_id or dataset_id")
            return []
        print(f"    Apify {actor_id} started: run_id={run_id[:12]}..., target={target_items} items")
    except Exception as e:
        print(f"    Apify {actor_id} start error: {type(e).__name__}: {e}")
        return []

    # === STEP 2: Poll until done OR we have enough items ===
    start_time = time.time()
    poll_interval = 5  # seconds between polls (was 8 - faster = safer for cost control)
    last_count = 0
    
    # Safety margin: trigger abort at 90% of target so the actor doesn't overshoot
    # while we're calling abort. Better to get slightly fewer than overshoot.
    abort_threshold = int(target_items * 0.9) if target_items else None
    
    while True:
        elapsed = time.time() - start_time
        if elapsed > timeout:
            print(f"    Apify {actor_id}: timeout {timeout}s reached, aborting and fetching results...")
            break
        
        time.sleep(poll_interval)
        
        # Check run status
        try:
            status_r = requests.get(
                f"https://api.apify.com/v2/actor-runs/{run_id}",
                params={"token": APIFY_TOKEN},
                timeout=15,
            )
            if status_r.status_code == 200:
                status_data = status_r.json().get("data", {})
                status = status_data.get("status", "")
                item_count = status_data.get("stats", {}).get("inputBodyLen", 0)  # rough indicator
                
                # Get actual dataset count
                count_r = requests.get(
                    f"https://api.apify.com/v2/datasets/{dataset_id}",
                    params={"token": APIFY_TOKEN},
                    timeout=15,
                )
                if count_r.status_code == 200:
                    item_count = count_r.json().get("data", {}).get("itemCount", 0)
                
                if item_count != last_count:
                    print(f"    Apify {actor_id}: {item_count} items collected ({status}, {int(elapsed)}s elapsed)")
                    last_count = item_count
                
                # Done?
                if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
                    print(f"    Apify {actor_id}: finished with status {status}")
                    break
                
                # Have enough? Abort to save money!
                # Use 90% threshold so the actor doesn't overshoot while we're aborting
                if abort_threshold and item_count >= abort_threshold:
                    print(f"    Apify {actor_id}: reached {item_count} items (threshold {abort_threshold}, target {target_items}) - ABORTING NOW to save cost")
                    try:
                        abort_r = requests.post(
                            f"https://api.apify.com/v2/actor-runs/{run_id}/abort",
                            params={"token": APIFY_TOKEN},
                            timeout=15,
                        )
                        if abort_r.status_code in (200, 201):
                            print(f"    ✅ Abort successful")
                        else:
                            print(f"    ⚠️ Abort returned HTTP {abort_r.status_code}")
                    except Exception as e:
                        print(f"    ⚠️ Apify abort failed (continuing anyway): {e}")
                    # Don't wait - move on to fetching results immediately
                    break
        except Exception as e:
            print(f"    Apify {actor_id} poll error: {type(e).__name__}")
            continue
    
    # === STEP 3: Fetch whatever was collected (even if aborted/failed) ===
    try:
        items_r = requests.get(
            f"https://api.apify.com/v2/datasets/{dataset_id}/items",
            params={"token": APIFY_TOKEN, "format": "json", "clean": "true"},
            timeout=60,
        )
        if items_r.status_code == 200:
            items = items_r.json()
            if isinstance(items, list):
                # Hard cap at target_items if specified (extra safety)
                if target_items and len(items) > target_items:
                    items = items[:target_items]
                return items
        print(f"    Apify {actor_id}: items fetch failed HTTP {items_r.status_code}")
        return []
    except Exception as e:
        print(f"    Apify {actor_id} items fetch error: {type(e).__name__}: {e}")
        return []


def fetch_reddit_buzz_apify_batch(tickers, names_dict=None):
    """Single Apify call for ALL tickers - much cheaper than per-ticker calls.
    Now searches for BOTH ticker AND company name (e.g. "AVTX" + "Avalo Therapeutics").
    Returns: dict mapping ticker -> list of posts."""
    if not APIFY_TOKEN:
        print("  No APIFY_TOKEN - skipping Reddit")
        return {t: [] for t in tickers}
    
    if names_dict is None:
        names_dict = {}

    print(f"\n--- Reddit via Apify: searching for {len(tickers)} tickers in batch ---")

    # ⚡ SMART: search for ticker AND company name to maximize coverage
    # Some small stocks barely have $TICKER mentions, but their company name is discussed
    # Example: "AVTX" → 0 results, but "Avalo Therapeutics" → many results
    start_urls = []
    for ticker in tickers:
        # Search 1: ticker with cashtag
        start_urls.append({
            "url": f"https://www.reddit.com/search/?q=%24{ticker}&t=week&sort=hot",
        })
        # Search 2: company name (if available and different from ticker)
        company_name = names_dict.get(ticker, "")
        if company_name and company_name.upper() != ticker:
            # Clean the name: remove "Inc.", "Corp.", "Ltd.", etc.
            clean_name = company_name
            for suffix in [", Inc.", " Inc.", ", Corp.", " Corp.", ", Ltd.", " Ltd.",
                          ", Co.", " Co.", " Class A Common Stock", " Common Stock",
                          " - Common Stock", " - Class A Common Stock"]:
                clean_name = clean_name.replace(suffix, "")
            clean_name = clean_name.strip()
            
            # Use first word(s) only if name is short, full name if longer
            if len(clean_name) > 5 and len(clean_name) < 40:
                # URL-encode the name for the query
                from urllib.parse import quote
                encoded_name = quote(clean_name)
                start_urls.append({
                    "url": f"https://www.reddit.com/search/?q={encoded_name}&t=week&sort=hot",
                })

    # Use Reddit Scraper Lite - cheap and reliable
    actor_id = "trudax/reddit-scraper-lite"
    run_input = {
        "startUrls": start_urls,
        "maxItems": len(tickers) * 40,  # ~40 posts per ticker average
        "maxPostCount": 40,  # max 40 posts per search
        "skipComments": True,
        "skipUserPosts": True,
        "skipCommunity": True,
        "proxy": {"useApifyProxy": True},
    }

    # Reddit: don't abort early - we need to cover ALL tickers
    # Set target very high so abort only triggers if actor is misbehaving
    # Hard cap is enforced by maxItems in run_input + post-fetch trimming
    print(f"  Calling Apify actor {actor_id} with {len(start_urls)} URLs (timeout 35 min - waits for completion)...")
    posts = apify_run_actor(actor_id, run_input, timeout=2100, target_items=len(tickers)*200)  # 35 min, very high target = no early abort
    print(f"  Got {len(posts)} total posts from Apify")

    # Group posts by ticker
    by_ticker = {t: [] for t in tickers}
    for p in posts:
        # Try multiple field names (different scrapers use different schemas)
        title = (p.get("title") or "").strip()
        body = (p.get("body") or p.get("selftext") or p.get("text") or "").strip()
        if not title:
            continue
        full_text = f"{title} {body}"

        # Identify which ticker(s) this post mentions
        for ticker in tickers:
            matched = False
            
            # Match 1: explicit cashtag like $RXT (highest confidence)
            if f"${ticker}" in full_text or f"${ticker.lower()}" in full_text.lower():
                matched = True
            # Match 2: ticker as standalone word (boundaries)
            elif re.search(rf"\b{re.escape(ticker)}\b", full_text):
                matched = True
            # Match 3: company name (if available and distinctive enough)
            elif names_dict:
                company_name = names_dict.get(ticker, "")
                if company_name and len(company_name) > 5:
                    # Use first significant word of company name (e.g. "Avalo" from "Avalo Therapeutics")
                    first_word = company_name.split()[0] if company_name.split() else ""
                    # Only match if first word is distinctive (not generic like "The", "United", etc.)
                    generic_words = {"the", "a", "an", "and", "of", "in", "on", "for", "with", "united", 
                                    "national", "american", "international", "global", "general", "common"}
                    if (len(first_word) > 4 and 
                        first_word.lower() not in generic_words and 
                        first_word in full_text):
                        matched = True
            
            if matched:
                by_ticker[ticker].append({
                    "title": clean_text(title),
                    "subreddit": p.get("communityName") or p.get("subreddit") or "reddit",
                    "upvotes": int(p.get("upVotes") or p.get("score") or p.get("ups") or 0),
                    "num_comments": int(p.get("numberOfComments") or p.get("num_comments") or 0),
                    "url": p.get("url") or p.get("postUrl") or "",
                })

    # Dedup by title within each ticker
    for ticker, posts_list in by_ticker.items():
        seen = set()
        unique = []
        for post in posts_list:
            key = post["title"][:60].lower()
            if key not in seen:
                seen.add(key)
                unique.append(post)
        by_ticker[ticker] = unique
        print(f"  {ticker}: {len(unique)} unique posts")

    return by_ticker


def fetch_stocktwits_apify_batch(tickers):
    """Fetch StockTwits messages for all tickers via the FREE Apify actor.
    We only need: count, sentiment, and top 3 messages per ticker.
    Returns: dict mapping ticker -> dict with count/bullish/bearish/messages."""
    result = {t: {"count": 0, "bullish": 0, "bearish": 0, "sentiment_pct": 50, "messages": []} for t in tickers}

    if not APIFY_TOKEN:
        print("  No APIFY_TOKEN - skipping StockTwits")
        return result

    print(f"\n--- StockTwits via Apify (pay-per-result, free actor): {len(tickers)} tickers ---")

    actor_id = "automation-lab/stocktwits-scraper"
    # We compute Reddit-style sentiment + StockTwits user-marked sentiment
    # 40 messages per ticker = good resolution for differentiating buzz levels
    PER_TICKER_LIMIT = 40
    HARD_TOTAL_LIMIT = len(tickers) * PER_TICKER_LIMIT  # absolute ceiling, controls cost
    
    run_input = {
        "mode": "symbol",
        "symbols": tickers,
        "maxMessagesPerSymbol": PER_TICKER_LIMIT,
        "maxItems": HARD_TOTAL_LIMIT,  # belt-and-suspenders: actor MUST stop here
    }

    print(f"  Calling Apify actor {actor_id} for {len(tickers)} symbols (max {PER_TICKER_LIMIT} msgs/ticker, hard cap {HARD_TOTAL_LIMIT})...")
    items = apify_run_actor(actor_id, run_input, timeout=180, target_items=HARD_TOTAL_LIMIT)
    print(f"  Got {len(items)} messages from StockTwits")
    
    # Defensive: if actor ignored our limits, trim ourselves
    if len(items) > HARD_TOTAL_LIMIT:
        print(f"  ⚠️ Actor returned more than requested - trimming to {HARD_TOTAL_LIMIT}")
        items = items[:HARD_TOTAL_LIMIT]

    # Group items by ticker - the actor returns items with various symbol fields
    # We need to be defensive about field names because schemas differ
    for item in items:
        # Try all possible field names for the ticker symbol
        symbol = None
        # Direct fields first
        for field in ("symbol", "ticker", "stockSymbol"):
            val = item.get(field)
            if val and isinstance(val, str):
                symbol = val.upper()
                break

        # If symbols is a list, dig into it carefully
        if not symbol:
            symbols_list = item.get("symbols")
            if isinstance(symbols_list, list) and len(symbols_list) > 0:
                first = symbols_list[0]
                if isinstance(first, dict):
                    symbol = (first.get("symbol") or first.get("ticker") or "").upper()
                elif isinstance(first, str):
                    symbol = first.upper()

        if not symbol or symbol not in result:
            continue

        body = item.get("body") or item.get("message") or item.get("text") or ""
        if not body:
            continue

        # Sentiment - try multiple field paths
        sentiment = (
            item.get("sentiment")
            or (item.get("entities", {}).get("sentiment", {}) if isinstance(item.get("entities"), dict) else {}).get("basic")
            or ""
        )
        sentiment_lower = (sentiment or "").lower()

        result[symbol]["count"] += 1
        if "bull" in sentiment_lower:
            result[symbol]["bullish"] += 1
        elif "bear" in sentiment_lower:
            result[symbol]["bearish"] += 1

        # Keep best 5 messages (sorted later by score for top 3 quotes)
        # Keep top 10 messages (we'll pick 3 best by quality later)
        if len(result[symbol]["messages"]) < 10:
            result[symbol]["messages"].append({
                "body": clean_text(body, max_len=140),
                "sentiment": sentiment,
            })
        
        # Hard per-ticker cap - never count more than PER_TICKER_LIMIT messages
        if result[symbol]["count"] >= PER_TICKER_LIMIT:
            continue

    # Calculate sentiment percentage and print summary
    for ticker in tickers:
        d = result[ticker]
        tot = d["bullish"] + d["bearish"]
        d["sentiment_pct"] = round(d["bullish"] / tot * 100) if tot > 0 else 50
        print(f"  {ticker}: {d['count']} msgs, {d['sentiment_pct']}% bullish")

    return result


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


def calculate_buzz_score_v2(reddit_count, stocktwits_count, market_cap, top_posts):
    """Smart buzz scoring with WEIGHTED sources.
    
    Key insight: not all buzz is equal!
    - Reddit posts = HIGH SIGNAL (people write thoughtful posts, real discussion)
    - StockTwits messages = LOW SIGNAL (lots of noise, bots, repetitive cashtags)
    
    Weights: Reddit × 3, StockTwits × 1
    
    Then we calculate posts-per-billion of market cap:
    - Small-cap with high weighted buzz = 10/10 (real signal)
    - Big-cap with same buzz = lower (it's normal for them)
    
    Returns score 1-10 where:
    - 1-3: nothing happening
    - 4-6: some discussion, worth noting
    - 7-8: significant buzz, something brewing
    - 9-10: extreme buzz, this stock is on fire
    """
    # Weighted total - Reddit posts count 3x more than StockTwits messages
    weighted_total = (reddit_count * 3) + stocktwits_count
    raw_total = reddit_count + stocktwits_count

    if raw_total == 0:
        return 1  # no buzz at all

    # Calculate "weighted buzz per billion of market cap"
    mcap_b = max(market_cap / 1e9, 0.1) if market_cap else 1.0
    weighted_per_billion = weighted_total / mcap_b

    # Score based on weighted buzz density
    # Note: With 40 messages cap per ticker, max possible weighted = 40*3 + 40 = 160
    # Thresholds are calibrated so that hitting cap on small-cap stock = high score
    if weighted_per_billion > 200:   base = 10  # extreme - small cap with massive Reddit buzz
    elif weighted_per_billion > 130: base = 9
    elif weighted_per_billion > 90:  base = 8
    elif weighted_per_billion > 60:  base = 7
    elif weighted_per_billion > 35:  base = 6
    elif weighted_per_billion > 18:  base = 5
    elif weighted_per_billion > 8:   base = 4
    elif weighted_per_billion > 3:   base = 3
    else:                            base = 2

    # Cap based on absolute REDDIT volume (Reddit is the gold signal)
    # If there's barely any Reddit activity, even huge StockTwits noise can't get you above 7
    if reddit_count == 0:
        base = min(base, 6)  # No Reddit = capped at 6 - StockTwits alone isn't enough
    elif reddit_count < 5:
        base = min(base, 7)
    elif reddit_count < 15:
        base = min(base, 8)

    # Cap based on absolute total (sanity check for tiny activity)
    if raw_total < 5:
        base = min(base, 4)
    elif raw_total < 15:
        base = min(base, 6)

    # BOOST for early-signal keywords (insider words like "takeover", "FDA", "unusual volume")
    early_signals = sum(1 for p in top_posts if p.get("interest_score", 0) >= 5)
    if early_signals >= 3:
        base = min(10, base + 2)
    elif early_signals >= 1:
        base = min(10, base + 1)

    return base


# Bullish/bearish keyword detection for Reddit posts
BULLISH_KEYWORDS = [
    "moon", "mooning", "rocket", "🚀", "calls", "long", "buy",
    "breakout", "squeeze", "rally", "surge", "rip", "ripping",
    "pump", "pumping", "bull", "bullish", "rocket",
    "to the moon", "explode", "exploding", "ath", "all time high",
    "gains", "tendies", "winner", "beat", "upgrade",
    "fda approval", "partnership", "buyout", "takeover",
]

BEARISH_KEYWORDS = [
    "dump", "dumping", "crash", "tank", "tanking",
    "puts", "short", "shorting", "sell", "selling",
    "bear", "bearish", "drop", "fall", "falling",
    "downgrade", "miss", "missed", "warning", "lawsuit",
    "fraud", "scam", "delisted", "bankruptcy",
]


def detect_post_sentiment(text):
    """Returns 'bullish', 'bearish', or 'neutral' based on keywords."""
    text_lower = text.lower()
    bull_hits = sum(1 for kw in BULLISH_KEYWORDS if kw in text_lower)
    bear_hits = sum(1 for kw in BEARISH_KEYWORDS if kw in text_lower)
    if bull_hits > bear_hits:
        return "bullish"
    elif bear_hits > bull_hits:
        return "bearish"
    return "neutral"


def build_buzz_from_data(ticker, market_cap, reddit_posts, stocktwits_data):
    """Build the buzz dict from pre-fetched Reddit posts + StockTwits data.
    
    Key insight: counts are sample-limited (we only fetch 30 max), so we focus on:
    - SENTIMENT % (bullish/bearish) - this is real and meaningful
    - Top 3 quotes - real signals from real people  
    - Buzz score 1-10 - relative to market cap
    """
    # === REDDIT SENTIMENT (from keyword detection) ===
    reddit_bull = 0
    reddit_bear = 0
    for p in reddit_posts:
        p["interest_score"] = score_post(p["title"], ticker)
        sent = detect_post_sentiment(p["title"])
        p["sentiment"] = sent
        if sent == "bullish":
            reddit_bull += 1
        elif sent == "bearish":
            reddit_bear += 1
    
    reddit_total_sentiment = reddit_bull + reddit_bear
    reddit_bullish_pct = round(reddit_bull / reddit_total_sentiment * 100) if reddit_total_sentiment > 0 else 50
    
    # Sort Reddit posts by relevance + upvotes
    reddit_posts.sort(key=lambda x: (x["interest_score"], x["upvotes"]), reverse=True)
    
    # === TOP 3 QUOTES (smart selection - always try for 3) ===
    quotes = []
    st_messages = stocktwits_data.get("messages", [])
    
    # Score StockTwits messages by quality (length + has bullish/bearish sentiment marked)
    # Avoids "lol", "to the moon 🚀", short noise
    def st_quality_score(msg):
        body = msg.get("body", "") or ""
        score = 0
        # Length signal: longer messages tend to be more substantive
        if len(body) > 80: score += 3
        elif len(body) > 40: score += 2
        elif len(body) > 20: score += 1
        # Has explicit sentiment marked
        if msg.get("sentiment"):
            score += 2
        # Penalize obvious noise patterns
        body_lower = body.lower()
        if any(noise in body_lower for noise in ["lol", "🚀🚀", "to the moon", "buy buy buy", "lfg"]):
            score -= 2
        return score
    
    # Sort StockTwits messages by quality
    st_sorted = sorted(st_messages, key=st_quality_score, reverse=True)
    
    # Strategy A: Both sources have content → 2 Reddit + 1 StockTwits
    if len(reddit_posts) >= 2 and len(st_sorted) >= 1:
        for p in reddit_posts[:2]:
            quotes.append({
                "text": p["title"],
                "source": "reddit",
                "subreddit": p["subreddit"],
                "upvotes": p["upvotes"],
                "url": p["url"],
                "sentiment": p.get("sentiment", "neutral"),
            })
        best_st = st_sorted[0]
        quotes.append({
            "text": best_st["body"],
            "source": "stocktwits",
            "subreddit": "StockTwits",
            "upvotes": 0,
            "url": "",
            "sentiment": (best_st.get("sentiment", "") or "neutral").lower(),
        })
    
    # Strategy B: Only Reddit has content → 3 from Reddit
    elif len(reddit_posts) >= 1 and len(st_sorted) == 0:
        for p in reddit_posts[:3]:
            quotes.append({
                "text": p["title"],
                "source": "reddit",
                "subreddit": p["subreddit"],
                "upvotes": p["upvotes"],
                "url": p["url"],
                "sentiment": p.get("sentiment", "neutral"),
            })
    
    # Strategy C: Only StockTwits has content → 3 from StockTwits
    elif len(reddit_posts) == 0 and len(st_sorted) >= 1:
        for msg in st_sorted[:3]:
            quotes.append({
                "text": msg["body"],
                "source": "stocktwits",
                "subreddit": "StockTwits",
                "upvotes": 0,
                "url": "",
                "sentiment": (msg.get("sentiment", "") or "neutral").lower(),
            })
    
    # Strategy D: Mixed but one is short → fill from the other
    elif len(reddit_posts) == 1 and len(st_sorted) >= 2:
        # 1 Reddit + 2 StockTwits
        p = reddit_posts[0]
        quotes.append({
            "text": p["title"], "source": "reddit", "subreddit": p["subreddit"],
            "upvotes": p["upvotes"], "url": p["url"],
            "sentiment": p.get("sentiment", "neutral"),
        })
        for msg in st_sorted[:2]:
            quotes.append({
                "text": msg["body"], "source": "stocktwits", "subreddit": "StockTwits",
                "upvotes": 0, "url": "",
                "sentiment": (msg.get("sentiment", "") or "neutral").lower(),
            })
    
    # === TOPICS (early signal keywords found) ===
    topics = []
    for p in reddit_posts:
        for kw in EARLY_SIGNAL_KEYWORDS:
            if kw in p["title"].lower() and kw not in topics:
                topics.append(kw)
                if len(topics) >= 5:
                    break
        if len(topics) >= 5:
            break

    # === BUZZ SCORE (relative to market cap) ===
    score = calculate_buzz_score_v2(
        len(reddit_posts), stocktwits_data["count"], market_cap, reddit_posts
    )

    return {
        # Counts (sample-limited - mainly used for buzz score, not displayed prominently)
        "reddit_count": len(reddit_posts),
        "stocktwits_count": stocktwits_data["count"],
        "total_count": len(reddit_posts) + stocktwits_data["count"],
        # Score 1-10 (the key indicator)
        "score": score,
        # Sentiment - REDDIT (keyword-based, our analysis)
        "reddit_bullish_pct": reddit_bullish_pct,
        "reddit_bullish": reddit_bull,
        "reddit_bearish": reddit_bear,
        # Sentiment - STOCKTWITS (user-marked, from the platform)
        "stocktwits_bullish_pct": stocktwits_data["sentiment_pct"],
        "stocktwits_bullish": stocktwits_data["bullish"],
        "stocktwits_bearish": stocktwits_data["bearish"],
        # Quotes - the most important part
        "quotes": quotes,
        # Topics - keywords found
        "topics": topics[:3],
        # Legacy fields for backwards compat
        "sentiment_pct": stocktwits_data["sentiment_pct"],
        "bullish": stocktwits_data["bullish"],
        "bearish": stocktwits_data["bearish"],
    }


def build_buzz(ticker, name):
    """DEPRECATED - kept for backwards compat. Returns empty buzz."""
    return {
        "reddit_count": 0,
        "stocktwits_count": 0,
        "total_count": 0,
        "score": 1,
        "sentiment_pct": 50,
        "bullish": 0,
        "bearish": 0,
        "quotes": [],
        "topics": [],
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
<div style="font-size:10px;color:#aaa;margin-top:2px">{buzz.get("reddit_bullish_pct", 50)}% bull</div>
</td>
<td style="padding:10px 14px">{badge}</td>
</tr>"""

    bonus_html = ""
    if bonus:
        bonus_cards = "".join(
            [
                f'<div style="background:white;border:1px solid #e8e8e8;border-radius:10px;padding:14px 16px;flex:1;min-width:220px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:16px;font-weight:700;color:#1a1a2e">{b["ticker"]}</span><span style="background:#FAEEDA;color:#633806;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">🔥 Buzz Alert</span></div><div style="font-size:12px;color:#666">{b["name"]}</div><div style="font-size:12px;color:#097c3e;font-weight:600;margin-top:6px">+{b["change_pct"]}% · Buzz {b.get("buzz",{}).get("score",0)}/10 · {b.get("buzz",{}).get("reddit_bullish_pct",50)}% bullish</div></div>'
                for b in bonus[:3]
            ]
        )
        bonus_html = f'<div style="padding:20px 24px;background:#f8f9fa;border-top:1px solid #eee"><div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">🔥 Buzz Alerts — Top stocks with extraordinary buzz</div><div style="display:flex;gap:12px;flex-wrap:wrap">{bonus_cards}</div></div>'

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
    t_start = time.time()
    print("=" * 50)
    print("STOCK SCOUT - Weekly Scan")
    print("=" * 50)
    week_label = get_week_label()
    print(f"Week: {week_label}\n")

    # 1. Universe (returns list + names dict)
    universe, names = get_ticker_universe()
    if not universe:
        print("FATAL: no tickers")
        return
    print(f"  [+{int(time.time()-t_start)}s]\n")

    # 2. Weekly price changes
    price_data = fetch_weekly_changes(universe)
    if not price_data:
        print("FATAL: no price data")
        return
    print(f"  [+{int(time.time()-t_start)}s]\n")

    # 3. Filter to gainers, find top 20 by % gain that pass market cap
    gainers = [p for p in price_data.values() if p["change_pct"] > 0]
    print(f"Total gainers: {len(gainers)}")

    gainers_dict = {g["ticker"]: g for g in gainers}
    top20 = find_top20_by_marketcap(gainers_dict, names)

    if not top20:
        print("FATAL: no stocks passed market cap filter")
        return
    print(f"  [+{int(time.time()-t_start)}s]\n")

    # 4. ONE Apify batch call for the TOP 20 only (cheap and focused)
    print("--- Fetching buzz for TOP 20 via Apify ---")
    top20_tickers = [s["ticker"] for s in top20]
    top20_names = {s["ticker"]: s["name"] for s in top20}
    
    # Reddit - one big batch call (search by ticker AND company name)
    reddit_data = fetch_reddit_buzz_apify_batch(top20_tickers, top20_names)
    print(f"  [+{int(time.time()-t_start)}s]\n")
    
    # StockTwits - per ticker (smaller calls but still batched)
    stocktwits_data = fetch_stocktwits_apify_batch(top20_tickers)
    print(f"  [+{int(time.time()-t_start)}s]\n")

    # Build buzz objects from the fetched data
    print("--- Building buzz for TOP 20 ---")
    for i, s in enumerate(top20, 1):
        ticker = s["ticker"]
        s["buzz"] = build_buzz_from_data(
            ticker, s["market_cap"], reddit_data.get(ticker, []),
            stocktwits_data.get(ticker, {"count": 0, "bullish": 0, "bearish": 0, "sentiment_pct": 50, "messages": []}),
        )
        print(
            f"  [{i}/20] {ticker}: R={s['buzz']['reddit_count']} ST={s['buzz']['stocktwits_count']} total={s['buzz']['total_count']} score={s['buzz']['score']}/10"
        )

    # 5. Streak from previous week
    prev = get_previous_week_data()
    for s in top20:
        s["streak"] = prev.get(s["ticker"], {}).get("streak", 0) + 1 if s["ticker"] in prev else 1
    returning_count = sum(1 for s in top20 if s["streak"] >= 2)
    print(f"\nStreak: {returning_count} stocks returning from last week")

    # 6. Bonus = top 2-3 stocks from TOP 20 with highest buzz score (>= 7)
    # No extra API calls - we already have the data!
    # The boss wanted: "2-5 stocks where I see something interesting" - this is exactly that.
    buzz_alerts = sorted(
        [s for s in top20 if s["buzz"]["score"] >= 7],
        key=lambda x: (x["buzz"]["score"], x["buzz"]["total_count"]),
        reverse=True,
    )[:3]  # top 3 maximum

    # Mark them in top20 with a flag (so dashboard/email can show 🔥)
    alert_tickers = {b["ticker"] for b in buzz_alerts}
    for s in top20:
        s["buzz_alert"] = s["ticker"] in alert_tickers

    # The bonus list shown separately = same stocks but with their full buzz info
    bonus = buzz_alerts
    print(f"\n🔥 Buzz alerts: {len(bonus)} stocks with buzz score >= 7")
    for b in bonus:
        print(f"  {b['ticker']}: score {b['buzz']['score']}/10, {b['buzz']['total_count']} posts")
    print(f"  [+{int(time.time()-t_start)}s]\n")

    # 7. Save and send
    save_to_supabase(top20, bonus, week_label)
    send_email(top20, bonus, week_label)
    print(f"\n=== DONE in {int(time.time()-t_start)}s ===")


if __name__ == "__main__":
    main()
