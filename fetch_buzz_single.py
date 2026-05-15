"""
Fetch enhanced buzz on-demand for a single ticker.
Combines:
  - Social:  Reddit + StockTwits (via Apify)
  - Price:   Volume spike, short interest, 52-week position (yfinance — free)
  - News:    Article count + headline sentiment (yfinance — free)
  - Trends:  Google search interest this week (pytrends — free, no key)
  - Insider: Recent insider purchases from SEC Form 4 via OpenInsider (free)

Usage: python fetch_buzz_single.py --ticker AAPL --name "Apple Inc" --market_cap 3000000000000
"""
import os
import re
import json
import time
import argparse
from datetime import datetime

import requests
import yfinance as yf

import scanner  # reuse all social buzz functions

supabase = scanner.supabase


# ============== PRICE SIGNALS ==============

def fetch_price_signals(ticker, market_cap):
    """Volume spike, short interest, 52-week position — all from yfinance (free)."""
    signals = {}
    try:
        t    = yf.Ticker(ticker)
        info = t.info

        high_52w = info.get("fiftyTwoWeekHigh") or 0
        low_52w  = info.get("fiftyTwoWeekLow")  or 0
        current  = info.get("currentPrice") or info.get("regularMarketPrice") or 0
        if high_52w > 0 and current > 0:
            signals["week_high_pct"] = round(current / high_52w * 100)
        if high_52w > 0 and low_52w > 0 and (high_52w - low_52w) > 0:
            signals["year_range_pct"] = round((current - low_52w) / (high_52w - low_52w) * 100)

        sf = info.get("shortPercentOfFloat")
        sr = info.get("shortRatio")
        if sf is not None:
            signals["short_interest_pct"] = round(float(sf) * 100, 1)
        if sr is not None:
            signals["short_ratio"] = round(float(sr), 1)

        hist = t.history(period="1mo")
        if len(hist) >= 10:
            avg_vol  = float(hist["Volume"].mean())
            week_vol = float(hist["Volume"].tail(5).mean())
            if avg_vol > 0:
                signals["volume_spike_pct"] = round((week_vol / avg_vol - 1) * 100)

        print(f"  Vol spike: {signals.get('volume_spike_pct','?')}%  "
              f"52w: {signals.get('week_high_pct','?')}%  "
              f"Short: {signals.get('short_interest_pct','?')}%")
    except Exception as e:
        print(f"  Price signals error: {e}")
    return signals


# ============== NEWS SIGNALS ==============

def fetch_news_signals(ticker):
    """Recent news headlines + sentiment from yfinance (free)."""
    signals = {"news_count": 0, "news_bullish_pct": 50, "news_headlines": []}
    try:
        news = yf.Ticker(ticker).news or []
        bull, bear, headlines = 0, 0, []
        for article in news[:20]:
            title = article.get("title") or ""
            if not title:
                continue
            sent = scanner.detect_post_sentiment(title)
            if sent == "bullish":
                bull += 1
            elif sent == "bearish":
                bear += 1
            if len(headlines) < 3:
                headlines.append({
                    "text": title[:120],
                    "sentiment": sent,
                    "publisher": article.get("publisher", ""),
                })
        total = bull + bear
        signals["news_count"]       = len(news)
        signals["news_bullish_pct"] = round(bull / total * 100) if total > 0 else 50
        signals["news_headlines"]   = headlines
        print(f"  News: {len(news)} articles, {signals['news_bullish_pct']}% bullish")
    except Exception as e:
        print(f"  News signals error: {e}")
    return signals


# ============== GOOGLE TRENDS (free, no API key) ==============

def fetch_google_trends(ticker):
    """Search interest (0-100) for the ticker in the US over the past 7 days.
    Uses pytrends — unofficial but free. Falls back gracefully if rate-limited."""
    signals = {"google_trend_score": None}
    try:
        from pytrends.request import TrendReq
        time.sleep(2)  # polite delay to avoid rate limiting
        pt = TrendReq(hl="en-US", tz=0, timeout=(10, 30), retries=2, backoff_factor=0.5)
        pt.build_payload([ticker], timeframe="now 7-d", geo="US")
        df = pt.interest_over_time()
        if df.empty or ticker not in df.columns:
            # Try without geo filter (global)
            time.sleep(3)
            pt.build_payload([ticker], timeframe="now 7-d")
            df = pt.interest_over_time()
        if not df.empty and ticker in df.columns:
            avg = int(df[ticker].mean())
            peak = int(df[ticker].max())
            # Trend direction: is interest accelerating or fading?
            mid = len(df) // 2
            first_half = float(df[ticker].iloc[:mid].mean()) if mid > 0 else avg
            second_half = float(df[ticker].iloc[mid:].mean()) if mid > 0 else avg
            if second_half > first_half * 1.3:
                direction = "rising"
            elif second_half < first_half * 0.7:
                direction = "falling"
            else:
                direction = "stable"
            signals["google_trend_score"]     = avg
            signals["google_trend_peak"]      = peak
            signals["google_trend_direction"] = direction
            print(f"  Google Trends: {avg}/100 (peak {peak}, {direction})")
        else:
            print("  Google Trends: no data returned")
    except ImportError:
        print("  Google Trends: pytrends not installed")
    except Exception as e:
        print(f"  Google Trends error (non-critical): {type(e).__name__}: {e}")
    return signals


# ============== INSIDER PURCHASES (free — OpenInsider / SEC Form 4) ==============

def fetch_insider_activity(ticker):
    """Recent insider PURCHASES from OpenInsider (aggregates public SEC Form 4 filings).
    Only purchases are meaningful — sales have many non-bearish reasons (tax, diversification).
    Data is 2-3 days delayed from SEC filing date."""
    signals = {"insider_purchases": 0, "insider_recent": []}
    try:
        # Screener URL: ticker-specific, purchases only, last 60 days, sorted by value
        url = (
            f"https://openinsider.com/screener"
            f"?s={ticker}&o=&pl=&ph=&ls=&lp=&limit=20&action=1"
        )
        r = requests.get(url, headers={"User-Agent": scanner.get_ua()}, timeout=20)
        if r.status_code != 200:
            print(f"  OpenInsider: HTTP {r.status_code}")
            return signals

        html = r.text

        # Find the data table body
        tbody_m = re.search(r"<tbody>(.*?)</tbody>", html, re.DOTALL)
        if not tbody_m:
            print("  OpenInsider: no table found")
            return signals

        purchases = []
        for row_m in re.finditer(r"<tr[^>]*>(.*?)</tr>", tbody_m.group(1), re.DOTALL):
            cells_raw = re.findall(r"<td[^>]*>(.*?)</td>", row_m.group(1), re.DOTALL)
            cells = [re.sub(r"<[^>]+>", "", c).strip() for c in cells_raw]

            # OpenInsider screener columns (0-indexed after stripping tags):
            # 0:X  1:Filing Date  2:Trade Date  3:Ticker  4:Company
            # 5:Insider Name  6:Title  7:Trade Type  8:Price  9:Qty  10:Owned  11:ΔOwn  12:Value
            if len(cells) < 13:
                continue
            trade_type = cells[7]
            if "P" not in trade_type:   # purchases only
                continue

            name       = cells[5].strip()
            title      = cells[6].strip()
            trade_date = cells[2].strip()
            value_str  = cells[12]
            value      = int(re.sub(r"[^0-9]", "", value_str)) if re.search(r"\d", value_str) else 0

            if not name:
                continue
            purchases.append({"date": trade_date, "name": name, "title": title, "value": value})

        if purchases:
            total_val = sum(p["value"] for p in purchases)
            signals["insider_purchases"]   = len(purchases)
            signals["insider_total_value"] = total_val
            signals["insider_recent"]      = purchases[:4]
            print(f"  Insider: {len(purchases)} purchases, total ${total_val:,}")
        else:
            print(f"  Insider: no recent purchases")

    except Exception as e:
        print(f"  Insider fetch error: {type(e).__name__}: {e}")
    return signals


# ============== ENHANCED SCORE ==============

def calculate_enhanced_score(buzz, price, news, trends, insider):
    """
    Score 1–10 combining all signals.
    Base = social buzz score (Reddit + StockTwits vs market cap).
    Bonuses (max +4, capped at 10):
      +2 if volume spike > 300%
      +1 if volume spike > 150% (instead of +2)
      +1 if price near 52-week high (> 90%) — momentum
      +1 if short interest > 15% — squeeze potential
      +1 if news strong (>=5 articles, >65% bullish)
      +1 if Google Trends score > 60 — retail interest building
      +1 if insider purchases in last 60 days — insiders believe in it
      +2 if insider purchase > $500k by CEO/CFO/President — very strong signal
    """
    base  = buzz.get("score", 1)
    bonus = 0

    vol = price.get("volume_spike_pct")
    if vol is not None:
        if vol >= 300:
            bonus += 2
        elif vol >= 150:
            bonus += 1

    if (price.get("week_high_pct") or 0) >= 90:
        bonus += 1
    if (price.get("short_interest_pct") or 0) >= 15:
        bonus += 1
    if news.get("news_count", 0) >= 5 and news.get("news_bullish_pct", 50) >= 65:
        bonus += 1
    if (trends.get("google_trend_score") or 0) >= 60:
        bonus += 1

    # Insider signal — strongest weight
    insider_recent = insider.get("insider_recent", [])
    if insider_recent:
        top_value = max((p["value"] for p in insider_recent), default=0)
        top_title = next((p["title"] for p in insider_recent if p["value"] == top_value), "")
        is_exec   = any(t in top_title.upper() for t in ["CEO", "CFO", "PRESIDENT", "COO", "CHAIRMAN"])
        if top_value >= 500_000 and is_exec:
            bonus += 2  # executive bought big — very bullish
        elif insider_recent:
            bonus += 1  # any purchase is a positive signal

    return min(10, base + bonus)


# ============== MAIN ==============

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker",     required=True)
    parser.add_argument("--name",       default="")
    parser.add_argument("--market_cap", type=int, default=500_000_000)
    args = parser.parse_args()

    ticker = args.ticker.upper().strip()
    print(f"\n{'='*55}")
    print(f"BUZZ ON DEMAND — {ticker}")
    print(f"{'='*55}")

    if not scanner.APIFY_TOKEN:
        print("ERROR: APIFY_TOKEN not set.")
        return

    # 1. Social (Reddit + StockTwits via Apify)
    print("\n[1/5] Social signals (Apify)...")
    names = {ticker: args.name} if args.name else {}
    reddit_data     = scanner.fetch_reddit_buzz_apify_batch([ticker], names)
    stocktwits_data = scanner.fetch_stocktwits_apify_batch([ticker])
    empty_st = {"count": 0, "bullish": 0, "bearish": 0, "sentiment_pct": 50, "messages": []}
    buzz = scanner.build_buzz_from_data(
        ticker, args.market_cap,
        reddit_data.get(ticker, []),
        stocktwits_data.get(ticker, empty_st),
    )
    print(f"  Social score: {buzz['score']}/10  Reddit: {buzz['reddit_count']}  ST: {buzz['stocktwits_count']}")

    # 2. Price signals (yfinance — free)
    print("\n[2/5] Price signals (yfinance)...")
    price = fetch_price_signals(ticker, args.market_cap)

    # 3. News (yfinance — free)
    print("\n[3/5] News signals (yfinance)...")
    news = fetch_news_signals(ticker)

    # 4. Google Trends (pytrends — free)
    print("\n[4/5] Google Trends (pytrends)...")
    trends = fetch_google_trends(ticker)

    # 5. Insider purchases (OpenInsider — free, SEC data)
    print("\n[5/5] Insider activity (OpenInsider)...")
    insider = fetch_insider_activity(ticker)

    # Calculate enhanced score
    enhanced = calculate_enhanced_score(buzz, price, news, trends, insider)
    print(f"\n  Enhanced score: {enhanced}/10  (social base: {buzz['score']}/10)")

    # Merge everything
    buzz.update(price)
    buzz.update(news)
    buzz.update(trends)
    buzz.update(insider)
    buzz["enhanced_score"] = enhanced

    # Save to Supabase
    supabase.table("ticker_buzz").upsert({
        "ticker": ticker,
        "buzz_json": json.dumps(buzz),
        "updated_at": datetime.now().isoformat(),
    }).execute()

    print(f"\nDone. Refresh the dashboard to see the full panel for {ticker}.")


if __name__ == "__main__":
    main()
