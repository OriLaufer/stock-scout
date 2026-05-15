"""
Fetch enhanced buzz on-demand for a single ticker.
Combines social signals (Reddit + StockTwits) with price signals (volume, short interest, news, 52w position).
Saves to ticker_buzz table in Supabase.

Usage: python fetch_buzz_single.py --ticker AAPL --name "Apple Inc" --market_cap 3000000000000
"""
import os
import json
import argparse
from datetime import datetime, timedelta

import yfinance as yf
import pandas as pd

import scanner  # reuse all social buzz functions

supabase = scanner.supabase


# ============== PRICE SIGNALS (free via yfinance) ==============

def fetch_price_signals(ticker, market_cap):
    """Volume spike, short interest, and 52-week position from yfinance."""
    signals = {
        "volume_spike_pct": None,
        "short_interest_pct": None,
        "short_ratio": None,
        "week_high_pct": None,
    }
    try:
        t = yf.Ticker(ticker)
        info = t.info

        # 52-week position: how close to the 52-week high is the current price
        high_52w = info.get("fiftyTwoWeekHigh") or 0
        low_52w  = info.get("fiftyTwoWeekLow")  or 0
        current  = info.get("currentPrice") or info.get("regularMarketPrice") or 0
        if high_52w > 0 and current > 0:
            signals["week_high_pct"] = round(current / high_52w * 100)
        if high_52w > 0 and low_52w > 0:
            range_size = high_52w - low_52w
            if range_size > 0:
                signals["year_range_pct"] = round((current - low_52w) / range_size * 100)

        # Short interest
        short_float = info.get("shortPercentOfFloat")
        short_ratio = info.get("shortRatio")
        if short_float is not None:
            signals["short_interest_pct"] = round(float(short_float) * 100, 1)
        if short_ratio is not None:
            signals["short_ratio"] = round(float(short_ratio), 1)

        # Volume spike: compare this week's average daily volume to the 4-week average
        hist = t.history(period="1mo")
        if len(hist) >= 10:
            avg_vol   = float(hist["Volume"].mean())
            week_vol  = float(hist["Volume"].tail(5).mean())
            if avg_vol > 0:
                signals["volume_spike_pct"] = round((week_vol / avg_vol - 1) * 100)

    except Exception as e:
        print(f"  Price signals error for {ticker}: {e}")

    return signals


def fetch_news_signals(ticker):
    """Recent news count and headline sentiment from yfinance."""
    signals = {
        "news_count": 0,
        "news_bullish_pct": 50,
        "news_headlines": [],
    }
    try:
        t = yf.Ticker(ticker)
        news = t.news or []

        bull = 0
        bear = 0
        headlines = []
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
        signals["news_count"] = len(news)
        signals["news_bullish_pct"] = round(bull / total * 100) if total > 0 else 50
        signals["news_headlines"] = headlines

    except Exception as e:
        print(f"  News signals error for {ticker}: {e}")

    return signals


def calculate_enhanced_score(buzz, price, news):
    """
    Enhanced buzz score that combines social + price signals.
    Base: social buzz score (1-10)
    Bonus points for:
    - Volume spike > 150%  → +1
    - Volume spike > 300%  → +2 (stacks with above)
    - Near 52-week high (> 90%) → +1 (momentum)
    - High short interest (> 15%) + rising → +1 (squeeze potential)
    - Strong news (bullish pct > 65% with >= 5 articles) → +1
    All capped at 10.
    """
    base = buzz.get("score", 1)
    bonus = 0

    vol_spike = price.get("volume_spike_pct")
    if vol_spike is not None:
        if vol_spike >= 300:
            bonus += 2
        elif vol_spike >= 150:
            bonus += 1

    week_high = price.get("week_high_pct")
    if week_high is not None and week_high >= 90:
        bonus += 1

    short_pct = price.get("short_interest_pct")
    if short_pct is not None and short_pct >= 15:
        bonus += 1

    if news.get("news_count", 0) >= 5 and news.get("news_bullish_pct", 50) >= 65:
        bonus += 1

    return min(10, base + bonus)


# ============== MAIN ==============

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker",     required=True,            help="Stock ticker symbol, e.g. AAPL")
    parser.add_argument("--name",       default="",               help="Company name (improves Reddit matching)")
    parser.add_argument("--market_cap", type=int, default=500_000_000, help="Market cap in dollars")
    args = parser.parse_args()

    ticker = args.ticker.upper().strip()
    print(f"\n{'='*50}")
    print(f"BUZZ ON DEMAND (ENHANCED): {ticker}")
    print(f"{'='*50}")

    if not scanner.APIFY_TOKEN:
        print("ERROR: APIFY_TOKEN not set. Cannot fetch social buzz.")
        return

    # 1. Social signals (Reddit + StockTwits via Apify)
    print("\n--- Social signals ---")
    names = {ticker: args.name} if args.name else {}
    reddit_data    = scanner.fetch_reddit_buzz_apify_batch([ticker], names)
    stocktwits_data = scanner.fetch_stocktwits_apify_batch([ticker])

    empty_st = {"count": 0, "bullish": 0, "bearish": 0, "sentiment_pct": 50, "messages": []}
    buzz = scanner.build_buzz_from_data(
        ticker, args.market_cap,
        reddit_data.get(ticker, []),
        stocktwits_data.get(ticker, empty_st),
    )
    print(f"  Social score: {buzz['score']}/10  |  Reddit: {buzz['reddit_count']}  |  StockTwits: {buzz['stocktwits_count']}")

    # 2. Price signals (yfinance — free)
    print("\n--- Price signals ---")
    price = fetch_price_signals(ticker, args.market_cap)
    print(f"  Volume spike:    {price.get('volume_spike_pct', 'N/A')}%")
    print(f"  52-week pos:     {price.get('week_high_pct', 'N/A')}% of high")
    print(f"  Short interest:  {price.get('short_interest_pct', 'N/A')}% float")
    print(f"  Short ratio:     {price.get('short_ratio', 'N/A')} days")

    # 3. News signals (yfinance — free)
    print("\n--- News signals ---")
    news = fetch_news_signals(ticker)
    print(f"  News articles:   {news.get('news_count', 0)}")
    print(f"  News sentiment:  {news.get('news_bullish_pct', 50)}% bullish")

    # 4. Enhanced score
    enhanced = calculate_enhanced_score(buzz, price, news)
    print(f"\n  Enhanced score: {enhanced}/10  (social base: {buzz['score']}/10)")

    # 5. Merge everything
    buzz.update(price)
    buzz.update(news)
    buzz["enhanced_score"] = enhanced

    # 6. Upsert to ticker_buzz table
    supabase.table("ticker_buzz").upsert({
        "ticker": ticker,
        "buzz_json": json.dumps(buzz),
        "updated_at": datetime.now().isoformat(),
    }).execute()

    print(f"\nSaved to Supabase. Refresh the dashboard to see it.")


if __name__ == "__main__":
    main()
