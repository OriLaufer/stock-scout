import yfinance as yf
import requests
import json
import os
from datetime import datetime, timedelta
from supabase import create_client

# --- הגדרות ---
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SECRET_KEY"]
RESEND_API_KEY = os.environ["RESEND_API_KEY"]
BOSS_EMAIL = os.environ["BOSS_EMAIL"]
MIN_MARKET_CAP = int(os.environ.get("MIN_MARKET_CAP", "500000000"))

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_week_label():
    today = datetime.now()
    start = today - timedelta(days=today.weekday() + 7)
    end = start + timedelta(days=4)
    return f"{start.strftime('%d.%m')}-{end.strftime('%d.%m.%Y')}"

def get_top_gainers():
    print("סורק את השוק...")
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(
            "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved",
            params={"scrIds": "day_gainers", "count": 250, "region": "US"},
            headers=headers
        )
        data = response.json()
        quotes = data["finance"]["result"][0]["quotes"]
    except Exception as e:
        print(f"שגיאה בשליפת נתונים: {e}")
        return []

    results = []
    for quote in quotes:
        try:
            market_cap = quote.get("marketCap", {}).get("raw", 0)
            if market_cap < MIN_MARKET_CAP:
                continue
            ticker = quote.get("symbol", "")
            name = quote.get("shortName", ticker)
            change_pct = quote.get("regularMarketChangePercent", {}).get("raw", 0)
            volume = quote.get("regularMarketVolume", {}).get("raw", 0)
            price = quote.get("regularMarketPrice", {}).get("raw", 0)
            results.append({
                "ticker": ticker,
                "name": name,
                "change_pct": round(change_pct, 2),
                "market_cap": market_cap,
                "volume": volume,
                "price": price
            })
        except:
            continue

    results.sort(key=lambda x: x["change_pct"], reverse=True)
    return results[:20]

def get_buzz_score(ticker):
    print(f"בודק באז עבור {ticker}...")
    buzz_data = {"reddit_count": 0, "stocktwits_count": 0, "total_count": 0, "score": 0, "topics": [], "spike_ratio": 1.0}

    try:
        st_url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json"
        st_response = requests.get(st_url, timeout=5)
        if st_response.status_code == 200:
            st_data = st_response.json()
            messages = st_data.get("messages", [])
            buzz_data["stocktwits_count"] = len(messages)
            bullish = sum(1 for m in messages if m.get("entities", {}).get("sentiment", {}).get("basic") == "Bullish")
            bearish = sum(1 for m in messages if m.get("entities", {}).get("sentiment", {}).get("basic") == "Bearish")
            total_sentiment = bullish + bearish
            buzz_data["sentiment_pct"] = round((bullish / total_sentiment) * 100) if total_sentiment > 0 else 50
    except:
        pass

    try:
        reddit_url = f"https://www.reddit.com/search.json?q={ticker}&sort=new&limit=100&t=week"
        reddit_response = requests.get(reddit_url, headers={"User-Agent": "StockScout/1.0"}, timeout=5)
        if reddit_response.status_code == 200:
            reddit_data = reddit_response.json()
            posts = reddit_data.get("data", {}).get("children", [])
            buzz_data["reddit_count"] = len(posts)
            keywords = {}
            important_words = ["acquisition", "merger", "contract", "partnership", "earnings", "insider", "buyout", "fda", "approval", "deal", "revenue", "profit"]
            for post in posts:
                title = post.get("data", {}).get("title", "").lower()
                for word in important_words:
                    if word in title:
                        keywords[word] = keywords.get(word, 0) + 1
            sorted_keywords = sorted(keywords.items(), key=lambda x: x[1], reverse=True)[:3]
            buzz_data["topics"] = [k for k, v in sorted_keywords]
    except:
        pass

    total = buzz_data["reddit_count"] + buzz_data["stocktwits_count"]
    buzz_data["total_count"] = total
    if total > 500: buzz_data["score"] = 10
    elif total > 200: buzz_data["score"] = 8
    elif total > 100: buzz_data["score"] = 7
    elif total > 50: buzz_data["score"] = 6
    elif total > 20: buzz_data["score"] = 5
    elif total > 5: buzz_data["score"] = 3
    else: buzz_data["score"] = 1
    return buzz_data

def get_previous_week_data():
    try:
        result = supabase.table("weekly_scans").select("*").order("created_at", desc=True).limit(1).execute()
        if result.data:
            return {item["ticker"]: item for item in json.loads(result.data[0]["stocks_json"])}
    except:
        pass
    return {}

def save_to_supabase(stocks, week_label):
    try:
        supabase.table("weekly_scans").insert({
            "week_label": week_label,
            "stocks_json": json.dumps(stocks),
            "created_at": datetime.now().isoformat()
        }).execute()
        print(f"נשמר בהצלחה: {week_label}")
    except Exception as e:
        print(f"שגיאה בשמירה: {e}")

def send_email(stocks, week_label, previous_week):
    rows = ""
    for i, stock in enumerate(stocks, 1):
        streak = stock.get("streak", 0)
        if streak >= 4:
            streak_badge = f'<span style="background:#FCEBEB;color:#791F1F;padding:2px 8px;border-radius:10px;font-size:11px">🔴 {streak} שבועות</span>'
        elif streak >= 3:
            streak_badge = f'<span style="background:#FAEEDA;color:#633806;padding:2px 8px;border-radius:10px;font-size:11px">🟠 {streak} שבועות</span>'
        elif streak >= 2:
            streak_badge = f'<span style="background:#EAF3DE;color:#27500A;padding:2px 8px;border-radius:10px;font-size:11px">🟡 {streak} שבועות</span>'
        else:
            streak_badge = '<span style="color:#999;font-size:11px">חדשה</span>'
        buzz = stock.get("buzz", {})
        mcap_b = round(stock["market_cap"] / 1_000_000_000, 1)
        rows += f'<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:10px 12px;color:#999;font-size:12px">{i}</td><td style="padding:10px 12px"><strong style="font-size:14px">{stock["ticker"]}</strong><br><span style="font-size:11px;color:#999">{stock["name"]}</span></td><td style="padding:10px 12px;color:#097c3e;font-weight:700;font-size:17px">+{stock["change_pct"]}%</td><td style="padding:10px 12px;color:#666;font-size:12px">${mcap_b}B</td><td style="padding:10px 12px;text-align:center"><strong style="font-size:14px">{buzz.get("score", 0)}/10</strong><br><span style="font-size:10px;color:#999">{buzz.get("total_count", 0)} פוסטים</span></td><td style="padding:10px 12px">{streak_badge}</td></tr>'

    html = f'<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto"><div style="background:#1a1a2e;padding:24px;border-radius:12px 12px 0 0"><h1 style="color:white;margin:0;font-size:22px">📈 Stock Scout</h1><p style="color:#aaa;margin:6px 0 0">{week_label} — TOP 20</p></div><table style="width:100%;border-collapse:collapse;background:white"><thead><tr style="background:#f8f9fa;border-bottom:2px solid #eee"><th style="padding:10px 12px;text-align:left">#</th><th style="padding:10px 12px;text-align:left">מנייה</th><th style="padding:10px 12px;text-align:left">עלייה</th><th style="padding:10px 12px;text-align:left">מרקט קאפ</th><th style="padding:10px 12px;text-align:center">באז</th><th style="padding:10px 12px;text-align:left">מגמה</th></tr></thead><tbody>{rows}</tbody></table><div style="background:#1a1a2e;padding:20px 24px;border-radius:0 0 12px 12px;text-align:center"><a href="https://stock-scout-phi.vercel.app" style="background:#097c3e;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">🔍 פתח את הדשבורד המלא</a></div></div>'

    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": "Stock Scout <onboarding@resend.dev>", "to": [BOSS_EMAIL], "subject": f"📈 Stock Scout — {week_label}", "html": html}
        )
        print(f"מייל נשלח: {response.status_code}")
    except Exception as e:
        print(f"שגיאה בשליחת מייל: {e}")

def main():
    print("=== Stock Scout מתחיל לרוץ ===")
    week_label = get_week_label()
    stocks = get_top_gainers()
    print(f"נמצאו {len(stocks)} מניות")
    previous_week = get_previous_week_data()
    for stock in stocks:
        stock["buzz"] = get_buzz_score(stock["ticker"])
        stock["streak"] = previous_week.get(stock["ticker"], {}).get("streak", 0) + 1 if stock["ticker"] in previous_week else 1
    save_to_supabase(stocks, week_label)
    send_email(stocks, week_label, previous_week)
    print("=== סיים בהצלחה! ===")

if __name__ == "__main__":
    main()
