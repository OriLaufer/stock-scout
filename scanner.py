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

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

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
            return []

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
    print(f"Found {len(results)} stocks")
    return results[:20]

def get_buzz_score(ticker):
    print(f"Buzz: {ticker}...")
    buzz = {"reddit_count": 0, "stocktwits_count": 0, "total_count": 0, "score": 0, "topics": [], "sentiment_pct": 50}
    try:
        st = requests.get(f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json", timeout=5)
        if st.status_code == 200:
            msgs = st.json().get("messages", [])
            buzz["stocktwits_count"] = len(msgs)
            b = sum(1 for m in msgs if m.get("entities", {}).get("sentiment", {}).get("basic") == "Bullish")
            br = sum(1 for m in msgs if m.get("entities", {}).get("sentiment", {}).get("basic") == "Bearish")
            buzz["sentiment_pct"] = round(b/(b+br)*100) if (b+br) > 0 else 50
    except: pass
    try:
        r = requests.get(f"https://www.reddit.com/search.json?q={ticker}&sort=new&limit=100&t=week", headers={"User-Agent": "StockScout/1.0"}, timeout=5)
        if r.status_code == 200:
            posts = r.json().get("data", {}).get("children", [])
            buzz["reddit_count"] = len(posts)
            kw = {}
            for p in posts:
                t = p.get("data", {}).get("title", "").lower()
                for w in ["acquisition","merger","contract","partnership","earnings","insider","buyout","fda","approval","deal"]:
                    if w in t: kw[w] = kw.get(w, 0) + 1
            buzz["topics"] = [k for k,v in sorted(kw.items(), key=lambda x: x[1], reverse=True)[:3]]
    except: pass
    total = buzz["reddit_count"] + buzz["stocktwits_count"]
    buzz["total_count"] = total
    buzz["score"] = 10 if total>500 else 8 if total>200 else 7 if total>100 else 6 if total>50 else 5 if total>20 else 3 if total>5 else 1
    return buzz

def get_previous_week_data():
    try:
        r = supabase.table("weekly_scans").select("*").order("created_at", desc=True).limit(1).execute()
        if r.data: return {s["ticker"]: s for s in json.loads(r.data[0]["stocks_json"])}
    except: pass
    return {}

def save_to_supabase(stocks, week_label):
    try:
        supabase.table("weekly_scans").insert({"week_label": week_label, "stocks_json": json.dumps(stocks), "created_at": datetime.now().isoformat()}).execute()
        print(f"Saved: {week_label}")
    except Exception as e:
        print(f"Save error: {e}")

def send_email(stocks, week_label, previous_week):
    rows = ""
    for i, s in enumerate(stocks, 1):
        streak = s.get("streak", 1)
        badge = f'<span style="background:#FCEBEB;color:#791F1F;padding:2px 8px;border-radius:10px;font-size:11px">4+ weeks</span>' if streak>=4 else f'<span style="background:#FAEEDA;color:#633806;padding:2px 8px;border-radius:10px;font-size:11px">3 weeks</span>' if streak>=3 else f'<span style="background:#EAF3DE;color:#27500A;padding:2px 8px;border-radius:10px;font-size:11px">2 weeks</span>' if streak>=2 else '<span style="color:#999;font-size:11px">New</span>'
        buzz = s.get("buzz", {})
        mcap = round(s["market_cap"]/1_000_000_000, 1)
        rows += f'<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:10px 12px;color:#999">{i}</td><td style="padding:10px 12px"><strong>{s["ticker"]}</strong><br><span style="font-size:11px;color:#999">{s["name"]}</span></td><td style="padding:10px 12px;color:#097c3e;font-weight:700;font-size:17px">+{s["change_pct"]}%</td><td style="padding:10px 12px;color:#666;font-size:12px">${mcap}B</td><td style="padding:10px 12px;text-align:center"><strong>{buzz.get("score",0)}/10</strong><br><span style="font-size:10px;color:#999">{buzz.get("total_count",0)} posts</span></td><td style="padding:10px 12px">{badge}</td></tr>'

    returning = sum(1 for s in stocks if s.get("streak",1) >= 2)
    html = f'<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto"><div style="background:#1a1a2e;padding:24px;border-radius:12px 12px 0 0"><h1 style="color:white;margin:0">Stock Scout</h1><p style="color:#aaa;margin:6px 0 0">{week_label} - TOP 20 Weekly Gainers</p></div><div style="background:#f8f9fa;padding:12px 24px;border-bottom:1px solid #eee"><span style="background:#EAF3DE;color:#27500A;padding:4px 12px;border-radius:12px;font-size:13px">{returning} returning stocks</span></div><table style="width:100%;border-collapse:collapse;background:white"><thead><tr style="background:#f8f9fa;border-bottom:2px solid #eee"><th style="padding:10px 12px;text-align:left;font-size:11px;color:#999">#</th><th style="padding:10px 12px;text-align:left;font-size:11px;color:#999">Stock</th><th style="padding:10px 12px;text-align:left;font-size:11px;color:#999">Gain</th><th style="padding:10px 12px;text-align:left;font-size:11px;color:#999">Mkt Cap</th><th style="padding:10px 12px;text-align:center;font-size:11px;color:#999">Buzz</th><th style="padding:10px 12px;text-align:left;font-size:11px;color:#999">Trend</th></tr></thead><tbody>{rows}</tbody></table><div style="background:#1a1a2e;padding:20px 24px;border-radius:0 0 12px 12px;text-align:center"><a href="https://stock-scout-phi.vercel.app" style="background:#097c3e;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600">Open Full Dashboard</a></div></div>'

    try:
        r = requests.post("https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": "Stock Scout <onboarding@resend.dev>", "to": [BOSS_EMAIL], "subject": f"Stock Scout - Weekly Report {week_label}", "html": html})
        print(f"Email: {r.status_code}")
    except Exception as e:
        print(f"Email error: {e}")

def main():
    print("=== Stock Scout Starting ===")
    week_label = get_week_label()
    stocks = get_top_gainers()
    if not stocks:
        print("No stocks found")
        return
    previous_week = get_previous_week_data()
    for s in stocks:
        s["buzz"] = get_buzz_score(s["ticker"])
        s["streak"] = previous_week.get(s["ticker"], {}).get("streak", 0) + 1 if s["ticker"] in previous_week else 1
    save_to_supabase(stocks, week_label)
    send_email(stocks, week_label, previous_week)
    print("=== Done! ===")

if __name__ == "__main__":
    main()
