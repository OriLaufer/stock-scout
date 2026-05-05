import requests
import json
import os
import re
import time
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
    "moving", "spiking", "flying", "running", "pumping"
]

def clean_text(text):
    if not text:
        return ""
    text = re.sub(r'http\S+|www\.\S+|\[\S+\]\(\S+\)', '', text)
    text = re.sub(r'[*#\[\]()&amp;]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) > 120:
        text = text[:117] + "..."
    return text

def get_week_label():
    today = datetime.now()
    start = today - timedelta(days=today.weekday() + 7)
    end = start + timedelta(days=4)
    return f"{start.strftime('%d.%m')}-{end.strftime('%d.%m.%Y')}"

def get_reddit_total_count(ticker):
    """שולף מספר פוסטים כולל מ-Reddit — חינמי לגמרי"""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
        }
        # חיפוש ב-Reddit עם פרמטר count
        url = f"https://www.reddit.com/search.json?q={ticker}&sort=hot&t=week&limit=1"
        resp = requests.get(url, headers=headers, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            # Reddit מחזיר total count בתוך ה-after/before metadata
            children = data.get("data", {}).get("children", [])
            dist = data.get("data", {}).get("dist", 0)
            # אם יש תוצאות — נחזיר הערכה
            if dist > 0:
                return True  # יש פוסטים
        return False
    except:
        return False

def get_stocktwits_data(ticker):
    """שולף נתוני StockTwits — מספר הודעות וסנטימנט"""
    result = {"count": 0, "sentiment_pct": 50, "bullish": 0, "bearish": 0}
    try:
        # ניסיון ישיר
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json"
        resp = requests.get(url, headers=headers, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            msgs = data.get("messages", [])
            result["count"] = len(msgs)
            b = sum(1 for m in msgs if m.get("entities", {}).get("sentiment", {}).get("basic") == "Bullish")
            br = sum(1 for m in msgs if m.get("entities", {}).get("sentiment", {}).get("basic") == "Bearish")
            result["bullish"] = b
            result["bearish"] = br
            result["sentiment_pct"] = round(b/(b+br)*100) if (b+br) > 0 else 50
            print(f"  StockTwits {ticker}: {len(msgs)} messages, {result['sentiment_pct']}% bullish")
    except Exception as e:
        print(f"  StockTwits {ticker}: {e}")
    return result

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

def get_all_buzz_via_apify(tickers):
    """בקשה אחת ל-Apify — מביא ציטוטים"""
    print(f"Fetching Reddit quotes for {len(tickers)} tickers via Apify...")
    if not APIFY_TOKEN:
        print("No APIFY_TOKEN!")
        return {}

    start_urls = []
    for ticker in tickers:
        start_urls.append({"url": f"https://www.reddit.com/search/?q={ticker}&sort=hot&t=week"})
    start_urls.append({"url": "https://www.reddit.com/r/wallstreetbets/hot/"})
    start_urls.append({"url": "https://www.reddit.com/r/stocks/hot/"})
    start_urls.append({"url": "https://www.reddit.com/r/investing/hot/"})

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
            print(f"Apify error: {run_resp.status_code} - {run_resp.text[:100]}")
            return {}

        all_posts = run_resp.json()
        if not isinstance(all_posts, list):
            return {}

        print(f"Got {len(all_posts)} posts from Apify")

        ticker_quotes = {t: [] for t in tickers}
        for post in all_posts:
            title = post.get("title", "") or ""
            body = post.get("body", "") or post.get("selftext", "") or ""
            full_text = f"{title} {body}"
            upvotes = post.get("upVotes", 0) or post.get("score", 0) or 0
            subreddit = post.get("communityName", "") or post.get("subreddit", "") or "reddit"

            for ticker in tickers:
                if ticker.lower() in full_text.lower() or f"${ticker}" in full_text:
                    clean_title = clean_text(title or full_text)
                    if clean_title and len(clean_title) > 10:
                        interest_score = score_post(clean_title, ticker)
                        ticker_quotes[ticker].append({
                            "text": clean_title,
                            "score": interest_score,
                            "upvotes": upvotes,
                            "subreddit": subreddit,
                        })

        result = {}
        for ticker in tickers:
            posts = ticker_quotes[ticker]
            posts.sort(key=lambda x: (x["score"], x["upvotes"]), reverse=True)
            result[ticker] = posts[:3]

        return result

    except Exception as e:
        print(f"Apify error: {e}")
        return {}

def calculate_buzz_score(reddit_count, stocktwits_count, quotes):
    total = reddit_count + stocktwits_count
    if total > 100: score = 10
    elif total > 50: score = 9
    elif total > 20: score = 8
    elif total > 10: score = 7
    elif total > 5: score = 6
    elif total > 2: score = 5
    elif total > 0: score = 4
    else: score = 1
    early_signals = [q for q in quotes if q["score"] >= 4]
    if len(early_signals) >= 2:
        score = min(10, score + 2)
    elif len(early_signals) >= 1:
        score = min(10, score + 1)
    return score

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
            quote_html = f'<div style="font-size:11px;color:#555;font-style:italic;margin-top:4px;padding:4px 8px;background:#f5f5f5;border-radius:4px;border-left:2px solid #FF4500">"{q["text"]}"</div>'

        st_count = buzz.get("stocktwits_count", 0)
        reddit_count = buzz.get("reddit_count", 0)
        total = buzz.get("total_count", 0)

        rows += f'''<tr style="border-bottom:1px solid #f0f0f0">
            <td style="padding:10px 14px;color:#999;font-size:13px">{i}</td>
            <td style="padding:10px 14px"><div style="font-size:15px;font-weight:700;color:#1a1a2e">{s["ticker"]}</div><div style="font-size:11px;color:#999;margin-top:2px">{s["name"]}</div>{quote_html}</td>
            <td style="padding:10px 14px"><span style="font-size:18px;font-weight:800;color:#097c3e">+{s["change_pct"]}%</span></td>
            <td style="padding:10px 14px;color:#555;font-size:13px">${mcap}B</td>
            <td style="padding:10px 14px;text-align:center">
                <span style="font-size:14px;font-weight:700;color:{buzz_color}">{buzz.get("score",0)}/10</span>
                <div style="font-size:10px;color:#aaa;margin-top:2px">R:{reddit_count} · ST:{st_count}</div>
            </td>
            <td style="padding:10px 14px">{badge}</td>
        </tr>'''

    bonus_html = ""
    if bonus:
        bonus_cards = "".join([
            f'<div style="background:white;border:1px solid #e8e8e8;border-radius:10px;padding:14px 16px;flex:1;min-width:200px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:16px;font-weight:700;color:#1a1a2e">{b["ticker"]}</span><span style="background:#FAEEDA;color:#633806;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">Buzz Alert</span></div><div style="font-size:12px;color:#666">{b["name"]}</div><div style="font-size:12px;color:#097c3e;font-weight:600;margin-top:6px">+{b["change_pct"]}% · {b.get("buzz",{}).get("total_count",0)} signals</div></div>'
            for b in bonus[:2]
        ])
        bonus_html = f'<div style="padding:20px 24px;background:#f8f9fa;border-top:1px solid #eee"><div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Bonus Stocks — Worth Watching</div><div style="display:flex;gap:12px;flex-wrap:wrap">{bonus_cards}</div></div>'

    html = f'''<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f5;font-family:Arial,sans-serif">
<div style="max-width:700px;margin:0 auto">
<div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px;border-radius:16px 16px 0 0">
<h1 style="color:white;margin:0;font-size:22px;font-weight:800">Stock Scout</h1>
<p style="color:#aaa;margin:6px 0 0;font-size:13px">{week_label} · Weekly Top Gainers</p>
</div>
<div style="background:#097c3e;padding:12px 24px">
<span style="color:white;font-size:13px;font-weight:600">{returning} stocks returning this week · Min cap: ${MIN_MARKET_CAP//1_000_000}M</span>
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
<a href="https://stock-scout-phi.vercel.app" style="background:#097c3e;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Open Full Dashboard</a>
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
    tickers = [s["ticker"] for s in stocks]

    # בקשה אחת ל-Apify — ציטוטים
    all_reddit_quotes = get_all_buzz_via_apify(tickers)

    # StockTwits + Reddit count לכל מנייה
    for s in stocks:
        ticker = s["ticker"]
        quotes = all_reddit_quotes.get(ticker, [])

        # StockTwits ישירות
        st_data = get_stocktwits_data(ticker)

        # Reddit count — ספירה ישירה
        reddit_count = len(quotes)  # מספר ציטוטים שמצאנו

        total = reddit_count + st_data["count"]
        score = calculate_buzz_score(reddit_count, st_data["count"], quotes)

        topics = []
        for q in quotes:
            for kw in EARLY_SIGNAL_KEYWORDS:
                if kw in q["text"].lower() and kw not in topics:
                    topics.append(kw)

        s["buzz"] = {
            "reddit_count": reddit_count,
            "stocktwits_count": st_data["count"],
            "total_count": total,
            "score": score,
            "sentiment_pct": st_data["sentiment_pct"],
            "bullish": st_data["bullish"],
            "bearish": st_data["bearish"],
            "quotes": quotes,
            "topics": topics[:3]
        }
        s["streak"] = previous_week.get(ticker, {}).get("streak", 0) + 1 if ticker in previous_week else 1
        print(f"{ticker}: Reddit={reddit_count}, ST={st_data['count']}, score={score}/10")

    # בונוס
    bonus_with_buzz = []
    for b in bonus_candidates[:10]:
        quotes = all_reddit_quotes.get(b["ticker"], [])
        st = get_stocktwits_data(b["ticker"])
        total = len(quotes) + st["count"]
        b["buzz"] = {
            "total_count": total,
            "score": calculate_buzz_score(len(quotes), st["count"], quotes),
            "quotes": quotes,
            "topics": [],
            "sentiment_pct": st["sentiment_pct"],
            "reddit_count": len(quotes),
            "stocktwits_count": st["count"]
        }
        if total > 0:
            bonus_with_buzz.append(b)

    bonus_with_buzz.sort(key=lambda x: x["buzz"]["total_count"], reverse=True)
    bonus = bonus_with_buzz[:2]

    save_to_supabase(stocks, bonus, week_label)
    send_email(stocks, bonus, week_label)
    print("=== Done! ===")

if __name__ == "__main__":
    main()
