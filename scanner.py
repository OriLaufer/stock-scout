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
    print(f"Found {len(results)} stocks, checking bonus candidates...")
    return top20, bonus_candidates

def get_buzz_score(ticker, is_bonus=False):
    print(f"Buzz: {ticker}...")
    buzz = {"reddit_count": 0, "stocktwits_count": 0, "total_count": 0, "score": 0, "topics": [], "sentiment_pct": 50, "spike_ratio": 1.0}
    try:
        st = requests.get(f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json", timeout=8)
        if st.status_code == 200:
            msgs = st.json().get("messages", [])
            buzz["stocktwits_count"] = len(msgs)
            b = sum(1 for m in msgs if m.get("entities", {}).get("sentiment", {}).get("basic") == "Bullish")
            br = sum(1 for m in msgs if m.get("entities", {}).get("sentiment", {}).get("basic") == "Bearish")
            buzz["sentiment_pct"] = round(b/(b+br)*100) if (b+br) > 0 else 50
    except: pass
    try:
        r = requests.get(f"https://www.reddit.com/search.json?q={ticker}+stock&sort=new&limit=100&t=week", headers={"User-Agent": "Mozilla/5.0 StockScout/2.0"}, timeout=8)
        if r.status_code == 200:
            posts = r.json().get("data", {}).get("children", [])
            buzz["reddit_count"] = len(posts)
            kw = {}
            important = ["acquisition","merger","contract","partnership","earnings","insider","buyout","fda","approval","deal","revenue","profit","short","squeeze","catalyst","breakout","upgrade","downgrade"]
            for p in posts:
                title = p.get("data", {}).get("title", "").lower()
                score = p.get("data", {}).get("score", 0)
                for w in important:
                    if w in title:
                        kw[w] = kw.get(w, 0) + max(1, score // 100)
            buzz["topics"] = [k for k,v in sorted(kw.items(), key=lambda x: x[1], reverse=True)[:3]]
    except: pass
    total = buzz["reddit_count"] + buzz["stocktwits_count"]
    buzz["total_count"] = total
    buzz["score"] = 10 if total>500 else 9 if total>300 else 8 if total>200 else 7 if total>100 else 6 if total>50 else 5 if total>20 else 3 if total>5 else 1
    return buzz

def get_previous_week_data():
    try:
        r = supabase.table("weekly_scans").select("*").order("created_at", desc=True).limit(1).execute()
        if r.data:
            data = json.loads(r.data[0]["stocks_json"])
            return {s["ticker"]: s for s in data.get("stocks", data) if isinstance(s, dict)}
    except Exception as e:
        print(f"Previous week error: {e}")
    return {}

def save_to_supabase(stocks, bonus, week_label):
    try:
        supabase.table("weekly_scans").insert({"week_label": week_label, "stocks_json": json.dumps({"stocks": stocks, "bonus": bonus}), "created_at": datetime.now().isoformat()}).execute()
        print(f"Saved: {week_label}")
    except Exception as e:
        print(f"Save error: {e}")

def send_email(stocks, bonus, week_label, previous_week):
    returning = sum(1 for s in stocks if s.get("streak", 1) >= 2)
    rows = ""
    for i, s in enumerate(stocks, 1):
        streak = s.get("streak", 1)
        badge = f'<span style="background:#FCEBEB;color:#791F1F;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">4+ weeks</span>' if streak>=4 else f'<span style="background:#FAEEDA;color:#633806;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">{streak} weeks</span>' if streak>=3 else f'<span style="background:#EAF3DE;color:#27500A;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600">{streak} weeks</span>' if streak>=2 else '<span style="background:#f0f0f0;color:#888;padding:3px 10px;border-radius:12px;font-size:11px">New</span>'
        buzz = s.get("buzz", {})
        mcap = round(s["market_cap"] / 1_000_000_000, 1)
        buzz_color = "#097c3e" if buzz.get("score", 0) >= 7 else "#633806" if buzz.get("score", 0) >= 4 else "#888"
        rows += f'<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:10px 14px;color:#999;font-size:13px">{i}</td><td style="padding:10px 14px"><div style="font-size:15px;font-weight:700;color:#1a1a2e">{s["ticker"]}</div><div style="font-size:11px;color:#999;margin-top:2px">{s["name"]}</div></td><td style="padding:10px 14px"><span style="font-size:18px;font-weight:800;color:#097c3e">+{s["change_pct"]}%</span></td><td style="padding:10px 14px;color:#555;font-size:13px">${mcap}B</td><td style="padding:10px 14px;text-align:center"><span style="font-size:14px;font-weight:700;color:{buzz_color}">{buzz.get("score",0)}/10</span><div style="font-size:10px;color:#aaa;margin-top:2px">{buzz.get("total_count",0)} posts</div></td><td style="padding:10px 14px">{badge}</td></tr>'

    bonus_html = ""
    if bonus:
        bonus_cards = "".join([f'<div style="background:white;border:1px solid #e8e8e8;border-radius:10px;padding:14px 16px;flex:1;min-width:200px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:16px;font-weight:700;color:#1a1a2e">{b["ticker"]}</span><span style="background:#FAEEDA;color:#633806;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">Buzz Alert</span></div><div style="font-size:12px;color:#666">{b["name"]}</div><div style="font-size:12px;color:#097c3e;font-weight:600;margin-top:6px">+{b["change_pct"]}% · {b.get("buzz",{}).get("total_count",0)} posts · {b.get("buzz",{}).get("score",0)}/10 buzz</div></div>' for b in bonus[:2]])
        bonus_html = f'<div style="padding:20px 24px;background:#f8f9fa;border-top:1px solid #eee"><div style="font-size:11px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">2 Bonus Stocks — Worth Watching</div><div style="display:flex;gap:12px;flex-wrap:wrap">{bonus_cards}</div></div>'

    html = f'<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f2f5;font-family:Arial,sans-serif"><div style="max-width:680px;margin:0 auto"><div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px;border-radius:16px 16px 0 0"><div style="display:flex;align-items:center;gap:12px"><span style="font-size:28px">📈</span><div><div style="color:white;font-size:22px;font-weight:800">Stock Scout</div><div style="color:#aaa;font-size:13px;margin-top:2px">{week_label} · Weekly Top Gainers</div></div></div></div><div style="background:#097c3e;padding:12px 24px"><span style="color:white;font-size:13px;font-weight:600">✦ {returning} stocks returning this week · Min cap: ${MIN_MARKET_CAP//1_000_000}M</span></div><div style="background:white"><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f8f9fa;border-bottom:2px solid #eee"><th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:600">#</th><th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:600">STOCK</th><th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:600">GAIN</th><th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:600">MKT CAP</th><th style="padding:10px 14px;text-align:center;font-size:11px;color:#999;font-weight:600">BUZZ</th><th style="padding:10px 14px;text-align:left;font-size:11px;color:#999;font-weight:600">TREND</th></tr></thead><tbody>{rows}</tbody></table></div>{bonus_html}<div style="background:#1a1a2e;padding:24px;border-radius:0 0 16px 16px;text-align:center"><div style="color:#aaa;font-size:13px;margin-bottom:16px">Open the full dashboard for detailed analysis</div><a href="https://stock-scout-phi.vercel.app" style="background:#097c3e;color:white;padding:14px 36px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Open Full Dashboard →</a></div></div></body></html>'

    try:
        r = requests.post("https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": "Stock Scout <onboarding@resend.dev>", "to": [BOSS_EMAIL], "subject": f"Stock Scout - Weekly Report {week_label}", "html": html})
        print(f"Email sent: {r.status_code}")
        if r.status_code != 200:
            print(f"Email error: {r.text}")
    except Exception as e:
        print(f"Email error: {e}")

def main():
    print("=== Stock Scout Starting ===")
    week_label = get_week_label()
    stocks, bonus_candidates = get_top_gainers()
    if not stocks:
        print("No stocks found")
        return
    previous_week = get_previous_week_data()
    for s in stocks:
        s["buzz"] = get_buzz_score(s["ticker"])
        s["streak"] = previous_week.get(s["ticker"], {}).get("streak", 0) + 1 if s["ticker"] in previous_week else 1
    bonus_with_buzz = []
    for b in bonus_candidates[:15]:
        b["buzz"] = get_buzz_score(b["ticker"], is_bonus=True)
        if b["buzz"]["total_count"] > 10:
            bonus_with_buzz.append(b)
    bonus_with_buzz.sort(key=lambda x: x["buzz"]["total_count"], reverse=True)
    bonus = bonus_with_buzz[:2]
    save_to_supabase(stocks, bonus, week_label)
    send_email(stocks, bonus, week_label, previous_week)
    print("=== Done! ===")

if __name__ == "__main__":
    main()
