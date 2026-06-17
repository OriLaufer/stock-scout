// Deep research on a position we OWN: news, analyst views, web buzz — then a
// clear call: HOLD as-is, or ADD MORE (scale up the winner). Reframed per the
// boss: the "rotate to a winning horse" intent = add money to confirmed winners.
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 60 }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

let _model = null
async function pickModel(apiKey) {
  if (process.env.CHAT_MODEL) return process.env.CHAT_MODEL
  if (_model) return _model
  try {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    })
    if (r.ok) {
      const { data } = await r.json()
      const sorted = (data || []).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      const sonnet = sorted.find(m => /sonnet/i.test(m.id))   // fast enough for 60s
      const opus = sorted.find(m => /opus/i.test(m.id))
      _model = (sonnet || opus || sorted[0])?.id
      if (_model) return _model
    }
  } catch {}
  return 'claude-sonnet-4-20250514'
}

// Find what OUR system thinks of this ticker (trend/radar/rising_stars/scan)
async function ourTake(ticker) {
  try {
    const { data } = await supabase.from('weekly_scans').select('stocks_json').order('created_at', { ascending: false }).limit(1)
    if (!data?.length) return ''
    const p = JSON.parse(data[0].stocks_json)
    const bits = []
    const r = (p.radar || []).find(x => x.ticker === ticker)
    if (r) bits.push(`Our Radar DNA score ${r.dna_score}/100, 6mo RS ${r.rs_6mo}%, revenue growth ${r.revenue_growth_pct ?? 'N/A'}`)
    const rs = (p.rising_stars || []).find(x => x.ticker === ticker)
    if (rs) bits.push(`Rising Star base-builder score ${rs.rs_score}/100, ${rs.ret_6mo}% 6mo`)
    const tr = (p.trend || []).find(x => x.ticker === ticker)
    if (tr) bits.push(`In The Trend: ${tr.full_compound_pct}% compound over ${tr.total_weeks} weeks`)
    return bits.join('. ')
  } catch { return '' }
}

const SYSTEM = `You are a portfolio research analyst for "Stock Scout". The user OWNS this position. Your job: research the real world and tell them what's going on and what to do.

THE BOSS'S PHILOSOPHY: he ADDS money to winners that keep proving themselves (news, analysts, and online buzz confirming strength). He is NOT looking to sell quickly — he wants to know whether to keep holding, and especially whether a winner is strong enough to ADD MORE and run it for months. He also wants to be sure he's not sitting on a fading pump.

USE WEB SEARCH heavily to find, for THIS stock:
- 📰 Recent news / catalysts (earnings, contracts, products, sector moves)
- 🎯 Analyst views — ratings, price targets, recent upgrades/downgrades
- 💬 Online buzz / sentiment — what people say on Reddit, StockTwits, forums, blogs; is there hype building?

Be efficient: at most 2 web searches, then write. Keep it tight and scannable.
Write a research note in HEBREW, markdown, with these sections (a few bullet points each, not long paragraphs):
## 📰 חדשות אחרונות
## 🎯 אנליסטים
## 💬 באז ברשת
## 🧠 שורה תחתונה
In the bottom line: given their entry price and current P&L, is the story still strong and confirmed? Give a clear call — **להחזיק** (hold and keep running), **להוסיף** (winner is confirmed by news/analysts/buzz — worth adding more), or **להיזהר** (momentum/story weakening — watch closely). Explain WHY briefly, cite what you found, and say what to watch next. Be decisive and honest — never invent news; if you couldn't find something, say so.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!ANTHROPIC_API_KEY) return res.status(200).json({ report: '⚠️ צריך להוסיף ANTHROPIC_API_KEY ב-Vercel.', error: true })

  try {
    const { ticker, name, entry_price, quantity, current_price, pnl_pct, entry_date } = req.body || {}
    if (!ticker) return res.status(400).json({ error: 'ticker required' })

    const take = await ourTake(ticker.toUpperCase())
    const posLine = `Position: ${quantity || '?'} shares of ${ticker} (${name || ''}), bought at $${entry_price} on ${entry_date || '?'}.` +
      (current_price ? ` Current price $${current_price}.` : '') +
      (pnl_pct != null ? ` Current P&L: ${pnl_pct >= 0 ? '+' : ''}${pnl_pct}%.` : '')
    const userMsg = `${posLine}\n${take ? 'Our system: ' + take + '\n' : ''}\nResearch this stock (news, analysts, online buzz) and give the note + clear call (hold / add / be careful).`

    const model = await pickModel(ANTHROPIC_API_KEY)
    const body = {
      model, max_tokens: 1500, system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
      // Cap at 2 searches — must finish within Vercel's 60s function limit.
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
    }
    let r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const err = await r.text()
      // retry without tools if the tool is the problem
      if (/tool|web_search/i.test(err)) {
        r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, tools: undefined }),
        })
      }
      if (!r.ok) {
        const e2 = await r.text()
        return res.status(200).json({ report: `שגיאה: ${r.status} ${e2.slice(0, 140)}`, error: true })
      }
    }
    const data = await r.json()
    const report = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim()
    const searched = (data.content || []).some(b => b.type === 'server_tool_use' || b.type === 'web_search_tool_result')
    return res.status(200).json({ report: report || '(no response)', searched })
  } catch (e) {
    return res.status(200).json({ report: `שגיאה: ${e.message}`, error: true })
  }
}
