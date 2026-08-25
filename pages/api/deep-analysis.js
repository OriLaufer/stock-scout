// THE ANALYSIS LAB — drop in any ticker, get a real research verdict.
//
// Deliberately NOT a generic "what do you think of $TICKER" wrapper. It grounds
// the model in three things it cannot invent:
//   1. Hard technicals we compute ourselves (extension, MAs, weekly path, volume)
//   2. What our own scanner already knows about the name (all four lenses)
//   3. The measured base rates from 109 of our own forward-tested picks
//
// That third one is the point. Our data says buying after a +80-150% week
// compounded to -89.5%, while +20-50% weeks compounded to +52.9%. An analysis
// that ignores WHERE IN THE MOVE a stock is, is decoration.
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 60 }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_KEY)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

let _model = null
async function pickModel(key) {
  if (process.env.CHAT_MODEL) return process.env.CHAT_MODEL
  if (_model) return _model
  try {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    })
    if (r.ok) {
      const { data } = await r.json()
      const sorted = (data || []).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      _model = (sorted.find(m => /sonnet/i.test(m.id)) || sorted[0])?.id
      if (_model) return _model
    }
  } catch {}
  return 'claude-sonnet-4-20250514'
}

// ---------- Hard technicals: where in the move is this thing? ----------
async function technicals(ticker) {
  const r = await fetch(
    'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(ticker) + '?range=1y&interval=1d',
    { headers: { 'User-Agent': UA } })
  if (!r.ok) return null
  const j = await r.json()
  const res = j.chart?.result?.[0]
  if (!res) return null
  const q = res.indicators?.quote?.[0] || {}
  const ts = res.timestamp || []
  const closes = [], vols = []
  for (let i = 0; i < ts.length; i++) {
    if (q.close?.[i] == null) continue
    closes.push(q.close[i])
    vols.push(q.volume?.[i] ?? 0)
  }
  if (closes.length < 60) return null

  const price = closes[closes.length - 1]
  const sma = n => closes.length >= n ? closes.slice(-n).reduce((a, b) => a + b, 0) / n : null
  const ma50 = sma(50), ma200 = sma(200)
  const hi52 = Math.max(...closes), lo52 = Math.min(...closes)

  // Weekly path over the last 10 weeks (5 trading days each)
  const weekly = []
  for (let i = 10; i >= 1; i--) {
    const end = closes.length - (i - 1) * 5 - 1
    const start = end - 5
    if (start < 0) continue
    weekly.push(+(((closes[end] - closes[start]) / closes[start]) * 100).toFixed(1))
  }
  const ret = n => closes.length > n
    ? +(((price - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n]) * 100).toFixed(1) : null

  const recentVol = vols.slice(-10).reduce((a, b) => a + b, 0) / 10
  const baseVol = vols.slice(-60).reduce((a, b) => a + b, 0) / 60

  const pctAbove50 = ma50 ? +(((price - ma50) / ma50) * 100).toFixed(1) : null
  const ups = weekly.filter(w => w > 0)
  const biggestWeek = weekly.length ? Math.max(...weekly) : 0

  // Extension: how stretched is it, and is the climb smooth or spike-driven?
  let stage = 'unknown', stageWhy = ''
  if (pctAbove50 != null) {
    if (pctAbove50 > 60) { stage = 'parabolic'; stageWhy = pctAbove50 + '% above its 50-day average' }
    else if (pctAbove50 > 30) { stage = 'extended'; stageWhy = pctAbove50 + '% above its 50-day average' }
    else if (pctAbove50 > 0) { stage = 'trending'; stageWhy = pctAbove50 + '% above its 50-day average, still in range' }
    else { stage = 'basing/broken'; stageWhy = 'below its 50-day average' }
  }
  const upSum = ups.reduce((a, b) => a + b, 0)
  const spikeDriven = biggestWeek >= 40 || (upSum > 0 && biggestWeek / upSum > 0.5)

  return {
    price: +price.toFixed(2),
    ma50: ma50 ? +ma50.toFixed(2) : null,
    ma200: ma200 ? +ma200.toFixed(2) : null,
    pct_above_50dma: pctAbove50,
    pct_above_200dma: ma200 ? +(((price - ma200) / ma200) * 100).toFixed(1) : null,
    high_52w: +hi52.toFixed(2), low_52w: +lo52.toFixed(2),
    pct_off_52w_high: +(((hi52 - price) / hi52) * 100).toFixed(1),
    gain_from_52w_low: +(((price - lo52) / lo52) * 100).toFixed(1),
    ret_1w: ret(5), ret_1mo: ret(21), ret_3mo: ret(63), ret_6mo: ret(126),
    weekly_path_10w: weekly,
    biggest_week_10w: biggestWeek,
    positive_weeks_10w: ups.length,
    volume_vs_normal: baseVol ? +(recentVol / baseVol).toFixed(2) : null,
    stage, stage_why: stageWhy,
    climb_is_spike_driven: spikeDriven,
  }
}

// ---------- What our own system already knows ----------
async function ourData(ticker) {
  try {
    const { data } = await supabase.from('weekly_scans').select('week_label,stocks_json')
      .order('created_at', { ascending: false }).limit(30)
    if (!data?.length) return {}
    const safe = s => JSON.parse(String(s || '{}').replace(/-?\bInfinity\b/g, 'null').replace(/\bNaN\b/g, 'null'))
    const out = { appearances: [] }
    for (const row of data) {
      try {
        const pl = safe(row.stocks_json)
        const hit = (pl.stocks || []).find(s => s.ticker === ticker)
        if (hit) out.appearances.push({ week: row.week_label, gain: hit.change_pct })
      } catch {}
    }
    const latest = safe(data[0].stocks_json)
    out.trend = (latest.trend || []).find(x => x.ticker === ticker) || null
    out.radar = (latest.radar || []).find(x => x.ticker === ticker) || null
    out.rising = (latest.rising_stars || []).find(x => x.ticker === ticker) || null
    return out
  } catch { return {} }
}

// The evidence base — measured on 109 of our own forward-tested picks.
const BASE_RATES = [
  'OUR OWN MEASURED BASE RATES (109 forward-tested picks over 25 weeks — this is',
  'evidence produced by this system, not theory. Weight it heavily):',
  '- Bought after a +20-50% week  -> 64% won, compounded +52.9%   <-- THE ONLY BUCKET THAT MADE MONEY',
  '- Bought after a +50-80% week  -> 54% won, compounded -15.8%',
  '- Bought after a +80-150% week -> 45% won, median -1.7%, compounded -89.5%',
  '- Bought after a +150%+ week   -> 17% won, median -16.4%, compounded -65.7%',
  'The lesson: chasing the biggest movers AFTER the move is what loses money. The',
  'entry point and how extended a stock is matter more than how exciting the story is.',
].join('\n')

const SYSTEM_ONE = `You are the head analyst at "Stock Scout". You write the research note that decides where real money goes. The reader has lost 33% chasing stocks after they had already exploded — be the analyst who prevents that, not the one who cheerleads.

${BASE_RATES}

You are given hard technicals we computed, what our own scanner knows, and web search. Investigate the real catalyst before you write.

Write in HEBREW, markdown, tight and scannable. Structure:

## 🏢 מה החברה עושה
Two or three sentences in plain language. What they sell, to whom.

## 🔥 למה היא זזה עכשיו
The actual catalyst — earnings, contract, approval, sector flow. USE WEB SEARCH and cite what you find. If you cannot find a real catalyst, say so plainly: a big move with no findable reason is a warning, not a mystery.

## 📍 איפה היא במהלך
The most important section. Use the technicals: distance from the 50-day average, the shape of the 10-week path, whether the climb is smooth or spike-driven, volume versus normal. State explicitly whether a buyer TODAY is early, mid-move, or late, and tie that to the base rates above.

## ⚠️ הסיכון
What actually kills this. Be concrete.

## 🎯 השורה התחתונה
Give a number from 1-10 for how attractive the SETUP is right now — not how good the company is; a great company badly extended is a bad setup. One sentence on why, and what would have to happen to make it a better entry.

Rules: never invent news or numbers. If web search found nothing, say so. Be decisive and honest — "this is late, I would not chase it here" is a valuable answer.`

const SYSTEM_COMPARE = `You are the head analyst at "Stock Scout". You are given finished research notes on several stocks. Rank them head to head for the boss.

${BASE_RATES}

Write in HEBREW, markdown. Short and sharp — this is the summary page:

## 🥇 הדירוג
A markdown table: מניה | ציון סטאפ | איפה היא במהלך | שורה אחת למה. Best setup first.

## 🎯 המסקנה
Which ONE has the best risk/reward setup right now and why it beats the others. If the honest answer is that none of them are at a good entry, say that — it is a real answer and the base rates support it.

## 🚫 ממה להיזהר
The one most likely to hurt, and why.

Judge the SETUP and the entry point, not just how good the story is. Never invent facts beyond the notes you were given.`

async function callClaude(model, system, userMsg, useWeb, maxTokens) {
  const body = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userMsg }] }
  if (useWeb) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }]
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200))
  const data = await r.json()
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
  return { text, truncated: data.stop_reason === 'max_tokens' }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!ANTHROPIC_API_KEY) return res.status(200).json({ error: true, report: '⚠️ חסר ANTHROPIC_API_KEY ב-Vercel.' })

  try {
    const model = await pickModel(ANTHROPIC_API_KEY)
    const { ticker, compare } = req.body || {}

    // ---- Comparison pass over already-analysed names ----
    if (Array.isArray(compare) && compare.length > 1) {
      const notes = compare.map(c => '### ' + c.ticker + '\n' + String(c.report || '').slice(0, 2500)).join('\n\n')
      const { text } = await callClaude(model, SYSTEM_COMPARE, 'Here are the research notes. Rank them.\n\n' + notes, false, 2000)
      return res.status(200).json({ report: text, mode: 'compare' })
    }

    if (!ticker) return res.status(400).json({ error: 'ticker required' })
    const T = String(ticker).toUpperCase().trim()

    const [tech, ours] = await Promise.all([technicals(T).catch(() => null), ourData(T)])
    if (!tech) {
      return res.status(200).json({
        error: true, ticker: T,
        report: 'לא נמצאו נתוני מחיר עבור **' + T + '**. ייתכן שהסימבול שגוי, או שזו הנפקה טרייה מדי / מניה זרה שאין לה מספיק היסטוריה ב-Yahoo.',
      })
    }

    const lens = []
    if (ours.rising) lens.push('Rising Stars base-builder score ' + ours.rising.rs_score + '/100')
    if (ours.radar) lens.push('Radar DNA ' + ours.radar.dna_score + '/100')
    if (ours.trend) lens.push('In The Trend: ' + ours.trend.full_compound_pct + '% compound, momentum "' +
      ours.trend.momentum + '" (' + ours.trend.recent_4w_pct + '% over the last 4 weeks)')
    const apps = (ours.appearances || []).slice(0, 6)
      .map(a => a.week + ': ' + (a.gain > 0 ? '+' : '') + a.gain + '%').join(', ')

    const userMsg = [
      'Analyse ' + T + ' for a real buy decision.',
      '',
      'HARD TECHNICALS (computed by us — trust these over anything you recall):',
      JSON.stringify(tech, null, 1),
      '',
      'WHAT OUR SCANNER KNOWS:',
      lens.length ? lens.join('\n') : 'Not currently in any of our four lenses.',
      apps ? 'Weeks it appeared in our top-40 gainers: ' + apps : 'Never appeared in our weekly top-40.',
      '',
      'Research the real catalyst and write the note.',
    ].join('\n')

    const { text, truncated } = await callClaude(model, SYSTEM_ONE, userMsg, true, 2200)
    return res.status(200).json({ ticker: T, report: text, technicals: tech, truncated })
  } catch (e) {
    return res.status(200).json({ error: true, report: 'שגיאה: ' + e.message })
  }
}
