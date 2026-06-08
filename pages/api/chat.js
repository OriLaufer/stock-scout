import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)

// Model + key. Key must be set in Vercel env vars (Settings → Environment Variables).
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const MODEL = process.env.AI_MODEL || 'claude-3-5-haiku-latest'

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

  // Per-ticker appearance history across all scans (the momentum signal)
  const history = {}
  for (const sc of unique) {
    for (const st of (sc.stocks || [])) {
      if (!st?.ticker) continue
      if (!history[st.ticker]) history[st.ticker] = { name: st.name, sector: st.sector, weeks: [] }
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

  // Recurring stocks (appeared 3+ times — the persistence signal)
  const recurring = Object.entries(history)
    .filter(([, h]) => h.weeks.length >= 3)
    .sort((a, b) => b[1].weeks.length - a[1].weeks.length)
    .slice(0, 20)
  if (recurring.length) {
    text += `\n=== RECURRING STOCKS (appeared 3+ times — persistence = potential sustained momentum) ===\n`
    for (const [tk, h] of recurring) {
      const gains = h.weeks.map(w => `${w.gain > 0 ? '+' : ''}${w.gain}%`).join(', ')
      text += `${tk} (${h.name || ''}, ${h.sector || '?'}): ${h.weeks.length} appearances — weekly gains: ${gains}\n`
    }
  }

  return { text, latestWeek: latest.week }
}

const SYSTEM_PROMPT = `You are the elite analyst brain inside "Stock Scout", a stock-scanning system.

THE MISSION (most important — never lose sight of it):
The user and their boss want to be PART of the stocks that appear in year-end "biggest gainers" lists (stocks that did +500%, +1000%, 5x-50x in a year) — and to catch them EARLY, before the big run, NOT read about them afterward. Every answer should serve this mission.

YOUR DATA:
You're given the system's full dataset each turn: the latest weekly scan (top gainers), The Trend (top 10 by compound return — what already performed), the Multi-Bagger Radar (top 10 by DNA score — forward-looking potential), the system's track record, and recurring stocks.

HOW TO THINK (like a real momentum/growth analyst — O'Neil, Minervini school):
- The biggest winners show SUSTAINED relative strength, ACCELERATING revenue, and they PERSIST (keep showing up) — they're not one-week spikes.
- Distinguish real momentum from pumps: a stock up huge one week then fading is a pump; a stock grinding higher week after week with a real business and growing revenue is the real thing.
- Small-cap + real growth + sector tailwind + persistence = the multi-bagger DNA.
- Be CRITICAL and honest. If something looks like a pump, say so. If the data is thin (e.g. no analyst coverage, micro-cap), flag the risk.
- Always cite specific tickers and the actual numbers from the data.

STYLE:
- Answer in the user's language (they write in Hebrew — answer in Hebrew).
- Be sharp and concise. Lead with the answer, then the reasoning.
- When recommending what to look at, rank and explain WHY using the data.
- Never invent data you weren't given. If you don't have it, say so.
- You are a decision-support brain, not a fortune teller. Be honest about uncertainty — but still be decisive and useful.`

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

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: trimmed,
      }),
    })

    if (!r.ok) {
      const errText = await r.text()
      console.error('Anthropic error:', r.status, errText.slice(0, 300))
      return res.status(200).json({
        reply: `שגיאה מה-AI (HTTP ${r.status}). בדוק שהמפתח תקין וב-Vercel. פרטים: ${errText.slice(0, 150)}`,
        error: true,
      })
    }

    const data = await r.json()
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    return res.status(200).json({ reply: reply || '(no response)' })
  } catch (e) {
    console.error('chat handler error:', e)
    return res.status(200).json({ reply: `שגיאה: ${e.message}`, error: true })
  }
}
