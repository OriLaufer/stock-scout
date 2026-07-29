"""End-to-end health check for Stock Scout.

Answers one question honestly: "is the system actually working right now?"
Every check that has ever silently broken this system is in here — the NaN-in-JSON
bug that made a whole week vanish, the paused database, the enrichments that quietly
came back empty, the Trend filling up with one-week spikes.

Run standalone:  python verify_system.py
In CI:           called by .github/workflows/full-run-verify.yml
Exit code 0 = all good, 1 = something is broken.

Env: SUPABASE_URL, SUPABASE_SECRET_KEY (required)
     DASHBOARD_URL, RESEND_API_KEY, BOSS_EMAIL (optional)
"""
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY") or ""
DASHBOARD_URL = (os.environ.get("DASHBOARD_URL") or "https://stock-scout-phi.vercel.app").rstrip("/")

results = []   # (ok: bool|None, title: str, detail: str)   None = warning


def check(ok, title, detail=""):
    results.append((ok, title, detail))
    icon = "PASS" if ok else ("WARN" if ok is None else "FAIL")
    print(f"[{icon}] {title}" + (f" — {detail}" if detail else ""))
    return ok


def get(url, headers=None, timeout=45):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        check(False, "Configuration", "SUPABASE_URL / SUPABASE_SECRET_KEY are missing")
        return report()

    # ---- 1. Is the database even reachable? (the July 2026 outage) ----
    hdr = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    raw = None
    try:
        _, raw = get(
            f"{SUPABASE_URL}/rest/v1/weekly_scans"
            "?select=week_label,created_at,stocks_json&order=created_at.desc&limit=1",
            hdr,
        )
        check(True, "Database reachable")
    except Exception as e:
        check(False, "Database reachable",
              f"{type(e).__name__}: {e} — the Supabase project is probably PAUSED. "
              "Restore it at https://supabase.com/dashboard/projects")
        return report()

    # ---- 2. Is there a scan at all, and is it recent? ----
    try:
        rows = json.loads(raw)
    except Exception as e:
        check(False, "Scan list readable", str(e))
        return report()

    if not rows:
        check(False, "A scan exists", "weekly_scans is empty — run the weekly scan")
        return report()

    row = rows[0]
    week = row.get("week_label", "?")
    created = row.get("created_at", "")
    try:
        age = (datetime.now(timezone.utc)
               - datetime.fromisoformat(created.replace("Z", "+00:00"))).days
    except Exception:
        age = -1
    check(age >= 0 and age <= 9, f"Latest scan is fresh ({week})",
          f"saved {age} days ago" if age >= 0 else f"unparseable date {created}")

    # ---- 3. Is the stored JSON actually VALID? ----
    # Python writes bare NaN/Infinity, which json.loads accepts but the browser's
    # JSON.parse REJECTS. That mismatch once made a whole week disappear from the
    # dashboard while looking perfectly fine server-side. parse_constant catches it.
    def reject_constant(name):
        raise ValueError(f"invalid JSON literal `{name}` — the browser cannot parse this")

    payload = None
    try:
        payload = json.loads(row.get("stocks_json") or "{}", parse_constant=reject_constant)
        check(True, "Stored JSON is browser-safe", "no NaN/Infinity")
    except ValueError as e:
        check(False, "Stored JSON is browser-safe",
              f"{e} — the dashboard will silently drop this week")
        return report()
    except Exception as e:
        check(False, "Stored JSON is browser-safe", str(e))
        return report()

    # ---- 4. Did the scan actually find stocks? ----
    stocks = payload.get("stocks") or []
    check(len(stocks) >= 20, "Weekly stocks present", f"{len(stocks)} stocks")

    # ---- 5. Are the enrichments there? (they fail quietly when rate-limited) ----
    for key, label, minimum in [
        ("trend", "The Trend", 3),
        ("radar", "Radar", 3),
        ("rising_stars", "Rising Stars", 3),
    ]:
        items = payload.get(key) or []
        check(len(items) >= minimum, f"{label} populated", f"{len(items)} entries")

    # The verdict is stored as {text, model, generated_at} — not a bare string.
    # Treating it as one raised AttributeError and killed the whole check run.
    v = payload.get("verdict")
    verdict = (v.get("text") if isinstance(v, dict) else v) or ""
    check(len(verdict) > 200, "AI Verdict written",
          f"{len(verdict)} chars" if verdict else "missing — run the Fix Verdict workflow")

    # The verdict is written in Hebrew for the boss. English at the top means the
    # model's plan-narration leaked in ahead of the report.
    if verdict:
        head = verdict.lstrip()[:120]
        leaked = head.startswith(("I'll", "I will", "Let me", "I need to", "First,"))
        check(not leaked, "Verdict starts with the report",
              "clean" if not leaked else f"pre-answer narration leaked in: {head[:70]}...")

    # ---- 6. Is The Trend quality, or is it single-week spikes? ----
    # A stock whose entire compound comes from one explosive week is noise. The
    # scanner filters these out; this proves the filter is actually working.
    trend = payload.get("trend") or []
    spikes = []
    for t in trend:
        ups = [h.get("change_pct", 0) for h in (t.get("weekly_history") or [])
               if (h.get("change_pct") or 0) > 0]
        if not ups:
            continue
        strong = [g for g in ups if g >= 12]
        if len(strong) <= 1 and max(ups) / sum(ups) >= 0.5:
            spikes.append(f"{t.get('ticker')} ({max(ups):.0f}% in one week)")
    if trend:
        check(not spikes, "The Trend is spike-free",
              "clean" if not spikes else "single-week spikes leaked in: " + ", ".join(spikes))

        # A compound return since February is history, not a signal. RXT once sat
        # in the list at +112% while down 42% over the previous four weeks. Every
        # entry must still be a live trend, and must say so.
        dead = []
        for t in trend:
            r4 = t.get("recent_4w_pct")
            if r4 is None:
                dead.append(f"{t.get('ticker')} (no momentum data)")
            elif r4 <= -25:
                dead.append(f"{t.get('ticker')} ({r4}% in 4 weeks)")
        check(not dead, "The Trend holds only LIVE trends",
              "all still running" if not dead else "finished trends still listed: " + ", ".join(dead))

    # ---- 7. Does the live dashboard actually render the data? ----
    try:
        status, html = get(DASHBOARD_URL, {"User-Agent": "StockScoutVerify/1.0"}, timeout=90)
        empty = "אין נתונים" in html or len(html) < 50000
        check(status == 200 and not empty, "Live dashboard shows data",
              f"HTTP {status}, {len(html):,} bytes" + (" — page looks EMPTY" if empty else ""))
    except Exception as e:
        check(False, "Live dashboard shows data", f"{type(e).__name__}: {e}")

    return report()


def report():
    failed = [r for r in results if r[0] is False]
    ok = not failed
    print("\n" + "=" * 60)
    print(f"RESULT: {'ALL CHECKS PASSED' if ok else str(len(failed)) + ' CHECK(S) FAILED'}")
    print("=" * 60)
    email(ok)
    return 0 if ok else 1


def email(ok):
    key, to = os.environ.get("RESEND_API_KEY"), os.environ.get("BOSS_EMAIL")
    if not key or not to:
        print("(no RESEND_API_KEY / BOSS_EMAIL — skipping report email)")
        return

    rows_html = ""
    for status, title, detail in results:
        color, icon = ("#097c3e", "✅") if status else (("#b8860b", "⚠️") if status is None else ("#cc3333", "❌"))
        rows_html += (
            f'<tr><td style="padding:8px 6px;font-size:20px;width:34px">{icon}</td>'
            f'<td style="padding:8px 6px"><b style="color:{color}">{title}</b>'
            f'<div style="color:#888;font-size:12px;direction:ltr;text-align:left">{detail}</div></td></tr>'
        )

    head = ("✅ Stock Scout — המערכת מוכנה להצגה לבוס" if ok
            else "❌ Stock Scout — לא מוכן להצגה, נמצאה תקלה")
    intro = ("כל הבדיקות עברו. הנתונים בכל הטאבים עדכניים ומחושבים מחדש, "
             "המגמות ברשימה עדיין חיות, והדשבורד עולה תקין. אפשר להעביר לבוס."
             if ok else
             "אל תעביר לבוס עדיין. הבדיקה מצאה בעיה — מה שמסומן באדום למטה הוא מה שצריך טיפול.")

    html = f"""<div dir="rtl" style="font-family:system-ui,Arial,sans-serif;max-width:600px">
      <h2 style="margin:0 0 10px;color:{'#097c3e' if ok else '#cc3333'}">{head}</h2>
      <p style="font-size:15px;margin:0 0 16px">{intro}</p>
      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px">{rows_html}</table>
      <p style="margin:20px 0"><a href="{DASHBOARD_URL}"
         style="background:#097c3e;color:#fff;padding:11px 22px;border-radius:8px;
                text-decoration:none;font-weight:700">פתח את הדשבורד</a></p>
      <p style="color:#888;font-size:12px">נשלח אוטומטית מבדיקת התקינות של Stock Scout.</p>
    </div>"""

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps({
            "from": "Stock Scout <onboarding@resend.dev>",
            "to": [to],
            "subject": head,
            "html": html,
        }).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=30)
        print(f"Report emailed to {to}")
    except Exception as e:
        print("report email failed:", e)


if __name__ == "__main__":
    sys.exit(main())
