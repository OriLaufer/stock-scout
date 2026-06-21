# Stock Scout — Project State (checkpoint)

Live: https://stock-scout-phi.vercel.app · Repo: OriLaufer/stock-scout
Stack: Next.js dashboard (Vercel) · Python scanner (GitHub Actions, weekly) · Supabase (data) · Resend (email) · yfinance + TradingView + Anthropic Claude.

## THE MISSION (boss's words)
Be IN the stocks that 5x–50x in a year — caught EARLY, before they hit any year-end "biggest gainers" list. Not read about them after. Then monitor what we hold: news, analysts, web buzz — and decide hold / add more.

## HOW IT RUNS
- Weekly scan: GitHub Actions cron, Sunday 06:00 UTC (`weekly-scan.yml`, timeout 120m). Runs `scanner.py`.
- scanner.py pulls the full US universe, 6 months of prices, computes everything, saves one row per week to Supabase `weekly_scans` (stocks_json), emails the report.
- Dashboard reads from Supabase in getServerSideProps.

## TABS (dashboard, pages/index.js)
- 📊 Weekly — top 40 gainers this week (>= $250M cap). Verdict card on top (collapsed by default).
- ⭐ Rising Stars — full-market 6-month relative-strength scan: quiet base-builders (early-SanDisk pattern).
- 🎯 Radar — top 10 by DNA score (forward-looking: RS + revenue growth + persistence + acceleration + small-cap + sector).
- 📈 The Trend — top 10 by COMPOUND return since we started scanning (who built the strongest trend). Per-stock identity card + TradingView chart + weekly bars.
- 🏆 Hall of Fame — ranked by appearance frequency; dot timeline (adaptive sizing).
- 📓 Journal — manual trades, live P&L, shared via Supabase (`shared_journal`). Click a trade → full identity card.
- 🔭 Portfolio Watch — per holding: live P&L + AI research (news/analysts/web buzz) + hold/add call + identity card.
- 🧠 AI Analyst — floating chat bubble, every tab. Shared history via Supabase (`shared_chats`).

## KEY SCORING
- Weekly "Pick for Next Week" = V3 Conviction: gate (weekly close < 60% of range → reject), then strength/weakness signals, then category (Pick/Candidate/Possible/Avoid/No-Pick). Master signal = weekly close strength (NOT float — learned after the BRUN -18.85% failure).
- Radar DNA (0-100): RS vs SPY 3/6mo (35) + revenue growth (20) + persistence (15) + acceleration (15) + small-cap room (10) + sector heat (5).
- Rising Stars (0-100): RS 6mo vs SPY (40) + weekly consistency (25) + above 50/200 MA (20) + still-rising (15) − spike penalty (15).
- The Verdict = AI written opinion (Opus + web search), NOT a number. Weekly.

## AI (Anthropic Claude)
- API key in BOTH Vercel env (chat, research, identity) AND GitHub Secrets (weekly verdict).
- Model names NOT hardcoded — discovered via GET /v1/models. Chat/research use newest Sonnet (fast, fits Vercel 60s); Verdict uses newest Opus (Actions, no timeout). Account's best = claude-opus-4-8.
- Web search: ON for Verdict + Portfolio research (capped 2 uses to fit 60s); OFF by default in chat (too slow) — when off, prompt forbids fabricating news/tool calls.
- /api/chat (chat), /api/position-research (holding research), /api/stock-identity (Yahoo cookie+crumb auth for analyst/52W/business/float), /api/chats + /api/journal (shared state).

## DATA / SCALE
- safe_json() in scanner.py sanitizes NaN/Infinity → null (Python writes bare NaN = invalid JSON, which silently dropped a whole scan). Dashboard safeParse() also strips NaN on read.
- SSR ships LEAN scans (week_label, created_at, stocks, bonus only) + top-level latest trend/radar/rising/verdict. ~316KB. Scales for many weeks.

## ONE-TIME FIX WORKFLOWS (Actions, workflow_dispatch)
fix-trend, fix-radar, fix-rising-stars, fix-recommendations, fix-verdict, fix-send-email, fix-sectors, check-top5, analyze-winners. (Most auto-detect the latest week.)

## SETUP NOTES
- Supabase tables: weekly_scans, ticker_buzz, shared_chats, shared_journal (last two: RLS with allow-all policy for anon).
- Resend: sends from onboarding@resend.dev → can only deliver to the Resend account owner's email. BOSS_EMAIL must = that address (currently the user's), then forward to boss. (Verify a domain to send anywhere.)

## KNOWN GAPS / ROADMAP (not built yet)
- Portfolio Watch: "research any ticker" search box (research a candidate not yet held — boss: "I looked at VLO, check what they say").
- Portfolio progress over time (track total value week-over-week to justify scaling capital — boss: "if it works over months we'll add money").
- Validation pass: measure if high-score picks actually won (after more weeks).
- Insider buying (SEC EDGAR), buzz integration into scoring.

## RECENT FIXES (June 2026)
- NaN-broke-JSON bug (frozen Trend + missing latest week) — fixed both write & read.
- Trend cards fetch identity live (reliable even when weekly scan was rate-limited).
- TradingView embed: yellow/red candles, volume pane, MAs 20/50/150/200, pivots.
- Email redesign: dashboard CTA on top, pick hero, REAL track record.
- Markdown rendering + expand button in chat; chat history persistent & shared.
