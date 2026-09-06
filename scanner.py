"""
Stock Scout - Weekly Scanner
- Real weekly % change (Friday-to-Friday close) using yfinance
- Buzz from Reddit (free JSON API) + StockTwits (free API)
- No Apify, no paid APIs
- Saves to Supabase, sends email via Resend
"""

import os
import sys
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


def safe_json(payload):
    """Serialize to STRICT JSON. Python's json.dumps writes bare NaN/Infinity
    (from a div-by-zero in some metric), which is INVALID JSON — JavaScript's
    JSON.parse then throws and the whole scan silently disappears on the
    dashboard. allow_nan=False forces those to be caught; we recursively
    replace any NaN/Inf with None so the output is always valid JSON."""
    import math

    def clean(o):
        if isinstance(o, float):
            return o if math.isfinite(o) else None
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        return o

    return json.dumps(clean(payload))


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
    """For each ticker: pull ~6 months of daily closes. Compute the weekly %
    change (PREVIOUS Friday → THIS Friday) AND relative-strength metrics
    (1/3/6-month returns, trend steadiness, above moving averages).

    The 6-month window is the key upgrade: it lets us find QUIET base-builders
    (the early-SanDisk pattern — steady climbers that never top the weekly
    gainers list) via compute_rising_stars(), not just this week's spikes."""
    prev_friday, this_friday = get_two_fridays(reference_date)
    print(f"Weekly window: {prev_friday.strftime('%d.%m.%Y')} (Fri close) → {this_friday.strftime('%d.%m.%Y')} (Fri close)")
    print(f"Fetching 6mo prices for {len(tickers)} tickers (batched)...")

    # yfinance can handle ~200 tickers per call efficiently
    BATCH = 200
    # Pull ~6.5 months of history → enough for 6-month relative strength,
    # while the last two Fridays still give us the weekly change.
    start = this_friday - timedelta(days=200)
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

    def ret_n_days_back(closes_series, n):
        """% return from the close n trading days ago to the latest close."""
        if len(closes_series) <= n:
            return None
        last = float(closes_series.iloc[-1])
        past = float(closes_series.iloc[-1 - n])
        if past <= 0:
            return None
        return round((last - past) / past * 100, 1)

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

                    rec = {
                        "ticker": t,
                        "price": round(this_close, 2),
                        "prev_price": round(prev_close, 2),
                        "change_pct": round(pct, 2),
                        "volume": weekly_vol,
                    }

                    # --- Relative-strength / trend metrics (from the 6mo series) ---
                    if len(closes) >= 25:
                        rec["ret_1mo"] = ret_n_days_back(closes, 21)
                        rec["ret_3mo"] = ret_n_days_back(closes, 63)
                        rec["ret_6mo"] = ret_n_days_back(closes, 126)
                        # Above moving averages = confirmed uptrend
                        if len(closes) >= 50:
                            ma50 = float(closes.iloc[-50:].mean())
                            rec["above_50dma"] = bool(this_close > ma50)
                            # HOW FAR above matters more than whether. Our own 109
                            # forward-tested picks say the money is made buying a
                            # stock that is trending but NOT yet stretched; a name
                            # 60% above its 50-day average is late, not strong.
                            if ma50 > 0:
                                rec["pct_above_50dma"] = round((this_close - ma50) / ma50 * 100, 1)
                        if len(closes) >= 120:
                            ma200 = float(closes.iloc[-200:].mean()) if len(closes) >= 200 else float(closes.mean())
                            rec["above_200dma"] = bool(this_close > ma200)
                            if ma200 > 0:
                                rec["pct_above_200dma"] = round((this_close - ma200) / ma200 * 100, 1)
                        # ATR(14) — how much this stock moves on a normal day. A
                        # stop has to sit outside the noise or it gets hit by the
                        # noise; without this every stop level is a guess.
                        try:
                            if all(k in ticker_df.columns for k in ("High", "Low")) and len(closes) >= 20:
                                hi = ticker_df["High"].reindex(closes.index)
                                lo = ticker_df["Low"].reindex(closes.index)
                                prev_c = closes.shift(1)
                                tr = pd.concat([hi - lo, (hi - prev_c).abs(), (lo - prev_c).abs()], axis=1).max(axis=1)
                                atr = float(tr.tail(14).mean())
                                if atr > 0 and this_close > 0:
                                    rec["atr14"] = round(atr, 3)
                                    rec["atr_pct"] = round(atr / this_close * 100, 2)
                        except Exception:
                            pass
                        # Volume expansion: are buyers actually showing up lately?
                        try:
                            if len(volumes) >= 60:
                                recent_v = float(volumes.iloc[-10:].mean())
                                base_v = float(volumes.iloc[-60:].mean())
                                if base_v > 0:
                                    rec["vol_ratio"] = round(recent_v / base_v, 2)
                        except Exception:
                            pass
                        # Steadiness: weekly returns over the window. A quiet
                        # base-builder has many positive weeks and is NOT driven
                        # by a single explosive week (that's a spike/pump).
                        try:
                            weekly = closes.resample("W-FRI").last().dropna()
                            wk_returns = weekly.pct_change().dropna() * 100
                            if len(wk_returns) >= 4:
                                pos = int((wk_returns > 0).sum())
                                rec["positive_weeks_pct"] = round(pos / len(wk_returns) * 100)
                                rec["max_week_pct"] = round(float(wk_returns.max()), 1)
                        except Exception:
                            pass

                    all_data[t] = rec
                except Exception:
                    continue
        except Exception as e:
            print(f"  Batch failed: {e}")
            continue

        time.sleep(0.5)  # gentle rate limit

    print(f"Got price data for {len(all_data)} tickers")
    return all_data


TOP_PICKS_TARGET = 40  # expanded from 20 to 40 — catches "building momentum" stocks


def find_top_picks_by_marketcap(price_data, names_dict, target=TOP_PICKS_TARGET):
    """Find top `target` gainers that pass the market cap filter.

    Strategy: check the top 5*target candidates by % gain — anything outside that
    is not a meaningful top gainer anyway. Use fast_info for market cap (lightweight,
    much less rate-limited than info) with a brief pause after the heavy batch downloads.
    """
    sorted_gainers = sorted(price_data.values(), key=lambda x: x["change_pct"], reverse=True)
    candidates = sorted_gainers[:target * 5]  # check 5x the target to account for failures + cap rejections

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

    # Step 2: filter in % order, then fetch full details for the final picks
    top_picks = []
    for c in candidates:
        if len(top_picks) >= target:
            break
        t = c["ticker"]
        mcap = market_caps.get(t, 0)
        if not mcap or mcap < MIN_MARKET_CAP:
            continue

        name = names_dict.get(t, t)
        sector, industry = "", ""
        basic_signals = {}  # baseline identity-card data for ALL picks
        time.sleep(0.8)
        obj = yf.Ticker(t)

        price = c["price"]
        high_52w = None
        low_52w  = None
        info = None

        # .info — name/sector/industry/float/short/52W. Most reliable source.
        try:
            info = obj.info
            name = info.get("longName") or info.get("shortName") or name
            sector = info.get("sector") or ""
            industry = info.get("industry") or ""
            fl = info.get("floatShares") or 0
            if fl:
                basic_signals["float_m"] = round(fl / 1e6, 1)
            sp = info.get("shortPercentOfFloat") or 0
            if sp:
                basic_signals["short_pct"] = round(float(sp) * 100, 1)
            high_52w = info.get("fiftyTwoWeekHigh") or None
            low_52w  = info.get("fiftyTwoWeekLow")  or None
        except Exception:
            pass

        # fast_info fallback if .info didn't give us 52W
        if not (high_52w and low_52w):
            try:
                fi = obj.fast_info
                if not high_52w:
                    high_52w = getattr(fi, "year_high", None) or getattr(fi, "fifty_two_week_high", None)
                if not low_52w:
                    low_52w  = getattr(fi, "year_low", None)  or getattr(fi, "fifty_two_week_low", None)
            except Exception:
                pass

        # 1-year history fallback — always works
        if not (high_52w and low_52w):
            try:
                hist1y = obj.history(period="1y", interval="1d")
                if not hist1y.empty:
                    high_52w = high_52w or float(hist1y["High"].max())
                    low_52w  = low_52w  or float(hist1y["Low"].min())
            except Exception:
                pass

        if high_52w:
            basic_signals["high_52w"] = round(float(high_52w), 2)
            if price > 0:
                # % the stock would need to GAIN (from current price) to retest the 52W high.
                # Consistent with gain_from_52w_low_pct which is also from current-price perspective.
                basic_signals["gain_to_52w_high_pct"] = round((high_52w - price) / price * 100, 1)
                # Old "distance from high as % of high" kept for backwards compat
                basic_signals["dist_from_52w_high_pct"] = round((high_52w - price) / high_52w * 100, 1)
        if low_52w:
            basic_signals["low_52w"] = round(float(low_52w), 2)
            if price > 0 and low_52w > 0:
                basic_signals["gain_from_52w_low_pct"] = round((price - low_52w) / low_52w * 100, 1)
        if high_52w and low_52w and high_52w > low_52w and price > 0:
            basic_signals["pos_in_52w_range_pct"] = round((price - low_52w) / (high_52w - low_52w) * 100, 1)

        if len(name) > 60:
            name = name[:57] + "..."

        top_picks.append({
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
        print(f"  [{len(top_picks)}/{target}] {t}: +{c['change_pct']}% | ${mcap/1e9:.2f}B | float={basic_signals.get('float_m', 'N/A')}M | {name[:40]}")

    print(f"Found {len(top_picks)} stocks from top-{len(candidates)} gainers passing market cap filter")
    return top_picks


# ============== RISING STARS — QUIET BASE-BUILDERS (THE EARLY-SANDISK SCAN) ==============
RISING_STARS_MAX_MCAP = 20_000_000_000   # cap at $20B — we want room to multiply


def _rising_star_score(d, spy_6mo):
    """Score a stock on 'quiet base-builder' DNA from its 6-month metrics.
    High score = sustained outperformance, steady (not a one-week spike),
    confirmed uptrend, still rising. Returns (score 0-100, breakdown)."""
    r6 = d.get("ret_6mo")
    if r6 is None:
        return 0, {}
    parts = {}

    # Sustained relative strength vs market (0-40)
    excess = r6 - spy_6mo
    parts["rs_6mo"] = round(min(40, max(0, excess / 5)), 1)   # +200% excess = full

    # Consistency — % of weeks that were positive (0-25)
    pw = d.get("positive_weeks_pct")
    parts["consistency"] = round(min(25, (pw or 0) / 4), 1) if pw is not None else 0

    # Trend confirmation — above moving averages (0-20)
    trend = (10 if d.get("above_50dma") else 0) + (10 if d.get("above_200dma") else 0)
    parts["trend"] = trend

    # Still rising — recent month positive (0-15)
    r1 = d.get("ret_1mo")
    parts["still_rising"] = round(min(15, max(0, (r1 or 0) / 2)), 1)

    # Spike penalty — if a single week dominates the 6mo gain, it's a spike not a build
    mw = d.get("max_week_pct")
    penalty = 0
    if mw is not None and r6 > 0 and mw / r6 > 0.55:
        penalty = -15
    parts["spike_penalty"] = penalty

    total = round(min(100, max(0, sum(parts.values()))), 1)
    return total, parts


def _entry_zone_score(d, spy_6mo):
    """Score a stock on how good the ENTRY looks right now — not how good the
    company is. Built directly from what our own 109 forward-tested picks
    measured: buying after a +20-50% week compounded +52.9%, while +80-150%
    compounded -89.5%. Extension and steadiness beat excitement."""
    parts = {}

    # Relative strength vs the market (0-30). Real leadership, not noise.
    rs6 = (d.get("ret_6mo") or 0) - spy_6mo
    parts["rel_strength"] = round(min(30, max(0, rs6 / 4)), 1)

    # Extension (0-30) — THE decisive one. The sweet spot is trending but not
    # stretched: roughly 5-20% above the 50-day average. Being far above it is
    # exactly the state our losing picks were in when we bought them.
    ext = d.get("pct_above_50dma")
    if ext is None:
        parts["entry_position"] = 0
    elif ext < 0:      parts["entry_position"] = 5     # below the average: not confirmed
    elif ext <= 20:    parts["entry_position"] = 30    # the zone
    elif ext <= 30:    parts["entry_position"] = 22
    elif ext <= 45:    parts["entry_position"] = 10
    else:              parts["entry_position"] = 0     # late
    # Steadiness (0-20): many green weeks = accumulation, not a lottery ticket.
    pw = d.get("positive_weeks_pct") or 0
    parts["steadiness"] = round(min(20, max(0, (pw - 40) / 2.0)), 1)

    # Smoothness (0-12): penalise a climb carried by one explosive week.
    mw = d.get("max_week_pct")
    if mw is None:     parts["smooth_climb"] = 6
    elif mw <= 20:     parts["smooth_climb"] = 12
    elif mw <= 35:     parts["smooth_climb"] = 7
    elif mw <= 50:     parts["smooth_climb"] = 3
    else:              parts["smooth_climb"] = 0

    # Volume expansion (0-8): buyers arriving beats a quiet drift up.
    vr = d.get("vol_ratio")
    if vr is None:     parts["volume"] = 3
    elif vr >= 1.5:    parts["volume"] = 8
    elif vr >= 1.15:   parts["volume"] = 6
    elif vr >= 0.9:    parts["volume"] = 4
    else:              parts["volume"] = 1

    return round(min(100, sum(parts.values())), 1), parts


def _trade_plan(d):
    """Mechanical risk levels for a candidate — the part that was missing.

    Knowing WHAT looks good is half a decision; the other half is knowing where
    you are wrong and what you would do about it. These are arithmetic outputs of
    a stated rule, not a recommendation:

      invalidation : the 50-day average. The entire reason this stock is on the
                     list is that it is trending above it, so a close below it
                     ends the thesis by definition.
      stop         : the tighter of 2xATR below price and 3% below the 50-day
                     average. Two ATRs is the classic "outside the daily noise"
                     distance; a stop inside the noise gets hit by the noise.
      targets      : 2R and 4R, where R is the distance from entry to stop.
      size         : what fraction of a portfolio a 1% risk budget implies. The
                     user picks the risk budget; this only does the division.
    """
    price = d.get("price")
    atr = d.get("atr14")
    ext = d.get("pct_above_50dma")
    if not price or not atr or ext is None:
        return None
    ma50 = price / (1 + ext / 100) if ext != -100 else None
    if not ma50 or ma50 <= 0:
        return None

    stop_atr = price - 2 * atr
    stop_ma = ma50 * 0.97
    stop = max(stop_atr, stop_ma)          # the tighter (higher) of the two
    # ...but never tighter than one ATR. When a volatile stock sits right on its
    # 50-day average the moving-average stop lands inside the daily noise: STRZ
    # came out at -4.4% while it moves 7.3% on an average day, so ordinary
    # volatility would have taken the position out before the thesis was tested.
    stop = min(stop, price - atr)
    if stop <= 0 or stop >= price:
        return None

    r = price - stop
    stop_pct = round((stop - price) / price * 100, 1)
    return {
        "invalidation_price": round(ma50, 2),
        "stop_price": round(stop, 2),
        "stop_pct": stop_pct,
        "stop_basis": "2xATR" if stop_atr >= stop_ma else "below the 50-day average",
        "atr_pct": d.get("atr_pct"),
        "target_1": round(price + 2 * r, 2),
        "target_2": round(price + 4 * r, 2),
        "target_1_pct": round(2 * r / price * 100, 1),
        "target_2_pct": round(4 * r / price * 100, 1),
        # A 1% risk budget divided by the stop distance. Wide stop -> small position.
        "position_pct_at_1pct_risk": round(1.0 / abs(stop_pct) * 100, 1),
        "pullback_entry": round(ma50 * 1.02, 2),
    }


def _entry_reason(d, parts, ext, rs, scan_appearances):
    """Say what actually got THIS stock onto the list.

    The first version printed the same sentence for every row with the numbers
    swapped, which told the reader nothing about why one name beat another. This
    leads with the trait that scored highest, then adds the flags that genuinely
    distinguish a candidate — and states the reservations too, because a list
    that only ever flatters its own picks is not worth reading."""
    strengths, cautions = [], []

    if ext <= 12:
        strengths.append(f"צמודה לממוצע 50 ({ext:+.0f}%) — הכניסה כאן זולה יחסית והסטופ קצר")
    elif ext <= 20:
        strengths.append(f"{ext:+.0f}% מעל ממוצע 50 — עדיין בתוך אזור הכניסה")
    elif ext <= 30:
        cautions.append(f"{ext:+.0f}% מעל ממוצע 50 — כבר מעט מתוחה, הסטופ יוצא רחוק יותר")
    else:
        cautions.append(f"{ext:+.0f}% מעל ממוצע 50 — בקצה העליון של מה שהמסננת מרשה")

    if rs >= 150:
        strengths.append(f"מובילה את השוק ב-{rs:+.0f}% בחצי שנה — מהחזקות בכל השוק")
    elif rs >= 80:
        strengths.append(f"עוקפת את השוק ב-{rs:+.0f}% בחצי שנה")
    else:
        strengths.append(f"מקדימה את השוק ב-{rs:+.0f}% בחצי שנה — מובילה, אך לא מהבולטות")

    pw = d.get("positive_weeks_pct") or 0
    if pw >= 70:
        strengths.append(f"{pw}% מהשבועות ירוקים — טיפוס יוצא דופן בעקביותו")
    elif pw >= 60:
        strengths.append(f"{pw}% מהשבועות ירוקים")
    else:
        cautions.append(f"רק {pw}% מהשבועות ירוקים — הדרך למעלה מקוטעת")

    mw = d.get("max_week_pct")
    if mw is not None:
        if mw <= 20:
            strengths.append(f"השבוע הגדול ביותר {mw}% — עלתה בלי אף קפיצה חדה, כלומר צבירה ולא פאמפ")
        elif mw <= 35:
            strengths.append(f"השבוע הגדול ביותר {mw}% — בלי קפיצות קיצוניות")
        else:
            cautions.append(f"היה לה שבוע של {mw}% — חלק מהעלייה מגיע מקפיצה, לא מטיפוס")

    vr = d.get("vol_ratio")
    if vr and vr >= 1.4:
        strengths.append(f"המחזור פי {vr} מהרגיל — קונים נכנסים, לא רק היעדר מוכרים")
    elif vr and vr < 0.85:
        cautions.append(f"המחזור רק פי {vr} מהרגיל — הטיפוס קורה בלי אישור של נפח")

    if scan_appearances == 0:
        strengths.append("מעולם לא הופיעה ברשימת המזנקות השבועיות שלנו — בדיוק סוג המטפסת השקטה שהמערכת נבנתה לתפוס")

    if d.get("pct_above_200dma") is None:
        cautions.append("אין לה ממוצע 200 יום — נסחרת פחות משנה ולא נבחנה במחזור שוק שלם")

    txt = "**למה היא ברשימה:** " + "; ".join(strengths) + "."
    if cautions:
        txt += " **לשים לב:** " + "; ".join(cautions) + "."
    return txt


# ============== NEED CHAINS ==============
# The insight this encodes: a stock does not run for hundreds of percent because
# of its chart — it runs because a NEED appeared underneath it. SanDisk ran on an
# AI-driven memory shortage. But that same AI need also lifted power producers,
# turbine makers, transformer suppliers, cooling and uranium — DIFFERENT
# industries serving ONE need. Grouping by industry alone can never connect them.
#
# This is a small static map (industries -> needs), not per-ticker tagging: the
# industry comes from the data, and roughly 40 lines of mapping turn it into the
# thing we actually care about. It is the one place where human judgement about
# how the world works is worth more than any amount of price history.
NEED_CHAINS = {
    "AI - מחשוב ושבבים": [
        "semiconductors", "semiconductor equipment", "semiconductor memory",
        "computer hardware", "electronic components", "information technology services",
        "communication equipment", "scientific & technical instruments",
    ],
    "AI - חשמל ותשתית": [
        "utilities - regulated electric", "utilities - independent power producers",
        "utilities - renewable", "utilities - diversified", "specialty industrial machinery",
        "electrical equipment & parts", "engineering & construction", "uranium",
        "solar", "oil & gas midstream", "building products & equipment",
    ],
    "ביוטק ותרופות": [
        "biotechnology", "drug manufacturers - specialty & generic",
        "drug manufacturers - general", "diagnostics & research", "medical devices",
        "medical instruments & supplies", "pharmaceutical retailers",
    ],
    "בריאות דיגיטלית": [
        "health information services", "healthcare plans", "medical care facilities",
        "health care equipment & services",
    ],
    "תוכנה וענן": [
        "software - infrastructure", "software - application", "internet content & information",
    ],
    "פינטק ותשלומים": [
        "credit services", "capital markets", "financial data & stock exchanges",
        "insurance brokers", "banks - regional", "asset management",
    ],
    "ביטחון וחלל": [
        "aerospace & defense", "conglomerates",
    ],
    "אנרגיה וסחורות": [
        "oil & gas e&p", "oil & gas equipment & services", "oil & gas refining & marketing",
        "gold", "silver", "copper", "other industrial metals & mining", "steel", "coking coal",
    ],
}
_INDUSTRY_TO_NEED = {ind: need for need, inds in NEED_CHAINS.items() for ind in inds}


def compute_need_chains(themes):
    """Roll the industry themes up into the NEEDS they serve.

    A need is only interesting when SEVERAL of its industries are strong at once
    — that is the shape of a real structural shift rather than one hot corner."""
    if not themes:
        return []
    buckets = {}
    for t in themes:
        need = _INDUSTRY_TO_NEED.get((t.get("industry") or "").strip().lower())
        if not need:
            continue
        b = buckets.setdefault(need, {"need": need, "industries": [], "members": 0,
                                      "buyable": 0, "rs": [], "accelerating": 0})
        b["industries"].append(t["industry"])
        b["members"] += t["member_count"]
        b["buyable"] += t.get("buyable_now") or 0
        b["rs"].append(t["median_rs_vs_spy"])
        if t.get("trajectory") == "accelerating":
            b["accelerating"] += 1

    out = []
    for b in buckets.values():
        if len(b["industries"]) < 2:      # one industry is a theme, not a need
            continue
        rs = sorted(b["rs"])
        out.append({
            "need": b["need"],
            "industry_count": len(b["industries"]),
            "industries": b["industries"],
            "member_count": b["members"],
            "buyable_now": b["buyable"],
            "median_rs_vs_spy": round(rs[len(rs) // 2], 1),
            "accelerating_industries": b["accelerating"],
            "breadth_score": round(min(100, len(b["industries"]) * 14
                                       + min(30, b["members"] * 0.5)
                                       + b["accelerating"] * 10), 1),
        })
    out.sort(key=lambda x: -x["breadth_score"])
    if out:
        print("  Need chains (several industries moving on one underlying need):")
        for n in out:
            print(f"    {n['need']:26} {n['industry_count']} industries, {n['member_count']} companies, "
                  f"median RS {n['median_rs_vs_spy']:+.0f}%, {n['accelerating_industries']} accelerating")
    return out


def _load_industry_cache():
    """Carry the ticker->industry map forward between scans.

    Looking an industry up costs a yfinance .info call, so doing it for hundreds
    of tickers every week would be unaffordable. The map is stored inside the
    scan payload itself, which means no extra table and no setup: each run reads
    the newest map, fills in only what is missing, and saves the union."""
    try:
        r = supabase.table("weekly_scans").select("stocks_json").order("created_at", desc=True).limit(6).execute()
        for row in (r.data or []):
            try:
                pl = json.loads(row["stocks_json"])
                m = pl.get("industry_map")
                if m:
                    print(f"  industry cache: {len(m)} tickers carried forward")
                    return dict(m)
            except Exception:
                continue
    except Exception as e:
        print(f"  industry cache unavailable: {e}")
    return {}


def compute_themes(price_data, names_dict, pool=300, lookup_budget=180):
    """WHAT IS THE MARKET ACTUALLY BUYING?

    A stock does not go up hundreds of percent for no reason. SanDisk ran because
    AI created a memory shortage — and that shortage lifted the whole memory
    industry, not one ticker. A thesis shows up in the price of SEVERAL companies
    at once, well before it shows up in the news.

    Every other screen in this system looks at one stock at a time, which makes it
    structurally blind to exactly that signal. This one groups the market's
    strongest names by industry: when many companies in one industry lead the
    market together, something real is happening there.

    The output is deliberately two-sided — how strong the theme is, AND how many
    of its members are still at a sane entry. A theme where everything has already
    gone parabolic is a theme we found too late."""
    spy_3mo, spy_6mo = _spy_baseline()

    # Ranking on six-month strength alone only ever finds MATURE themes — by the
    # time an industry leads over six months, most of the move has happened. A
    # theme that started five weeks ago (which is exactly what we want to catch)
    # would be invisible. So build the pool from BOTH horizons: the established
    # leaders and the names that have come alive in the last month.
    have6 = [d for d in price_data.values() if d.get("ret_6mo") is not None]
    top_6mo = sorted(have6, key=lambda d: d["ret_6mo"], reverse=True)[:pool]
    have1 = [d for d in price_data.values() if d.get("ret_1mo") is not None]
    top_1mo = sorted(have1, key=lambda d: d["ret_1mo"], reverse=True)[:pool // 2]

    seen, ranked = set(), []
    for d in top_6mo + top_1mo:
        if d["ticker"] in seen:
            continue
        seen.add(d["ticker"])
        ranked.append(d)
    if not ranked:
        print("Themes: no ranked universe")
        return []
    print(f"\nThemes: {len(ranked)} names ({len(top_6mo)} strongest over 6 months, "
          f"plus {len(ranked) - len(top_6mo)} that only came alive in the last month)")

    cache = _load_industry_cache()
    missing = [d["ticker"] for d in ranked if d["ticker"] not in cache]
    print(f"  {len(missing)} of them need an industry lookup (budget {lookup_budget})")
    for t in missing[:lookup_budget]:
        try:
            time.sleep(0.45)
            info = yf.Ticker(t).info
            cache[t] = [info.get("industry") or "", info.get("sector") or ""]
        except Exception:
            cache[t] = ["", ""]

    groups = {}
    for d in ranked:
        ind, sec = (cache.get(d["ticker"]) or ["", ""])[:2]
        if not ind:
            continue
        groups.setdefault(ind, {"industry": ind, "sector": sec, "members": []})["members"].append(d)

    def _median(vals):
        v = sorted(x for x in vals if x is not None)
        return v[len(v) // 2] if v else None

    themes = []
    for ind, g in groups.items():
        mem = g["members"]
        if len(mem) < 3:            # one or two names is a story, not a theme
            continue

        med6 = _median([d["ret_6mo"] - spy_6mo for d in mem if d.get("ret_6mo") is not None])
        med3 = _median([d["ret_3mo"] - spy_3mo for d in mem if d.get("ret_3mo") is not None])
        med1 = _median([d.get("ret_1mo") for d in mem])
        if med6 is None:
            continue
        median_ext = _median([d.get("pct_above_50dma") for d in mem])

        # TRAJECTORY - the part that decides whether we are early or late.
        # Compare the pace of the last month against the pace the last six months
        # implies. An industry running far faster than its own six-month average
        # is a theme catching fire NOW; one whose last month is negative is a
        # theme we are reading about after the fact.
        implied_monthly = med6 / 6.0
        acceleration = (med1 - implied_monthly) if med1 is not None else 0.0
        if med1 is not None and med1 < 0:
            trajectory, traj_he = "fading", "דועך"
        elif acceleration > 6:
            trajectory, traj_he = "accelerating", "מתלקח"
        else:
            trajectory, traj_he = "steady", "יציב"

        early = [d for d in mem
                 if d.get("above_50dma") and d.get("above_200dma")
                 and (d.get("pct_above_50dma") or 99) <= 30]

        # Breadth x strength, then rewarded for accelerating and penalised for
        # fading — because WHEN we find a theme matters as much as how strong it is.
        heat = (len(mem) ** 0.7) * 6 + min(40, med6 / 6)
        if trajectory == "accelerating":
            heat += 12
        elif trajectory == "fading":
            heat -= 15
        heat = round(max(0, min(100, heat)), 1)

        themes.append({
            "industry": ind,
            "sector": g["sector"],
            "member_count": len(mem),
            "heat": heat,
            "median_rs_vs_spy": round(med6, 1),
            "median_rs_3mo": round(med3, 1) if med3 is not None else None,
            "median_ret_1mo": round(med1, 1) if med1 is not None else None,
            "acceleration": round(acceleration, 1),
            "trajectory": trajectory,
            "trajectory_he": traj_he,
            "median_pct_above_50dma": round(median_ext, 1) if median_ext is not None else None,
            "stage": ("מוקדם" if median_ext is not None and median_ext <= 25
                      else "בעיצומו" if median_ext is not None and median_ext <= 55
                      else "מתקדם"),
            "buyable_now": len(early),
            "members": [{
                "ticker": d["ticker"],
                "name": (names_dict.get(d["ticker"]) or d["ticker"])[:44],
                "rs_vs_spy_6mo": round(d["ret_6mo"] - spy_6mo, 1) if d.get("ret_6mo") is not None else None,
                "ret_1mo": d.get("ret_1mo"),
                "ret_6mo": d.get("ret_6mo"),
                "pct_above_50dma": d.get("pct_above_50dma"),
                "price": d.get("price"),
                "at_good_entry": bool(d.get("above_50dma") and d.get("above_200dma")
                                      and (d.get("pct_above_50dma") or 99) <= 30),
            } for d in sorted(mem, key=lambda x: -(x.get("ret_6mo") or -999))[:14]],
        })

    themes.sort(key=lambda t: -t["heat"])
    themes = themes[:10]
    if themes:
        print("  Hottest industries right now:")
        for t in themes:
            print(f"    {t['industry'][:38]:40} {t['member_count']:>3} leaders | "
                  f"median RS {t['median_rs_vs_spy']:+7.0f}% | {t['stage']} | "
                  f"{t['buyable_now']} still at a good entry")
    return themes, cache


def compute_entry_zone(price_data, names_dict, target=15, themes=None):
    """THE BUY LIST — stocks that are in a confirmed uptrend but have NOT yet
    gone parabolic, i.e. the only profile our forward-tested data ever made
    money on. This is the answer to "which stocks do we actually enter?".

    Everything here is arithmetic on price and volume. No AI, no API keys."""
    spy_3mo, spy_6mo = _spy_baseline()
    print(f"\nEntry Zone: SPY 6mo baseline {spy_6mo:+.1f}% — hunting confirmed-but-not-extended")

    # A stock leading the market on its own is one thing. A stock leading the
    # market while its whole industry does the same is a stock with a REASON
    # behind it, and that reason is what separates a good chart from a run.
    theme_of = {}
    for th in (themes or []):
        if th.get("trajectory") == "fading":
            continue
        for m in (th.get("members") or []):
            theme_of[m["ticker"]] = th


    # How often has each name already shown up in our weekly top-40? A candidate
    # that has NEVER been there is the quiet climber this screen exists to find,
    # and that is worth saying in its reason.
    ticker_scans = {}
    try:
        r = supabase.table("weekly_scans").select("week_label,stocks_json").order("created_at", desc=True).limit(30).execute()
        for row in (r.data or []):
            try:
                pl = json.loads(row["stocks_json"])
                for st in (pl.get("stocks") or []):
                    tk = st.get("ticker")
                    if tk:
                        ticker_scans.setdefault(tk, []).append(row["week_label"])
            except Exception:
                continue
    except Exception as e:
        print(f"  (scan-history lookup failed: {e})")

    scored = []
    rejected = {"no_data": 0, "downtrend": 0, "too_extended": 0, "spiky": 0, "weak_rs": 0, "just_exploded": 0}
    for d in price_data.values():
        if d.get("ret_6mo") is None or d.get("pct_above_50dma") is None:
            rejected["no_data"] += 1; continue
        # Confirmed uptrend — must be above BOTH averages.
        if not (d.get("above_50dma") and d.get("above_200dma")):
            rejected["downtrend"] += 1; continue
        # Not already stretched. This single line is the lesson of the -89.5%.
        if d["pct_above_50dma"] > 45:
            rejected["too_extended"] += 1; continue
        # Not carried by one explosive week.
        if (d.get("max_week_pct") or 0) > 55:
            rejected["spiky"] += 1; continue
        # Must actually be leading the market.
        if (d["ret_6mo"] - spy_6mo) < 25:
            rejected["weak_rs"] += 1; continue
        # And must not have just detonated this week — that IS the losing bucket.
        if (d.get("change_pct") or 0) > 55:
            rejected["just_exploded"] += 1; continue

        score, parts = _entry_zone_score(d, spy_6mo)
        # This loop iterates over `d`; `t` only exists in the loop below. Reading
        # it here raised NameError, _safe swallowed it, and the whole Entry Zone
        # came back None — which then silently left LAST week's list on screen.
        th = theme_of.get(d["ticker"])
        if th:
            # Breadth of the industry behind it, extra when that industry is
            # accelerating rather than merely strong. Capped so a theme can
            # promote a good setup but never rescue a weak one.
            bonus = min(12, 3 + th["member_count"] * 0.35)
            if th.get("trajectory") == "accelerating":
                bonus += 4
            parts["theme_backing"] = round(bonus, 1)
            score = round(min(100, score + bonus), 1)
        scored.append((score, parts, d))

    scored.sort(key=lambda x: x[0], reverse=True)
    print(f"  passed the profile: {len(scored)}   rejected: {rejected}")

    picks = []
    for score, parts, d in scored[:150]:
        if len(picks) >= target:
            break
        t = d["ticker"]
        th = theme_of.get(t)          # resolve per row; never inherit from above
        try:
            time.sleep(0.4)
            mc = getattr(yf.Ticker(t).fast_info, "market_cap", None) or 0
        except Exception:
            mc = 0
        if not mc or mc < MIN_MARKET_CAP or mc > RISING_STARS_MAX_MCAP:
            continue

        sector, name = "", names_dict.get(t, t)
        fund = {}
        try:
            time.sleep(0.6)
            info = yf.Ticker(t).info
            name = info.get("longName") or info.get("shortName") or name
            sector = info.get("sector") or ""
            # We are already paying for this call — take the fundamentals too.
            # Whether the business behind the chart is actually growing is the
            # difference between a real leader and a squeeze.
            rg = info.get("revenueGrowth")
            fund["revenue_growth_pct"] = round(rg * 100, 1) if rg is not None else None
            fund["target_mean"] = info.get("targetMeanPrice")
            fund["analyst_count"] = info.get("numberOfAnalystOpinions")
            fund["short_pct"] = (round(info.get("shortPercentOfFloat") * 100, 1)
                                 if info.get("shortPercentOfFloat") is not None else None)
            fund["industry"] = info.get("industry") or ""
        except Exception:
            pass
        if len(name) > 60:
            name = name[:57] + "..."

        ext = d["pct_above_50dma"]
        picks.append({
            "ticker": t, "name": name, "sector": sector,
            "price": d["price"], "market_cap": int(mc),
            "entry_score": score, "entry_breakdown": parts,
            "pct_above_50dma": ext,
            "pct_above_200dma": d.get("pct_above_200dma"),
            "ret_1mo": d.get("ret_1mo"), "ret_3mo": d.get("ret_3mo"), "ret_6mo": d.get("ret_6mo"),
            "rs_vs_spy_6mo": round(d["ret_6mo"] - spy_6mo, 1),
            "positive_weeks_pct": d.get("positive_weeks_pct"),
            "max_week_pct": d.get("max_week_pct"),
            "vol_ratio": d.get("vol_ratio"),
            "this_week_pct": d.get("change_pct"),
            "plan": _trade_plan(d),
            "revenue_growth_pct": fund.get("revenue_growth_pct"),
            "target_mean": fund.get("target_mean"),
            "analyst_count": fund.get("analyst_count"),
            "short_pct": fund.get("short_pct"),
            "target_upside_pct": (round((fund["target_mean"] - d["price"]) / d["price"] * 100, 1)
                                  if fund.get("target_mean") and d.get("price") else None),
            "theme": ({"industry": th["industry"], "member_count": th["member_count"],
                       "trajectory": th["trajectory"], "trajectory_he": th["trajectory_he"],
                       "stage": th["stage"], "median_rs_vs_spy": th["median_rs_vs_spy"]}
                      if th else None),
            # Plain-language reason, so the list explains itself without an AI.
            "why": _entry_reason(d, parts, ext, d["ret_6mo"] - spy_6mo,
                                 len(ticker_scans.get(t, []))),
        })
        print(f"  [{len(picks)}/{target}] {t}: entry {score} | {ext:+.0f}% vs 50dma | "
              f"RS {d['ret_6mo']-spy_6mo:+.0f}% | ${mc/1e9:.2f}B")

    print(f"Entry Zone: {len(picks)} stocks in the buy zone")
    return picks


def compute_shortlist(entry_zone, rising_stars, radar, trend, themes, top_n=5):
    """THE SHORTLIST — the two or three names to actually put in front of the boss.

    Six lenses is six opinions, and a person still has to turn them into a
    decision. That gap is where a good tool stops being a good investment. This
    collapses everything into one ranked answer, built only from candidates that
    already passed the Entry Zone gates, so nothing here is extended or spiky.

    Conviction is weighted by what our own 109 forward-tested picks actually
    measured, not by what sounds impressive:
      entry quality  30 - where in the move it is. The single biggest driver of
                          whether money was made, so it carries the most weight.
      leadership     25 - is it genuinely beating the market
      theme          20 - is there a NEED behind it. SanDisk ran on an AI memory
                          shortage; a stock with a reason outlasts one without.
      climb quality  15 - accumulation rather than a pump
      confirmation   10 - how many independent lenses arrived at it separately
    """
    if not entry_zone:
        print("Shortlist: no entry-zone candidates")
        return []

    rs_by = {x["ticker"]: x for x in (rising_stars or [])}
    radar_by = {x["ticker"]: x for x in (radar or [])}
    trend_by = {x["ticker"]: x for x in (trend or [])}

    picks = []
    for e in entry_zone:
        t = e["ticker"]
        ext = e.get("pct_above_50dma")
        parts, why, watch = {}, [], []

        # --- entry quality (0-30): the money-maker ---
        if ext is None:
            parts["entry"] = 0
        elif ext <= 12:
            parts["entry"] = 30
            why.append(f"צמודה לממוצע 50 ({ext:+.0f}%) — הסטופ קצר והסיכון לעסקה קטן")
        elif ext <= 20:
            parts["entry"] = 26
            why.append(f"{ext:+.0f}% מעל ממוצע 50 — עדיין בתוך אזור הכניסה")
        elif ext <= 30:
            parts["entry"] = 17
            watch.append(f"{ext:+.0f}% מעל הממוצע — הסטופ יוצא רחוק יותר")
        else:
            parts["entry"] = 8
            watch.append(f"{ext:+.0f}% מעל הממוצע — בקצה העליון של מה שהמסננת מרשה")

        # --- leadership (0-25) ---
        rs = e.get("rs_vs_spy_6mo") or 0
        parts["leadership"] = round(min(25, max(0, rs / 6)), 1)
        if rs >= 150:
            why.append(f"מובילה את השוק ב-{rs:+.0f}% בחצי שנה — מהחזקות בכל השוק")
        elif rs >= 80:
            why.append(f"עוקפת את השוק ב-{rs:+.0f}% בחצי שנה")

        # --- theme: is there a need behind it (0-20) ---
        th = e.get("theme")
        if th:
            base = min(14, 4 + th["member_count"] * 0.4)
            if th.get("trajectory") == "accelerating":
                base += 6
                why.append(f"התמה שלה ({th['industry']}) מתלקחת עכשיו — {th['member_count']} חברות מהתעשייה מובילות את השוק יחד")
            else:
                why.append(f"נתמכת בתמה חיה: {th['member_count']} חברות מ-{th['industry']} מובילות יחד")
            parts["theme"] = round(min(20, base), 1)
        else:
            parts["theme"] = 0
            watch.append("אין תמה מזוהה מאחוריה — היא עולה לבדה, בלי סיפור שמרים ענף שלם")

        # --- quality of the climb (0-15) ---
        pw = e.get("positive_weeks_pct") or 0
        mw = e.get("max_week_pct") or 0
        q = min(9, max(0, (pw - 40) / 4.0)) + (6 if mw <= 20 else 3 if mw <= 35 else 0)
        parts["climb"] = round(q, 1)
        if pw >= 68 and mw <= 25:
            why.append(f"{pw}% שבועות ירוקים והשבוע הגדול ביותר רק {mw}% — צבירה שקטה, לא פאמפ")
        elif mw > 40:
            watch.append(f"היה לה שבוע של {mw}% — חלק מהעלייה מגיע מקפיצה")

        # --- confirmation: independent lenses that found it too (0-10) ---
        lenses = ["אזור כניסה"]
        if t in rs_by: lenses.append("כוכבים עולים")
        if t in radar_by: lenses.append("ראדאר")
        if t in trend_by: lenses.append("המגמה")
        parts["confirmation"] = min(10, (len(lenses) - 1) * 4)
        if len(lenses) >= 3:
            why.append(f"אותרה במקביל ב-{len(lenses)} עדשות שונות של המערכת ({', '.join(lenses)})")

        # --- fundamentals: colour the case, and flag when they contradict it ---
        rg = e.get("revenue_growth_pct")
        if rg is not None:
            if rg >= 30:
                why.append(f"ההכנסות צומחות {rg:+.0f}% — יש עסק אמיתי מאחורי הגרף")
                parts["fundamentals_bonus"] = 5
            elif rg < 0:
                watch.append(f"ההכנסות יורדות {rg:.0f}% — הגרף עולה בזמן שהעסק מתכווץ")
                parts["fundamentals_bonus"] = -6
            else:
                parts["fundamentals_bonus"] = 1
        up = e.get("target_upside_pct")
        if up is not None and (e.get("analyst_count") or 0) >= 3:
            if up >= 15:
                why.append(f"עוד {up:+.0f}% עד יעד האנליסטים הממוצע ({e.get('analyst_count')} מכסים)")
                parts["analyst_bonus"] = 4
            elif up <= -10:
                watch.append(f"המחיר כבר {abs(up):.0f}% מעל יעד האנליסטים — הרחוב חושב שהיא מתומחרת מלא")
                parts["analyst_bonus"] = -5
        if e.get("short_pct") and e["short_pct"] >= 15:
            watch.append(f"{e['short_pct']}% מהמניות בשורט — חלק מהעלייה עשוי להיות סגירת שורטים")

        conviction = round(max(0, min(100, sum(parts.values()))), 1)
        picks.append({
            **{k: e.get(k) for k in (
                "ticker", "name", "sector", "price", "market_cap", "pct_above_50dma",
                "pct_above_200dma", "rs_vs_spy_6mo", "positive_weeks_pct", "max_week_pct",
                "vol_ratio", "ret_1mo", "ret_3mo", "ret_6mo", "plan", "theme",
                "revenue_growth_pct", "target_upside_pct", "analyst_count", "short_pct")},
            "conviction": conviction,
            "conviction_breakdown": parts,
            "lenses": lenses,
            "why": why,
            "watch": watch,
        })

    picks.sort(key=lambda x: -x["conviction"])
    picks = picks[:top_n]
    if picks:
        print(f"  Shortlist — the {len(picks)} highest-conviction ideas:")
        for i, p in enumerate(picks, 1):
            th = p.get("theme")
            print(f"    #{i} {p['ticker']:6} conviction {p['conviction']:5} | "
                  f"{p['pct_above_50dma']:+5.0f}% vs 50dma | RS {p['rs_vs_spy_6mo']:+6.0f}% | "
                  f"{len(p['lenses'])} lenses | theme: {th['industry'] if th else 'none'}")
    return picks


def compute_rising_stars(price_data, names_dict, target=20):
    """Find QUIET BASE-BUILDERS across the whole market — stocks with strong
    sustained 6-month relative strength that may NOT be this week's top gainers.
    This is the scan that catches the early SanDisk before the parabolic run."""
    spy_3mo, spy_6mo = _spy_baseline()
    print(f"\nRising Stars: SPY 6mo baseline {spy_6mo:+.1f}%")

    # Score every stock that has 6-month data
    scored = []
    for d in price_data.values():
        if d.get("ret_6mo") is None:
            continue
        score, parts = _rising_star_score(d, spy_6mo)
        if score <= 0:
            continue
        scored.append((score, parts, d))
    scored.sort(key=lambda x: x[0], reverse=True)

    # Take the top ~120 by score, then market-cap filter to small/mid with room
    candidates = scored[:120]
    print(f"Rising Stars: market-cap filtering top {len(candidates)} candidates...")
    time.sleep(2)

    stars = []
    for score, parts, d in candidates:
        if len(stars) >= target:
            break
        t = d["ticker"]
        try:
            time.sleep(0.4)
            fi = yf.Ticker(t).fast_info
            mc = getattr(fi, "market_cap", None) or 0
        except Exception:
            mc = 0
        if not mc or mc < MIN_MARKET_CAP or mc > RISING_STARS_MAX_MCAP:
            continue

        # Fetch sector/name/short for the final list
        sector, name = "", names_dict.get(t, t)
        try:
            time.sleep(0.6)
            info = yf.Ticker(t).info
            name = info.get("longName") or info.get("shortName") or name
            sector = info.get("sector") or ""
        except Exception:
            pass
        if len(name) > 60:
            name = name[:57] + "..."

        stars.append({
            "ticker": t,
            "name": name,
            "sector": sector,
            "price": d["price"],
            "market_cap": int(mc),
            "rs_score": score,
            "rs_breakdown": parts,
            "ret_1mo": d.get("ret_1mo"),
            "ret_3mo": d.get("ret_3mo"),
            "ret_6mo": d.get("ret_6mo"),
            "positive_weeks_pct": d.get("positive_weeks_pct"),
            "max_week_pct": d.get("max_week_pct"),
            "above_50dma": d.get("above_50dma"),
            "above_200dma": d.get("above_200dma"),
            "this_week_pct": d.get("change_pct"),
        })
        print(f"  [{len(stars)}/{target}] {t}: score {score} | 6mo {d.get('ret_6mo')}% | "
              f"${mc/1e9:.2f}B | {sector}")

    print(f"Rising Stars: found {len(stars)} quiet base-builders")
    return stars


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


def save_to_supabase(stocks, bonus, week_label, backtest_entry=None, trend_data=None, replace=False):
    """Save the week's scan. Returns True on success.

    The caller MUST check the result. This used to swallow every exception and
    return quietly, so a scan that saved nothing — every run while the database
    was paused — still exited 0 and was reported as a successful scan."""
    try:
        payload = {"stocks": stocks, "bonus": bonus}
        if backtest_entry:
            payload["backtest"] = backtest_entry
        if trend_data:
            payload["trend"] = trend_data
        row = {
            "week_label": week_label,
            "stocks_json": safe_json(payload),
            "created_at": datetime.now().isoformat(),
        }
        # Never delete the existing week before the replacement is safely in.
        # Deleting first opened a window where the old enrichments were already
        # gone and the new ones were not written yet (they land at the end of the
        # scan), so a crash mid-run would have destroyed the week outright.
        old_ids = []
        if replace:
            try:
                existing = supabase.table("weekly_scans").select("id").eq("week_label", week_label).execute()
                old_ids = [r["id"] for r in (existing.data or [])]
            except Exception as e:
                print(f"  (could not list existing rows for {week_label}: {e})")

        supabase.table("weekly_scans").insert(row).execute()
        print(f"Saved: {week_label}")

        for rid in old_ids:
            try:
                supabase.table("weekly_scans").delete().eq("id", rid).execute()
            except Exception as e:
                print(f"  (could not remove superseded row {rid}: {e})")
        if old_ids:
            print(f"  replaced {len(old_ids)} superseded row(s) for {week_label}")
        return True
    except Exception as e:
        print(f"Save error: {e}")
        return False


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


# ============== THE TREND — TOP-10 BY COMPOUND RETURN ACROSS ALL WEEKS ==============
def _fetch_trend_identity(ticker):
    """Fetch the full identity-card data for a Trend stock:
    - 52W range + current price
    - Analyst targets (mean / high / low / # of analysts / recommendation)
    - Float, short interest
    - Sector, industry
    - Business summary (what the company does)
    - Market cap

    All from yfinance .info — single call. Returns dict (may be partial on errors)."""
    out = {}
    try:
        time.sleep(0.4)
        obj = yf.Ticker(ticker)
        info = obj.info
        # Basic
        out["name"]     = info.get("longName") or info.get("shortName")
        out["sector"]   = info.get("sector") or ""
        out["industry"] = info.get("industry") or ""
        out["website"]  = info.get("website") or ""
        out["country"]  = info.get("country") or ""
        # Price
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        if price:
            out["price"] = round(float(price), 2)
        # Market cap
        mc = info.get("marketCap") or 0
        if mc:
            out["market_cap"] = int(mc)
        # 52W
        high_52w = info.get("fiftyTwoWeekHigh")
        low_52w  = info.get("fiftyTwoWeekLow")
        if high_52w: out["high_52w"] = round(float(high_52w), 2)
        if low_52w:  out["low_52w"]  = round(float(low_52w), 2)
        if high_52w and low_52w and price and high_52w > low_52w:
            out["pos_in_52w_range_pct"] = round((price - low_52w) / (high_52w - low_52w) * 100, 1)
            out["gain_from_52w_low_pct"] = round((price - low_52w) / low_52w * 100, 1)
            out["gain_to_52w_high_pct"] = round((high_52w - price) / price * 100, 1)
        # Float + short
        fl = info.get("floatShares") or 0
        if fl: out["float_m"] = round(fl / 1e6, 1)
        sp = info.get("shortPercentOfFloat") or 0
        if sp: out["short_pct"] = round(float(sp) * 100, 1)
        # Analyst targets — the boss wants TradingView-style ratings
        tgt_mean = info.get("targetMeanPrice")
        tgt_high = info.get("targetHighPrice")
        tgt_low  = info.get("targetLowPrice")
        tgt_med  = info.get("targetMedianPrice")
        rec_key  = info.get("recommendationKey") or ""
        n_analy  = info.get("numberOfAnalystOpinions") or 0
        if tgt_mean: out["target_mean"]  = round(float(tgt_mean), 2)
        if tgt_high: out["target_high"]  = round(float(tgt_high), 2)
        if tgt_low:  out["target_low"]   = round(float(tgt_low), 2)
        if tgt_med:  out["target_median"] = round(float(tgt_med), 2)
        if rec_key:  out["recommendation"] = rec_key
        if n_analy:  out["analyst_count"]  = int(n_analy)
        if tgt_mean and price:
            out["target_upside_pct"] = round((tgt_mean - price) / price * 100, 1)
        # Business summary — the boss wants to know WHAT the company does
        summary = info.get("longBusinessSummary") or ""
        if summary:
            # Cap at ~600 chars — enough to convey the business without
            # overwhelming the UI
            out["business_summary"] = summary[:600] + ("..." if len(summary) > 600 else "")
    except Exception as e:
        print(f"    {ticker}: identity fetch error — {type(e).__name__}")
    return out


def _fetch_continuous_weekly_changes(ticker, fridays):
    """Fetch the % change for each consecutive Friday-to-Friday week.
    Returns dict: week_label -> change_pct. Even weeks the stock wasn't in our
    scans are included — that's the whole point of 'continuous trend'."""
    if len(fridays) < 2:
        return {}
    try:
        time.sleep(0.4)
        start = fridays[0] - timedelta(days=10)
        end   = fridays[-1] + timedelta(days=2)
        hist = yf.Ticker(ticker).history(
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            interval="1d",
            auto_adjust=True,
        )
        if hist.empty:
            return {}
        # yfinance returns timezone-aware index; strip it so naive Timestamp
        # comparisons in close_on_or_before work without TypeError.
        if hist.index.tz is not None:
            hist.index = hist.index.tz_localize(None)
        closes = hist["Close"].dropna()
        if closes.empty:
            return {}

        def close_on_or_before(target):
            target_ts = pd.Timestamp(target.date())
            valid = closes[closes.index.normalize() <= target_ts]
            return float(valid.iloc[-1]) if len(valid) > 0 else None

        result = {}
        for i in range(1, len(fridays)):
            this_friday = fridays[i]
            prev_friday = fridays[i - 1]
            week_label = f"{prev_friday.strftime('%d.%m')}-{this_friday.strftime('%d.%m.%Y')}"
            this_close = close_on_or_before(this_friday)
            prev_close = close_on_or_before(prev_friday)
            if this_close and prev_close and prev_close > 0:
                result[week_label] = round((this_close - prev_close) / prev_close * 100, 2)
        return result
    except Exception as e:
        print(f"  {ticker}: trend fetch error — {type(e).__name__}: {e}")
        return {}


def compute_the_trend(top_n=10, min_appearances=2, candidate_pool=20):
    """Find the top N stocks by FULL compound return (continuous, including
    weeks they weren't in our top picks). Algorithm:

      1. Require min_appearances in our scans (filter one-week wonders)
      2. Rank `candidate_pool` stocks by scan compound (cheap)
      3. Fetch FULL continuous timeline for those candidates from yfinance
      4. Re-rank candidates by FULL compound (the real return)
      5. Take top_n

    This is fully dynamic: every weekly scan re-runs from scratch. A stock
    that was #1 last week but crashed this week will drop or disappear.
    A new stock that built momentum will rise into the list naturally."""
    try:
        r = supabase.table("weekly_scans").select("*").order("created_at", desc=True).limit(100).execute()
        scans = r.data or []
    except Exception as e:
        print(f"Trend: fetch error: {e}")
        return []

    # Build per-ticker history from our scans
    ticker_history = {}  # ticker -> {week_label: change_pct}
    name_lookup   = {}
    weeks_seen    = set()
    skip_labels   = {"__trend__"}

    for scan in scans:
        try:
            label = scan["week_label"]
            if label in skip_labels:
                continue
            weeks_seen.add(label)
            payload = json.loads(scan["stocks_json"])
            stocks = payload.get("stocks", payload) if isinstance(payload, dict) else payload
            if not isinstance(stocks, list):
                continue
            for s in stocks:
                if not isinstance(s, dict):
                    continue
                ticker = s.get("ticker")
                if not ticker:
                    continue
                ticker_history.setdefault(ticker, {})[label] = s.get("change_pct", 0)
                name_lookup.setdefault(ticker, s.get("name", ticker))
        except Exception:
            continue

    if len(weeks_seen) < 2:
        print("Trend: need at least 2 weeks of data, skipping")
        return []

    # Rank by SCAN compound (cheap) to pick candidates. Require min_appearances
    # so a single-week +60% doesn't beat a sustained 5-week run.
    ticker_scan_compound = {}
    for ticker, history in ticker_history.items():
        if len(history) < min_appearances:
            continue
        cmpd = 1.0
        for change in history.values():
            cmpd *= (1 + change / 100)
        ticker_scan_compound[ticker] = cmpd - 1

    if not ticker_scan_compound:
        print(f"Trend: no tickers with >= {min_appearances} appearances")
        return []

    # Wider candidate pool — final ranking uses FULL compound which may
    # reorder things significantly.
    candidates = sorted(ticker_scan_compound.items(), key=lambda x: x[1], reverse=True)[:candidate_pool]
    print(f"Trend: {len(candidates)} candidates (>= {min_appearances} appearances), fetching full timelines...")

    # Build the consecutive Friday list spanning ALL weeks
    sorted_labels = sorted(weeks_seen, key=lambda lbl: re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", lbl)
                           and datetime(int(re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", lbl).group(3)),
                                        int(re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", lbl).group(2)),
                                        int(re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", lbl).group(1)))
                           or datetime(2000, 1, 1))
    def lbl_to_friday(lbl):
        m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", lbl)
        if not m: return None
        return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    earliest_friday = lbl_to_friday(sorted_labels[0]) - timedelta(days=7)
    latest_friday   = lbl_to_friday(sorted_labels[-1])
    # Build all consecutive Fridays from earliest to latest
    fridays = []
    cur = earliest_friday
    while cur <= latest_friday:
        fridays.append(cur)
        cur += timedelta(days=7)

    print(f"  Fetching {len(fridays)-1} weeks for {len(candidates)} candidates...")

    candidate_data = []
    for ticker, scan_compound in candidates:
        full_weekly = _fetch_continuous_weekly_changes(ticker, fridays)
        if not full_weekly:
            continue
        full_compound = 1.0
        for change in full_weekly.values():
            full_compound *= (1 + change / 100)
        full_compound -= 1

        scan_weeks = set(ticker_history.get(ticker, {}).keys())
        history_entries = []
        for week_label, change in sorted(full_weekly.items(), key=lambda x: lbl_to_friday(x[0]) or datetime(2000,1,1)):
            history_entries.append({
                "week": week_label,
                "change_pct": change,
                "in_scan": week_label in scan_weeks,
            })

        # ── QUALITY FILTER: skip single-week spikes ──
        # The Trend must show SUSTAINED momentum, not one explosive week. If a
        # stock's entire gain comes from one week (e.g. AIFU +2522% on a single
        # spike, flat/red otherwise), it's noise — exclude it. A real trend has
        # MULTIPLE meaningful up-weeks.
        ups = [h["change_pct"] for h in history_entries if h["change_pct"] > 0]
        strong_weeks = [g for g in ups if g >= 12]      # meaningful up-weeks
        spike_ratio = (max(ups) / sum(ups)) if ups else 1.0
        is_spike = (len(strong_weeks) <= 1) and (spike_ratio >= 0.5)
        if is_spike:
            print(f"    skip {ticker}: single-week spike (1 big week, {spike_ratio:.0%} of gains) — not a sustained trend")
            continue

        # ── LIVE FILTER: is this trend still alive TODAY? ──
        # Compound return since we started scanning is a HISTORY, not a signal.
        # RXT sat at #10 showing +112% while it had bled -42% over the previous
        # four weeks — a finished trend dressed up as a winner. This system is a
        # hunter, so a broken trend leaves the list and the survivors carry a
        # visible "is it still running" status.
        recent = [h["change_pct"] for h in history_entries[-4:]]
        recent_comp = 1.0
        for ch in recent:
            recent_comp *= (1 + ch / 100)
        recent_4w = round((recent_comp - 1) * 100, 1)

        if recent_4w <= -25:
            print(f"    skip {ticker}: trend is broken ({recent_4w:+.1f}% over the last 4 weeks)")
            continue

        momentum = "running" if recent_4w >= 10 else ("holding" if recent_4w >= -10 else "cooling")

        # Fetch the full identity card data — analyst targets, business summary,
        # 52W range, sector, etc. This is The Trend's centerpiece.
        identity = _fetch_trend_identity(ticker)

        candidate_data.append({
            "ticker": ticker,
            "name": identity.get("name") or name_lookup.get(ticker, ticker),
            "scan_appearances": len(ticker_history[ticker]),
            "total_weeks": len(history_entries),
            "scan_compound_pct": round(scan_compound * 100, 1),
            "full_compound_pct": round(full_compound * 100, 1),
            "recent_4w_pct": recent_4w,
            "momentum": momentum,
            "weekly_history": history_entries,
            "identity": identity,
        })

    # Final ranking — by FULL compound (the real return for someone holding it).
    # This is the dynamic part: stocks that crashed after their scan appearance
    # have low full_compound and drop out; stocks that kept rising stay in.
    candidate_data.sort(key=lambda x: x["full_compound_pct"], reverse=True)
    trend_data = candidate_data[:top_n]

    if trend_data:
        print(f"  Trend top 10 (by full compound, broken trends removed):")
        for i, t in enumerate(trend_data, 1):
            print(f"    #{i:2} {t['ticker']:7} [{t['momentum']:7}] 4w {t['recent_4w_pct']:+7.1f}% | full {t['full_compound_pct']:+7.1f}% | "
                  f"scan {t['scan_compound_pct']:+7.1f}% | {t['scan_appearances']}/{t['total_weeks']} weeks")
    return trend_data


# ============== MULTI-BAGGER RADAR ==============
# Goal: catch the stocks that 5x-50x over a year BEFORE the parabolic move.
# Ranks our scan universe by "multi-bagger DNA" — the traits the legendary
# investors (O'Neil, Minervini) look for in early-stage big winners:
#   - Relative Strength (sustained outperformance vs the market)
#   - Revenue growth (the real fuel — NVDA/SMCI had explosive revenue)
#   - Persistence (keeps showing up in our scans, not a one-week spike)
#   - Acceleration (the move is speeding up, not fading)
#   - Small-cap room (space to multiply)
#   - Sector tailwind (riding a megatrend)

def _spy_baseline():
    """SPY 3-month and 6-month % returns — the market benchmark for RS."""
    try:
        time.sleep(0.3)
        h = yf.Ticker("SPY").history(period="6mo", interval="1d")
        if h.index.tz is not None:
            h.index = h.index.tz_localize(None)
        closes = h["Close"].dropna()
        if len(closes) < 30:
            return 0.0, 0.0
        now = float(closes.iloc[-1])
        i3 = max(0, len(closes) - 63)
        p3 = float(closes.iloc[i3])
        p6 = float(closes.iloc[0])
        r3 = (now - p3) / p3 * 100 if p3 > 0 else 0.0
        r6 = (now - p6) / p6 * 100 if p6 > 0 else 0.0
        return round(r3, 1), round(r6, 1)
    except Exception:
        return 0.0, 0.0


def _radar_metrics(ticker, spy_3mo, spy_6mo):
    """Fetch 6-month price history + fundamentals for one candidate."""
    out = {}
    try:
        obj = yf.Ticker(ticker)
        time.sleep(0.4)
        hist = obj.history(period="6mo", interval="1d")
        if hist.index.tz is not None:
            hist.index = hist.index.tz_localize(None)
        closes = hist["Close"].dropna()
        if len(closes) >= 30:
            price_now = float(closes.iloc[-1])
            i3 = max(0, len(closes) - 63)
            p3 = float(closes.iloc[i3])
            p6 = float(closes.iloc[0])
            ret_3mo = (price_now - p3) / p3 * 100 if p3 > 0 else 0.0
            ret_6mo = (price_now - p6) / p6 * 100 if p6 > 0 else 0.0
            out["ret_3mo"] = round(ret_3mo, 1)
            out["ret_6mo"] = round(ret_6mo, 1)
            out["rs_3mo"]  = round(ret_3mo - spy_3mo, 1)
            out["rs_6mo"]  = round(ret_6mo - spy_6mo, 1)
            out["price"]   = round(price_now, 2)

        # Fundamentals from info (Yahoo pre-computes these — reliable enough)
        info = obj.info
        out["name"]   = info.get("longName") or info.get("shortName") or ticker
        out["sector"] = info.get("sector") or ""
        mc = info.get("marketCap")
        if mc:
            out["market_cap"] = int(mc)
        rg = info.get("revenueGrowth")
        if rg is not None:
            out["revenue_growth_pct"] = round(float(rg) * 100, 1)
        eg = info.get("earningsGrowth")
        if eg is None:
            eg = info.get("earningsQuarterlyGrowth")
        if eg is not None:
            out["earnings_growth_pct"] = round(float(eg) * 100, 1)
    except Exception as e:
        print(f"    {ticker}: radar metric error — {type(e).__name__}")
    return out


def _dna_score(m, appearances, accel, sector_peers):
    """Compute a 0-100 'multi-bagger DNA' score from the metrics.
    Returns (total, breakdown_dict)."""
    parts = {}

    # Relative Strength (0-35) — the #1 trait. 6mo weighted heavier than 3mo.
    rs6 = m.get("rs_6mo", 0) or 0
    rs3 = m.get("rs_3mo", 0) or 0
    rs_pts = min(20, max(0, rs6 / 10)) + min(15, max(0, rs3 / 8))  # +200%/6mo & +120%/3mo excess = full
    parts["relative_strength"] = round(rs_pts, 1)

    # Revenue growth (0-20) — the fuel. 100% YoY = full.
    rev_pts = 0
    rg = m.get("revenue_growth_pct")
    if rg is not None:
        rev_pts = min(20, max(0, rg / 5))
    parts["revenue_growth"] = round(rev_pts, 1)

    # Persistence (0-15) — keeps appearing in our scans
    pers_pts = min(15, appearances * 3)
    parts["persistence"] = pers_pts

    # Acceleration (0-15) — the move is speeding up
    acc_pts = min(15, max(0, accel))
    parts["acceleration"] = round(acc_pts, 1)

    # Small-cap room (0-10) — space to multiply
    mc = m.get("market_cap", 0)
    if mc:
        room = 10 if mc < 2e9 else 7 if mc < 10e9 else 4 if mc < 50e9 else 1
    else:
        room = 5
    parts["smallcap_room"] = room

    # Sector tailwind (0-5)
    heat = min(5, sector_peers * 2)
    parts["sector_heat"] = heat

    total = round(min(100, sum(parts.values())), 1)
    return total, parts


def compute_multibagger_radar(top_n=10, candidate_pool=30):
    """Rank our scan universe by multi-bagger DNA. Runs every scan, fully
    dynamic. Returns top_n stocks with their DNA score + component breakdown."""
    try:
        r = supabase.table("weekly_scans").select("*").order("created_at", desc=True).limit(100).execute()
        scans = r.data or []
    except Exception as e:
        print(f"Radar: fetch error: {e}")
        return []

    # Build per-ticker scan history
    ticker_history = {}   # ticker -> {week_label: change_pct}
    sector_lookup  = {}
    seen_labels    = set()
    for scan in scans:
        try:
            label = scan["week_label"]
            seen_labels.add(label)
            payload = json.loads(scan["stocks_json"])
            stocks = payload.get("stocks", payload) if isinstance(payload, dict) else payload
            if not isinstance(stocks, list):
                continue
            for s in stocks:
                if not isinstance(s, dict):
                    continue
                tk = s.get("ticker")
                if not tk:
                    continue
                ticker_history.setdefault(tk, {})[label] = s.get("change_pct", 0)
                if s.get("sector"):
                    sector_lookup[tk] = s["sector"]
        except Exception:
            continue

    if not ticker_history:
        print("Radar: no ticker history")
        return []

    def lbl_friday(lbl):
        mm = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", lbl)
        return datetime(int(mm.group(3)), int(mm.group(2)), int(mm.group(1))) if mm else datetime(2000, 1, 1)

    # Cheap proxy ranking to pick candidate pool: appearances * avg gain
    proxies = {}
    for tk, hist in ticker_history.items():
        if len(hist) < 2:
            continue
        avg_gain = sum(hist.values()) / len(hist)
        proxies[tk] = len(hist) * max(avg_gain, 0)
    candidates = sorted(proxies.items(), key=lambda x: x[1], reverse=True)[:candidate_pool]
    if not candidates:
        print("Radar: no candidates with >=2 appearances")
        return []

    # Sector peer counts across the candidate set
    sector_counts = {}
    for tk, _ in candidates:
        sec = sector_lookup.get(tk, "")
        if sec:
            sector_counts[sec] = sector_counts.get(sec, 0) + 1

    print(f"Radar: scoring {len(candidates)} candidates...")
    spy_3mo, spy_6mo = _spy_baseline()
    print(f"  SPY baseline: 3mo {spy_3mo:+.1f}% / 6mo {spy_6mo:+.1f}%")

    radar = []
    for tk, _ in candidates:
        m = _radar_metrics(tk, spy_3mo, spy_6mo)
        if not m:
            continue
        hist = ticker_history.get(tk, {})
        appearances = len(hist)

        # Acceleration: recent half of our weekly gains vs earlier half
        ordered = [hist[k] for k in sorted(hist.keys(), key=lbl_friday)]
        accel = 0
        if len(ordered) >= 4:
            mid = len(ordered) // 2
            early = sum(ordered[:mid]) / mid
            late  = sum(ordered[mid:]) / (len(ordered) - mid)
            accel = late - early

        sec = m.get("sector") or sector_lookup.get(tk, "")
        sector_peers = max(0, sector_counts.get(sec, 0) - 1)

        # ── GATE: the Radar hunts EARLY WINNERS, so it must not rank losers ──
        # Points for small-cap room, sector heat, persistence and acceleration
        # are all available to a stock that is simply falling, so VELO scored
        # 51.6/100 while down 45% over six months. Nothing that is losing to the
        # market on BOTH horizons belongs on a multi-bagger radar.
        rs6, rs3 = m.get("rs_6mo") or 0, m.get("rs_3mo") or 0
        if rs6 <= 0 and rs3 <= 0:
            print(f"    skip {tk}: lagging the market on both horizons (RS 6mo {rs6:+.0f}%, 3mo {rs3:+.0f}%)")
            continue

        score, parts = _dna_score(m, appearances, accel, sector_peers)
        radar.append({
            "ticker": tk,
            "name": m.get("name", tk),
            "dna_score": score,
            "dna_breakdown": parts,
            "sector": sec,
            "market_cap": m.get("market_cap"),
            "price": m.get("price"),
            "ret_3mo": m.get("ret_3mo"),
            "ret_6mo": m.get("ret_6mo"),
            "rs_3mo": m.get("rs_3mo"),
            "rs_6mo": m.get("rs_6mo"),
            "revenue_growth_pct": m.get("revenue_growth_pct"),
            "earnings_growth_pct": m.get("earnings_growth_pct"),
            "appearances": appearances,
            "acceleration": round(accel, 1),
        })

    radar.sort(key=lambda x: x["dna_score"], reverse=True)
    radar = radar[:top_n]
    if radar:
        print(f"  Radar top {len(radar)} by DNA score:")
        for i, x in enumerate(radar, 1):
            print(f"    #{i:2} {x['ticker']:7} DNA {x['dna_score']:5.1f} | "
                  f"RS6 {x.get('rs_6mo', 0):+.0f}% | rev {x.get('revenue_growth_pct', '—')} | "
                  f"{x['appearances']} apps")
    return radar


# ============== THE VERDICT — AI ANALYST'S REAL OPINION (not a score) ==============
# Scores are the machine's FILTER (narrow 5000 → finalists). The Verdict is the
# brain's JUDGMENT: a written professional opinion on whether there's a genuine
# multi-bagger candidate this week — with the thesis, catalyst (web-searched),
# conviction, and risk. If nothing is compelling, it says so honestly.

_DISCOVERED_MODEL = None


def _discover_best_model(api_key):
    """Ask the Anthropic API which models the account has, pick the newest
    Opus (else newest Sonnet). Avoids guessing model names that change."""
    global _DISCOVERED_MODEL
    if os.environ.get("AI_MODEL"):
        return os.environ["AI_MODEL"]
    if _DISCOVERED_MODEL:
        return _DISCOVERED_MODEL
    try:
        r = requests.get(
            "https://api.anthropic.com/v1/models?limit=100",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            timeout=30,
        )
        if r.status_code == 200:
            models = r.json().get("data", [])
            models.sort(key=lambda m: m.get("created_at", ""), reverse=True)
            opus = next((m for m in models if "opus" in m.get("id", "").lower()), None)
            sonnet = next((m for m in models if "sonnet" in m.get("id", "").lower()), None)
            best = opus or sonnet or (models[0] if models else None)
            if best:
                _DISCOVERED_MODEL = best["id"]
                print(f"  Verdict: using model {_DISCOVERED_MODEL}")
                return _DISCOVERED_MODEL
    except Exception as e:
        print(f"  Verdict: model discovery failed ({type(e).__name__})")
    _DISCOVERED_MODEL = "claude-sonnet-4-20250514"
    return _DISCOVERED_MODEL

VERDICT_SYSTEM = """You are the head analyst of "Stock Scout". Once a week you write THE VERDICT — a sharp research note for the boss.

THE MISSION: be IN the stocks that 5x-50x over a year, caught EARLY, before they hit any year-end "biggest gainers" list. Not read about them after — own them before.

WHAT YOU'RE GIVEN: the machine has already filtered the whole market down to finalists across four lenses:
- Weekly top gainers (loud movers this week)
- Rising Stars (quiet base-builders — strong 6-month relative strength, may not have spiked this week — THIS is where early SanDisks hide)
- Multi-Bagger Radar (forward-looking DNA score)
- The Trend (what already compounded)
The scores were just the filter. Your job is JUDGMENT, not ranking by number.

YOUR JOB — write a real, DEEP opinion (a proper Wall Street research note):
1. Is there a genuinely compelling multi-bagger candidate this week? Name the single best one (occasionally two). If NOTHING is compelling, SAY SO honestly — "nothing worth a position this week, here's why" is a valid, valuable verdict. Never force a pick.
2. For your pick, GO DEEP — this is the whole point:
   - 🏢 WHAT THE COMPANY DOES: its actual business, products, customers — in clear language.
   - 🔥 WHY IT'S HOT NOW: the secular trend driving it (AI compute, power demand, memory shortage, GLP-1, nuclear, etc.). USE WEB SEARCH for the real, current catalyst (news, earnings, contracts) and cite it.
   - 🚀 THE FUTURE: why demand could keep growing, the bull case, the path to a multi-bagger.
3. Distinguish a real durable story from a pump. Be critical.
4. 🎯 CONVICTION LEVEL (high / medium / low) and why.
5. ⚠️ THE RISK — what could kill the thesis.
6. 👀 WHAT TO WATCH next to confirm or abandon it.

FORMAT — make it engaging and professional, a pleasure to read:
- Write in Hebrew, like a top analyst briefing the boss.
- Use ## headers, **bold** for tickers/key terms, bullet lists, and tables when useful.
- Use tasteful emoji as section anchors (🏢 🔥 🚀 🎯 ⚠️ 👀 📊) — not excessively.
- Lead with a one-line bottom line, then go deep. Cite real numbers (6mo return, revenue growth, DNA) woven into the narrative, not dumped. Speak like a human deciding where to put real money — be the judgment the boss is paying for.

LENGTH — you have a hard output budget and a note that stops mid-sentence is worthless to the boss:
- Go deep on ONE pick. If a second name is worth mentioning, give it a short paragraph, not a second full analysis.
- Aim for roughly 4000-5000 characters of Hebrew.
- Budget your room as you write and ALWAYS finish with your closing section. Never run out mid-thought."""


def _verdict_context(top_picks, trend, radar, rising_stars):
    """Build a dense context string from the in-memory scan objects."""
    lines = []
    if rising_stars:
        lines.append("=== RISING STARS (quiet base-builders — full-market 6mo relative strength; the early-SanDisk pattern) ===")
        for s in rising_stars[:15]:
            lines.append(
                f"{s['ticker']} ({s.get('name','')}) | base-builder {s.get('rs_score')}/100 | "
                f"6mo {s.get('ret_6mo')}% / 3mo {s.get('ret_3mo')}% / 1mo {s.get('ret_1mo')}% | "
                f"{s.get('positive_weeks_pct')}% positive weeks | "
                f"{'above' if s.get('above_50dma') else 'below'} 50dma, {'above' if s.get('above_200dma') else 'below'} 200dma | "
                f"mcap ${ (s.get('market_cap') or 0)/1e9:.2f}B | {s.get('sector','?')} | this wk {s.get('this_week_pct')}%"
            )
    if radar:
        lines.append("\n=== MULTI-BAGGER RADAR (forward-looking DNA score) ===")
        for r in radar[:10]:
            lines.append(
                f"{r['ticker']} ({r.get('name','')}) | DNA {r.get('dna_score')}/100 | "
                f"6mo {r.get('ret_6mo')}% (RS vs mkt {r.get('rs_6mo')}%) | "
                f"rev growth {r.get('revenue_growth_pct') if r.get('revenue_growth_pct') is not None else 'N/A'} | "
                f"{r.get('appearances')} appearances | mcap ${ (r.get('market_cap') or 0)/1e9:.2f}B | {r.get('sector','?')}"
            )
    if trend:
        lines.append("\n=== THE TREND (already compounded) ===")
        for t in trend[:10]:
            idn = t.get("identity", {}) or {}
            lines.append(
                f"{t['ticker']} ({t.get('name','')}) | compound {t.get('full_compound_pct')}% | "
                f"{t.get('scan_appearances')}/{t.get('total_weeks')} weeks | "
                f"{('analyst tgt $'+str(idn.get('target_mean'))+' ('+str(idn.get('target_upside_pct'))+'%)') if idn.get('target_mean') else 'no analyst coverage'} | {idn.get('sector','?')}"
            )
    if top_picks:
        lines.append("\n=== THIS WEEK'S TOP GAINERS (loud movers) ===")
        for s in top_picks[:15]:
            sig = s.get("rec_signals", {}) or {}
            lines.append(
                f"{s['ticker']} ({s.get('name','')}) | +{s.get('change_pct')}% wk | "
                f"mcap ${ (s.get('market_cap') or 0)/1e9:.2f}B | {s.get('sector','?')}"
                + (f" | float {sig.get('float_m')}M" if sig.get('float_m') is not None else "")
            )
    return "\n".join(lines)


def generate_ai_verdict(top_picks, trend, radar, rising_stars):
    """Call Claude (with live web search) to write THE VERDICT — the analyst's
    real opinion on this week's best multi-bagger candidate (or none). Returns
    a dict {text, model, generated_at} or None if no API key / failure."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("  Verdict: no ANTHROPIC_API_KEY, skipping (add it to GitHub secrets)")
        return None

    context = _verdict_context(top_picks, trend, radar, rising_stars)
    user_msg = (
        "Here are this week's finalists from the machine's filter. Write THE VERDICT: "
        "is there a genuinely compelling multi-bagger candidate to own early? "
        "Investigate the best ones (web-search their catalysts), give your real opinion, "
        "conviction, risk, and what to watch. If nothing is compelling, say so honestly.\n\n"
        + context
    )

    model = _discover_best_model(api_key)

    def _call(with_tools):
        body = {
            "model": model,
            # The budget covers the model's search narration AND the report, not
            # just the report — and Hebrew burns roughly a token every 2-3
            # characters. At 2500 the note stopped mid-word at 713 characters; at
            # 8000 it still ran out at 7972. Pair this headroom with the length
            # guidance in the system prompt so it finishes on its own terms.
            "max_tokens": 16000,
            "system": VERDICT_SYSTEM,
            "messages": [{"role": "user", "content": user_msg}],
        }
        if with_tools:
            body["tools"] = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 6}]
        return requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=body,
            # Six web searches plus an 8000-token note comfortably exceeds three
            # minutes. The old 180s ceiling turned the bigger token budget into a
            # timeout, and the week ended up with no verdict at all.
            timeout=900,
        )

    def _attempt(with_tools):
        """Never let a transport failure become a silent 'no verdict'."""
        try:
            return _call(with_tools)
        except Exception as e:
            print(f"  Verdict: request failed ({type(e).__name__}: {e})")
            return None

    try:
        r = _attempt(True)
        # Retry without search on a transport failure too — a verdict written
        # from our own data beats no verdict on the boss's screen.
        if r is None or (r.status_code != 200 and ("tool" in r.text.lower() or "web_search" in r.text.lower())):
            print("  Verdict: retrying without web search")
            r = _attempt(False)
        if r is None:
            print("  Verdict: both attempts failed")
            return None
        if r.status_code == 200:
            data = r.json()
            # Citations split a single sentence across several text blocks, so
            # joining with "\n" shredded sentences mid-clause and produced
            # bullets like "- \nהחברה נוסדה ב-2011\n — \nנכון ל-15 ביולי".
            # The fragments are contiguous prose: join them with nothing.
            text = "".join(
                b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
            ).strip()
            # With web search the model narrates its plan in English first
            # ("I'll investigate the most compelling candidates..."). That is
            # thinking-out-loud, not the report the boss should read. The report
            # itself opens with a markdown heading — start there.
            head = re.search(r"^#{1,3} .+$", text, re.M)
            if head and head.start() > 0:
                print(f"  Verdict: trimmed {head.start()} chars of pre-answer narration")
                text = text[head.start():].strip()
            if text:
                stop = data.get("stop_reason")
                if stop == "max_tokens":
                    print(f"  Verdict: WARNING — response hit the token ceiling and is "
                          f"cut off mid-sentence. Raise max_tokens.")
                print(f"  Verdict: generated with {model} ({len(text)} chars, stop_reason={stop})")
                return {"text": text, "model": model, "truncated": stop == "max_tokens",
                        "generated_at": datetime.now().isoformat()}
            print("  Verdict: empty response")
        else:
            print(f"  Verdict: {model} failed HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"  Verdict: error: {type(e).__name__}: {e}")
    return None


# ============== EMAIL ==============
def build_real_track_record():
    """Aggregate the REAL per-week backtest entries (yfinance actual_gain,
    stored in each scan's payload as 'backtest') — the same truthful data the
    dashboard shows. Replaces compute_backtest() for the email, which used
    scan-data lookup and wrongly reported 0/5 because top-5 gainers rarely
    re-appear in the next week's top list."""
    try:
        r = supabase.table("weekly_scans").select("*").order("created_at", desc=True).limit(100).execute()
        scans = r.data or []
    except Exception:
        return None

    seen, entries = set(), []
    for scan in scans:
        try:
            payload = json.loads(scan["stocks_json"])
            bt = payload.get("backtest") if isinstance(payload, dict) else None
            if not bt:
                continue
            wk = bt.get("week")
            if not wk or wk in seen or not bt.get("total"):
                continue
            seen.add(wk)
            entries.append(bt)
        except Exception:
            continue

    if not entries:
        return None

    def week_end(lbl):
        m = re.search(r"(\d{2})\.(\d{2})\.(\d{4})$", lbl or "")
        return datetime(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else datetime(2000, 1, 1)
    entries.sort(key=lambda b: week_end(b.get("week", "")))

    total_wins  = sum(b.get("wins", 0) for b in entries)
    total_picks = sum(b.get("total", 0) for b in entries)
    compound = 1.0
    for b in entries:
        compound *= (1 + b.get("avg_gain", 0) / 100)
    weeks = [{"week": b["week"], "wins": b.get("wins", 0), "total": b.get("total", 0),
              "avg_next": b.get("avg_gain", 0)} for b in entries]
    return {
        "total_weeks":  len(entries),
        "win_rate":     round(total_wins / total_picks * 100) if total_picks else 0,
        "avg_weekly":   round(sum(b.get("avg_gain", 0) for b in entries) / len(entries), 1),
        "compound_ret": round((compound - 1) * 100, 1),
        "weeks":        weeks,
    }


def send_email(stocks, bonus, week_label, backtest=None):
    returning = sum(1 for s in stocks if s.get("streak", 1) >= 2)
    rec = next((s for s in stocks if s.get("recommended")), None)
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

    # Pick-for-next-week hero (the key takeaway, up top)
    pick_hero = ""
    if rec:
        cats_txt = " · ".join(rec.get("rec_catalysts", [])) or "Top-ranked this week"
        rmcap = rec.get("market_cap", 0)
        rmcap_str = f"${rmcap/1e9:.1f}B" if rmcap >= 1e9 else f"${rmcap/1e6:.0f}M"
        pick_hero = f"""
<div style="background:linear-gradient(135deg,#fff8e8 0%,#fff0c8 100%);padding:22px 24px;border-bottom:1px solid #f0e0b0">
  <div style="font-size:11px;font-weight:800;color:#9a6200;letter-spacing:1.5px">🔥 PICK FOR NEXT WEEK</div>
  <div style="margin-top:8px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
    <span style="font-size:26px;font-weight:800;color:#1a1a2e">{rec['ticker']}</span>
    <span style="font-size:16px;font-weight:800;color:#097c3e">+{rec['change_pct']}%</span>
    <span style="font-size:13px;color:#9a6200">{rmcap_str}</span>
  </div>
  <div style="font-size:13px;color:#5a4a20;margin-top:3px">{rec.get('name','')}</div>
  <div style="font-size:12px;color:#7a5a20;margin-top:8px;line-height:1.5">{cats_txt}</div>
</div>"""

    cta_top = f"""
<div style="background:white;padding:20px 24px;text-align:center;border-bottom:1px solid #eee">
  <a href="{DASHBOARD_URL}" style="background:#097c3e;color:white;padding:15px 44px;border-radius:12px;text-decoration:none;font-weight:800;font-size:16px;display:inline-block;box-shadow:0 3px 10px rgba(9,124,62,0.3)">📊 Open Full Dashboard →</a>
  <div style="font-size:11px;color:#999;margin-top:10px">Rising Stars · Radar · The Trend · Live charts · AI analyst</div>
</div>"""

    html = f"""<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f5;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:680px;margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">

<!-- Header -->
<div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px 24px">
<h1 style="color:white;margin:0;font-size:23px;font-weight:800">📈 Stock Scout</h1>
<p style="color:#9aa3c2;margin:6px 0 0;font-size:13px">{week_label} · Weekly Intelligence Report</p>
</div>

<!-- Dashboard CTA — FIRST, up top -->
{cta_top}

<!-- Pick for next week -->
{pick_hero}

<!-- Quick stats -->
<div style="background:#097c3e;padding:12px 24px">
<span style="color:white;font-size:13px;font-weight:600">{returning} returning · Min cap ${MIN_MARKET_CAP//1_000_000}M · {len(stocks)} stocks scanned this week</span>
</div>

<!-- Top gainers table -->
<div style="background:white">
<div style="padding:16px 24px 4px;font-size:12px;font-weight:800;color:#1a1a2e;letter-spacing:.5px">📋 THIS WEEK'S TOP GAINERS</div>
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

<!-- Footer -->
<div style="background:#1a1a2e;padding:24px;text-align:center">
<a href="{DASHBOARD_URL}" style="background:#097c3e;color:white;padding:13px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">📊 Open Full Dashboard</a>
<div style="color:#777;font-size:10px;margin-top:14px;line-height:1.5">Decision-support analysis · Not investment advice · Past performance does not guarantee future results</div>
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


# ============== RECOMMENDATION SCORING (V3 — Conviction Score) ==============
# Built after the BRUN -18.85% failure: the previous float-dominant scoring
# picked a stock with WEAK weekly close (50.5% of range) — a textbook
# "rejection" pattern. V3 rewrites the logic to:
#  1) gate-reject stocks with weak closes (the master signal)
#  2) score remaining stocks on strength minus weakness signals
#  3) refuse to pick when no stock stands out (honest "no pick" state)


def _decision_category(score, gap, was_rejected):
    """Convert (score, gap_to_next) into a final category.
    Returns: ('pick' | 'candidate' | 'possible' | 'avoid' | 'rejected', label, emoji)."""
    if was_rejected:
        return "rejected", "Rejected — weak close", "🔴"
    if score >= 5 and gap >= 3:
        return "pick", "Pick for Next Week", "🔥"
    if score >= 3 and gap >= 1.5:
        return "candidate", "Best Candidate", "✨"
    if score >= 1:
        return "possible", "Possible", "•"
    return "avoid", "Avoid", "🔴"


def _compute_signals_v3(stock, obj):
    """Compute V3 strength/weakness signals from yfinance.
    Returns (signals_dict, plus_breakdown, minus_breakdown, was_rejected_at_gate).

    Plus and minus breakdowns are lists of (label, value) tuples — kept so
    the dashboard can show exactly which signals fired (transparency).
    """
    signals = dict(stock.get("rec_signals") or {})
    plus  = []   # strength contributions
    minus = []   # weakness contributions
    rejected = False

    # ---- Pull data we need ----
    price = stock.get("price", 0)
    # 30-day daily history — for close_loc, MA20, 4-week high, intra-week volume profile
    try:
        hist = obj.history(period="30d", interval="1d")
    except Exception:
        hist = None

    # Weekly close-in-range (last ~5 trading days)
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
    # If close < 60% of weekly range → reject. This is the BRUN-style filter.
    if close_loc is not None and close_loc < 60:
        rejected = True
        signals["rejected_reason"] = f"Weak close ({close_loc:.0f}% of weekly range)"
        return signals, plus, minus, rejected

    # ============ STAGE 2: STRENGTH SIGNALS ============
    # Close strength (most important)
    if close_loc is not None:
        if close_loc >= 90:
            plus.append(("close>90%", 3))
        elif close_loc >= 70:
            plus.append(("close 70-90%", 1))

    # Daily volume pattern from last 5 trading days
    if hist is not None and not hist.empty and len(hist) >= 5:
        vols = hist["Volume"].tail(5).tolist()
        if len(vols) == 5 and all(v > 0 for v in vols):
            fri_vol  = vols[-1]
            week_avg = sum(vols) / 5
            first_half  = sum(vols[:2])
            second_half = sum(vols[2:])

            signals["fri_vol_ratio_week"] = round(fri_vol / week_avg, 2) if week_avg > 0 else None

            # Friday volume spike vs weekly avg
            if week_avg > 0:
                fri_ratio = fri_vol / week_avg
                if fri_ratio >= 3:
                    plus.append(("Fri vol >3x week avg (institutional)", 2))
                elif fri_ratio >= 1:
                    plus.append(("Fri vol > week avg", 1))
                elif fri_ratio < 0.5:
                    minus.append(("Fri vol <50% week avg (climax)", -2))

            # Building volume profile (accumulation)
            if second_half > first_half * 1.2:
                plus.append(("Volume building thru week", 1))

    # Above 20-day MA
    if hist is not None and not hist.empty and len(hist) >= 20:
        ma20 = float(hist["Close"].tail(20).mean())
        last_close = float(hist["Close"].iloc[-1])
        signals["ma20"] = round(ma20, 2)
        if last_close > ma20:
            plus.append(("Above 20-day MA", 1))

    # 4-week high breakout (closing above prior 4-week high)
    if hist is not None and not hist.empty and len(hist) >= 25:
        prior_high = float(hist["High"].iloc[-25:-5].max())  # prior 20 trading days, excluding this week
        this_close = float(hist["Close"].iloc[-1])
        if this_close > prior_high:
            plus.append(("Breakout above 4-week high", 1))

    # Earnings catalyst (within next 7 days)
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

    # ============ STAGE 2: WEAKNESS SIGNALS ============
    # Extension risk (gain from 52W low)
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

    return signals, plus, minus, rejected


def compute_recommendation_scores(top5, all_top_picks=None):
    """V3 — Gate + Conviction Score.

    1. GATE: stocks with weekly close < 60% of range get rejected outright
       (the BRUN pattern — "rejection" candle).
    2. SCORE remaining stocks on weighted strength vs weakness signals.
    3. DECISION: 'pick' only when score >= 5 AND gap >= 3; otherwise honest
       category (candidate / possible / avoid / no pick).
    """
    print("\nComputing recommendation scores (V3 Conviction)...")
    time.sleep(3)

    # Sector heat — count sectors across all top picks (40)
    sector_counts = {}
    if all_top_picks:
        for s in all_top_picks:
            sec = s.get("sector") or ""
            if sec:
                sector_counts[sec] = sector_counts.get(sec, 0) + 1

    scored = []
    for stock in top5:
        t = stock["ticker"]
        catalysts = []
        plus, minus = [], []
        rejected = False
        signals = dict(stock.get("rec_signals") or {})

        try:
            time.sleep(0.8)
            obj = yf.Ticker(t)

            # Pull volume_ratio (week vs 3-mo avg) — kept as a display stat
            try:
                fi = obj.fast_info
                avg_vol = getattr(fi, "three_month_average_volume", None)
                if avg_vol and avg_vol > 0 and stock.get("volume", 0) > 0:
                    ratio = stock["volume"] / (avg_vol * 5)
                    signals["volume_ratio"] = round(ratio, 2)
            except Exception:
                pass

            signals, plus, minus, rejected = _compute_signals_v3({**stock, "rec_signals": signals}, obj)

            # Sector heat bonus
            sec = stock.get("sector") or ""
            if sec and sector_counts.get(sec, 0) >= 2:
                plus.append((f"Hot sector ({sec}: {sector_counts[sec]} in picks)", 1))

        except Exception as e:
            print(f"  {t}: score error — {e}")

        plus_total  = sum(v for _, v in plus)
        minus_total = sum(v for _, v in minus)
        total = 0 if rejected else (plus_total + minus_total)

        # Human-readable "why" — surface the top 3 most impactful signals
        signal_lines = [f"+{v} {label}" for label, v in plus] + [f"{v} {label}" for label, v in minus]
        catalysts = signal_lines[:5]

        signals["score_breakdown"] = {
            "plus":  [(label, v) for label, v in plus],
            "minus": [(label, v) for label, v in minus],
            "plus_total":  plus_total,
            "minus_total": minus_total,
        }
        signals["rejected"] = rejected

        scored.append({
            **stock,
            "rec_score":     round(total, 2),
            "rec_signals":   signals,
            "rec_catalysts": catalysts,
            "rec_rejected":  rejected,
        })
        status = "REJECTED" if rejected else f"score={total} (+{plus_total}, {minus_total})"
        print(f"  {t}: {status}")

    # ===== Decision: who is the pick? =====
    # Among non-rejected stocks
    eligible = [s for s in scored if not s["rec_rejected"]]
    if eligible:
        eligible_sorted = sorted(eligible, key=lambda x: x["rec_score"], reverse=True)
        top  = eligible_sorted[0]
        gap  = top["rec_score"] - (eligible_sorted[1]["rec_score"] if len(eligible_sorted) > 1 else 0)
        category, label, emoji = _decision_category(top["rec_score"], gap, False)
    else:
        category, label, emoji, top, gap = "no_pick", "No Pick This Week", "⚠️", None, 0

    # If top scored below "candidate" threshold, no stock should be flagged
    if category in ("possible", "avoid"):
        # Don't crown anyone — show all as informational only
        for s in scored:
            s["recommended"]    = False
            s["rec_category"]   = "rejected" if s["rec_rejected"] else category
            s["rec_gap"]        = round(gap, 2)
        print(f"  => {emoji} No clear pick — top score {top['rec_score']} is too low (gap {gap:.2f})")
    elif category == "no_pick":
        for s in scored:
            s["recommended"]    = False
            s["rec_category"]   = "rejected" if s["rec_rejected"] else "no_pick"
            s["rec_gap"]        = 0
        print(f"  => ⚠️ No Pick This Week — all 5 rejected or too weak")
    else:
        for s in scored:
            s["recommended"]    = (top is not None and s["ticker"] == top["ticker"])
            s["rec_category"]   = "rejected" if s["rec_rejected"] else (
                category if s["ticker"] == top["ticker"] else (
                    "possible" if s["rec_score"] >= 1 else "avoid"
                )
            )
            s["rec_gap"]        = round(gap, 2)
        print(f"  => {emoji} {label}: {top['ticker']} (score {top['rec_score']}, gap +{gap:.2f})")

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

    # Don't silently overwrite a good scan on the Sunday cron — but DO allow a
    # deliberate refresh. Without this, a week scanned with buggy code was frozen
    # until the next Sunday: every re-run exited here in seconds, reported
    # success, and left the tabs stale while looking like it had worked.
    force_rescan = str(os.environ.get("FORCE_RESCAN", "")).lower() in ("1", "true", "yes")
    week_already_saved = week_exists_in_supabase(week_label)
    if week_already_saved and not force_rescan:
        print(f"SKIP: {week_label} already exists in Supabase. "
              f"Set FORCE_RESCAN=1 to recompute and replace it. Exiting.")
        return
    if week_already_saved:
        print(f"FORCE_RESCAN: {week_label} exists — recomputing and replacing it.")

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

    # 3. Filter to gainers, find top picks (40) by % gain that pass market cap
    gainers = [p for p in price_data.values() if p["change_pct"] > 0]
    print(f"Total gainers: {len(gainers)}")

    gainers_dict = {g["ticker"]: g for g in gainers}
    top_picks = find_top_picks_by_marketcap(gainers_dict, names)

    if not top_picks:
        print("FATAL: no stocks passed market cap filter")
        return
    print(f"  [+{int(time.time()-t_start)}s]\n")

    # Compute recommendation scores for top 5 (which of the top 5 is most likely to continue)
    top5_tickers = sorted(top_picks, key=lambda x: x["change_pct"], reverse=True)[:5]
    if not historical_mode:
        scored = compute_recommendation_scores(top5_tickers, all_top_picks=top_picks)
        scored_map = {s["ticker"]: s for s in scored}
        for s in top_picks:
            if s["ticker"] in scored_map:
                s.update(scored_map[s["ticker"]])
    else:
        for s in top_picks:
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
    for s in top_picks:
        s["buzz"] = empty_buzz
        s["buzz_alert"] = False

    if historical_mode:
        for s in top_picks:
            s["streak"] = 1
        save_to_supabase(top_picks, [], week_label)
        print(f"\n=== DONE (historical) in {int(time.time()-t_start)}s ===")
        return

    # 4. Streak + real backtest from previous week
    prev, prev_week_label = get_previous_week_data()
    for s in top_picks:
        s["streak"] = prev.get(s["ticker"], {}).get("streak", 0) + 1 if s["ticker"] in prev else 1
    returning_count = sum(1 for s in top_picks if s["streak"] >= 2)
    print(f"Streak: {returning_count} stocks returning from last week")

    # Real backtest: how did last week's top 5 actually perform THIS week?
    # Label by the SELECTION week (prev_week_label), not the current week.
    print("\nComputing real backtest (last week's picks vs this week's prices)...")
    weekly_backtest = compute_weekly_backtest(prev, price_data, prev_week_label)

    # 5. Save first so compute_backtest + compute_the_trend can include this week's data
    if not save_to_supabase(top_picks, [], week_label,
                            backtest_entry=weekly_backtest, replace=week_already_saved):
        print("FATAL: the scan could not be saved — everything downstream would be stale.")
        sys.exit(1)

    # Each enrichment step is wrapped so that ONE failure never blocks the
    # email or the rest. The core scan (top picks) is already saved above.
    # Which enrichments failed this run. A step that dies must not leave last
    # week's list quietly on screen pretending to be current — that is exactly
    # how a NameError in the Entry Zone showed stale picks for a whole scan.
    failed_steps = []

    def _safe(label, fn, default=None):
        try:
            return fn()
        except Exception as e:
            print(f"  WARNING: {label} failed (continuing): {type(e).__name__}: {e}")
            failed_steps.append(f"{label}: {type(e).__name__}: {e}")
            return default

    # 6. Build the REAL track record (yfinance actual gains) for the email
    print("\nBuilding real track record...")
    backtest = _safe("track record", build_real_track_record)
    if backtest:
        print(f"  Track record: {backtest['total_weeks']} weeks | {backtest['win_rate']}% win rate | {backtest['avg_weekly']}% avg weekly | {backtest['compound_ret']}% compound")

    # 7. The Trend
    print("\nComputing The Trend (top 10 by compound return)...")
    trend = _safe("trend", lambda: compute_the_trend(top_n=10))

    # 8. Multi-Bagger Radar
    print("\nComputing Multi-Bagger Radar (top 10 by DNA score)...")
    radar = _safe("radar", lambda: compute_multibagger_radar(top_n=10))

    # 9. Rising Stars (full-market RS — the early-SanDisk scan)
    print("\nComputing Rising Stars (quiet base-builders, full-market RS)...")
    rising_stars = _safe("rising stars", lambda: compute_rising_stars(price_data, names, target=20))

    # 9b. THEMES - what is the market actually buying? Groups the strongest
    # names in the market by industry, because a thesis shows up in several
    # companies at once long before it shows up in the news.
    print("\nComputing Themes (industry clusters among the market leaders)...")
    _themes = _safe("themes", lambda: compute_themes(price_data, names, pool=300))
    themes, industry_map = (_themes if _themes else ([], {}))
    needs = _safe("need chains", lambda: compute_need_chains(themes)) or []

    # 10. ENTRY ZONE - the buy list. Pure arithmetic: no AI, no API key, so
    # this tab keeps working even when the Anthropic balance is empty.
    print("\nComputing Entry Zone (confirmed uptrend, not yet extended)...")
    entry_zone = _safe("entry zone", lambda: compute_entry_zone(price_data, names, target=15, themes=themes))

    # 10b. THE SHORTLIST - six lenses is six opinions; this is the decision.
    print("\nBuilding the Shortlist (the highest-conviction ideas)...")
    shortlist = _safe("shortlist", lambda: compute_shortlist(
        entry_zone, rising_stars, radar, trend, themes, top_n=5))

    # 11. THE VERDICT - the analyst's real written opinion
    print("\nGenerating The Verdict (AI analyst's real opinion)...")
    verdict = _safe("verdict", lambda: generate_ai_verdict(top_picks, trend, radar, rising_stars))

    # Save trend + radar + rising_stars + verdict into the just-saved row
    if trend or radar or rising_stars or verdict or entry_zone or themes or shortlist or needs:
        try:
            r = supabase.table("weekly_scans").select("stocks_json").eq("week_label", week_label).execute()
            if r.data:
                pl = json.loads(r.data[0]["stocks_json"])
                if trend: pl["trend"] = trend
                if radar: pl["radar"] = radar
                if rising_stars: pl["rising_stars"] = rising_stars
                if entry_zone: pl["entry_zone"] = entry_zone
                if themes: pl["themes"] = themes
                if shortlist: pl["shortlist"] = shortlist
                if needs: pl["needs"] = needs
                # Record what broke, so the dashboard can say "this list is from
                # the previous scan" instead of presenting it as this week's.
                pl["failed_steps"] = failed_steps
                pl["enriched_at"] = datetime.now().isoformat()
                if industry_map: pl["industry_map"] = industry_map
                if verdict: pl["verdict"] = verdict
                supabase.table("weekly_scans").update({"stocks_json": safe_json(pl)}).eq("week_label", week_label).execute()
                print(f"  Saved: trend={len(trend or [])}, radar={len(radar or [])}, rising_stars={len(rising_stars or [])}, entry_zone={len(entry_zone or [])}, themes={len(themes or [])}, shortlist={len(shortlist or [])}, verdict={'yes' if verdict else 'no'}.")
        except Exception as e:
            print(f"  Save error: {e}")

    # 9. Send email with track record
    send_email(top_picks, [], week_label, backtest=backtest)
    print(f"\n=== DONE in {int(time.time()-t_start)}s ===")


if __name__ == "__main__":
    main()
