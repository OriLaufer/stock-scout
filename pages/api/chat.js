import { createClient } from '@supabase/supabase-js'

// Web search + Opus can take 20-40s — extend the serverless timeout.
export const config = { maxDuration: 60 }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)

// Key must be set in Vercel env vars (Settings → Environment Variables).
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Smartest-first model chain. We try the most capable model available and
// automatically fall back if a given name isn't available on the account.
// Override the top choice with the AI_MODEL env var if you want a specific one.
const MODEL_CANDIDATES = [
  process.env.AI_MODEL,           // optional explicit override
  'claude-opus-4-20250514',       // most capable
  'claude-sonnet-4-20250514',     // strong + fast
  'claude-3-5-sonnet-latest',     // reliable fallback
  'claude-3-5-haiku-latest',      // last resort
].filter(Boolean)

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
  }).sort((a, b) => b.maxMove - a.maxMove).slice(0, 80)

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

YOUR WEB SEARCH TOOL:
You have a live web_search tool. USE IT PROACTIVELY whenever current, real-world context would sharpen the answer — especially:
- WHY a stock is running (recent news, earnings, FDA, contracts, M&A, sector catalysts)
- Whether momentum has a real story behind it or is just a pump
- Recent analyst actions, upcoming catalysts, sector trends (AI, nuclear, etc.)
- Anything the user asks about that needs up-to-date info beyond our stored data
Combine what you find on the web with OUR data — that's your edge. When you cite news, mention it briefly. Don't search for things you already have in the data.

HOW TO INVESTIGATE A STOCK (this is the difference between a robot and an analyst):
Do NOT just report counts like "appeared 6 times." INVESTIGATE.
- Look at the stock's FULL HISTORY timeline and find its NOTABLE MOVES — e.g. a single +60% week on a specific date.
- For each notable move, WEB-SEARCH what actually happened that week: the catalyst, the news, the event. Pinpoint it using the week's date range.
- Then reason like an investor deciding where to put real money:
  * What drove the move? Is it a durable catalyst (new product, contract, secular demand) or a one-off (short squeeze, meme, dilution pop)?
  * Is the story still alive, or already priced in?
  * What's the setup RIGHT NOW — entry, risk, what would confirm the thesis, what would kill it?
- A one-time +60% with a real, ongoing catalyst can be a BETTER opportunity than 6 quiet appearances. Judge the STORY, not just the frequency.
- Your job is to help decide on an actual investment — give a clear thesis, conviction level, and what to watch. Think hard. Be the analyst, not the spreadsheet.

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
- You are a decision-support brain, not a fortune teller. Be honest about uncertainty — but always be decisive and genuinely useful. The boss is paying for sharp judgment, not hedging.`

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

    const { text: contextText } = await buildContext()

    // Append journal context if the user has open trades
    let journalText = ''
    if (Array.isArray(journal) && journal.length > 0) {
      journalText = `\n\n=== THE USER'S OPEN TRADES (their trading journal) ===\n` +
        journal.map(t => `${t.ticker}: ${t.quantity} shares @ $${t.entry_price} (entered ${t.entry_date})`).join('\n')
    }

    const system = `${SYSTEM_PROMPT}\n\n--- CURRENT DATA ---\n${contextText}${journalText}`

    // Keep last 12 turns to bound token usage
    const trimmed = messages.slice(-12).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    }))

    // Try models smartest-first; fall through only when a model name is unavailable.
    let lastErr = ''
    for (let i = 0; i < MODEL_CANDIDATES.length; i++) {
      const model = MODEL_CANDIDATES[i]
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 3500,   // room for thorough, structured analysis
          system,
          messages: trimmed,
          // Native web search — Claude pulls current news/catalysts on demand.
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
        }),
      })

      if (r.ok) {
        const data = await r.json()
        // Collect all text blocks (final answer). Web-search runs produce
        // intermediate tool blocks too — we keep only the text.
        const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text)
        const reply = textBlocks.join('\n').trim()
        // Did it actually search? (for transparency in the UI)
        const searched = (data.content || []).some(b => b.type === 'server_tool_use' || b.type === 'web_search_tool_result')
        return res.status(200).json({ reply: reply || '(no response)', model, searched })
      }

      const errText = await r.text()
      lastErr = `HTTP ${r.status}: ${errText.slice(0, 200)}`
      console.error(`Anthropic error (${model}):`, lastErr)
      // Only fall through if this model name is the problem; otherwise stop.
      const isModelIssue = r.status === 404 || /model|tool|web_search/i.test(errText)
      const hasNext = i < MODEL_CANDIDATES.length - 1
      if (!(isModelIssue && hasNext)) {
        return res.status(200).json({
          reply: `שגיאה מה-AI. בדוק שהמפתח תקין ב-Vercel. פרטים: ${lastErr}`,
          error: true,
        })
      }
    }
    return res.status(200).json({ reply: `שגיאה: לא נמצא מודל זמין. ${lastErr}`, error: true })
  } catch (e) {
    console.error('chat handler error:', e)
    return res.status(200).json({ reply: `שגיאה: ${e.message}`, error: true })
  }
}
