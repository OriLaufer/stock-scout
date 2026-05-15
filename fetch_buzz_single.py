"""
Fetch buzz on-demand for a single ticker and save to the ticker_buzz table.
Run from GitHub Actions (buzz-on-demand.yml) or manually.

Usage: python fetch_buzz_single.py --ticker AAPL --name "Apple Inc" --market_cap 3000000000000
"""
import os
import json
import argparse
from datetime import datetime

# Import reusable buzz functions from scanner (no duplication)
import scanner

supabase = scanner.supabase


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ticker", required=True, help="Stock ticker symbol, e.g. AAPL")
    parser.add_argument("--name", default="", help="Company name (optional, improves Reddit matching)")
    parser.add_argument("--market_cap", type=int, default=500_000_000,
                        help="Market cap in dollars (used for buzz score normalization)")
    args = parser.parse_args()

    ticker = args.ticker.upper().strip()
    print(f"\n{'='*50}")
    print(f"BUZZ ON DEMAND: {ticker}")
    print(f"{'='*50}")

    if not scanner.APIFY_TOKEN:
        print("ERROR: APIFY_TOKEN not set. Cannot fetch buzz.")
        return

    # Fetch Reddit and StockTwits in sequence (same functions as the weekly scanner)
    names = {ticker: args.name} if args.name else {}
    reddit_data = scanner.fetch_reddit_buzz_apify_batch([ticker], names)
    stocktwits_data = scanner.fetch_stocktwits_apify_batch([ticker])

    empty_st = {"count": 0, "bullish": 0, "bearish": 0, "sentiment_pct": 50, "messages": []}
    buzz = scanner.build_buzz_from_data(
        ticker,
        args.market_cap,
        reddit_data.get(ticker, []),
        stocktwits_data.get(ticker, empty_st),
    )

    print(f"\nResult: score={buzz['score']}/10  reddit={buzz['reddit_count']}  "
          f"stocktwits={buzz['stocktwits_count']}  bullish={buzz['reddit_bullish_pct']}%")

    # Upsert into ticker_buzz table (one row per ticker, replaced each run)
    supabase.table("ticker_buzz").upsert({
        "ticker": ticker,
        "buzz_json": json.dumps(buzz),
        "updated_at": datetime.now().isoformat(),
    }).execute()

    print(f"Saved to Supabase ticker_buzz table. Refresh the dashboard to see it.")


if __name__ == "__main__":
    main()
