"""
Diagnostic script - run ONCE to figure out exactly what's working and what isn't.
Tests Reddit (multiple endpoints) and StockTwits with full transparency.
Run via GitHub Actions workflow_dispatch, look at logs.
"""
import requests
import json
import time
import sys

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
]

# Test on tickers we KNOW have buzz - mega caps that are always discussed
TEST_TICKERS = ["AAPL", "TSLA", "NVDA", "GME", "AMC"]

print("=" * 70)
print("BUZZ DIAGNOSTICS - testing Reddit and StockTwits from this environment")
print("=" * 70)
print()

# ================== TEST 1: REDDIT - WWW (current method) ==================
print("\n" + "=" * 70)
print("TEST 1: Reddit via www.reddit.com (current method, per subreddit)")
print("=" * 70)
for ticker in TEST_TICKERS:
    try:
        url = f"https://www.reddit.com/r/wallstreetbets/search.json"
        params = {"q": ticker, "restrict_sr": "1", "sort": "hot", "t": "week", "limit": 25}
        r = requests.get(url, params=params, headers={
            "User-Agent": USER_AGENTS[0],
            "Accept": "application/json",
        }, timeout=15)
        print(f"\n  {ticker}: HTTP {r.status_code}")
        print(f"    Response size: {len(r.text)} bytes")
        if r.status_code == 200:
            try:
                d = r.json()
                kids = d.get("data", {}).get("children", [])
                print(f"    Children: {len(kids)} posts")
                if kids:
                    print(f"    First post title: {kids[0]['data'].get('title', '')[:80]!r}")
                else:
                    # show what Reddit returned
                    print(f"    Raw response (first 300 chars): {r.text[:300]!r}")
            except Exception as e:
                print(f"    JSON parse failed: {e}")
                print(f"    Raw response: {r.text[:200]!r}")
        else:
            print(f"    Raw response: {r.text[:300]!r}")
    except Exception as e:
        print(f"    EXCEPTION: {type(e).__name__}: {e}")
    time.sleep(2)


# ================== TEST 2: REDDIT - OLD ==================
print("\n" + "=" * 70)
print("TEST 2: Reddit via old.reddit.com (alternate endpoint)")
print("=" * 70)
for ticker in TEST_TICKERS:
    try:
        url = f"https://old.reddit.com/r/wallstreetbets/search.json"
        params = {"q": ticker, "restrict_sr": "1", "sort": "hot", "t": "week", "limit": 25}
        r = requests.get(url, params=params, headers={
            "User-Agent": f"web:stock-scout:1.0 (by /u/scout_bot) {USER_AGENTS[0][:40]}",
            "Accept": "application/json",
        }, timeout=15)
        print(f"\n  {ticker}: HTTP {r.status_code}")
        print(f"    Response size: {len(r.text)} bytes")
        if r.status_code == 200:
            try:
                d = r.json()
                kids = d.get("data", {}).get("children", [])
                print(f"    Children: {len(kids)} posts")
                if kids:
                    print(f"    First post title: {kids[0]['data'].get('title', '')[:80]!r}")
                else:
                    print(f"    Raw response (first 300 chars): {r.text[:300]!r}")
            except Exception as e:
                print(f"    JSON parse failed: {e}")
                print(f"    Raw response: {r.text[:200]!r}")
        else:
            print(f"    Raw response: {r.text[:300]!r}")
    except Exception as e:
        print(f"    EXCEPTION: {type(e).__name__}: {e}")
    time.sleep(2)


# ================== TEST 3: REDDIT - GLOBAL SEARCH ==================
print("\n" + "=" * 70)
print("TEST 3: Reddit GLOBAL search (across all subreddits)")
print("=" * 70)
for ticker in TEST_TICKERS:
    try:
        url = f"https://old.reddit.com/search.json"
        params = {"q": f"${ticker}", "sort": "hot", "t": "week", "limit": 50}
        r = requests.get(url, params=params, headers={
            "User-Agent": f"web:stock-scout:1.0 (by /u/scout_bot) Chrome/120",
            "Accept": "application/json",
        }, timeout=15)
        print(f"\n  ${ticker}: HTTP {r.status_code}, size={len(r.text)}")
        if r.status_code == 200:
            try:
                d = r.json()
                kids = d.get("data", {}).get("children", [])
                print(f"    Children: {len(kids)} posts")
                if kids:
                    for i, k in enumerate(kids[:3]):
                        kd = k.get("data", {})
                        sub = kd.get("subreddit", "?")
                        title = kd.get("title", "")[:60]
                        ups = kd.get("ups", 0)
                        print(f"    [{i+1}] r/{sub} ({ups}↑): {title!r}")
            except Exception as e:
                print(f"    JSON parse failed: {e}")
        else:
            print(f"    Raw: {r.text[:200]!r}")
    except Exception as e:
        print(f"    EXCEPTION: {type(e).__name__}")
    time.sleep(2)


# ================== TEST 4: STOCKTWITS ==================
print("\n" + "=" * 70)
print("TEST 4: StockTwits API")
print("=" * 70)
for ticker in TEST_TICKERS:
    try:
        url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json"
        # Try with full headers
        r = requests.get(url, headers={
            "User-Agent": USER_AGENTS[0],
            "Accept": "application/json",
            "Origin": "https://stocktwits.com",
            "Referer": "https://stocktwits.com/",
            "Accept-Language": "en-US,en;q=0.9",
        }, timeout=15)
        print(f"\n  {ticker}: HTTP {r.status_code}, size={len(r.text)}")
        if r.status_code == 200:
            try:
                d = r.json()
                msgs = d.get("messages", [])
                print(f"    Messages: {len(msgs)}")
                if msgs:
                    bull = sum(1 for m in msgs if (m.get("entities", {}).get("sentiment") or {}).get("basic") == "Bullish")
                    bear = sum(1 for m in msgs if (m.get("entities", {}).get("sentiment") or {}).get("basic") == "Bearish")
                    print(f"    Sentiment: {bull} bullish / {bear} bearish")
                    print(f"    First message body: {msgs[0].get('body', '')[:80]!r}")
            except Exception as e:
                print(f"    JSON parse failed: {e}")
                print(f"    Raw: {r.text[:200]!r}")
        else:
            print(f"    Raw: {r.text[:200]!r}")
    except Exception as e:
        print(f"    EXCEPTION: {type(e).__name__}: {e}")
    time.sleep(2)


# ================== TEST 5: PUSHSHIFT (alternative Reddit archive) ==================
print("\n" + "=" * 70)
print("TEST 5: Pushshift API (Reddit archive, alternative)")
print("=" * 70)
ticker = "TSLA"
try:
    # Pushshift sometimes works when reddit doesn't
    url = "https://api.pushshift.io/reddit/search/submission/"
    params = {"q": ticker, "size": 10, "after": "7d"}
    r = requests.get(url, params=params, headers={"User-Agent": USER_AGENTS[0]}, timeout=15)
    print(f"  {ticker}: HTTP {r.status_code}, size={len(r.text)}")
    if r.status_code == 200:
        d = r.json()
        data = d.get("data", [])
        print(f"    Submissions: {len(data)}")
except Exception as e:
    print(f"    EXCEPTION: {type(e).__name__}")


# ================== SUMMARY ==================
print("\n" + "=" * 70)
print("DIAGNOSTIC COMPLETE - check above for what works")
print("=" * 70)
