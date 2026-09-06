# Stock Scout — where the system stands

Live: https://stock-scout-phi.vercel.app · Repo: OriLaufer/stock-scout
Next.js dashboard (Vercel) · Python scanner (GitHub Actions, Sundays) · Supabase · Resend · yfinance.

## THE GOAL
Own the stocks that multiply over a year, entered EARLY — and stop losing money on
the ones that already ran. Everything below exists to serve that one sentence.

## THE FINDING THAT REBUILT THE SYSTEM
Across 109 of our own picks, forward-tested against real prices, bucketed by how
big the week was that we bought AFTER:

| bought after a week of | won | compounded |
|---|---|---|
| +20–50% | 64% | **+52.9%** |
| +50–80% | 54% | −15.8% |
| +80–150% | 45% | **−89.5%** |
| +150%+ | 17% | **−65.7%** |

The old system ranked by biggest weekly gain, which put the worst entries at the
top of the list. A 54% win rate still produced a −33% portfolio because there
were no stops and every entry was made at maximum extension.

Re-measured at longer horizons, the biggest single winner (+633%) DID come from
the most extended bucket — so the filter costs us some monsters. But that bucket's
median at 13 weeks is −21.4%. The 0–20%-above-the-50-day bucket compounded +114.8%
with a positive median. **The extension test governs the ENTRY, not the holding:
you buy at 10% above the 50-day average and hold while it becomes 80% above.**

## WHERE TO LOOK — in order of usefulness

| tab | the question it answers |
|---|---|
| ⭐ **Shortlist** | **Which 2–3 names, and why.** Everything converges here. The default view. |
| 🎯 Entry Zone | The full buy list (15) — confirmed uptrend, not yet extended, each with stop and targets |
| 🧭 Themes | WHY things are moving — industries leading together, and whether the theme is accelerating or fading |
| 🔬 Analysis Lab | Paste any ticker → research note + head-to-head. Needs API credits |
| 📈 The Trend | What already compounded, with a live "is it still running" status |
| ⭐ Rising Stars | Full-market relative strength — quiet base-builders |
| 🎯 Radar | Forward-looking DNA score |
| 📊 Weekly | Top-40 gainers. **Kept for reference — our data says this is the losing lens** |
| 🏆 Hall of Fame · 📓 Journal · 🔭 Portfolio Watch | History, manual trades with live P&L, holdings research |

## HOW A DECISION GETS MADE
1. **Themes** — is there a real need moving a whole industry, and is it early?
2. **Shortlist** — which names carry that theme AND sit at a good entry
3. **Risk framework** (on every candidate) — stop at the tighter of 2×ATR or 3%
   under the 50-day average but never inside one ATR; targets at 2R and 4R; the
   50-day average is where the thesis is void; position size follows the stop distance
4. **`/scout TICKER`** — deep research on the finalist, run in the Claude Code session
5. **`report.py`** — the PDF that goes to the boss

## CONVICTION SCORE (the Shortlist)
entry quality 30 · market leadership 25 · theme behind it 20 · quality of climb 15
· cross-lens confirmation 10, then adjusted for revenue growth, analyst upside and
short interest. Weights come from the table above, not from what sounds impressive.
Every pick states its case AND what should worry you.

## NEED CHAINS
Above the industry themes sits a small static map of industry → need (AI compute,
AI power, biotech, digital health, software, fintech, defense, commodities). SanDisk
ran on an AI memory shortage, but that same need lifted utilities, turbines,
transformers, cooling and uranium — different industries, one need, which industry
grouping alone can never connect. A need registers only when several of its
industries move together.

## THE TOOLS OUTSIDE THE DASHBOARD
- **`/scout`** — `C:\Users\orila\.claude\skills\scout\`. Runs the analysis inside the
  Claude Code session, so it costs no API credits.
  - `/scout` → system state · `/scout GEO CXW` → per-ticker research · `/scout --portfolio` → holdings
  - `brief.py` gathers the facts; `report.py` builds the boss's PDF
  - Use the real python: `C:\Users\orila\AppData\Local\Programs\Python\Python312\python.exe`

## WHAT RUNS BY ITSELF
- **Sunday 06:00 UTC** — full scan, self-verification, two emails
- **Daily 05:17 UTC** — keep-alive: pings Supabase so the free project never pauses
  again, checks for stale data, emails the moment anything breaks
- Any failure reaches you by email the same day

## KNOWN LIMITS — stated plainly
- The 0–20% bucket rests on 9 observations and 20–45% on 18. Enough to show a
  direction, not enough to prove one. The numbers will sharpen as weeks accumulate.
- The extension filter will miss some of the biggest winners. That is a real cost,
  accepted deliberately in exchange for a portfolio that compounds up rather than down.
- **The Anthropic API balance is empty.** Chat, the weekly Verdict, Portfolio research
  and the Analysis Lab need credits (console.anthropic.com → Plans & Billing). The
  Shortlist, Entry Zone, Themes and `/scout` do not.
- Themes rest on yfinance industry labels, which are occasionally wrong for a
  small or foreign company.

## STILL OPEN
- A position-size ceiling: the maths gives 9–14% of a portfolio at 1% risk, which is
  concentrated. That is a decision for you and the boss, separate from the calculation.
- Tracking whether the Shortlist actually wins — the honest verdict needs a few
  months of forward data, measured the same way as the table at the top.
