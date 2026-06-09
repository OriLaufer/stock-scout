import { createClient } from '@supabase/supabase-js'

// Web search + Opus can take 20-40s — extend the serverless timeout.
export const config = { maxDuration: 60 }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)

// Key must be set in Vercel env vars (Settings → Environment Variables).
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Discover available models from the account (names change over time).
// For the INTERACTIVE chat we prefer the newest SONNET — it's far faster than
// Opus and must answer within Vercel's 60s function limit. (The weekly Verdict,
// which runs in GitHub Actions with no timeout, uses Opus for max depth.)
let _cachedModels = null
async function listModels(apiKey) {
  if (_cachedModels) return _cachedModels
  try {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    })
    if (r.ok) {
      const { data } = await r.json()
      _cachedModels = (data || []).slice().sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      )
      return _cachedModels
    }
  } catch {}
  _cachedModels = []
  return _cachedModels
}
async function pickChatModel(apiKey) {
  if (process.env.CHAT_MODEL) return process.env.CHAT_MODEL
  if (process.env.AI_MODEL) return process.env.AI_MODEL
  const models = await listModels(apiKey)
  const sonnet = models.find(m => /sonnet/i.test(m.id))
  const opus   = models.find(m => /opus/i.test(m.id))
  return (sonnet || opus || models[0])?.id || 'claude-sonnet-4-20250514'
}

function parseWeekEnd(label) {
  const m = (label || '').match(/(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return new Date(0)
  return new Date(`${m[3]}-${m[2]}-${m[1]}`)
}

// Build a compact, information-dense context from everything we have.
async function buildContext() {
  const { data: scans } = await supabase
    .from('weekly_scans')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(60)

  if (!scans || scans.length === 0) return { text: 'No scan data available.', latestWeek: null }

  const parsed = scans.map(s => {
    try {
      const p = JSON.parse(s.stocks_json)
      return {
        week: s.week_label,
        stocks: p.stocks || p,
        trend: p.trend || null,
        radar: p.radar || null,
        rising_stars: p.rising_stars || null,
        backtest: p.backtest || null,
      }
    } catch { return null }
  }).filter(Boolean)

  // Dedup by week, sort newest first
  const seen = new Set()
  const unique = []
  for (const sc of parsed) {
    if (!seen.has(sc.week)) { seen.add(sc.week); unique.push(sc) }
  }
  unique.sort((a, b) => parseWeekEnd(b.week) - parseWeekEnd(a.week))

  const latest = unique[0]
  const trend = unique.find(u => u.trend)?.trend || null
  const radar = unique.find(u => u.radar)?.radar || null
  const risingStars = unique.find(u => u.rising_stars)?.rising_stars || null

  // Per-ticker FULL history across all scans — every week it appeared, with the
  // exact date and the move. This is the raw material the analyst investigates:
  // it can pinpoint a single +60% week and search the web for what drove it.
  const history = {}
  for (const sc of unique) {
    for (const st of (sc.stocks || [])) {
      if (!st?.ticker) continue
      if (!history[st.ticker]) {
        history[st.ticker] = {
          name: st.name, sector: st.sector,
          market_cap: st.market_cap, weeks: [],
        }
      }
      history[st.ticker].weeks.push({ week: sc.week, gain: st.change_pct })
    }
  }

  let text = `You have access to Stock Scout's full dataset. Today's data:\n\n`

  // Latest weekly scan (top 40)
  text += `=== LATEST WEEKLY SCAN (${latest.week}) — top gainers this week ===\n`
  for (const st of (latest.stocks || []).slice(0, 40)) {
    const sig = st.rec_signals || {}
    text += `${st.ticker} (${st.name || ''}) | +${st.change_pct}% wk | ` +
      `mcap ${st.market_cap ? '$' + (st.market_cap / 1e9).toFixed(2) + 'B' : '?'} | ` +
      `sector ${st.sector || '?'}` +
      (sig.float_m != null ? ` | float ${sig.float_m}M` : '') +
      (st.rec_category ? ` | pick:${st.rec_category}` : '') +
      `\n`
  }

  // The Trend (compound winners)
  if (trend) {
    text += `\n=== THE TREND — top 10 by compound return (backward-looking, what already performed) ===\n`
    for (const t of trend) {
      text += `${t.ticker} (${t.name || ''}) | full compound ${t.full_compound_pct}% | ` +
        `${t.scan_appearances}/${t.total_weeks} weeks in scans | sector ${t.identity?.sector || '?'}` +
        (t.identity?.target_mean ? ` | analyst target $${t.identity.target_mean} (${t.identity.target_upside_pct >= 0 ? '+' : ''}${t.identity.target_upside_pct}%)` : ' | no analyst coverage') +
        (t.identity?.market_cap ? ` | mcap $${(t.identity.market_cap / 1e9).toFixed(2)}B` : '') +
        `\n`
    }
  }

  // The Radar (DNA score — forward-looking)
  if (radar) {
    text += `\n=== MULTI-BAGGER RADAR — top 10 by DNA score (forward-looking, who has early big-winner traits) ===\n`
    for (const r of radar) {
      const b = r.dna_breakdown || {}
      text += `${r.ticker} (${r.name || ''}) | DNA ${r.dna_score}/100 | ` +
        `6mo return ${r.ret_6mo}% (RS vs market ${r.rs_6mo >= 0 ? '+' : ''}${r.rs_6mo}%) | ` +
        `revenue growth ${r.revenue_growth_pct != null ? r.revenue_growth_pct + '% YoY' : 'N/A'} | ` +
        `${r.appearances} scan appearances | mcap ${r.market_cap ? '$' + (r.market_cap / 1e9).toFixed(2) + 'B' : '?'} | sector ${r.sector || '?'} | ` +
        `[RS ${b.relative_strength}/35, rev ${b.revenue_growth}/20, persist ${b.persistence}/15, accel ${b.acceleration}/15, room ${b.smallcap_room}/10, sector ${b.sector_heat}/5]\n`
    }
  }

  // Rising Stars (quiet base-builders — full-market relative strength)
  if (risingStars) {
    text += `\n=== RISING STARS — quiet base-builders (full-market 6mo relative-strength scan, NOT just weekly gainers) ===\n`
    text += `These climbed steadily for months and beat the market — the early-SanDisk pattern. May not appear in the weekly scan at all.\n`
    for (const s of risingStars) {
      text += `${s.ticker} (${s.name || ''}) | base-builder score ${s.rs_score}/100 | ` +
        `6mo ${s.ret_6mo}% / 3mo ${s.ret_3mo}% / 1mo ${s.ret_1mo}% | ` +
        `${s.positive_weeks_pct}% positive weeks | ` +
        `${s.above_50dma ? 'above' : 'below'} 50dma, ${s.above_200dma ? 'above' : 'below'} 200dma | ` +
        `mcap ${s.market_cap ? '$' + (s.market_cap / 1e9).toFixed(2) + 'B' : '?'} | sector ${s.sector || '?'} | ` +
        `this week ${s.this_week_pct >= 0 ? '+' : ''}${s.this_week_pct}%\n`
    }
  }

  // Backtest summary
  const bts = unique.filter(u => u.backtest).map(u => u.backtest)
  if (bts.length) {
    const wins = bts.reduce((a, b) => a + (b.wins || 0), 0)
    const total = bts.reduce((a, b) => a + (b.total || 0), 0)
    text += `\n=== SYSTEM TRACK RECORD ===\n` +
      `Across ${bts.length} evaluated weeks, the top-5 picks rose the following week ${wins}/${total} times (${total ? Math.round(wins / total * 100) : 0}%).\n`
  }

  // FULL stock history — EVERY stock that appeared, with its complete
  // week-by-week timeline (date + move). Sorted by biggest single-week move
  // first so the most investigable jumps are at the top. This lets the analyst
  // pick ANY notable move (even a one-time +60%) and web-search what caused it.
  const allTickers = Object.entries(history).map(([tk, h]) => {
    const maxMove = Math.max(...h.weeks.map(w => Math.abs(w.gain || 0)))
    return { tk, h, maxMove }
  }).sort((a, b) => b.maxMove - a.maxMove).slice(0, 40)

  if (allTickers.length) {
    text += `\n=== FULL STOCK HISTORY (every stock we've caught, full week-by-week timeline) ===\n`
    text += `Format: TICKER (name, sector, mcap): week-range → move | week-range → move ...\n`
    text += `Use this to investigate specific moves. A big one-time move on a date is a lead — search what happened that week.\n`
    for (const { tk, h } of allTickers) {
      const mc = h.market_cap ? '$' + (h.market_cap / 1e9).toFixed(2) + 'B' : '?'
      const timeline = h.weeks
        .slice()
        .sort((a, b) => parseWeekEnd(a.week) - parseWeekEnd(b.week))
        .map(w => `${w.week} → ${w.gain > 0 ? '+' : ''}${w.gain}%`)
        .join(' | ')
      text += `${tk} (${h.name || ''}, ${h.sector || '?'}, ${mc}): ${timeline}\n`
    }
  }

  return { text, latestWeek: latest.week }
}

const SYSTEM_PROMPT = `You are the elite analyst brain inside "Stock Scout", a stock-scanning system.

THE MISSION (most important — never lose sight of it):
The user and their boss want to be PART of the stocks that appear in year-end "biggest gainers" lists (stocks that did +500%, +1000%, 5x-50x in a year) — and to catch them EARLY, before the big run, NOT read about them afterward. Every answer should serve this mission.

YOUR DATA:
You're given the system's full dataset each turn: the latest weekly scan (top gainers), The Trend (top 10 by compound return — what already performed), the Multi-Bagger Radar (top 10 by DNA score — forward-looking potential), the system's track record, and recurring stocks.

HOW TO INVESTIGATE A STOCK (this is the difference between a robot and an analyst):
Do NOT just report counts like "appeared 6 times." INVESTIGATE the data.
- Look at the stock's FULL HISTORY timeline and find its NOTABLE MOVES — e.g. a single +60% week on a specific date.
- Reason like an investor deciding where to put real money:
  * Was the move a steady build (many positive weeks, rising) or a single spike (one week dominates)? Steady = real; one-week spike = likely pump.
  * Sustained relative strength + revenue growth + persistence = the multi-bagger DNA.
  * Is it small enough to still multiply? What's the setup — and what would kill the thesis?
- A steady builder can be a BETTER opportunity than a one-week spike. Judge the STORY in the data, not just the frequency.
- Give a clear thesis, conviction level, and what to watch. Be the analyst, not the spreadsheet.

HOW TO THINK (like a real momentum/growth analyst — O'Neil, Minervini school):
- The biggest winners show SUSTAINED relative strength, ACCELERATING revenue, and they PERSIST (keep showing up) — they're not one-week spikes.
- Distinguish real momentum from pumps: a stock up huge one week then fading is a pump; a stock grinding higher week after week with a real business and growing revenue is the real thing.
- Small-cap + real growth + sector tailwind + persistence = the multi-bagger DNA.
- Be CRITICAL and honest. If something looks like a pump, say so. If the data is thin (e.g. no analyst coverage, micro-cap), flag the risk.
- Always cite specific tickers and the actual numbers from the data.

HOW TO ANSWER (be the sharpest analyst they've ever worked with):
- Answer in the user's language (they write in Hebrew — answer in Hebrew, fluent and professional).
- Lead with a clear bottom-line answer, THEN the reasoning. Don't bury the conclusion.
- When ranking opportunities, give each a clear verdict and a CONVICTION LEVEL (high/medium/low) with the data behind it.
- Structure longer answers with short headers or numbered points so they're scannable.
- Always ground claims in the actual numbers from the data (RS %, revenue growth, DNA score, appearances, weekly gains). Quote them.
- Proactively connect dots across the datasets: e.g. "X is #1 on the Radar AND appeared 6 weeks running AND its sector has 3 peers in our scans — that's a strong confluence."
- Think in terms of the mission: which of these could be the +1000% story, and what would confirm or kill that thesis next.
- Flag risks honestly: thin float, no analyst coverage, single-week spike, overextension, fading volume.
- Never invent data you weren't given. If you don't have it, say so and say what you'd want to check.
- You are a decision-support brain, not a fortune teller. Be honest about uncertainty — but always be decisive and genuinely useful. The boss is paying for sharp judgment, not hedging.

DEPTH — explain like a top Wall Street analyst (this is what makes you valuable):
When you name a stock, don't just cite its scores. EXPLAIN it:
- 🏢 WHAT THE COMPANY DOES — its actual business, products, who its customers are, in plain language.
- 🔥 WHY IT'S HOT NOW — the secular trend / theme driving demand (AI compute, power/energy, memory, GLP-1, nuclear, etc.) and why that matters today.
- 🚀 THE FUTURE — why demand could keep growing, the bull case, and what would make it a multi-bagger.
- Use your own knowledge of the company and its sector to give this depth. (You don't have live news this turn, so DON'T state specific recent events/contracts as fact — frame the business and the secular trend, and note when something would need a news check.)

FORMAT — make it a pleasure to read (engaging, professional, scannable):
- Use ## headers, **bold** for key terms and tickers, bullet lists, and tables when comparing.
- Use tasteful emoji as visual anchors (🏢 business, 🔥 catalyst, 🚀 upside, ⚠️ risk, 📊 data, 🎯 verdict) — not excessively.
- Open with a one-line bottom line, then go deep. End with a clear verdict + conviction.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  if (!ANTHROPIC_API_KEY) {
    return res.status(200).json({
      reply: '⚠️ העוזר עדיין לא מחובר. צריך להוסיף מפתח API של Anthropic ב-Vercel:\n\n' +
        '1. היכנס ל-vercel.com → הפרויקט → Settings → Environment Variables\n' +
        '2. הוסף משתנה בשם ANTHROPIC_API_KEY עם המפתח מ-console.anthropic.com\n' +
        '3. Redeploy\n\nאחרי זה אני אהיה כאן ומוכן לעבוד.',
      needsSetup: true,
    })
  }

  try {
    const { messages, journal } = req.body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages required' })
    }

    const wantWeb = req.body?.useWeb === true

    const { text: contextText } = await buildContext()

    // Append journal context if the user has open trades
    let journalText = ''
    if (Array.isArray(journal) && journal.length > 0) {
      journalText = `\n\n=== THE USER'S OPEN TRADES (their trading journal) ===\n` +
        journal.map(t => `${t.ticker}: ${t.quantity} shares @ $${t.entry_price} (entered ${t.entry_date})`).join('\n')
    }

    // Critical: tell the model exactly what it can/can't do, so it never
    // fabricates news or fake tool calls when web search is off.
    const webBlock = wantWeb
      ? `\nYOU HAVE A LIVE web_search TOOL. Use it to verify WHY a stock is moving (news, earnings, contracts, catalysts) and cite what you find. Combine it with our data.`
      : `\nYOU HAVE NO INTERNET ACCESS THIS TURN. Answer ONLY from the data provided below. NEVER fabricate news, prices, catalysts, or tool calls — do not output <tool_call> or invented "search results". If a question truly needs current news you don't have, say so honestly and reason from the data patterns instead (steady build vs spike, relative strength, revenue growth, persistence).`

    const system = `${SYSTEM_PROMPT}${webBlock}\n\n--- CURRENT DATA ---\n${contextText}${journalText}`

    // Keep last 12 turns to bound token usage
    const trimmed = messages.slice(-12).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    }))

    const model = await pickChatModel(ANTHROPIC_API_KEY)

    async function callModel(withTools) {
      return fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2200,
          system,
          messages: trimmed,
          // Cap searches to 3 so the answer fits Vercel's 60s function limit.
          ...(withTools ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] } : {}),
        }),
      })
    }

    // Web search is OFF by default (wantWeb computed above) — the agentic
    // search loop is too slow for Vercel's 60s limit. The chat answers fast
    // from our rich context; opt in with useWeb:true for the rare news ask.
    let r = await callModel(wantWeb)
    if (!r.ok && wantWeb) {
      const errText = await r.text()
      if (/tool|web_search/i.test(errText)) r = await callModel(false)
    }
    if (!r.ok) {
      const errText = await r.text()
      console.error(`Anthropic error (${model}):`, r.status, errText.slice(0, 200))
      return res.status(200).json({
        reply: `שגיאה מה-AI (${model}). פרטים: HTTP ${r.status}: ${errText.slice(0, 160)}`,
        error: true,
      })
    }

    if (r.ok) {
      const data = await r.json()
      const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
      const searched = (data.content || []).some(b => b.type === 'server_tool_use' || b.type === 'web_search_tool_result')
      return res.status(200).json({ reply: reply || '(no response)', model, searched })
    }

    const finalErr = await r.text()
    return res.status(200).json({ reply: `שגיאה מה-AI: HTTP ${r.status}: ${finalErr.slice(0, 160)}`, error: true })
  } catch (e) {
    console.error('chat handler error:', e)
    return res.status(200).json({ reply: `שגיאה: ${e.message}`, error: true })
  }
}
