import requests
import json
import os
from datetime import datetime, timedelta
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"]
RESEND_API_KEY = os.environ["RESEND_API_KEY"]
BOSS_EMAIL = os.environ["BOSS_EMAIL"]
MIN_MARKET_CAP = int(os.environ.get("MIN_MARKET_CAP", "500000000"))
APIFY_TOKEN = os.environ.get("APIFY_TOKEN", "")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

EARLY_SIGNAL_KEYWORDS = [
    "unusual volume", "unusual activity", "unusual options",
    "someone knows", "insider", "someone bought", "big calls",
    "why is", "what's happening", "what happened",
    "takeover", "merger", "buyout", "acquisition", "rumor",
    "catalyst", "breakout", "squeeze", "short squeeze",
    "upgrade", "downgrade", "fda", "approval", "contract",
    "partnership", "deal", "earnings", "beat",
    "moving", "spiking", "flying", "running"
]

def get_week_label():
    today = datetime.now()
    start = today - timedelta(days=today.weekday() + 7)
    end = start + timedelta(days=4)
    return f"{start.strftime('%d.%m')}-{end.strftime('%d.%m.%Y')}"

def get_top_gainers():
    print("Scanning market...")
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
    }
    quotes = []
    try:
        session = requests.Session()
        crumb_resp = session.get("https://query2.finance.yahoo.com/v1/test/getcrumb", headers=headers, timeout=10)
        crumb = crumb_resp.text.strip()
        body = {
            "size": 250, "offset": 0,
            "sortField": "percentchange", "sortType": "DESC",
            "quoteType": "EQUITY",
            "query": {
                "operator": "AND",
                "operands": [
                    {"operator": "GT", "operands": ["percentchange", 0]},
                    {"operator": "GT", "operands": ["intradaymarketcap", MIN_MARKET_CAP]},
                    {"operator": "EQ", "operands": ["region", "us"]}
                ]
            },
            "userId": "", "userIdType": "guid"
        }
        resp = session.post(
            "https://query1.finance.yahoo.com/v1/finance/screener",
            params={"crumb": crumb, "lang": "en-US", "region": "US", "formatted": "true"},
            json=body, headers=headers, timeout=15
        )
        quotes = resp.json().get("finance", {}).get("result", [{}])[0].get("quotes", [])
        if not quotes:
            raise Exception("Empty")
    except Exception as e:
        print(f"Screener failed: {e}, trying gainers...")
        try:
            resp = requests.get(
                "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved",
                params={"scrIds": "day_gainers", "count": 250, "region": "US"},
                headers=headers, timeout=15
            )
            quotes = resp.json()["finance"]["result"][0]["quotes"]
        except Exception as e2:
            print(f"Failed: {e2}")
            return [], []

    results = []
    for q in quotes:
        try:
            mc = q.get("marketCap", {})
            mc = mc.get("raw", 0) if isinstance(mc, dict) else mc
            if not mc or mc < MIN_MARKET_CAP: continue
            pct = q.get("regularMarketChangePercent", {})
            pct = pct.get("raw", 0) if isinstance(pct, dict) else pct
            vol = q.get("regularMarketVolume", {})
            vol = vol.get("raw", 0) if isinstance(vol, dict) else vol
            price = q.get("regularMarketPrice", {})
            price = price.get("raw", 0) if isinstance(price, dict) else price
            if float(pct) > 0:
                results.append({
                    "ticker": q.get("symbol", ""),
                    "name": q.get("shortName", q.get("symbol", "")),
                    "change_pct": round(float(pct), 2),
                    "market_cap": int(mc),
                    "volume": int(vol) if vol else 0,
                    "price": float(price) if price else 0
                })
        except: continue

    results.sort(key=lambda x: x["change_pct"], reverse=True)
    top20 = results[:20]
    top20_tickers = {s["ticker"] for s in top20}
    bonus_candidates = [s for s in results[20:60] if s["ticker"] not in top20_tickers]
    print(f"Found {len(results)} stocks")
    return top20, bonus_candidates

def score_post_interest(text, ticker):
    text_lower = text.lower()
    score = 0
    if ticker.lower() in text_lower or f"${ticker.lower()}" in text_lower:
        score += 3
    for kw in EARLY_SIGNAL_KEYWORDS:
        if kw in text_lower:
            score += 2
    if "?" in text:
        score += 1
    if 20 < len(text) < 300:
        score += 1
    return score

def get_all_buzz_via_apify(tickers):
    """שולח בקשה אחת ל-Apify עם כל המניות ביחד"""
    print(f"Fetching Reddit buzz for {len(tickers)} tickers via Apify (single run)...")

    if not APIFY_TOKEN:
        return {}

    # בניית רשימת URLs — חיפוש כללי אחד ב-WSB ו-stocks
    start_urls = []
    for ticker in tickers[:10]:  # רק 10 ראשונות כדי לחסוך
        start_urls.append({"url": f"https://www.reddit.com/search/?q={ticker}&sort=hot&t=week"})

    # הוספת subreddits כלליים
    start_urls.append({"url": "https://www.reddit.com/r/wallstreetbets/hot/"})
    start_urls.append({"url": "https://www.reddit.com/r/stocks/hot/"})

    try:
        run_resp = requests.post(
            f"https://api.apify.com/v2/acts/trudax~reddit-scraper-lite/run-sync-get-dataset-items?token={APIFY_TOKEN}&timeout=120",
            headers={"Content-Type": "application/json"},
            json={
                "startUrls": start_urls,
                "maxItems": 100,
                "proxy": {"useApifyProxy": True}
            },
            timeout=150
        )

        if run_resp.status_code not in [200, 201]:
            print(f"Apify error: {run_resp.status_code}")
            return {}

        all_posts = run_resp.json()
        if not isinstance(all_posts, list):
            print(f"Unexpected response type: {type(all_posts)}")
            return {}

        print(f"Got {len(all_posts)} total posts from Apify")

        # מיון הפוסטים לפי מנייה
        ticker_posts = {t: [] for t in tickers}
        for post in all_posts:
            title = post.get("title", "") or ""
            body = post.get("body", "") or post.get("selftext", "") or ""
            full_text = f"{title} {body}"

            for ticker in tickers:
                if ticker.lower() in full_text.lower() or f"${ticker}" in full_text:
                    interest_score = score_post_interest(full_text, ticker)
                    ticker_posts[ticker].append({
                        "text": title[:150] if title else full_text[:150],
                        "score": interest_score,
                        "upvotes": post.get("upVotes", 0) or post.get("score", 0) or 0,
                        "subreddit": post.get("communityName", "") or post.get("subreddit", "") or "reddit",
                    })

        # מיון ולקיחת TOP 3 לכל מנייה
        result = {}
        for ticker in tickers:
            posts = ticker_posts[ticker]
            posts.sort(key=lambda x: (x["score"], x["upvotes"]), reverse=True)
            result[ticker] = posts[:3]

        return result

    except Exception as e:
        print(f"Apify error: {e}")
        return {}

def get_stocktwits_buzz(ticker):
    result = {"count": 0, "sentiment_pct": 50}
    try:
        st = requests.get(
            f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json",
            timeout=5
        )
        if st.status_code == 200:
            msgs = st.json().get("messages", [])
            result["count"] = len(msgs)
            b = sum(1 for m in msgs if m.get("entities", {}).get("sentiment", {}).get("basic") == "Bullish")
            br = sum(1 for m in msgs if m.get("entities", {}).get("sentiment", {}).get("basic") == "Bearish")
            result["sentiment_pct"] = round(b/(b+br)*100) if (b+br) > 0 else 50
    except: pass
    return result

def get_previous_week_data():
    try:
        r = supabase.table("weekly_scans").select("*").order("created_at", desc=True).limit(1).execute()
        if r.data:
            data = json.loads(r.data[0]["stocks_json"])
            stocks = data.get("stocks", data) if isinstance(data, dict) else data
            return {s["ticker"]: s for s in stocks if isinstance(s, dict)}
    except Exception as e:
        print(f"Previous week error: {e}")
    return {}

def save_to_supabase(stocks, bonus, week_label):
    try:
        supabase.table("weekly_scans").insert({
            "week_label": week_label,
            "stocks_json": json.dumps({"stocks": stocks, "bonus": bonus}),
            "created_at": datetime.now().isoformat()
        }).execute()
        print(f"Saved: {week_label}")
    except Exception as e:
        print(f"Save error: {e}")

def send_email(stocks, bonus, week_label):
    returning = sum(1 for s in stocks if s.get("streak", 1) >= 2)
    rows = ""
    for i, s in enumerate(stocks, 1):
        streak = s.get("streak", 1)
        badge = (
            f'<span style="background:#FCEBEB;color:#791F1F;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">4+ weeks</span>' if streak>=4
            else f'<span style="background:#FAEEDA;color:#633806;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">{streak} weeks</span>' if streak>=3
            else f'<span style="background:#EAF3DE;color:#27500A;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">{streak} weeks</span>' if streak>=2
            else '<span style="background:#f0f0f0;color:#888;padding:3px 10px;border-radius:12px;font-size:11px">New</span>'
        )
        buzz = s.get("buzz", {})
        mcap = round(s["market_cap"] / 1_000_000_000, 1)
        buzz_color = "#097c3e" if buzz.get("score", 0) >= 7 else "#cc8800" if buzz.get("score", 0) >= 4 else "#888"
        quotes = buzz.get("quotes", [])
        quote_html = ""
        if quotes:
            q = quotes[0]
            quote_html = f'<div style="font-size:11px;color:#555;font-style:italic;margin-top:4px;padding:4px 8px;background:#f5f5f5;border-radius:4px;border-left:2px solid #FF4500">"{q["text"][:100]}..."</div>'

        rows += f'''<tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:10px 14px;color:#999;font-size:13px">{i}</td>
            <td style="padding:10px 14px"><div style="font-size:15px;font-weight:700;color:#1a1a2e">{s["ticker"]}</div><div style="font-size:11px;color:#999;margin-top:2px">{s["name"]}</div>{quote_html}</td>
            <td style="padding:10px 14px"><span style="font-size:18px;font-weight:800;color:#097c3e">+{s["change_pct"]}%</span></td>
            <td style="padding:10px 14px;color:#555;font-size:13px">${mcap}B</td>
            <td style="padding:10px 14px;text-align:center"><span style="font-size:14px;font-weight:700;color:{buzz_color}">{buzz.get("score",0)}/10</span><div style="font-size:10px;color:#aaa;margin-top:2px">{buzz.get("total_count",0)} posts</div></td>
            <td style="padding:10px 14px">{badge}</td>
        </tr>'''

    bonus_html = ""
    if bonus:
        bonus_cards = "".join([
            f'<div style="background:white;border:1px solid #e8e8e8;border-radius:10px;padding:14px 16px;flex:1;min-width:200px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:16px;font-weight:700;color:#1a1a2e">{b["ticker"]}</span><span style="background:#FAEEDA;color:#633806;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">Buzz Alert</span></div><div style="font-size:12px;color:#666">{b["name"]}</div><div style="font-size:12px;color:#097c3e;font-weight:600;margin-top:6px">+{b["change_pct"]}% · {b.get("buzz",{}).get("total_count",0)} posts</div></div>'
            for b in bonus[:2]
        ])
        bonus_html = f'<div style="padding:20px 24px;background:#f8f9fa;border-top:1px solid #eee"><div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Bonus Stocks — Worth Watching</div><div style="display:flex;gap:12px;flex-wrap:wrap">{bonus_cards}</div></div>'

    html = f'''<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f5;font-family:Arial,sans-serif">
<div style="max-width:700px;margin:0 auto">
<div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px;border-radius:16px 16px 0 0">
<h1 style="color:white;margin:0;font-size:22px;font-weight:800">📈 Stock Scout</h1>
<p style="color:#aaa;margin:6px 0 0;font-size:13px">{week_label} · Weekly Top Gainers</p>
</div>
<div style="background:#097c3e;padding:12px 24px">
<span style="color:white;font-size:13px;font-weight:600">{returning} stocks returning this week · Min cap: ${MIN_MARKET_CAP//1_000_000}M</span>
</div>
<div style="background:white">
<table style="width:100%;border-collapse:collapse">
<thead><tr style="background:#f8f9fa;border-bottom:2px solid #eee">
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:600">#</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:600">STOCK</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:600">GAIN</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:600">MKT CAP</th>
<th style="padding:10px 14px;text-align:center;font-size:11px;color:#999;font-weight:600">BUZZ</th>
<th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:600">TREND</th>
</tr></thead>
<tbody>{rows}</tbody>
</table>
</div>
{bonus_html}
<div style="background:#1a1a2e;padding:24px;border-radius:0 0 16px 16px;text-align:center">
<div style="color:#aaa;font-size:13px;margin-bottom:16px">Open the full dashboard for detailed analysis</div>
<a href="https://stock-scout-phi.vercel.app" style="background:#097c3e;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Open Full Dashboard →</a>
</div>
</div></body></html>'''

    try:
        r = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": "Stock Scout <onboarding@resend.dev>",
                "to": [BOSS_EMAIL],
                "subject": f"Stock Scout - Weekly Report {week_label}",
                "html": html
            }
        )
        print(f"Email sent: {r.status_code}")
        if r.status_code != 200:
            print(f"Email error: {r.text[:200]}")
    except Exception as e:
        print(f"Email error: {e}")

def main():
    print("=== Stock Scout Starting ===")
    week_label = get_week_label()
    print(f"Week: {week_label}")

    stocks, bonus_candidates = get_top_gainers()
    if not stocks:
        print("No stocks found")
        return

    previous_week = get_previous_week_data()

    # שולף באז לכל המניות בבקשה אחת
    tickers = [s["ticker"] for s in stocks]
    print(f"Fetching buzz for {len(tickers)} stocks...")
    all_reddit_posts = get_all_buzz_via_apify(tickers)

    for s in stocks:
        ticker = s["ticker"]
        reddit_quotes = all_reddit_posts.get(ticker, [])
        st_data = get_stocktwits_buzz(ticker)
        total = len(reddit_quotes) + st_data["count"]

        if total > 200: score = 9
        elif total > 100: score = 8
        elif total > 50: score = 7
        elif total > 20: score = 6
        elif total > 10: score = 5
        elif total > 3: score = 4
        elif total > 0: score = 3
        else: score = 1

        if any(q["score"] >= 3 for q in reddit_quotes):
            score = min(10, score + 1)

        topics = []
        for q in reddit_quotes:
            for kw in EARLY_SIGNAL_KEYWORDS:
                if kw in q["text"].lower() and kw not in topics:
                    topics.append(kw)

        s["buzz"] = {
            "reddit_count": len(reddit_quotes),
            "stocktwits_count": st_data["count"],
            "total_count": total,
            "score": score,
            "sentiment_pct": st_data["sentiment_pct"],
            "quotes": reddit_quotes,
            "topics": topics[:3]
        }
        s["streak"] = previous_week.get(ticker, {}).get("streak", 0) + 1 if ticker in previous_week else 1

    # בונוס — רק StockTwits (מהיר)
    bonus_with_buzz = []
    for b in bonus_candidates[:10]:
        st = get_stocktwits_buzz(b["ticker"])
        b["buzz"] = {"total_count": st["count"], "score": 3 if st["count"] > 5 else 1, "quotes": [], "topics": [], "sentiment_pct": st["sentiment_pct"], "reddit_count": 0, "stocktwits_count": st["count"]}
        if st["count"] > 3:
            bonus_with_buzz.append(b)

    bonus_with_buzz.sort(key=lambda x: x["buzz"]["total_count"], reverse=True)
    bonus = bonus_with_buzz[:2]

    save_to_supabase(stocks, bonus, week_label)
    send_email(stocks, bonus, week_label)
    print("=== Done! ===")

if __name__ == "__main__":
    main()
