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
import argparse
import requests
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from supabase import create_client

# ============== CONFIG ==============
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"]
RESEND_API_KEY = os.environ["RESEND_API_KEY"]
BOSS_EMAIL = os.environ["BOSS_EMAIL"].split(",")[0].strip()  # first email only
MIN_MARKET_CAP = int(os.environ.get("MIN_MARKET_CAP", "250000000"))  # 250M default
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


def get_two_fridays(reference_date=None):
    """Return the two most recent Fridays relative to reference_date.
    If reference_date is None, uses today.
    - this_friday  = most recent Friday on or before reference_date
    - prev_friday  = the Friday 7 days before that
    """
    today = reference_date or datetime.now()
    # weekday(): Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
    if today.weekday() == 4:  # Friday itself
        this_friday = today
    elif today.weekday() < 4:  # Mon-Thu → go back to last week's Friday
        days_back = today.weekday() + 3
        this_friday = today - timedelta(days=days_back)
    else:  # Sat=5, Sun=6 → most recent Friday is this week's
        days_back = today.weekday() - 4
        this_friday = today - timedelta(days=days_back)
    prev_friday = this_friday - timedelta(days=7)
    # Strip time
    this_friday = this_friday.replace(hour=0, minute=0, second=0, microsecond=0)
    prev_friday = prev_friday.replace(hour=0, minute=0, second=0, microsecond=0)
    return prev_friday, this_friday


def get_week_label(reference_date=None):
    """Week label = prev_friday to this_friday. e.g. '01.05-08.05.2025'"""
    prev_friday, this_friday = get_two_fridays(reference_date)
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
def fetch_weekly_changes(tickers, reference_date=None):
    """For each ticker: get last 2 weeks of daily closes, compute % change
    from PREVIOUS Friday close to THIS Friday close.
    Uses exact Friday dates (not '5 days back')."""
    prev_friday, this_friday = get_two_fridays(reference_date)
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
        batch_num = i // BATCH + 1
        total_batches = (len(tickers) + BATCH - 1) // BATCH
        print(f"  Batch {batch_num}/{total_batches} ({len(batch)} tickers)...")
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
    """Find top 20 gainers that pass the market cap filter.

    Strategy: check only the top 100 candidates by % gain — anything outside that
    is not a meaningful top gainer anyway. Use fast_info for market cap (lightweight,
    much less rate-limited than info) with a brief pause after the heavy batch downloads.
    """
    sorted_gainers = sorted(price_data.values(), key=lambda x: x["change_pct"], reverse=True)
    candidates = sorted_gainers[:100]  # only top 100 by % gain

    print(f"Checking market caps for top {len(candidates)} gainers (>= ${MIN_MARKET_CAP/1e6:.0f}M)...")
    print("  Pausing 8s to let rate limits recover after batch downloads...")
    time.sleep(8)

    # Step 1: bulk-fetch market caps via fast_info (lightweight endpoint)
    market_caps = {}
    for idx, c in enumerate(candidates):
        t = c["ticker"]
        try:
            fi = yf.Ticker(t).fast_info
            mc = getattr(fi, "market_cap", None) or 0
            if mc and mc > 0:
                market_caps[t] = int(mc)
        except Exception:
            pass
        if (idx + 1) % 10 == 0:
            time.sleep(0.5)

    print(f"  Got market caps for {len(market_caps)}/{len(candidates)} candidates")

    # Step 2: filter in % order, then fetch full details for the final 20
    top20 = []
    for c in candidates:
        if len(top20) >= 20:
            break
        t = c["ticker"]
        mcap = market_caps.get(t, 0)
        if not mcap or mcap < MIN_MARKET_CAP:
            continue

        name = names_dict.get(t, t)
        sector, industry = "", ""
        basic_signals = {}  # baseline identity-card data for ALL top 20
        try:
            time.sleep(0.8)  # avoid rate limiting when fetching details for final picks
            obj  = yf.Ticker(t)
            info = obj.info
            name = info.get("longName") or info.get("shortName") or name
            sector = info.get("sector") or ""
            industry = info.get("industry") or ""

            # Float
            fl = info.get("floatShares") or 0
            if fl:
                basic_signals["float_m"] = round(fl / 1e6, 1)
            # Short interest
            sp = info.get("shortPercentOfFloat") or 0
            if sp:
                basic_signals["short_pct"] = round(float(sp) * 100, 1)
            # 52W range (from fast_info, no extra rate cost)
            fi = obj.fast_info
            high_52w = getattr(fi, "fifty_two_week_high", None)
            low_52w  = getattr(fi, "fifty_two_week_low", None)
            price    = c["price"]
            if high_52w:
                basic_signals["high_52w"] = round(float(high_52w), 2)
                if price > 0:
                    basic_signals["dist_from_52w_high_pct"] = round((high_52w - price) / high_52w * 100, 1)
            if low_52w:
                basic_signals["low_52w"] = round(float(low_52w), 2)
                if price > 0 and low_52w > 0:
                    basic_signals["gain_from_52w_low_pct"] = round((price - low_52w) / low_52w * 100, 1)
            if high_52w and low_52w and high_52w > low_52w and price > 0:
                basic_signals["pos_in_52w_range_pct"] = round((price - low_52w) / (high_52w - low_52w) * 100, 1)
        except Exception:
            pass

        if len(name) > 60:
            name = name[:57] + "..."

        top20.append({
            "ticker": t,
            "name": name,
            "change_pct": c["change_pct"],
            "price": c["price"],
            "volume": c["volume"],
            "market_cap": mcap,
            "sector": sector,
            "industry": industry,
            "rec_signals": basic_signals,  # baseline data for identity card
        })
        print(f"  [{len(top20)}/20] {t}: +{c['change_pct']}% | ${mcap/1e9:.2f}B | float={basic_signals.get('float_m', 'N/A')}M | {name[:40]}")

    print(f"Found {len(top20)} stocks from top-100 gainers passing market cap filter")
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

    # ⚡ SIMPLIFIED: 1 URL per ticker (cashtag only), more posts per URL
    # Why: $TICKER is the standard convention on Reddit for stocks.
    # Going from 40 URLs → 20 URLs cuts time in half and ensures ALL tickers get covered
    # before any abort. With 50 posts per URL, popular stocks can show high buzz (50)
    # while quiet stocks naturally show low (5-10).
    start_urls = []
    for ticker in tickers:
        start_urls.append({
            "url": f"https://www.reddit.com/search/?q=%24{ticker}&t=week&sort=hot",
        })

    # Use Reddit Scraper Lite - cheap and reliable
    actor_id = "trudax/reddit-scraper-lite"
    run_input = {
        "startUrls": start_urls,
        "maxItems": len(tickers) * 20,  # 20 posts × 20 tickers = 400 max
        "maxPostCount": 20,  # max 20 posts per ticker - enough for buzz signal + 3 quotes
        "skipComments": True,
        "skipUserPosts": True,
        "skipCommunity": True,
        "proxy": {"useApifyProxy": True},
    }

    # Reddit: abort at 400 results = ~$1.20 max cost
    # 20 posts is enough to: detect buzz, measure sentiment, pick 3 quality quotes
    print(f"  Calling Apify actor {actor_id} with {len(start_urls)} URLs (timeout 12 min, abort at 400 results = ~$1.20)...")
    posts = apify_run_actor(actor_id, run_input, timeout=720, target_items=400)  # 12 min, abort at 400
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
    PER_TICKER_LIMIT = 40  # StockTwits is fast and cheap - more = better sentiment + quote selection
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
    # Score based on weighted buzz density
    # Caps: Reddit max 20, StockTwits max 40 → max weighted = 20*3 + 40 = 100
    # A small-cap maxed out = ~70-100 per billion = 9-10
    if weighted_per_billion > 130:   base = 10  # extreme
    elif weighted_per_billion > 85:  base = 9
    elif weighted_per_billion > 55:  base = 8
    elif weighted_per_billion > 35:  base = 7
    elif weighted_per_billion > 20:  base = 6
    elif weighted_per_billion > 10:  base = 5
    elif weighted_per_billion > 5:   base = 4
    elif weighted_per_billion > 2:   base = 3
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
        # Fetch recent scans and sort by week_label date (not created_at).
        # Backfill scans are created after real weekly scans, so created_at order
        # can return the wrong "previous" week.
        r = (
            supabase.table("weekly_scans")
            .select("*")
            .order("created_at", desc=True)
            .limit(30)
            .execute()
        )
        if not r.data:
            return {}

        def parse_week_end(label):
            m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", label)
            if not m:
                return datetime(2000, 1, 1)
            return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))

        sorted_scans = sorted(r.data, key=lambda s: parse_week_end(s["week_label"]), reverse=True)
        prev_scan = sorted_scans[0]
        data = json.loads(prev_scan["stocks_json"])
        stocks = data.get("stocks", data) if isinstance(data, dict) else data
        return {s["ticker"]: s for s in stocks if isinstance(s, dict)}, prev_scan["week_label"]
    except Exception as e:
        print(f"Previous week error: {e}")
    return {}, ""


def week_exists_in_supabase(week_label):
    """Returns True if a scan for this week_label already exists in Supabase."""
    try:
        r = supabase.table("weekly_scans").select("week_label").eq("week_label", week_label).execute()
        return len(r.data) > 0
    except Exception as e:
        print(f"Duplicate check error: {e}")
        return False


def save_to_supabase(stocks, bonus, week_label, backtest_entry=None):
    try:
        payload = {"stocks": stocks, "bonus": bonus}
        if backtest_entry:
            payload["backtest"] = backtest_entry
        supabase.table("weekly_scans").insert(
            {
                "week_label": week_label,
                "stocks_json": json.dumps(payload),
                "created_at": datetime.now().isoformat(),
            }
        ).execute()
        print(f"Saved: {week_label}")
    except Exception as e:
        print(f"Save error: {e}")


# ============== BACKTEST ==============
def compute_weekly_backtest(prev_week_data, price_data, week_label):
    """Compute REAL performance of last week's top 5 picks using this week's price data.
    price_data contains actual change_pct for ALL tradeable stocks — no estimation."""
    if not prev_week_data:
        return None

    prev_stocks = list(prev_week_data.values())
    prev_top5 = sorted(prev_stocks, key=lambda s: s.get("change_pct", 0), reverse=True)[:5]
    if not prev_top5:
        return None

    picks = []
    for s in prev_top5:
        ticker = s["ticker"]
        this_week = price_data.get(ticker)
        actual_gain = round(this_week["change_pct"], 2) if this_week else None
        picks.append({
            "ticker": ticker,
            "prev_gain": round(s.get("change_pct", 0), 2),
            "actual_gain": actual_gain,  # None = stock didn't trade this week
        })

    valid = [p for p in picks if p["actual_gain"] is not None]
    if not valid:
        return None

    wins = sum(1 for p in valid if p["actual_gain"] > 0)
    avg  = round(sum(p["actual_gain"] for p in valid) / len(valid), 2)

    print(f"  Backtest: {wins}/{len(valid)} picks rose | avg: {avg:+.2f}%")
    return {
        "week":  week_label,  # selection week (when picks were chosen)
        "picks": picks,
        "wins":  wins,
        "total": len(valid),
        "avg_gain": avg,
    }


def compute_backtest():
    """For each past week, simulate buying the top 5 picks and measure next-week performance.
    Returns summary stats + week-by-week results."""
    try:
        r = supabase.table("weekly_scans").select("*").order("created_at", desc=True).limit(100).execute()
        scans = r.data or []
    except Exception as e:
        print(f"Backtest: fetch error: {e}")
        return None

    processed = []
    seen = set()
    for scan in scans:
        try:
            label = scan["week_label"]
            if label in seen:
                continue
            seen.add(label)
            parsed = json.loads(scan["stocks_json"])
            stocks = parsed.get("stocks", parsed) if isinstance(parsed, dict) else parsed
            processed.append({"week_label": label, "stocks": stocks})
        except Exception:
            continue

    def parse_week_end(label):
        m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", label)
        if not m:
            return datetime(2000, 1, 1)
        return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))

    processed.sort(key=lambda s: parse_week_end(s["week_label"]), reverse=True)

    if len(processed) < 2:
        return None

    weeks = []
    total_wins = 0
    total_picks = 0
    compound = 1.0

    # processed[0] = newest. For week i (i>=1), next week in time = processed[i-1]
    for i in range(1, len(processed)):
        this_week = processed[i]
        next_week  = processed[i - 1]

        top5 = sorted(this_week["stocks"], key=lambda s: s.get("change_pct", 0), reverse=True)[:5]
        if not top5:
            continue

        next_lookup = {s["ticker"]: s.get("change_pct", 0) for s in next_week["stocks"]}

        picks = []
        for s in top5:
            nxt = next_lookup.get(s["ticker"], 0)
            picks.append({
                "ticker": s["ticker"],
                "this_week": s.get("change_pct", 0),
                "next_week": nxt,
            })
            if nxt > 0:
                total_wins += 1
            total_picks += 1

        gains = [p["next_week"] for p in picks]
        avg = sum(gains) / len(gains)
        compound *= (1 + avg / 100)
        wins = sum(1 for g in gains if g > 0)

        weeks.append({
            "week": this_week["week_label"],
            "picks": picks,
            "avg_next": round(avg, 1),
            "wins": wins,
            "total": len(picks),
        })

    if not weeks:
        return None

    overall_wr   = round(total_wins / total_picks * 100) if total_picks > 0 else 0
    compound_ret = round((compound - 1) * 100, 1)
    avg_weekly   = round(sum(w["avg_next"] for w in weeks) / len(weeks), 1)

    return {
        "total_weeks":   len(weeks),
        "win_rate":      overall_wr,
        "compound_ret":  compound_ret,
        "avg_weekly":    avg_weekly,
        "weeks":         weeks,
    }


# ============== EMAIL ==============
def send_email(stocks, bonus, week_label, backtest=None):
    returning = sum(1 for s in stocks if s.get("streak", 1) >= 2)
    rows = ""
    for i, s in enumerate(stocks, 1):
        streak = s.get("streak", 1)
        if streak >= 4:
            streak_badge = '<span style="background:#FCEBEB;color:#791F1F;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">4+ wks</span>'
        elif streak >= 3:
            streak_badge = f'<span style="background:#FAEEDA;color:#633806;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">{streak} wks</span>'
        elif streak >= 2:
            streak_badge = f'<span style="background:#EAF3DE;color:#27500A;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">{streak} wks</span>'
        else:
            streak_badge = '<span style="background:#f0f0f0;color:#888;padding:2px 8px;border-radius:10px;font-size:10px">New</span>'

        mcap = s["market_cap"]
        mcap_str = f"${mcap/1e9:.1f}B" if mcap >= 1e9 else f"${mcap/1e6:.0f}M"

        sector = s.get("sector", "") or ""
        sector_html = (
            f'<span style="background:#e8f4ff;color:#1a6bb5;padding:2px 7px;border-radius:8px;font-size:10px;font-weight:600;margin-left:6px">{sector}</span>'
            if sector else ""
        )

        if s.get("recommended"):
            cats = s.get("rec_catalysts", [])
            cats_txt = " · ".join(cats) if cats else "highest score"
            conf  = s.get("rec_confidence", "low")
            gap   = s.get("rec_gap", 0)
            conf_emoji = {"high": "🔥", "medium": "✨", "low": "⚠️"}.get(conf, "")
            conf_label = {"high": "High confidence", "medium": "Medium confidence", "low": "Low confidence"}.get(conf, "")
            score = s.get("rec_score", 0)
            recommended_html = (
                f'<div style="margin-top:6px;background:linear-gradient(90deg,#fff3cd 0%,#ffe9a8 100%);'
                f'border-left:4px solid #ff8c00;padding:8px 12px;border-radius:6px">'
                f'<div style="font-size:11px;font-weight:800;color:#7a4a00;letter-spacing:0.5px">🔥 PICK FOR NEXT WEEK '
                f'<span style="font-size:10px;font-weight:600">· score {score} · {conf_emoji} {conf_label} (+{gap})</span></div>'
                f'<div style="font-size:11px;color:#7a4a00;margin-top:2px">{cats_txt}</div>'
                f'</div>'
            )
        else:
            recommended_html = ""

        rows += f"""<tr style="border-bottom:1px solid #f0f0f0">
<td style="padding:10px 14px;color:#999;font-size:13px;font-weight:700">{i}</td>
<td style="padding:10px 14px">
  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
    <span style="font-size:15px;font-weight:800;color:#1a1a2e">{s["ticker"]}</span>
    {streak_badge}{sector_html}
  </div>
  <div style="font-size:11px;color:#999;margin-top:3px">{s["name"]}</div>
  {recommended_html}
</td>
<td style="padding:10px 14px;white-space:nowrap">
  <span style="font-size:18px;font-weight:800;color:#097c3e">+{s["change_pct"]}%</span>
</td>
<td style="padding:10px 14px;color:#666;font-size:13px">{mcap_str}</td>
</tr>"""

    # Backtest track-record section
    backtest_html = ""
    if backtest and backtest.get("total_weeks", 0) >= 2:
        bt = backtest
        wr_color = "#097c3e" if bt["win_rate"] >= 55 else "#cc8800" if bt["win_rate"] >= 40 else "#c0392b"
        avg_color = "#097c3e" if bt["avg_weekly"] > 0 else "#c0392b"
        cmp_color = "#097c3e" if bt["compound_ret"] > 0 else "#c0392b"

        week_rows = ""
        for w in bt["weeks"][:6]:  # last 6 evaluated weeks
            bar_pct = min(100, max(0, w["wins"] / w["total"] * 100))
            bar_color = "#097c3e" if w["wins"] >= 3 else "#cc8800" if w["wins"] >= 2 else "#c0392b"
            avg_sign  = "+" if w["avg_next"] >= 0 else ""
            week_rows += f"""<tr style="border-bottom:1px solid #f0f0f0">
<td style="padding:7px 12px;font-size:11px;color:#555">{w["week"]}</td>
<td style="padding:7px 12px;text-align:center">
  <span style="font-size:12px;font-weight:700;color:{bar_color}">{w["wins"]}/{w["total"]}</span>
</td>
<td style="padding:7px 12px;text-align:right;font-size:12px;font-weight:700;color:{"#097c3e" if w["avg_next"]>=0 else "#c0392b"}">{avg_sign}{w["avg_next"]}%</td>
</tr>"""

        backtest_html = f"""
<div style="padding:24px;background:#f8fbff;border-top:2px solid #1a1a2e">
  <div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px">
    📊 System Track Record — Top 5 picks performance the following week
  </div>
  <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:20px">
    <div style="text-align:center;flex:1;min-width:100px;background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px 10px">
      <div style="font-size:26px;font-weight:800;color:{wr_color}">{bt["win_rate"]}%</div>
      <div style="font-size:11px;color:#999;margin-top:4px">Win Rate</div>
      <div style="font-size:10px;color:#bbb;margin-top:2px">picks up next wk</div>
    </div>
    <div style="text-align:center;flex:1;min-width:100px;background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px 10px">
      <div style="font-size:26px;font-weight:800;color:{avg_color}">{("+" if bt["avg_weekly"]>=0 else "")}{bt["avg_weekly"]}%</div>
      <div style="font-size:11px;color:#999;margin-top:4px">Avg Weekly Gain</div>
      <div style="font-size:10px;color:#bbb;margin-top:2px">top 5 next week avg</div>
    </div>
    <div style="text-align:center;flex:1;min-width:100px;background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px 10px">
      <div style="font-size:26px;font-weight:800;color:{cmp_color}">{("+" if bt["compound_ret"]>=0 else "")}{bt["compound_ret"]}%</div>
      <div style="font-size:11px;color:#999;margin-top:4px">Compound Return</div>
      <div style="font-size:10px;color:#bbb;margin-top:2px">if held each week</div>
    </div>
    <div style="text-align:center;flex:1;min-width:100px;background:white;border:1px solid #e0e0e0;border-radius:10px;padding:14px 10px">
      <div style="font-size:26px;font-weight:800;color:#1a1a2e">{bt["total_weeks"]}</div>
      <div style="font-size:11px;color:#999;margin-top:4px">Weeks Tracked</div>
      <div style="font-size:10px;color:#bbb;margin-top:2px">historical data</div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0">
    <thead><tr style="background:#f8f9fa">
      <th style="padding:7px 12px;text-align:left;font-size:10px;color:#999;font-weight:700">WEEK</th>
      <th style="padding:7px 12px;text-align:center;font-size:10px;color:#999;font-weight:700">PICKS ↑</th>
      <th style="padding:7px 12px;text-align:right;font-size:10px;color:#999;font-weight:700">AVG GAIN</th>
    </tr></thead>
    <tbody>{week_rows}</tbody>
  </table>
  <div style="font-size:10px;color:#bbb;margin-top:10px">* Each week: top 5 gainers selected, performance measured the following week. Past performance does not guarantee future results.</div>
</div>"""

    html = f"""<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f5;font-family:Arial,sans-serif">
<div style="max-width:680px;margin:0 auto">
<div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px;border-radius:16px 16px 0 0">
<h1 style="color:white;margin:0;font-size:22px;font-weight:800">📈 Stock Scout</h1>
<p style="color:#aaa;margin:6px 0 0;font-size:13px">{week_label} · Weekly Top Gainers</p>
</div>
<div style="background:#097c3e;padding:12px 24px">
<span style="color:white;font-size:13px;font-weight:600">{returning} stocks returning · Min cap: ${MIN_MARKET_CAP//1_000_000}M · {len(stocks)} total picks</span>
</div>
<div style="background:white">
<table style="width:100%;border-collapse:collapse">
<thead><tr style="background:#f8f9fa;border-bottom:2px solid #eee">
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:700">#</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:700">STOCK</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:700">GAIN</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:700">MKT CAP</th>
</tr></thead>
<tbody>{rows}</tbody>
</table>
</div>
{backtest_html}
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


# ============== RECOMMENDATION SCORING ==============
def float_score(float_m):
    """Continuous float score, anchored on forensic data
    (winners median ~14.6M, losers median ~66.4M).

    Piecewise-linear, no step discontinuities:
      float <= 10M     →  +5.0  (winner cap)
      float 10M → 75M  →  smooth 5 → 0
      float 75M → 250M →  smooth 0 → -1
      float >= 250M    →  -1.0  (penalty cap)
    """
    if float_m is None or float_m <= 0:
        return 0.0
    if float_m <= 10:
        return 5.0
    if float_m < 75:
        return 5.0 * (75 - float_m) / 65          # 5 at 10M → 0 at 75M
    if float_m < 250:
        return -(float_m - 75) / 175              # 0 at 75M → -1 at 250M
    return -1.0


def volume_score(ratio):
    """Continuous volume score (week vs 3-month daily avg, * 5).
    Mild signal (forensic: winners 3.1 vs losers 2.9), bounded 0-2."""
    if ratio is None or ratio <= 1:
        return 0.0
    if ratio < 2:
        return ratio - 1                          # 0 → 1 between 1x and 2x
    if ratio < 5:
        return 1.0 + (ratio - 2) / 3              # 1 → 2 between 2x and 5x
    return 2.0


def confidence_level(scored):
    """Confidence in the pick = gap between #1 and #2.
    Big gap = the pick stands out. Small gap = all 5 are similar = low confidence."""
    if not scored or len(scored) < 2:
        return "low", 0
    ordered = sorted([s.get("rec_score", 0) for s in scored], reverse=True)
    gap = ordered[0] - ordered[1]
    if gap >= 2.5:
        return "high", gap
    if gap >= 1.0:
        return "medium", gap
    return "low", gap


def compute_recommendation_scores(top5):
    """Score each top-5 pick for NEXT WEEK's likely winner.

    Built from FORENSIC ANALYSIS of 9 historical winners vs 36 losers.
    Uses CONTINUOUS scoring (no step thresholds — fairer, no cliff drops):
      FLOAT (data-driven, dominant signal): -1 → +5
      VOLUME (data-driven, mild signal):      0 → +2
      EARNINGS (theory, volatility catalyst): 0 or +1

    Returns each stock enriched with rec_score (float), rec_signals (dict),
    rec_catalysts (list), recommended (bool), rec_confidence ("high"/"medium"/"low").
    """
    print("\nComputing recommendation scores for top 5 (continuous)...")
    time.sleep(3)

    scored = []
    for stock in top5:
        t = stock["ticker"]
        # Start from any baseline signals already collected during find_top20_by_marketcap
        # (float, short, 52W high/low). compute_recommendation_scores ADDS to it.
        signals = dict(stock.get("rec_signals") or {})
        catalysts = []
        f_sc = v_sc = e_sc = 0.0

        try:
            time.sleep(0.8)
            obj = yf.Ticker(t)

            # --- FLOAT (continuous, -1 to +5) ---
            try:
                info = obj.info
                fl = info.get("floatShares") or 0
                if fl:
                    fm = round(fl / 1e6, 1)
                    signals["float_m"] = fm
                    f_sc = float_score(fm)
                    if fm <= 15:
                        catalysts.append(f"🔥 Tiny float ({fm}M)")
                    elif fm <= 30:
                        catalysts.append(f"Small float ({fm}M)")
                    elif fm >= 150:
                        catalysts.append(f"⚠️ Large float ({fm}M)")
                sp = info.get("shortPercentOfFloat") or 0
                if sp:
                    signals["short_pct"] = round(float(sp) * 100, 1)
            except Exception:
                pass

            # --- VOLUME (continuous, 0 to +2) ---
            fi = obj.fast_info
            avg_vol = getattr(fi, "three_month_average_volume", None)
            if avg_vol and avg_vol > 0 and stock.get("volume", 0) > 0:
                ratio = stock["volume"] / (avg_vol * 5)
                signals["volume_ratio"] = round(ratio, 2)
                v_sc = volume_score(ratio)
                if ratio >= 4.0:
                    catalysts.append(f"Volume {ratio:.1f}x avg")
                elif ratio >= 2.0:
                    catalysts.append(f"Volume {ratio:.1f}x avg")

            # --- EARNINGS (binary, 0 or +1) ---
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

            # --- DISPLAY-ONLY (not scored, but shown in identity card) ---
            hist = obj.history(period="10d", interval="1d")
            if not hist.empty:
                wh = float(hist["High"].max())
                wl = float(hist["Low"].min())
                wc = float(hist["Close"].iloc[-1])
                rng = wh - wl
                if rng > 0:
                    signals["close_location_pct"] = round((wc - wl) / rng * 100, 1)
            # 52-week range — raw values + where the price sits in the range
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
            print(f"  {t}: score error — {e}")

        total = round(max(0, f_sc + v_sc + e_sc), 2)
        signals["score_breakdown"] = {
            "float":    round(f_sc, 2),
            "volume":   round(v_sc, 2),
            "earnings": round(e_sc, 2),
        }
        scored.append({
            **stock,
            "rec_score":     total,
            "rec_signals":   signals,
            "rec_catalysts": catalysts,
        })
        print(f"  {t}: score={total} (float={f_sc:.2f} + vol={v_sc:.2f} + earn={e_sc:.2f})"
              f" | float_m={signals.get('float_m', 'N/A')}")

    # Pick the winner + measure confidence (gap to #2)
    if scored:
        best = max(scored, key=lambda x: x["rec_score"])
        conf_label, gap = confidence_level(scored)
        for s in scored:
            s["recommended"]    = (s["ticker"] == best["ticker"])
            s["rec_confidence"] = conf_label
            s["rec_gap"]        = round(gap, 2)
        emoji = {"high": "🔥", "medium": "✨", "low": "⚠️"}[conf_label]
        print(f"  => {emoji} Pick for Next Week: {best['ticker']} "
              f"(score {best['rec_score']}, gap +{gap:.2f}, confidence={conf_label})")

    return scored


# ============== MAIN ==============
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", type=str, default=None,
                        help="Reference date YYYY-MM-DD for historical mode (no buzz, no email)")
    args = parser.parse_args()

    reference_date = None
    historical_mode = False
    if args.date:
        reference_date = datetime.strptime(args.date, "%Y-%m-%d")
        historical_mode = True

    t_start = time.time()
    print("=" * 50)
    if historical_mode:
        print(f"STOCK SCOUT - Historical Scan ({args.date})")
    else:
        print("STOCK SCOUT - Weekly Scan")
    print("=" * 50)

    week_label = get_week_label(reference_date)
    print(f"Week: {week_label}\n")

    # Check for duplicates — don't overwrite existing scans
    if week_exists_in_supabase(week_label):
        print(f"SKIP: {week_label} already exists in Supabase. Exiting.")
        return

    # 1. Universe (returns list + names dict)
    universe, names = get_ticker_universe()
    if not universe:
        print("FATAL: no tickers")
        return
    print(f"  [+{int(time.time()-t_start)}s]\n")

    # 2. Weekly price changes
    price_data = fetch_weekly_changes(universe, reference_date)
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

    # Compute recommendation scores for top 5 (which of the top 5 is most likely to continue)
    top5_tickers = sorted(top20, key=lambda x: x["change_pct"], reverse=True)[:5]
    if not historical_mode:
        scored = compute_recommendation_scores(top5_tickers)
        scored_map = {s["ticker"]: s for s in scored}
        for s in top20:
            if s["ticker"] in scored_map:
                s.update(scored_map[s["ticker"]])
    else:
        for s in top20:
            s["recommended"] = False
            s["rec_score"] = 0
            s["rec_signals"] = {}

    # Buzz is fetched on-demand from Hall of Fame, not during weekly scans
    # This saves Apify costs — boss uses the "Get Buzz" button for stocks he cares about
    empty_buzz = {
        "reddit_count": 0, "stocktwits_count": 0, "total_count": 0,
        "score": 0, "sentiment_pct": 50, "bullish": 0, "bearish": 0,
        "reddit_bullish_pct": 50, "stocktwits_bullish_pct": 50,
        "quotes": [], "topics": [],
    }
    for s in top20:
        s["buzz"] = empty_buzz
        s["buzz_alert"] = False

    if historical_mode:
        for s in top20:
            s["streak"] = 1
        save_to_supabase(top20, [], week_label)
        print(f"\n=== DONE (historical) in {int(time.time()-t_start)}s ===")
        return

    # 4. Streak + real backtest from previous week
    prev, prev_week_label = get_previous_week_data()
    for s in top20:
        s["streak"] = prev.get(s["ticker"], {}).get("streak", 0) + 1 if s["ticker"] in prev else 1
    returning_count = sum(1 for s in top20 if s["streak"] >= 2)
    print(f"Streak: {returning_count} stocks returning from last week")

    # Real backtest: how did last week's top 5 actually perform THIS week?
    # Label by the SELECTION week (prev_week_label), not the current week.
    print("\nComputing real backtest (last week's picks vs this week's prices)...")
    weekly_backtest = compute_weekly_backtest(prev, price_data, prev_week_label)

    # 5. Save first so compute_backtest can include this week's data
    save_to_supabase(top20, [], week_label, backtest_entry=weekly_backtest)

    # 6. Compute backtest from all historical scans (including the one just saved)
    print("\nComputing backtest track record...")
    backtest = compute_backtest()
    if backtest:
        print(f"  Backtest: {backtest['total_weeks']} weeks | {backtest['win_rate']}% win rate | {backtest['avg_weekly']}% avg weekly | {backtest['compound_ret']}% compound")

    # 7. Send email with track record
    send_email(top20, [], week_label, backtest=backtest)
    print(f"\n=== DONE in {int(time.time()-t_start)}s ===")


if __name__ == "__main__":
    main()
