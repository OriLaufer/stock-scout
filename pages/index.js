import { createClient } from '@supabase/supabase-js'
import { useState, useEffect, useRef, Fragment } from 'react'
import fs from 'fs'
import path from 'path'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)

const T = {
  he: {
    title: 'Stock Scout',
    subtitle: 'סורק מניות שבועי',
    minCap: 'מרקט קאפ מינימום',
    million: 'מיליון',
    runScan: '▶ הפעל סריקה',
    running: 'סורק...',
    // The old text said "refresh in 2 minutes" — the scan takes 15-20. People
    // refreshed, saw nothing, and concluded the button was broken.
    scanMsg: '✅ הסריקה הופעלה ורצה ברקע (15-20 דקות). יישלח מייל כשתסתיים — אין צורך להשאיר את הדף פתוח.',
    returning: 'תכופות',
    threeWeeks: 'מדי פעם',
    fourPlus: 'חדשות',
    stocks: 'מניות',
    noData: 'אין נתונים. לחץ על "הפעל סריקה".',
    bonus: '🔥 התראות באז — מניות מהטופ עם באז יוצא דופן',
    buzzAlert: '🔥 באז גבוה',
    details: 'פרטים',
    close: 'סגור',
    thisWeek: 'השבוע',
    firstApp: 'הופעה ראשונה',
    notInList: 'לא הופיעה',
    appHistory: 'היסטוריית הופעות',
    buzzTitle: 'באז',
    sentimentTitle: 'סנטימנט המסחר',
    bullish: 'חיובי',
    bearish: 'שלילי',
    neutral: 'נייטרלי',
    redditSentiment: 'Reddit (לפי ניתוח טקסט)',
    stocktwitsSentiment: 'StockTwits (סימון משתמשים)',
    topTopics: '🏷️ נושאים מובילים',
    whatSaying: '💬 מה אומרים מאחורי הקלעים',
    upvotes: 'לייקים',
    mktCap: 'מרקט קאפ',
    price: 'מחיר',
    volume: 'נפח שבועי',
    buzzScore: 'ציון באז',
    streak: 'שבועות ברצף',
    new: 'חדשה',
    weeks: 'שבועות',
    appearances: 'הופעות',
    frequent: 'תכופות',
    occasional: 'מדי פעם',
    rare: 'נדירות',
    rank: '#',
    stock: 'מנייה',
    gain: 'עלייה',
    buzz: 'באז',
    trend: 'מגמה',
    relativeBuzz: 'יחסית למרקט קאפ',
    noQuotes: 'אין ציטוטים זמינים',
    noBuzz: 'אין באז משמעותי השבוע',
    pickNextWeek: '🔥 הבחירה לשבוע הקרוב',
    identityCard: 'כרטיס זהות',
    whyRecommended: 'למה זאת?',
    floatLabel: 'Float',
    volRatio: 'יחס נפח',
    shortInt: 'שורט',
    closeLoc: 'סגירה בטווח',
    distHigh: 'נדרשת עלייה כדי לחזור לשיא',
    gainToHigh: 'אפסייד עד השיא',
    themes: 'תמות',
    recScore: 'ציון המלצה',
    earningsIn: 'דוח רבעוני בעוד',
    days: 'ימים',
    hotTheme: 'תמה חמה',
    confHigh: 'אמון גבוה',
    confMed: 'אמון בינוני',
    confLow: 'אמון נמוך',
    scoreBreakdown: 'פירוט הציון',
    gap: 'פער מהשני',
    range52w: 'טווח 52 שבועות',
    posInRange: 'מיקום בטווח',
    high52: 'שיא 52W',
    low52: 'תחתית 52W',
    fromLow: 'מהתחתית',
  },
  en: {
    title: 'Stock Scout',
    subtitle: 'Weekly Stock Scanner',
    minCap: 'Min Market Cap',
    million: 'Million',
    runScan: '▶ Run Scan',
    running: 'Running...',
    scanMsg: '✅ Scan started, running in the background (15-20 min). You will get an email when it finishes — no need to keep this page open.',
    returning: 'frequent',
    threeWeeks: 'occasional',
    fourPlus: 'new',
    stocks: 'stocks',
    noData: 'No data yet. Click "Run Scan" to start.',
    bonus: '🔥 Buzz Alerts — Top stocks with extraordinary buzz',
    buzzAlert: '🔥 High Buzz',
    details: 'Details',
    close: 'Close',
    thisWeek: 'This week',
    firstApp: 'First appearance',
    notInList: 'Not in list',
    appHistory: 'Appearance History',
    buzzTitle: 'Buzz',
    sentimentTitle: 'Trading Sentiment',
    bullish: 'Bullish',
    bearish: 'Bearish',
    neutral: 'Neutral',
    redditSentiment: 'Reddit (text analysis)',
    stocktwitsSentiment: 'StockTwits (user-marked)',
    topTopics: '🏷️ Top Topics',
    whatSaying: '💬 What people are saying',
    upvotes: 'upvotes',
    mktCap: 'Market Cap',
    price: 'Price',
    volume: 'Weekly Volume',
    buzzScore: 'Buzz Score',
    streak: 'weeks streak',
    new: 'New',
    weeks: 'weeks',
    appearances: 'appearances',
    frequent: 'frequent',
    occasional: 'occasional',
    rare: 'rare',
    rank: '#',
    stock: 'Stock',
    gain: 'Gain',
    buzz: 'Buzz',
    trend: 'Trend',
    relativeBuzz: 'relative to market cap',
    noQuotes: 'No quotes available',
    noBuzz: 'No significant buzz this week',
    pickNextWeek: '🔥 Pick for Next Week',
    identityCard: 'Identity Card',
    whyRecommended: 'Why this pick?',
    floatLabel: 'Float',
    volRatio: 'Volume Ratio',
    shortInt: 'Short Interest',
    closeLoc: 'Close in Range',
    distHigh: 'to retest 52W high',
    gainToHigh: 'upside to 52W high',
    themes: 'Themes',
    recScore: 'Recommendation Score',
    earningsIn: 'Earnings in',
    days: 'days',
    hotTheme: 'Hot theme',
    confHigh: 'High confidence',
    confMed: 'Medium confidence',
    confLow: 'Low confidence',
    scoreBreakdown: 'Score breakdown',
    gap: 'Gap from #2',
    range52w: '52-Week Range',
    posInRange: 'Position in range',
    high52: '52W High',
    low52: '52W Low',
    fromLow: 'from low',
  }
}

const COLORS = {
  light: {
    pageBg: '#f5f6fa', card: '#ffffff', thead: '#f8f9fa',
    text: '#1a1a2e', muted: '#888', border: '#eeeeee',
    inputBg: '#ffffff', chipBg: '#f0f0f0',
    panelBg: '#f0faf5', rowHover: '#fafafa', rowSelected: '#f0faf5',
    bullColor: '#097c3e', bearColor: '#cc3333', neutralColor: '#888',
    bullBg: '#EAF3DE', bearBg: '#FCEBEB', neutralBg: '#f0f0f0',
  },
  dark: {
    pageBg: '#0f0f1a', card: '#1a1a2e', thead: '#12122a',
    text: '#e8e8f0', muted: '#777', border: '#2a2a3e',
    inputBg: '#12122a', chipBg: '#2a2a3e',
    panelBg: '#0d2018', rowHover: '#1e1e32', rowSelected: '#0d2018',
    bullColor: '#7dcc7d', bearColor: '#ff8888', neutralColor: '#888',
    bullBg: '#1a3a1a', bearBg: '#3a0a0a', neutralBg: '#2a2a3e',
  }
}

export async function getServerSideProps() {
  // Capture the error too. When the Supabase project is PAUSED the client throws
  // a network "fetch failed" — which used to look identical to "no scans yet"
  // and sent us hunting for missing data instead of a sleeping database.
  let scans = null, dbError = null
  try {
    const { data, error } = await supabase
      .from('weekly_scans')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    scans = data
    if (error) dbError = error.message || String(error)
  } catch (e) {
    dbError = e?.message || String(e)
  }

  // Python's json.dumps writes bare NaN/Infinity (from a div-by-zero in a
  // metric), which is INVALID JSON and makes JSON.parse throw — silently
  // dropping that whole week. Sanitize those tokens to null before parsing.
  const safeParse = (str) => JSON.parse(
    String(str || '{}').replace(/-?\bInfinity\b/g, 'null').replace(/\bNaN\b/g, 'null')
  )

  const processed = (scans || []).map(scan => {
    try {
      const parsed = safeParse(scan.stocks_json)
      // Keep parsed fields for server-side computation only. We do NOT keep the
      // raw stocks_json or the heavy enrichments on each object that ships to the
      // client — that bloated the payload (it grew every week and broke the
      // latest, biggest scan). Enrichments are taken from the latest scan below.
      return {
        week_label: scan.week_label,
        created_at: scan.created_at,
        stocks: parsed.stocks || parsed || [],
        bonus: parsed.bonus || [],
        backtest: parsed.backtest || null,
        _trend: parsed.trend || null,
        _radar: parsed.radar || null,
        _rising: parsed.rising_stars || null,
        _entry: parsed.entry_zone || null,
        _verdict: parsed.verdict || null,
      }
    } catch {
      return { week_label: scan.week_label, created_at: scan.created_at, stocks: [], bonus: [], backtest: null, _trend: null, _radar: null, _rising: null, _entry: null, _verdict: null }
    }
  })

  const unique = []
  const seen = new Set()
  for (const scan of processed) {
    if (!seen.has(scan.week_label)) {
      seen.add(scan.week_label)
      unique.push(scan)
    }
  }

  // Sort by actual week-end date (newest first), not by Supabase created_at
  function parseWeekEnd(label) {
    // "24.04-01.05.2026" → end part is after the last dash before the year
    const match = label.match(/(\d{2})\.(\d{2})\.(\d{4})$/)
    if (!match) return new Date(0)
    return new Date(`${match[3]}-${match[2]}-${match[1]}`)
  }
  unique.sort((a, b) => parseWeekEnd(b.week_label) - parseWeekEnd(a.week_label))

  // Count how many scans each ticker appeared in (across ALL scans)
  const appearanceCounts = {}
  for (const scan of unique) {
    for (const stock of scan.stocks || []) {
      appearanceCounts[stock.ticker] = (appearanceCounts[stock.ticker] || 0) + 1
    }
  }
  const totalScans = unique.length

  // Build Hall of Fame — oldest week first for the dot timeline
  const weekLabelsOldestFirst = [...unique].reverse().map(s => s.week_label)
  const tickerStats = {}
  for (const scan of unique) {
    const weekIndex = weekLabelsOldestFirst.indexOf(scan.week_label)
    for (const stock of scan.stocks || []) {
      if (!tickerStats[stock.ticker]) {
        tickerStats[stock.ticker] = {
          ticker: stock.ticker,
          name: stock.name,
          marketCap: stock.market_cap,
          appearances: 0,
          totalGain: 0,
          bestGain: 0,
          buzzScore: 0,
          weekPresence: Array(totalScans).fill(null),
        }
      }
      const d = tickerStats[stock.ticker]
      d.appearances++
      d.totalGain += stock.change_pct
      d.bestGain = Math.max(d.bestGain, stock.change_pct)
      d.marketCap = stock.market_cap
      if (stock.buzz && stock.buzz.score > 0) d.buzzScore = stock.buzz.score
      if (weekIndex >= 0) d.weekPresence[weekIndex] = stock.change_pct
    }
  }
  const hallOfFame = Object.values(tickerStats)
    .map(d => {
      const avgGain = Math.round(d.totalGain / d.appearances * 10) / 10
      const gains = d.weekPresence.filter(g => g !== null)
      let trend = '→'
      if (gains.length >= 3) {
        const mid = Math.floor(gains.length / 2)
        const firstAvg = gains.slice(0, mid).reduce((a, b) => a + b, 0) / mid
        const secondAvg = gains.slice(mid).reduce((a, b) => a + b, 0) / (gains.length - mid)
        if (secondAvg > firstAvg * 1.2) trend = '↗'
        else if (secondAvg < firstAvg * 0.8) trend = '↘'
      }
      return { ...d, avgGain, trend }
    })
    .sort((a, b) => b.appearances - a.appearances || b.avgGain - a.avgGain)

  // Win Rate: for each ticker, % of weeks after appearing where it ALSO appeared next week with gain > 0
  const winRateByTicker = {}
  for (const ticker of Object.keys(tickerStats)) {
    let wins = 0, opps = 0
    // unique[0] = newest. unique[i] is older, unique[i-1] is the following (newer) week
    for (let i = 1; i < unique.length; i++) {
      if (!(unique[i].stocks || []).find(s => s.ticker === ticker)) continue
      opps++
      const nextWeek = (unique[i - 1].stocks || []).find(s => s.ticker === ticker)
      if (nextWeek && nextWeek.change_pct > 0) wins++
    }
    if (opps > 0) winRateByTicker[ticker] = { wins, opps, pct: Math.round(wins / opps * 100) }
  }

  // Collect best buzz data per ticker from any scan that has it
  const buzzByTicker = {}
  for (const scan of unique) {
    for (const stock of scan.stocks || []) {
      if (stock.buzz && stock.buzz.score > 0) {
        if (!buzzByTicker[stock.ticker] || stock.buzz.score > (buzzByTicker[stock.ticker].score || 0)) {
          buzzByTicker[stock.ticker] = stock.buzz
        }
      }
    }
  }

  // Overlay on-demand buzz fetched via the buzz-on-demand workflow (ticker_buzz table)
  try {
    const { data: tickerBuzzRows } = await supabase.from('ticker_buzz').select('*')
    for (const row of tickerBuzzRows || []) {
      try {
        const buzz = typeof row.buzz_json === 'string' ? JSON.parse(row.buzz_json) : row.buzz_json
        if (buzz && buzz.score > 0) buzzByTicker[row.ticker] = buzz
      } catch {}
    }
  } catch {}

  function parseWeekEndDate(label) {
    const m = (label || '').match(/(\d{2})\.(\d{2})\.(\d{4})$/)
    if (!m) return new Date(0)
    return new Date(`${m[3]}-${m[2]}-${m[1]}`)
  }

  const backtestByWeek = {}

  // From scan JSON (scanner.py stores per-scan backtest going forward)
  for (const scan of unique) {
    if (scan.backtest) backtestByWeek[scan.backtest.week] = scan.backtest
  }

  // From data/backtest.json (written by backfill_backtest.py via GitHub Actions)
  try {
    const btPath = path.join(process.cwd(), 'data', 'backtest.json')
    const btRaw = fs.readFileSync(btPath, 'utf-8')
    const btEntries = JSON.parse(btRaw)
    for (const bt of (btEntries || [])) {
      if (bt?.week && !backtestByWeek[bt.week]) backtestByWeek[bt.week] = bt
    }
  } catch {}

  const realBacktestWeeks = Object.values(backtestByWeek)
    .sort((a, b) => parseWeekEndDate(a.week) - parseWeekEndDate(b.week))

  let backtest = null
  if (realBacktestWeeks.length >= 1) {
    let btWins = 0, btPicks = 0, btCompound = 1.0
    for (const bt of realBacktestWeeks) {
      btWins    += bt.wins
      btPicks   += bt.total
      btCompound *= (1 + bt.avg_gain / 100)
    }
    backtest = {
      totalWeeks:  realBacktestWeeks.length,
      winRate:     btPicks > 0 ? Math.round(btWins / btPicks * 100) : 0,
      compoundRet: Math.round((btCompound - 1) * 100 * 10) / 10,
      avgWeekly:   Math.round(realBacktestWeeks.reduce((a, w) => a + w.avg_gain, 0) / realBacktestWeeks.length * 10) / 10,
      weeks:       realBacktestWeeks,
      isReal:      true,
    }
  } else {
    backtest = { pending: true, totalScans: unique.length }
  }

  // Enrichments from the LATEST scan (unique[0]); fall back to the most recent
  // scan that has each, so a single rate-limited week never freezes the view.
  const trend = (unique.find(s => s._trend)?._trend) || null
  const radar = (unique.find(s => s._radar)?._radar) || null
  const risingStars = (unique.find(s => s._rising)?._rising) || null
  const entryZone = (unique.find(s => s._entry)?._entry) || null
  const verdict = (unique.find(s => s._verdict)?._verdict) || null

  // Ship LEAN scans — only what the client renders (week, date, stocks, bonus).
  // No raw stocks_json, no duplicated enrichments. Keeps the payload small and
  // scalable as scans accumulate week after week.
  const scansLean = unique.map(s => ({ week_label: s.week_label, created_at: s.created_at, stocks: s.stocks, bonus: s.bonus }))

  return { props: { scans: scansLean, appearanceCounts, totalScans, hallOfFame, weekLabelsOldestFirst, buzzByTicker, winRateByTicker, backtest, trend, radar, risingStars, entryZone, verdict, dbError } }
}

export default function Dashboard({ scans, appearanceCounts, totalScans, hallOfFame, weekLabelsOldestFirst, buzzByTicker, winRateByTicker, backtest, trend, radar, risingStars, entryZone, verdict, dbError }) {
  const [dark, setDark] = useState(false)
  const [lang, setLang] = useState('he')
  const [tab, setTab] = useState('weekly')
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [openStock, setOpenStock] = useState(null)
  const [marketCapInput, setMarketCapInput] = useState('250')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [sectorFilter, setSectorFilter] = useState(null)
  // Trading Journal — manually-entered trades (replaces the old watchlist concept)
  const [journal, setJournal] = useState([])

  const t = T[lang]
  const c = COLORS[dark ? 'dark' : 'light']

  useEffect(() => {
    if (localStorage.getItem('dark') === 'true') setDark(true)
    if (localStorage.getItem('lang')) setLang(localStorage.getItem('lang'))
    // Load the SHARED trading journal from Supabase (whole team sees it)
    fetch('/api/journal')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.trades)) setJournal(d.trades) })
      .catch(() => {})
  }, [])

  function addTrade({ ticker, name, quantity, entry_price, notes }) {
    const qty = parseFloat(quantity)
    const px  = parseFloat(entry_price)
    if (!ticker || !qty || qty <= 0 || !px || px <= 0) return false
    const entry = {
      id:          `${ticker.toUpperCase()}-${Date.now()}`,
      ticker:      ticker.toUpperCase(),
      name:        name || ticker.toUpperCase(),
      quantity:    qty,
      entry_price: px,
      entry_date:  new Date().toISOString().split('T')[0],
      notes:       notes || '',
    }
    setJournal([entry, ...journal])
    fetch('/api/journal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade: entry }),
    }).catch(() => {})
    return true
  }
  function removeTrade(id) {
    setJournal(journal.filter(t => t.id !== id))
    fetch('/api/journal?id=' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {})
  }

  const toggleDark = () => setDark(d => { localStorage.setItem('dark', !d); return !d })
  const toggleLang = () => setLang(l => { const nl = l === 'he' ? 'en' : 'he'; localStorage.setItem('lang', nl); return nl })

  const currentScan = scans[selectedWeek] || {}
  const stocks = currentScan.stocks || []
  const bonus = currentScan.bonus || []

  // Weekly history per ticker (for the Journal deep-dive bars): prefer the
  // Trend's continuous timeline; otherwise build from our scan appearances.
  const weeklyHistoryByTicker = (() => {
    const map = {}
    if (trend) trend.forEach(t => { if (t.weekly_history?.length) map[t.ticker] = t.weekly_history })
    const we = (lbl) => { const m = (lbl || '').match(/(\d{2})\.(\d{2})\.(\d{4})$/); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}`) : new Date(0) }
    const fromScans = {}
    ;(scans || []).forEach(scan => {
      (scan.stocks || []).forEach(s => {
        if (!s?.ticker) return
        ;(fromScans[s.ticker] = fromScans[s.ticker] || []).push({ week: scan.week_label, change_pct: s.change_pct, in_scan: true })
      })
    })
    Object.keys(fromScans).forEach(tk => {
      if (!map[tk]) map[tk] = fromScans[tk].sort((a, b) => we(a.week) - we(b.week))
    })
    return map
  })()

  async function saveAndScan() {
    setSaving(true)
    setSaveMsg('')
    try {
      // The catch used to show the SAME success message as the happy path, so a
      // failed trigger looked identical to a successful one. Report the truth.
      const r = await fetch('/api/trigger-scan', { method: 'POST' })
      if (!r.ok) {
        const body = await r.text().catch(() => '')
        setSaveMsg((lang === 'he' ? '❌ ההפעלה נכשלה: ' : '❌ Failed to start: ') + `${r.status} ${body.slice(0, 100)}`)
      } else {
        setSaveMsg(t.scanMsg)
      }
    } catch (e) {
      setSaveMsg((lang === 'he' ? '❌ שגיאת רשת: ' : '❌ Network error: ') + e.message)
    }
    setSaving(false)
  }

  const he = lang === 'he'
  const dir = he ? 'rtl' : 'ltr'

  return (
    <div dir={dir} style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: c.pageBg, color: c.text, transition: 'background 0.2s' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>📈 {t.title}</h1>
            <p style={{ margin: '4px 0 0', color: c.muted, fontSize: 13 }}>{t.subtitle}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              value={selectedWeek}
              onChange={e => { setSelectedWeek(Number(e.target.value)); setOpenStock(null); setSectorFilter(null) }}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 14, background: c.card, color: c.text, cursor: 'pointer' }}
            >
              {scans.map((scan, i) => (<option key={i} value={i}>{scan.week_label}</option>))}
            </select>
            <button onClick={toggleLang} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${c.border}`, background: c.card, color: c.text, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {lang === 'he' ? 'EN' : 'עב'}
            </button>
            <button onClick={toggleDark} style={{ width: 38, height: 38, borderRadius: 19, border: `1px solid ${c.border}`, background: c.card, color: c.text, cursor: 'pointer', fontSize: 16 }}>
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Data freshness. Every tab renders one weekly snapshot, so the single
            most important fact on screen is WHEN that snapshot was taken. When a
            scan is missed the numbers still look authoritative while being weeks
            behind — that is how a collapsing stock kept looking like a winner. */}
        {scans && scans.length > 0 && (() => {
          const ageDays = Math.floor((Date.now() - new Date(scans[0].created_at)) / 86400000)
          const stale = ageDays > 8
          return (
            <div style={{
              background: stale ? (dark ? '#3a2a0a' : '#FFF8E1') : c.card,
              border: `1px solid ${stale ? '#d9a406' : c.border}`,
              borderRadius: 12, padding: '12px 18px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 18 }}>{stale ? '⚠️' : '🟢'}</span>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
                  {he
                    ? `הנתונים בכל הטאבים הם מהסריקה של ${scans[0].week_label}`
                    : `All tabs show the scan of ${scans[0].week_label}`}
                </div>
                <div style={{ fontSize: 12, color: stale ? '#8a6d0b' : c.muted, marginTop: 2 }}>
                  {stale
                    ? (he
                        ? `נשמרה לפני ${ageDays} ימים — חסרה סריקה. לחץ "הפעל סריקה" לרענון לפני הצגה.`
                        : `Saved ${ageDays} days ago — a scan was missed. Click "Run Scan" to refresh before presenting.`)
                    : (he
                        ? `נשמרה לפני ${ageDays} ימים — עדכני.`
                        : `Saved ${ageDays} days ago — current.`)}
                </div>
              </div>
            </div>
          )
        })()}

        {/* Database-down banner. An empty dashboard used to look like "no scans
            yet"; it was actually the Supabase project paused. Say so plainly. */}
        {dbError && (
          <div style={{ background: dark ? '#3a0a0a' : '#FCEBEB', border: '1px solid #cc3333', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#cc3333', marginBottom: 6 }}>
              {lang === 'he' ? '⚠️ אין חיבור למסד הנתונים' : '⚠️ Cannot reach the database'}
            </div>
            <div style={{ fontSize: 14, color: c.text, lineHeight: 1.6 }}>
              {lang === 'he'
                ? 'הנתונים לא נמחקו — השרת פשוט לא מצליח להתחבר. ברוב המקרים פרויקט ה-Supabase הוקפא אחרי תקופה בלי פעילות.'
                : 'Nothing was deleted — the server simply cannot connect. Usually the Supabase project was paused after a quiet period.'}
              {' '}
              <a href="https://supabase.com/dashboard/projects" target="_blank" rel="noreferrer" style={{ color: '#cc3333', fontWeight: 700 }}>
                {lang === 'he' ? 'פתח את Supabase ולחץ Restore project' : 'Open Supabase and click Restore project'}
              </a>
            </div>
            <div style={{ fontSize: 11, color: c.muted, marginTop: 8, direction: 'ltr', textAlign: 'left' }}>{dbError}</div>
          </div>
        )}

        {/* Filter bar */}
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: c.muted, fontWeight: 600 }}>{t.minCap}:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: c.muted }}>$</span>
            <input type="number" value={marketCapInput} onChange={e => setMarketCapInput(e.target.value)}
              style={{ width: 90, padding: '6px 10px', borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 14, background: c.inputBg, color: c.text }} />
            <span style={{ fontSize: 13, color: c.muted }}>{t.million}</span>
          </div>
          <button onClick={saveAndScan} disabled={saving}
            style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: saving ? '#888' : '#097c3e', color: 'white', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? t.running : t.runScan}
          </button>
          {saveMsg && <span style={{ fontSize: 13, fontWeight: 600, color: saveMsg.startsWith('❌') ? '#cc3333' : '#097c3e' }}>{saveMsg}</span>}
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            ['weekly',    `📊 ${lang === 'he' ? 'שבועי' : 'Weekly'}`],
            ['entry',     `🎯 ${lang === 'he' ? 'אזור כניסה' : 'Entry Zone'}`],
            ['stars',     `⭐ ${lang === 'he' ? 'כוכבים עולים' : 'Rising Stars'}`],
            ['radar',     `🎯 ${lang === 'he' ? 'ראדאר' : 'Radar'}`],
            ['trend',     `📈 ${lang === 'he' ? 'המגמה' : 'The Trend'}`],
            ['hof',       '🏆 Hall of Fame'],
            ['watchlist', `📓 ${lang === 'he' ? 'יומן מסחר' : 'Journal'}`],
            ['portfolio', `🔭 ${lang === 'he' ? 'מעקב תיק' : 'Portfolio Watch'}`],
            ['lab',       `🔬 ${lang === 'he' ? 'מעבדה' : 'Analysis Lab'}`],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding: '9px 22px', borderRadius: 22, border: `1px solid ${tab === key ? '#097c3e' : c.border}`, background: tab === key ? '#097c3e' : c.card, color: tab === key ? 'white' : c.muted, fontWeight: 700, cursor: 'pointer', fontSize: 14, transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'hof' && (
          <>
            {backtest && <BacktestCard backtest={backtest} c={c} dark={dark} lang={lang} />}
            <HallOfFame hallOfFame={hallOfFame} totalScans={totalScans} weekLabels={weekLabelsOldestFirst} c={c} dark={dark} lang={lang} buzzByTicker={buzzByTicker} winRateByTicker={winRateByTicker} />
          </>
        )}

        {tab === 'stars' && (
          <RisingStars stars={risingStars} c={c} dark={dark} lang={lang} />
        )}

        {tab === 'radar' && (
          <MultiBaggerRadar radar={radar} c={c} dark={dark} lang={lang} />
        )}

        {tab === 'trend' && (
          <TheTrend trend={trend} c={c} dark={dark} lang={lang} />
        )}

        {tab === 'watchlist' && (
          <TradingJournal journal={journal} addTrade={addTrade} removeTrade={removeTrade} weeklyHistoryByTicker={weeklyHistoryByTicker} c={c} dark={dark} lang={lang} />
        )}

        {tab === 'portfolio' && (
          <PortfolioWatch journal={journal} weeklyHistoryByTicker={weeklyHistoryByTicker} c={c} dark={dark} lang={lang} />
        )}

        {tab === 'entry' && (
          <EntryZone entryZone={entryZone} c={c} dark={dark} lang={lang} />
        )}

        {tab === 'lab' && (
          <AnalysisLab risingStars={risingStars} radar={radar} trend={trend} c={c} dark={dark} lang={lang} />
        )}

        {tab === 'weekly' && (<>

        {/* THE VERDICT — the analyst's real written opinion, front and center */}
        <VerdictCard verdict={verdict} c={c} dark={dark} lang={lang} />

        {/* Sector rotation heatmap */}
        {stocks.some(s => s.sector) && (
          <SectorHeatmap stocks={stocks} c={c} dark={dark} sectorFilter={sectorFilter} setSectorFilter={setSectorFilter} lang={lang} />
        )}

        {/* Stats chips — colors match trend column (appearance %) */}
        {stocks.length > 0 && (() => {
          const pct = s => totalScans > 0 ? (appearanceCounts[s.ticker] || 0) / totalScans * 100 : 0
          const greenCount  = stocks.filter(s => pct(s) > 70).length
          const yellowCount = stocks.filter(s => pct(s) > 30 && pct(s) <= 70).length
          const redCount    = stocks.filter(s => pct(s) <= 30).length
          return (
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <Chip label={`${greenCount} ${t.returning}`}  bg={dark ? '#1a3a1a' : '#EAF3DE'} color={dark ? '#7dcc7d' : '#27500A'} />
              <Chip label={`${yellowCount} ${t.threeWeeks}`} bg={dark ? '#3a2a0a' : '#FAEEDA'} color={dark ? '#ffcc66' : '#633806'} />
              <Chip label={`${redCount} ${t.fourPlus}`}     bg={dark ? '#3a0a0a' : '#FCEBEB'} color={dark ? '#ff8888' : '#791F1F'} />
              <Chip label={`${stocks.length} ${t.stocks}`}  bg={c.chipBg} color={c.muted} />
            </div>
          )
        })()}

        {/* Main table */}
        <div style={{ background: c.card, borderRadius: 12, border: `1px solid ${c.border}`, overflow: 'hidden', marginBottom: 20 }}>
          {stocks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: c.muted, fontSize: 15 }}>{t.noData}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: c.thead }}>
                  {[t.rank, t.stock, t.gain, t.mktCap, lang === 'he' ? 'נפח' : 'Volume', t.trend, ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: `1px solid ${c.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stocks.filter(s => !sectorFilter || s.sector === sectorFilter).map((stock, i) => {
                  return (<>
                    <StockRow key={stock.ticker} stock={stock} rank={i + 1} isOpen={openStock === stock.ticker}
                      onClick={() => setOpenStock(openStock === stock.ticker ? null : stock.ticker)} c={c} t={t} dark={dark}
                      appearanceCount={appearanceCounts[stock.ticker] || 1} totalScans={totalScans} />
                    {openStock === stock.ticker && (
                      <tr key={`${stock.ticker}-panel`}>
                        <td colSpan={7} style={{ padding: 0, borderBottom: `1px solid ${c.border}` }}>
                          <StockPanel stock={stock} scans={scans} c={c} t={t} dark={dark} lang={lang} onClose={() => setOpenStock(null)} buzzByTicker={buzzByTicker} />
                        </td>
                      </tr>
                    )}
                  </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Bonus */}
        {bonus.length > 0 && (
          <div style={{ background: c.card, borderRadius: 12, border: `1px solid ${c.border}`, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>{t.bonus}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {bonus.map(b => (
                <div key={b.ticker} style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', background: c.card }}
                  onClick={() => setOpenStock(openStock === b.ticker ? null : b.ticker)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: 16, color: c.text }}>{b.ticker}</strong>
                    <span style={{ background: dark ? '#3a2a0a' : '#FAEEDA', color: dark ? '#ffcc66' : '#633806', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{t.buzzAlert}</span>
                  </div>
                  <div style={{ fontSize: 12, color: c.muted, marginBottom: 6 }}>{b.name}</div>
                  <div style={{ fontSize: 13, color: '#097c3e', fontWeight: 700 }}>+{b.change_pct}%</div>
                  <div style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>{b.buzz?.score || 0}/10 buzz · {b.buzz?.reddit_bullish_pct || 50}% bullish</div>
                </div>
              ))}
            </div>
          </div>
        )}

        </>)}
      </div>

      {/* Floating AI Analyst — available on every tab */}
      <FloatingAnalyst journal={journal} c={c} dark={dark} lang={lang} />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// The Verdict — the analyst's real written opinion (not a score).
// The scores filter the market; this is the brain's judgment, in words.
// ──────────────────────────────────────────────────────────────────
function VerdictCard({ verdict, c, dark, lang }) {
  const he = lang === 'he'
  const [collapsed, setCollapsed] = useState(true)  // default hidden — open with the Show button

  if (!verdict || !verdict.text) {
    return (
      <div style={{
        background: `linear-gradient(135deg, ${dark ? '#0d2030' : '#0a2540'} 0%, ${dark ? '#10384a' : '#16486b'} 100%)`,
        borderRadius: 14, padding: '20px 24px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{ fontSize: 28 }}>📋</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>{he ? 'חוות הדעת השבועית' : 'The Weekly Verdict'}</div>
          <div style={{ fontSize: 12, color: '#a8c5dd', marginTop: 3 }}>
            {he ? 'תיווצר בסריקה הבאה (או הרץ "Fix Verdict" ב-Actions). דורש מפתח Anthropic ב-GitHub Secrets.' : 'Generated next scan (or run "Fix Verdict"). Needs Anthropic key in GitHub Secrets.'}
          </div>
        </div>
      </div>
    )
  }

  const when = verdict.generated_at ? new Date(verdict.generated_at).toLocaleDateString(he ? 'he-IL' : 'en-US') : ''
  // When a scan cannot write a verdict (an API failure, exhausted credits), the
  // dashboard falls back to the newest scan that HAS one — so a month-old note
  // renders as if it were this week's. Say how old it is.
  const verdictAgeDays = verdict.generated_at
    ? Math.floor((Date.now() - new Date(verdict.generated_at)) / 86400000) : null
  const verdictStale = verdictAgeDays != null && verdictAgeDays > 8

  return (
    <div style={{
      borderRadius: 14, marginBottom: 20, overflow: 'hidden',
      border: `2px solid ${dark ? '#1f5a7a' : '#16486b'}`,
      boxShadow: dark ? 'none' : '0 4px 16px rgba(22,72,107,0.15)',
    }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${dark ? '#0d2030' : '#0a2540'} 0%, ${dark ? '#10384a' : '#16486b'} 100%)`,
        padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26 }}>📋</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'white' }}>
              {he ? 'חוות הדעת — ניתוח האנליסט' : 'The Verdict — Analyst\'s Call'}
            </div>
            <div style={{ fontSize: 11, color: verdictStale ? '#ffcc55' : '#a8c5dd', marginTop: 2 }}>
              {he ? 'הדעה האמיתית, לא ציון · ' : 'Real opinion, not a score · '}{when}
              {verdictStale && (he
                ? ` · ⚠️ בת ${verdictAgeDays} ימים — לא נוצרה חוות דעת חדשה בסריקה האחרונה`
                : ` · ⚠️ ${verdictAgeDays} days old — the latest scan did not produce a new one`)}
            </div>
          </div>
        </div>
        <button onClick={() => setCollapsed(v => !v)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
          {collapsed ? (he ? '▼ הצג' : '▼ Show') : (he ? '▲ הסתר' : '▲ Hide')}
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ background: c.card, padding: '20px 24px' }}>
          <Markdown text={verdict.text} c={c} dark={dark} rtl={he} />
          <div style={{ fontSize: 11, color: c.muted, marginTop: 16, paddingTop: 12, borderTop: `1px solid ${c.border}`, lineHeight: 1.5 }}>
            {he
              ? '⚠️ ניתוח לתמיכה בהחלטה — לא ייעוץ השקעות. הציונים סיננו את המועמדים; זו דעת האנליסט עליהם. ההחלטה תמיד שלך.'
              : '⚠️ Decision-support analysis — not investment advice. Scores filtered the candidates; this is the analyst\'s judgment on them. The decision is always yours.'}
          </div>
        </div>
      )}
    </div>
  )
}

function BacktestCard({ backtest, c, dark, lang }) {
  const [expanded, setExpanded] = useState(false)
  const he = lang === 'he'

  // Pending state — tracking started but no real data yet
  if (backtest.pending) {
    return (
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ background: dark ? '#12122a' : '#1a1a2e', padding: '16px 22px' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>📊 {he ? 'ביצועי המערכת' : 'System Track Record'}</div>
        </div>
        <div style={{ padding: '28px 24px', textAlign: 'center', color: c.muted }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⏳</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: c.text, marginBottom: 6 }}>
            {he ? 'מתחילים לעקוב' : 'Tracking started'}
          </div>
          <div style={{ fontSize: 13 }}>
            {he
              ? `מהסריקה הבאה ואילך, הנתונים יהיו אמיתיים — כמה % עשו הטופ 5 בשבוע שאחרי.`
              : `From the next scan onwards, we'll track real next-week performance of the top 5 picks.`}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: c.muted }}>
            {he ? `${backtest.totalScans} סריקות קיימות — ממתינים לסריקה הבאה` : `${backtest.totalScans} scans stored — waiting for next scan`}
          </div>
        </div>
      </div>
    )
  }

  const bt = backtest
  const wrColor  = bt.winRate >= 60 ? '#097c3e' : bt.winRate >= 40 ? '#cc8800' : '#c0392b'
  const wrBg     = bt.winRate >= 60 ? (dark ? '#1a3a1a' : '#EAF3DE') : bt.winRate >= 40 ? (dark ? '#3a2a0a' : '#FAEEDA') : (dark ? '#3a1a1a' : '#FCEBEB')
  const avgColor = bt.avgWeekly > 0 ? '#097c3e' : '#c0392b'
  const cmpColor = bt.compoundRet > 0 ? '#097c3e' : '#c0392b'

  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, marginBottom: 20, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: dark ? '#12122a' : '#1a1a2e', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 10 }}>
            📊 {he ? 'ביצועי המערכת — נתונים אמיתיים' : 'System Track Record — Real Data'}
            <span style={{ background: '#097c3e', color: 'white', fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>✓ REAL</span>
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>
            {he
              ? 'כל שבוע: קונים את הטופ 5 בסגירת יום שישי — כמה % עשו עד יום שישי הבא?'
              : "Each week: buy top 5 at Friday close — what's their actual gain by next Friday?"}
          </div>
        </div>
        <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: '1px solid #555', color: '#aaa', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
          {expanded ? (he ? '▲ סגור' : '▲ Hide') : (he ? '▼ פרטים' : '▼ Details')}
        </button>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', borderBottom: expanded ? `1px solid ${c.border}` : 'none' }}>
        {[
          { value: `${bt.winRate}%`, label: he ? 'אחוז הצלחה' : 'Win Rate', sub: he ? 'מניות שעלו בשבוע הבא' : 'picks that rose next week', color: wrColor, bg: wrBg },
          { value: `${bt.avgWeekly >= 0 ? '+' : ''}${bt.avgWeekly}%`, label: he ? 'ממוצע שבועי' : 'Avg Weekly Gain', sub: he ? 'ממוצע ה-5 בשבוע הבא' : 'top 5 avg gain next week', color: avgColor, bg: 'transparent' },
          { value: `${bt.compoundRet >= 0 ? '+' : ''}${bt.compoundRet}%`, label: he ? 'תשואה מצטברת' : 'Compound Return', sub: he ? 'אם מחזיקים כל שבוע' : 'if reinvested each week', color: cmpColor, bg: 'transparent' },
          { value: bt.totalWeeks, label: he ? 'שבועות מדגם' : 'Weeks Tracked', sub: he ? 'נתונים מחירים אמיתיים' : 'real price data', color: c.text, bg: 'transparent' },
        ].map((stat, i) => (
          <div key={i} style={{ flex: 1, padding: '18px 16px', borderRight: i < 3 ? `1px solid ${c.border}` : 'none', background: stat.bg, textAlign: 'center' }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: stat.color, lineHeight: 1.1 }}>{stat.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.text, marginTop: 6 }}>{stat.label}</div>
            <div style={{ fontSize: 10, color: c.muted, marginTop: 2 }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Expanded details */}
      {expanded && (() => {
        // Flatten all individual picks for analysis
        const allPicks = bt.weeks.flatMap(w => w.picks.filter(p => p.actual_gain != null))
        const bigWins  = [...allPicks].filter(p => p.actual_gain >= 30).sort((a, b) => b.actual_gain - a.actual_gain)
        const dist = [
          { label: he ? '50%+ 🚀' : '50%+ 🚀', min: 50,  picks: allPicks.filter(p => p.actual_gain >= 50) },
          { label: he ? '20-50% 🟢' : '20–50% 🟢', min: 20,  picks: allPicks.filter(p => p.actual_gain >= 20 && p.actual_gain < 50) },
          { label: he ? '0-20% 📈' : '0–20% 📈', min: 0,   picks: allPicks.filter(p => p.actual_gain >= 0  && p.actual_gain < 20) },
          { label: he ? 'ירידה 🔴' : 'Loss 🔴',   min: null, picks: allPicks.filter(p => p.actual_gain < 0) },
        ]
        return (
          <div style={{ borderTop: `1px solid ${c.border}` }}>

            {/* Big wins spotlight */}
            {bigWins.length > 0 && (
              <div style={{ padding: '20px 22px', borderBottom: `1px solid ${c.border}`, background: dark ? '#0a1f0a' : '#f0faf4' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#097c3e', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>
                  🚀 {he ? `${bigWins.length} מניות שעשו 30%+ בשבוע אחרי שנבחרו` : `${bigWins.length} picks that surged 30%+ the following week`}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {bigWins.slice(0, 8).map((p, i) => (
                    <div key={i} style={{ background: dark ? '#0f2e18' : 'white', border: `2px solid #097c3e`, borderRadius: 10, padding: '12px 16px', minWidth: 120, textAlign: 'center' }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: c.text }}>{p.ticker}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#097c3e', marginTop: 4 }}>+{p.actual_gain}%</div>
                      <div style={{ fontSize: 10, color: c.muted, marginTop: 3 }}>{he ? 'שבוע לאחר בחירה' : 'week after pick'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Distribution bar */}
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${c.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>
                {he ? 'פיזור ביצועים — כל הבחירות' : 'Performance distribution — all picks'}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {dist.map((d, i) => {
                  const pct = allPicks.length > 0 ? Math.round(d.picks.length / allPicks.length * 100) : 0
                  const colors = ['#097c3e', '#27ae60', '#cc8800', '#c0392b']
                  const bgs    = [dark ? '#0f2e18' : '#eafaf1', dark ? '#1a3a1a' : '#d5f5e3', dark ? '#3a2a0a' : '#fef9e7', dark ? '#3a1a1a' : '#fdedec']
                  return (
                    <div key={i} style={{ flex: 1, minWidth: 110, background: bgs[i], border: `1px solid ${colors[i]}33`, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: colors[i], marginBottom: 6 }}>{d.label}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: colors[i] }}>{d.picks.length}</div>
                      <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>{pct}% {he ? 'מהבחירות' : 'of picks'}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Week-by-week table */}
            <div style={{ padding: '18px 22px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 12 }}>
                {he ? 'שבוע-אחר-שבוע' : 'Week-by-week'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {bt.weeks.map((w, wi) => {
                  const avgSign = w.avg_gain >= 0 ? '+' : ''
                  const avgColor2 = w.avg_gain >= 20 ? '#097c3e' : w.avg_gain >= 0 ? '#27ae60' : '#c0392b'
                  return (
                    <div key={wi} style={{ background: dark ? '#141428' : '#fafafa', border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 11, color: c.muted, fontWeight: 600 }}>{w.week}</span>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: c.muted }}>{w.wins}/{w.total} {he ? 'עלו' : 'wins'}</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: avgColor2 }}>{avgSign}{w.avg_gain}%</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {w.picks.map((p, pi) => {
                          const g = p.actual_gain
                          const huge = g != null && g >= 50
                          const good = g != null && g >= 20
                          const pos  = g != null && g > 0
                          const pColor = g == null ? c.muted : huge ? '#097c3e' : good ? '#27ae60' : pos ? '#7dcc7d' : '#c0392b'
                          const pBg   = g == null ? c.chipBg : huge ? (dark ? '#0f2e18' : '#d5f5e3') : good ? (dark ? '#1a3a1a' : '#eafaf1') : pos ? (dark ? '#1a2a1a' : '#f0faf4') : (dark ? '#3a1a1a' : '#fdedec')
                          const pBorder = huge ? '2px solid #097c3e' : `1px solid ${c.border}`
                          const label = g == null ? '—' : `${g >= 0 ? '+' : ''}${g}%`
                          return (
                            <div key={pi} style={{ background: pBg, border: pBorder, borderRadius: 8, padding: '6px 11px', textAlign: 'center' }}>
                              <div style={{ fontSize: 12, fontWeight: 800, color: c.text }}>{p.ticker}</div>
                              <div style={{ fontSize: 13, fontWeight: 900, color: pColor, marginTop: 2 }}>{label}</div>
                              {huge && <div style={{ fontSize: 9, color: '#097c3e', marginTop: 1 }}>🚀</div>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: c.muted, marginTop: 14 }}>
                * {he ? 'ביצועי עבר אינם מבטיחים ביצועי עתיד.' : 'Past performance does not guarantee future results.'}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function HallOfFame({ hallOfFame, totalScans, weekLabels, c, dark, lang, buzzByTicker, winRateByTicker }) {
  const medals = ['🥇', '🥈', '🥉']
  const medalBorder = ['#FFD700', '#C0C0C0', '#CD7F32']
  const medalBg = dark ? ['#2a2400', '#1e1e1e', '#1e1200'] : ['#fffdf0', '#f8f8f8', '#fff8f0']
  const [openBuzz, setOpenBuzz] = useState(null)
  const [openDates, setOpenDates] = useState(null)
  const [loadingBuzz, setLoadingBuzz] = useState({})
  const [liveBuzz, setLiveBuzz] = useState({})  // buzz fetched after clicking, auto-updates UI
  const pollTimers = useRef({})

  // Clean up all polling intervals when component unmounts
  useEffect(() => {
    return () => { Object.values(pollTimers.current).forEach(clearInterval) }
  }, [])

  async function handleGetBuzz(stock) {
    setLoadingBuzz(prev => ({ ...prev, [stock.ticker]: 'loading' }))
    try {
      await fetch('/api/trigger-buzz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: stock.ticker, name: stock.name, market_cap: stock.marketCap }),
      })

      // Poll every 20s — when the workflow finishes and saves to Supabase, update UI automatically
      const id = setInterval(async () => {
        try {
          const res = await fetch(`/api/check-buzz?ticker=${stock.ticker}`)
          const data = await res.json()
          if (data.found) {
            clearInterval(pollTimers.current[stock.ticker])
            delete pollTimers.current[stock.ticker]
            setLiveBuzz(prev => ({ ...prev, [stock.ticker]: data.buzz }))
            setLoadingBuzz(prev => ({ ...prev, [stock.ticker]: 'done' }))
          }
        } catch {}
      }, 20000)

      pollTimers.current[stock.ticker] = id
      // Stop polling after 10 minutes regardless
      setTimeout(() => {
        if (pollTimers.current[stock.ticker]) {
          clearInterval(pollTimers.current[stock.ticker])
          delete pollTimers.current[stock.ticker]
          setLoadingBuzz(prev => ({ ...prev, [stock.ticker]: 'timeout' }))
        }
      }, 600000)

    } catch {
      setLoadingBuzz(prev => ({ ...prev, [stock.ticker]: 'error' }))
    }
  }

  function dotStyle(gain) {
    if (gain === null) return {
      background: dark ? '#2a2a3e' : '#e8e8e8',
      border: `2px solid ${dark ? '#3a3a4e' : '#d0d0d0'}`,
      boxShadow: 'none',
    }
    const intensity = Math.min(gain / 15, 1)
    const alpha = 0.3 + intensity * 0.7
    return {
      background: `rgba(9,124,62,${alpha.toFixed(2)})`,
      border: `2px solid rgba(9,124,62,${Math.min(alpha + 0.2, 1).toFixed(2)})`,
      boxShadow: intensity > 0.5 ? '0 0 5px rgba(9,124,62,0.5)' : 'none',
    }
  }

  function TrendBadge({ trend }) {
    const cfg = trend === '↗'
      ? { color: '#097c3e', bg: dark ? '#1a3a1a' : '#eaf3de', label: '↗ ' + (lang === 'he' ? 'עולה' : 'Rising') }
      : trend === '↘'
      ? { color: '#c0392b', bg: dark ? '#3a1a1a' : '#fdecea', label: '↘ ' + (lang === 'he' ? 'יורד' : 'Fading') }
      : { color: c.muted, bg: dark ? '#2a2a3e' : '#f0f0f0', label: '→ ' + (lang === 'he' ? 'יציב' : 'Steady') }
    return (
      <span style={{ background: cfg.bg, color: cfg.color, padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
        {cfg.label}
      </span>
    )
  }

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{ background: dark ? '#12122a' : '#1a1a2e', borderRadius: '12px 12px 0 0', padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>🏆</span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>Hall of Fame</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>
              {lang === 'he'
                ? `כל המניות שהופיעו ב-${totalScans} הסריקות — מדורגות לפי עקביות`
                : `All stocks across ${totalScans} scans — ranked by consistency`}
            </div>
          </div>
          {/* Date labels above the dot timeline — scale to match dot scaling below */}
          {(() => {
            const n = weekLabels.length
            let gap, fontSize
            if      (n <= 8)  { gap = 16; fontSize = 10 }
            else if (n <= 12) { gap = 11; fontSize = 9  }
            else if (n <= 18) { gap = 9;  fontSize = 8  }
            else if (n <= 26) { gap = 7;  fontSize = 8  }
            else              { gap = 5;  fontSize = 7  }
            return (
              <div style={{ marginLeft: 'auto', display: 'flex', gap, maxWidth: 220, overflow: 'hidden' }}>
                {weekLabels.map((w, i) => (
                  <div key={i} style={{ fontSize, color: '#666', textAlign: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', lineHeight: 1.2, flexShrink: 0 }}>{w.split('-')[1] || w}</div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Legend */}
      <div style={{ background: dark ? '#0f0f1a' : '#f5f5f5', padding: '8px 24px', display: 'flex', gap: 20, alignItems: 'center', borderLeft: `1px solid ${c.border}`, borderRight: `1px solid ${c.border}` }}>
        <span style={{ fontSize: 11, color: c.muted }}>{lang === 'he' ? 'ציר שבועות:' : 'Week timeline:'}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(9,124,62,0.35)' }} />
          <span style={{ fontSize: 11, color: c.muted }}>{lang === 'he' ? 'עלייה קטנה' : 'small gain'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#097c3e' }} />
          <span style={{ fontSize: 11, color: c.muted }}>{lang === 'he' ? 'עלייה גדולה' : 'big gain'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: dark ? '#2a2a3e' : '#e0e0e0', border: `1px solid ${dark ? '#3a3a4e' : '#ccc'}` }} />
          <span style={{ fontSize: 11, color: c.muted }}>{lang === 'he' ? 'לא הופיעה' : 'absent'}</span>
        </div>
      </div>

      {/* Rows */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
        {hallOfFame.map((stock, i) => {
          const pct = Math.round(stock.appearances / totalScans * 100)
          const isTop3 = i < 3
          const badgeColor = pct > 70 ? '#097c3e' : pct > 30 ? '#cc8800' : c.muted
          const badgeBg = pct > 70 ? (dark ? '#1a3a1a' : '#EAF3DE') : pct > 30 ? (dark ? '#3a2a0a' : '#FAEEDA') : (dark ? '#2a2a3e' : '#f0f0f0')
          const buzz = liveBuzz[stock.ticker] || (buzzByTicker && buzzByTicker[stock.ticker])
          const isOpen = openBuzz === stock.ticker

          return (
            <div key={stock.ticker}>
              <div
                onClick={() => buzz && setOpenBuzz(isOpen ? null : stock.ticker)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px',
                  borderBottom: isOpen ? 'none' : `1px solid ${c.border}`,
                  background: isTop3 ? medalBg[i] : (i % 2 === 0 ? c.card : (dark ? '#141428' : '#fafafa')),
                  borderLeft: isTop3 ? `3px solid ${medalBorder[i]}` : '3px solid transparent',
                  cursor: buzz ? 'pointer' : 'default',
                }}
              >
                {/* Rank */}
                <div style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                  {isTop3
                    ? <span style={{ fontSize: 20 }}>{medals[i]}</span>
                    : <span style={{ fontSize: 13, fontWeight: 700, color: c.muted }}>#{i + 1}</span>}
                </div>

                {/* Ticker + name — click to show/hide appearance dates */}
                <div
                  onClick={e => { e.stopPropagation(); setOpenDates(openDates === stock.ticker ? null : stock.ticker) }}
                  style={{ width: 150, flexShrink: 0, cursor: 'pointer' }}
                >
                  <div style={{ fontSize: 15, fontWeight: 800, color: openDates === stock.ticker ? '#097c3e' : c.text, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {stock.ticker}
                    <span style={{ fontSize: 10, color: openDates === stock.ticker ? '#097c3e' : c.muted }}>{openDates === stock.ticker ? '▲' : '▼'}</span>
                  </div>
                  <div style={{ fontSize: 10, color: c.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 145 }}>{stock.name}</div>
                </div>

                {/* Dot timeline — intensity reflects gain magnitude.
                    Shrinks aggressively to keep the row from overflowing into the right-hand stats. */}
                {(() => {
                  const n = totalScans || stock.weekPresence.length
                  let size, gap
                  if      (n <= 8)  { size = 13; gap = 5 }
                  else if (n <= 12) { size = 10; gap = 3 }
                  else if (n <= 18) { size = 8;  gap = 3 }
                  else if (n <= 26) { size = 7;  gap = 2 }
                  else if (n <= 40) { size = 6;  gap = 2 }
                  else              { size = 5;  gap = 1 }
                  return (
                    <div style={{ display: 'flex', gap, alignItems: 'center', flexShrink: 0, maxWidth: 220, overflow: 'hidden' }}>
                      {stock.weekPresence.map((gain, wi) => (
                        <div key={wi} title={gain !== null ? `${weekLabels[wi]}: +${gain.toFixed(1)}%` : weekLabels[wi]} style={{
                          width: size, height: size, borderRadius: '50%', flexShrink: 0,
                          ...dotStyle(gain),
                        }} />
                      ))}
                    </div>
                  )
                })()}

                {/* Appearance badge */}
                <span style={{ background: badgeBg, color: badgeColor, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {stock.appearances}/{totalScans}
                </span>

                {/* Trend arrow */}
                <TrendBadge trend={stock.trend} />

                {/* Stats */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, alignItems: 'center' }}>
                  <div style={{ textAlign: 'center', minWidth: 55 }}>
                    <div style={{ fontSize: 10, color: c.muted, marginBottom: 2 }}>{lang === 'he' ? 'ממוצע' : 'Avg'}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#097c3e' }}>+{stock.avgGain}%</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 55 }}>
                    <div style={{ fontSize: 10, color: c.muted, marginBottom: 2 }}>{lang === 'he' ? 'שיא' : 'Best'}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#097c3e' }}>+{Math.round(stock.bestGain * 10) / 10}%</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 55 }}>
                    <div style={{ fontSize: 10, color: c.muted, marginBottom: 2 }}>{lang === 'he' ? 'שווי שוק' : 'Mkt Cap'}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.muted }}>{formatMcap(stock.marketCap)}</div>
                  </div>
                  {/* Win Rate */}
                  {(() => {
                    const wr = winRateByTicker && winRateByTicker[stock.ticker]
                    if (!wr || wr.opps === 0) return null
                    const wrColor = wr.pct >= 60 ? '#097c3e' : wr.pct >= 40 ? '#cc8800' : c.muted
                    const wrBg    = wr.pct >= 60 ? (dark ? '#1a3a1a' : '#EAF3DE') : wr.pct >= 40 ? (dark ? '#3a2a0a' : '#FAEEDA') : (dark ? '#2a2a3e' : '#f0f0f0')
                    return (
                      <div style={{ textAlign: 'center' }} title={lang === 'he' ? `ב-${wr.opps} שבועות שהופיעה, ${wr.wins} פעמים עלתה גם השבוע הבא` : `Appeared ${wr.opps} times; rose the following week ${wr.wins} times`}>
                        <div style={{ fontSize: 10, color: c.muted, marginBottom: 2 }}>{lang === 'he' ? 'הצלחה' : 'Win Rate'}</div>
                        <span style={{ background: wrBg, color: wrColor, padding: '3px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>{wr.wins}/{wr.opps} ({wr.pct}%)</span>
                      </div>
                    )
                  })()}
                  {buzz
                    ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: isOpen ? '#097c3e' : (dark ? '#1a2a1a' : '#eaf3de'), border: `1px solid ${isOpen ? '#097c3e' : (dark ? '#2a4a2a' : '#c3e6cb')}` }}>
                        <span style={{ fontSize: 13 }}>🔥</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isOpen ? 'white' : '#097c3e' }}>{buzz.enhanced_score || buzz.score}/10</span>
                        <span style={{ fontSize: 10, color: isOpen ? 'rgba(255,255,255,0.8)' : c.muted }}>{isOpen ? '▲' : '▼'}</span>
                      </div>
                    : (() => {
                        const bState = loadingBuzz[stock.ticker]
                        return (
                          <button
                            onClick={e => { e.stopPropagation(); if (!bState) handleGetBuzz(stock) }}
                            disabled={!!bState}
                            style={{
                              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: bState ? 'default' : 'pointer',
                              border: `1px solid ${bState === 'done' ? '#097c3e' : bState === 'error' ? '#c0392b' : (dark ? '#3a3a5e' : '#ccc')}`,
                              background: bState === 'done' ? (dark ? '#1a3a1a' : '#eaf3de') : (dark ? '#1e1e2e' : '#f8f8f8'),
                              color: bState === 'done' ? '#097c3e' : bState === 'error' ? '#c0392b' : c.muted,
                            }}
                          >
                            {bState === 'done' ? '✓ Done' : bState === 'loading' ? '⏳ ~3 min...' : bState === 'error' || bState === 'timeout' ? '✗ Retry' : '🔥 Get Buzz'}
                          </button>
                        )
                      })()
                  }
                </div>
              </div>

              {/* Buzz expansion panel — enhanced with price signals */}
              {/* Dates panel — shown when clicking on ticker name */}
              {openDates === stock.ticker && (() => {
                const appearances = stock.weekPresence
                  .map((gain, wi) => gain != null ? { label: weekLabels[wi], gain } : null)
                  .filter(Boolean)
                  .reverse() // newest first
                return (
                  <div style={{ background: dark ? '#0e1520' : '#f0f6ff', borderBottom: `1px solid ${c.border}`, borderLeft: `3px solid #1a6bb5`, padding: '14px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1a6bb5', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 12 }}>
                      📅 {lang === 'he' ? `הופעות — ${appearances.length} מתוך ${totalScans} שבועות` : `Appearances — ${appearances.length} of ${totalScans} weeks`}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {appearances.map((a, ai) => (
                        <div key={ai} style={{ background: dark ? '#1a2535' : 'white', border: `1px solid ${dark ? '#2a3a55' : '#c8daef'}`, borderRadius: 8, padding: '7px 12px', minWidth: 130 }}>
                          <div style={{ fontSize: 11, color: c.muted, marginBottom: 3 }}>{a.label}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#097c3e' }}>+{a.gain.toFixed(1)}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {isOpen && buzz && (
                <div style={{ background: dark ? '#0e1a0e' : '#f0f8f0', borderBottom: `1px solid ${c.border}`, borderLeft: `3px solid #097c3e`, padding: '18px 24px' }}>

                  {/* Score header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                    {/* Big score */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginRight: 8 }}>
                      <span style={{ fontSize: 34, fontWeight: 800, color: (buzz.enhanced_score || buzz.score) >= 7 ? '#097c3e' : (buzz.enhanced_score || buzz.score) >= 4 ? '#cc8800' : c.muted }}>
                        {buzz.enhanced_score || buzz.score}
                      </span>
                      <span style={{ fontSize: 14, color: c.muted }}>/10</span>
                      <span style={{ fontSize: 11, color: c.muted, marginLeft: 4 }}>{lang === 'he' ? 'ציון כולל' : 'total score'}</span>
                    </div>

                    {/* Volume spike */}
                    {buzz.volume_spike_pct != null && (() => {
                      const hot = buzz.volume_spike_pct >= 150
                      return (
                        <span title={lang === 'he' ? 'נפח מסחר השבוע vs ממוצע 4 שבועות — עלייה חריגה = משהו קורה' : 'This week avg volume vs 4-week avg — spike means unusual activity'} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: hot ? (dark ? '#1a3a1a' : '#eaf3de') : (dark ? '#2a2a3e' : '#f0f0f0'), color: hot ? '#097c3e' : c.muted }}>
                          📊 Vol {buzz.volume_spike_pct >= 0 ? '+' : ''}{buzz.volume_spike_pct}%
                        </span>
                      )
                    })()}

                    {/* 52-week position */}
                    {buzz.week_high_pct != null && (() => {
                      const hot = buzz.week_high_pct >= 90
                      return (
                        <span title={lang === 'he' ? `מחיר נוכחי = ${buzz.week_high_pct}% מהשיא השנתי. מעל 90% = מומנטום חזק` : `Current price is ${buzz.week_high_pct}% of the 52-week high. Above 90% = strong momentum`} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: hot ? (dark ? '#1a3a1a' : '#eaf3de') : (dark ? '#2a2a3e' : '#f0f0f0'), color: hot ? '#097c3e' : c.muted }}>
                          📍 {buzz.week_high_pct}% of 52w high
                        </span>
                      )
                    })()}

                    {/* Short interest */}
                    {buzz.short_interest_pct != null && (() => {
                      const danger = buzz.short_interest_pct >= 15
                      return (
                        <span title={lang === 'he' ? `${buzz.short_interest_pct}% מהפלואט ששורט. מעל 15% + עלייה = פוטנציאל שורט סקוויז` : `${buzz.short_interest_pct}% of float is shorted. Above 15% while rising = short squeeze potential`} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: danger ? (dark ? '#3a1a1a' : '#fff0f0') : (dark ? '#2a2a3e' : '#f0f0f0'), color: danger ? '#c0392b' : c.muted }}>
                          🩳 Short {buzz.short_interest_pct}%{buzz.short_ratio ? ` · ${buzz.short_ratio}d` : ''}
                        </span>
                      )
                    })()}

                    {/* Google Trends */}
                    {buzz.google_trend_score != null && (() => {
                      const hot = buzz.google_trend_score >= 60
                      const arrow = buzz.google_trend_direction === 'rising' ? ' ↗' : buzz.google_trend_direction === 'falling' ? ' ↘' : ''
                      return (
                        <span title={lang === 'he' ? `עניין בגוגל: ${buzz.google_trend_score}/100. מעל 60 = אנשים מתחילים לחפש — אות מוקדם לפני שהחדשות יוצאות` : `Google search interest: ${buzz.google_trend_score}/100. Above 60 = retail interest building — often an early signal`} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: hot ? (dark ? '#1a2a3a' : '#e8f4ff') : (dark ? '#2a2a3e' : '#f0f0f0'), color: hot ? '#1a6bb5' : c.muted }}>
                          🔍 Trends {buzz.google_trend_score}/100{arrow}
                        </span>
                      )
                    })()}

                    {/* News */}
                    {buzz.news_count > 0 && (() => {
                      const hot = buzz.news_bullish_pct >= 65
                      return (
                        <span title={lang === 'he' ? `${buzz.news_count} כתבות חדשות, ${buzz.news_bullish_pct}% חיוביות לפי ניתוח כותרות` : `${buzz.news_count} recent news articles, ${buzz.news_bullish_pct}% bullish by headline sentiment`} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: hot ? (dark ? '#1a3a1a' : '#eaf3de') : (dark ? '#2a2a3e' : '#f0f0f0'), color: hot ? '#097c3e' : c.muted }}>
                          🗞️ {buzz.news_count} {lang === 'he' ? 'כתבות' : 'news'} · {buzz.news_bullish_pct}% bull
                        </span>
                      )
                    })()}

                    {/* Insider purchases */}
                    {buzz.insider_purchases > 0 && (() => {
                      const val = buzz.insider_total_value || 0
                      const valStr = val >= 1_000_000 ? `$${(val/1_000_000).toFixed(1)}M` : val >= 1_000 ? `$${Math.round(val/1_000)}K` : `$${val}`
                      return (
                        <span title={lang === 'he' ? `${buzz.insider_purchases} רכישות פנימיות ב-60 יום האחרונים. מנהלים קנו ${valStr} ממניות החברה שלהם — אחד האותות החזקים ביותר` : `${buzz.insider_purchases} insider purchases in last 60 days. Executives bought ${valStr} of their own stock — one of the strongest signals`} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: dark ? '#2a1a3a' : '#f5eeff', color: '#7c3aed' }}>
                          🏦 {buzz.insider_purchases}x insider buy · {valStr}
                        </span>
                      )
                    })()}

                    {/* Analyst consensus */}
                    {buzz.analyst_target && (() => {
                      const upside = buzz.analyst_upside_pct || 0
                      const rec = buzz.analyst_recommendation || ''
                      const isBull = rec === 'strong_buy' || rec === 'buy'
                      const recLabel = rec === 'strong_buy' ? 'Strong Buy' : rec === 'buy' ? 'Buy' : rec === 'hold' ? 'Hold' : rec === 'sell' ? 'Sell' : rec
                      const upsideColor = upside >= 15 ? '#097c3e' : upside >= 0 ? '#cc8800' : '#c0392b'
                      return (
                        <span title={lang === 'he' ? `קונצנזוס אנליסטים: ${recLabel} | יעד: $${buzz.analyst_target} | ${buzz.analyst_count || '?'} אנליסטים` : `Analyst consensus: ${recLabel} | Target: $${buzz.analyst_target} | ${buzz.analyst_count || '?'} analysts`} style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: isBull ? (dark ? '#1a2a3a' : '#e8f4ff') : (dark ? '#2a2a3e' : '#f0f0f0'), color: isBull ? '#1a6bb5' : c.muted }}>
                          🎯 ${buzz.analyst_target} <span style={{ color: upsideColor }}>({upside >= 0 ? '+' : ''}{upside}%)</span>{recLabel ? ` · ${recLabel}` : ''}
                        </span>
                      )
                    })()}

                    {/* Sparkline in buzz panel header */}
                    <div style={{ marginLeft: 'auto' }}>
                      <Sparkline ticker={openBuzz} width={120} height={36} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {/* Sentiment bars */}
                    <div style={{ minWidth: 200 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>{lang === 'he' ? 'סנטימנט סושיאל' : 'Social sentiment'}</div>
                      {[
                        { label: lang === 'he' ? 'רדיט' : 'Reddit', pct: buzz.reddit_bullish_pct, count: buzz.reddit_count },
                        { label: 'StockTwits', pct: buzz.stocktwits_bullish_pct, count: buzz.stocktwits_count },
                        ...(buzz.news_count > 0 ? [{ label: lang === 'he' ? 'חדשות' : 'News', pct: buzz.news_bullish_pct, count: buzz.news_count }] : []),
                      ].map(row => (
                        <div key={row.label} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: c.muted, marginBottom: 4 }}>
                            <span>{row.label} ({row.count})</span>
                            <span style={{ color: row.pct >= 50 ? '#097c3e' : '#c0392b', fontWeight: 700 }}>{row.pct}% bullish</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 3, background: dark ? '#2a2a3e' : '#e0e0e0', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${row.pct}%`, background: row.pct >= 50 ? '#097c3e' : '#c0392b', borderRadius: 3 }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Quotes */}
                    {buzz.quotes && buzz.quotes.length > 0 && (
                      <div style={{ flex: 1, minWidth: 260 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>{lang === 'he' ? 'ציטוטים' : 'Top mentions'}</div>
                        {buzz.quotes.slice(0, 3).map((q, qi) => (
                          <div key={qi} style={{ background: dark ? '#1a2a1a' : 'white', border: `1px solid ${dark ? '#2a3a2a' : '#d4edda'}`, borderRadius: 8, padding: '9px 13px', marginBottom: 7 }}>
                            <div style={{ fontSize: 12, color: c.text, lineHeight: 1.5 }}>"{q.text}"</div>
                            <div style={{ fontSize: 10, color: c.muted, marginTop: 5 }}>
                              <span style={{ background: q.source === 'reddit' ? '#ff4500' : '#1da1f2', color: 'white', padding: '1px 6px', borderRadius: 4, marginRight: 6, fontSize: 9 }}>{q.source}</span>
                              {q.sentiment === 'bullish' ? '🟢' : q.sentiment === 'bearish' ? '🔴' : '⚪'} {q.sentiment}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* News headlines */}
                    {buzz.news_headlines && buzz.news_headlines.length > 0 && (
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>{lang === 'he' ? 'כותרות אחרונות' : 'Latest headlines'}</div>
                        {buzz.news_headlines.map((h, hi) => (
                          <div key={hi} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: hi < buzz.news_headlines.length - 1 ? `1px solid ${dark ? '#2a3a2a' : '#d4edda'}` : 'none' }}>
                            <div style={{ fontSize: 12, color: c.text, lineHeight: 1.4 }}>{h.text}</div>
                            <div style={{ fontSize: 10, color: c.muted, marginTop: 4 }}>
                              {h.sentiment === 'bullish' ? '🟢' : h.sentiment === 'bearish' ? '🔴' : '⚪'} {h.publisher}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Insider purchases — full-width row, shown only when present */}
                  {buzz.insider_recent && buzz.insider_recent.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${dark ? '#2a3a2a' : '#c8e6c9'}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
                        🏦 {lang === 'he' ? 'רכישות פנימיות (60 יום אחרונים) — נתוני SEC' : 'Insider purchases (last 60 days) — SEC Form 4'}
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {buzz.insider_recent.map((p, pi) => {
                          const val = p.value || 0
                          const valStr = val >= 1_000_000 ? `$${(val/1_000_000).toFixed(1)}M` : val >= 1_000 ? `$${Math.round(val/1_000)}K` : val > 0 ? `$${val}` : '—'
                          const isExec = ['CEO','CFO','PRESIDENT','COO','CHAIRMAN'].some(t => (p.title||'').toUpperCase().includes(t))
                          return (
                            <div key={pi} style={{ background: dark ? '#1e1230' : 'white', border: `1px solid ${isExec ? '#7c3aed' : (dark ? '#3a2a5a' : '#ddd6fe')}`, borderRadius: 8, padding: '9px 13px', minWidth: 180, flex: '1 1 180px' }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: c.text }}>{p.name}</div>
                              <div style={{ fontSize: 11, color: isExec ? '#7c3aed' : c.muted, marginTop: 2 }}>{p.title}</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: '#7c3aed', marginTop: 6 }}>{valStr}</div>
                              <div style={{ fontSize: 10, color: c.muted, marginTop: 2 }}>{p.date}</div>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ fontSize: 10, color: c.muted, marginTop: 8 }}>
                        {lang === 'he'
                          ? '* מנהל שקנה מניות של החברה שלו = אחד האותות החזקים ביותר בשוק. מידע מבוסס SEC.'
                          : '* Executives buying their own stock = one of the strongest signals in investing. Source: SEC.'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const priceCache = {}

function usePriceHistory(ticker) {
  const [data, setData] = useState(priceCache[ticker] || null)
  useEffect(() => {
    if (priceCache[ticker]) { setData(priceCache[ticker]); return }
    fetch(`/api/price-history?ticker=${encodeURIComponent(ticker)}`)
      .then(r => r.json())
      .then(d => { priceCache[ticker] = d; setData(d) })
      .catch(() => setData({ closes: [], volumes: [] }))
  }, [ticker])
  return data
}

function Sparkline({ ticker, width = 80, height = 26 }) {
  const data = usePriceHistory(ticker)
  const closes = data?.closes || []

  if (!data) return <div style={{ width, height: 8, borderRadius: 3, background: '#e0e0e0', opacity: 0.35, marginTop: 5 }} />
  if (closes.length < 2) return null

  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = max - min || 1
  const pad = 2
  const pts = closes.map((v, i) => {
    const x = (i / (closes.length - 1)) * width
    const y = (height - pad) - ((v - min) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const isUp = closes[closes.length - 1] >= closes[0]
  const color = isUp ? '#097c3e' : '#e03131'
  return (
    <svg width={width} height={height} style={{ display: 'block', marginTop: 4 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function VolSpike({ ticker, dark, c }) {
  const data = usePriceHistory(ticker)
  const volumes = data?.volumes || []

  if (!data) return <span style={{ fontSize: 11, color: c.muted }}>—</span>
  if (volumes.length < 10) return <span style={{ fontSize: 11, color: c.muted }}>—</span>

  const recent  = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5
  const baseline = volumes.slice(0, -5).reduce((a, b) => a + b, 0) / (volumes.length - 5)
  const spike = baseline > 0 ? Math.round((recent / baseline - 1) * 100) : 0

  const hot  = spike >= 150
  const warm = spike >= 50
  const bg    = hot ? (dark ? '#1a3a1a' : '#EAF3DE') : warm ? (dark ? '#3a2a0a' : '#FAEEDA') : (dark ? '#2a2a3e' : '#f0f0f0')
  const color = hot ? '#097c3e' : warm ? '#cc8800' : c.muted
  const icon  = hot ? '🔥' : warm ? '📊' : '📉'

  return (
    <span
      title="Last 5 trading days vs prior 25-day baseline"
      style={{ background: bg, color, padding: '3px 9px', borderRadius: 12, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.1 }}>
      <span>{icon} {spike >= 0 ? '+' : ''}{spike}% vol</span>
      <span style={{ fontSize: 8, fontWeight: 500, opacity: 0.75, marginTop: 1 }}>5d vs 25d</span>
    </span>
  )
}

// ── RSI ──────────────────────────────────────────────────────────
function calculateRSI(closes) {
  if (!closes || closes.length < 15) return null
  const changes = closes.slice(1).map((v, i) => v - closes[i])
  let avgGain = 0, avgLoss = 0
  for (let i = 0; i < 14; i++) {
    if (changes[i] > 0) avgGain += changes[i]; else avgLoss += Math.abs(changes[i])
  }
  avgGain /= 14; avgLoss /= 14
  for (let i = 14; i < changes.length; i++) {
    avgGain = (avgGain * 13 + Math.max(0, changes[i])) / 14
    avgLoss = (avgLoss * 13 + Math.max(0, -changes[i])) / 14
  }
  if (avgLoss === 0) return 100
  return Math.round(100 - 100 / (1 + avgGain / avgLoss))
}

function RSIBadge({ ticker, dark, c, size = 'small' }) {
  const data = usePriceHistory(ticker)
  const rsi = calculateRSI(data?.closes)
  if (rsi === null) return null
  const overbought = rsi >= 70, oversold = rsi <= 30
  const color = overbought ? '#c0392b' : oversold ? '#097c3e' : c.muted
  const bg    = overbought ? (dark ? '#3a1a1a' : '#FCEBEB') : oversold ? (dark ? '#1a3a1a' : '#EAF3DE') : (dark ? '#2a2a3e' : '#f0f0f0')
  const icon  = overbought ? ' 🔴' : oversold ? ' 🟢' : ''
  return (
    <span title={overbought ? 'RSI ≥ 70 — possibly overbought' : oversold ? 'RSI ≤ 30 — possibly oversold' : 'RSI neutral'}
      style={{ background: bg, color, padding: size === 'large' ? '4px 10px' : '2px 7px', borderRadius: 10, fontSize: size === 'large' ? 12 : 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
      RSI {rsi}{icon}
    </span>
  )
}

// ── SECTOR HEATMAP ────────────────────────────────────────────────
const SECTOR_ICONS = {
  'Technology': '💻', 'Healthcare': '🏥', 'Energy': '🔋', 'Financial Services': '🏦',
  'Consumer Cyclical': '🛍️', 'Communication Services': '📡', 'Industrials': '🏭',
  'Basic Materials': '⛏️', 'Real Estate': '🏢', 'Utilities': '⚡', 'Consumer Defensive': '🛒',
  'Biotechnology': '🧬',
}

function SectorHeatmap({ stocks, c, dark, sectorFilter, setSectorFilter, lang }) {
  const counts = {}
  for (const s of stocks) {
    if (s.sector) counts[s.sector] = (counts[s.sector] || 0) + 1
  }
  const sectors = Object.entries(counts).sort((a, b) => b[1] - a[1])
  if (!sectors.length) return null
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: '14px 20px', marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
        🗺️ {lang === 'he' ? 'פיזור סקטורים — השבוע' : 'Sector Rotation — This Week'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {sectorFilter && (
          <button onClick={() => setSectorFilter(null)} style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${c.border}`, background: c.chipBg, color: c.muted, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
            ✕ {lang === 'he' ? 'נקה' : 'Clear'}
          </button>
        )}
        {sectors.map(([sec, cnt]) => {
          const icon = SECTOR_ICONS[sec] || '📦'
          const active = sectorFilter === sec
          return (
            <button key={sec} onClick={() => setSectorFilter(active ? null : sec)} style={{
              padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              border: `1px solid ${active ? '#097c3e' : c.border}`,
              background: active ? '#097c3e' : c.chipBg,
              color: active ? 'white' : c.text,
            }}>
              {icon} {sec} ({cnt})
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── TRADING JOURNAL ──────────────────────────────────────────────
// Single row in the journal — fetches current price and computes P&L.
function JournalRow({ trade, removeTrade, c, dark, lang, isOpen, onToggle }) {
  const he = lang === 'he'
  const data = usePriceHistory(trade.ticker)
  const closes = data?.closes || []
  const current = data?.current ?? (closes.length ? closes[closes.length - 1] : null)

  const costBasis = trade.quantity * trade.entry_price
  const currentValue = current != null ? trade.quantity * current : null
  const pnlDollars  = currentValue != null ? currentValue - costBasis : null
  const pnlPct      = current != null ? (current - trade.entry_price) / trade.entry_price * 100 : null
  const isProfit = (pnlPct ?? 0) >= 0
  const GREEN = '#00c853', RED = '#ff3b30'   // vivid, bold
  const pnlColor = pnlPct == null ? c.muted : isProfit ? GREEN : RED

  const daysHeld = (() => {
    if (!trade.entry_date) return null
    const d = new Date(trade.entry_date)
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))
  })()

  return (
    <tr onClick={onToggle} title={lang === 'he' ? 'לחץ לכרטיס זהות מלא' : 'Click for full identity card'}
      style={{ borderBottom: `1px solid ${c.border}`, background: isOpen ? c.rowHover : c.card, cursor: 'pointer' }}
      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = c.rowHover }}
      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = c.card }}>
      {/* Ticker */}
      <td style={{ padding: '12px 14px' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: c.text, display: 'flex', alignItems: 'center', gap: 6 }}>
          {trade.ticker}
          <span style={{ fontSize: 11, color: c.muted }}>{isOpen ? '▲' : '▼'}</span>
        </div>
        <div style={{ fontSize: 10, color: c.muted, marginTop: 1, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trade.name}</div>
        <Sparkline ticker={trade.ticker} width={70} height={18} />
      </td>
      {/* Quantity */}
      <td style={{ padding: '12px 14px', fontSize: 14, color: c.text, fontWeight: 600 }}>{trade.quantity}</td>
      {/* Entry price */}
      <td style={{ padding: '12px 14px', fontSize: 13, color: c.text }}>${trade.entry_price.toFixed(2)}</td>
      {/* Current price */}
      <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, color: c.text }}>
        {current != null ? `$${current.toFixed(2)}` : (data ? '—' : '⏳')}
      </td>
      {/* Cost basis */}
      <td style={{ padding: '12px 14px', fontSize: 13, color: c.muted }}>
        ${costBasis.toFixed(2)}
      </td>
      {/* Current value */}
      <td style={{ padding: '12px 14px', fontSize: 13, color: c.text, fontWeight: 600 }}>
        {currentValue != null ? `$${currentValue.toFixed(2)}` : '—'}
      </td>
      {/* $ P&L */}
      <td style={{ padding: '12px 14px' }}>
        {pnlDollars != null ? (
          <span style={{ fontWeight: 800, fontSize: 15, color: pnlColor }}>
            {pnlDollars >= 0 ? '+' : ''}${pnlDollars.toFixed(2)}
          </span>
        ) : <span style={{ color: c.muted }}>—</span>}
      </td>
      {/* % P&L */}
      <td style={{ padding: '12px 14px' }}>
        {pnlPct != null ? (
          <span style={{
            background: isProfit ? GREEN : RED,
            color: 'white', padding: '5px 12px', borderRadius: 10,
            fontWeight: 800, fontSize: 14,
            display: 'inline-block',
            boxShadow: `0 0 10px ${isProfit ? GREEN : RED}55`,
          }}>
            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
          </span>
        ) : <span style={{ color: c.muted }}>—</span>}
      </td>
      {/* Days held */}
      <td style={{ padding: '12px 14px', fontSize: 11, color: c.muted, whiteSpace: 'nowrap' }}>
        {daysHeld != null ? `${daysHeld}d` : '—'}
        <div style={{ fontSize: 9, color: c.muted, marginTop: 1 }}>{trade.entry_date}</div>
      </td>
      {/* Remove */}
      <td style={{ padding: '12px 14px' }}>
        <button onClick={(e) => {
          e.stopPropagation()
          if (confirm(he ? `למחוק את העסקה ב-${trade.ticker}?` : `Delete ${trade.ticker} trade?`)) {
            removeTrade(trade.id)
          }
        }} title={he ? 'מחק' : 'Remove'}
          style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: c.muted, fontSize: 16, cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.color = '#c0392b'}
          onMouseLeave={e => e.currentTarget.style.color = c.muted}>
          ✕
        </button>
      </td>
    </tr>
  )
}

// Hook: feed it the journal and it returns aggregate totals based on
// each trade's current price. Updates as prices stream in.
function useJournalTotals(journal) {
  // We need to read current prices from usePriceHistory — done in rows.
  // For the totals card, we re-read them here using the same hook so the
  // numbers update in real time as the rows resolve.
  let totalCost = 0
  let totalCurrent = 0
  let resolvedCount = 0
  for (const t of journal) {
    totalCost += t.quantity * t.entry_price
    // We can't call hooks in a loop, so totals shown here are based on
    // entry only. The per-row current value is rendered separately.
  }
  return { totalCost }
}

function TradingJournal({ journal, addTrade, removeTrade, weeklyHistoryByTicker = {}, c, dark, lang }) {
  const he = lang === 'he'
  const [form, setForm] = useState({ ticker: '', quantity: '', entry_price: '' })
  const [showForm, setShowForm] = useState(false)
  const [openTrade, setOpenTrade] = useState(null)

  // Calculate totals reactively from journal entries + live prices
  // Each row's price comes from usePriceHistory cache; aggregate via a helper component
  const [livePrices, setLivePrices] = useState({})

  const totalCost = journal.reduce((sum, t) => sum + t.quantity * t.entry_price, 0)
  const totalCurrent = journal.reduce((sum, t) => {
    const p = livePrices[t.ticker]
    return sum + (p != null ? t.quantity * p : t.quantity * t.entry_price)
  }, 0)
  const totalPnL = totalCurrent - totalCost
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0
  const profitColor = totalPnL >= 0 ? '#00c853' : '#ff3b30'
  const profitBg    = totalPnL >= 0 ? (dark ? '#0d3320' : '#dcf5e6') : (dark ? '#3a1010' : '#ffe0de')

  function handleSubmit(e) {
    e.preventDefault()
    if (addTrade(form)) {
      setForm({ ticker: '', quantity: '', entry_price: '' })
      setShowForm(false)
    }
  }

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${dark ? '#0d1830' : '#1a1a2e'} 0%, ${dark ? '#1a2855' : '#2d3561'} 100%)`,
        borderRadius: '14px 14px 0 0', padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 30 }}>📓</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-.02em' }}>
              {he ? 'יומן מסחר' : 'Trading Journal'}
            </div>
            <div style={{ fontSize: 13, color: '#b0bbd9', marginTop: 4 }}>
              {he
                ? 'הזן עסקאות שאתה נכנס אליהן — המערכת תעקוב אחרי המחיר העדכני ותחשב רווח/הפסד'
                : 'Enter trades you take — the system tracks live prices and computes P&L'}
            </div>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              background: showForm ? '#cc4444' : '#00c853',
              color: 'white', border: 'none', borderRadius: 10,
              padding: '10px 18px', fontWeight: 800, fontSize: 14,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {showForm ? (he ? '✕ ביטול' : '✕ Cancel') : (he ? '➕ הוסף עסקה' : '➕ Add Trade')}
          </button>
        </div>

        {/* Add trade form */}
        {showForm && (
          <form onSubmit={handleSubmit} style={{
            marginTop: 16, padding: 16,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
          }}>
            <div style={{ flex: '0 0 130px' }}>
              <div style={{ fontSize: 11, color: '#b0bbd9', fontWeight: 700, marginBottom: 4 }}>
                {he ? 'טיקר' : 'Ticker'}
              </div>
              <input autoFocus required type="text" value={form.ticker}
                onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                placeholder="NVDA"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.95)', color: '#1a1a2e', fontWeight: 800, fontSize: 14 }} />
            </div>
            <div style={{ flex: '0 0 100px' }}>
              <div style={{ fontSize: 11, color: '#b0bbd9', fontWeight: 700, marginBottom: 4 }}>
                {he ? 'יחידות' : 'Quantity'}
              </div>
              <input required type="number" step="any" min="0.0001" value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })}
                placeholder="100"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.95)', color: '#1a1a2e', fontWeight: 700, fontSize: 14 }} />
            </div>
            <div style={{ flex: '0 0 130px' }}>
              <div style={{ fontSize: 11, color: '#b0bbd9', fontWeight: 700, marginBottom: 4 }}>
                {he ? 'מחיר כניסה $' : 'Entry Price $'}
              </div>
              <input required type="number" step="0.01" min="0.01" value={form.entry_price}
                onChange={e => setForm({ ...form, entry_price: e.target.value })}
                placeholder="145.50"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.95)', color: '#1a1a2e', fontWeight: 700, fontSize: 14 }} />
            </div>
            <button type="submit" style={{
              padding: '9px 22px', borderRadius: 8, border: 'none',
              background: '#00c853', color: 'white', fontWeight: 800, fontSize: 14,
              cursor: 'pointer',
            }}>
              {he ? '✓ שמור' : '✓ Save'}
            </button>
          </form>
        )}
      </div>

      {/* Summary stats */}
      {journal.length > 0 && (
        <div style={{
          background: c.card, borderLeft: `1px solid ${c.border}`, borderRight: `1px solid ${c.border}`,
          padding: '18px 24px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12,
        }}>
          <SummaryCard label={he ? 'עלות כניסה' : 'Cost Basis'} value={`$${totalCost.toFixed(2)}`} c={c} />
          <SummaryCard label={he ? 'שווי נוכחי' : 'Current Value'} value={`$${totalCurrent.toFixed(2)}`} c={c} />
          <SummaryCard
            label={he ? 'רווח/הפסד ($)' : 'Total P&L ($)'}
            value={`${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`}
            color={profitColor} bg={profitBg} c={c} />
          <SummaryCard
            label={he ? 'רווח/הפסד (%)' : 'Total P&L (%)'}
            value={`${totalPnLPct >= 0 ? '+' : ''}${totalPnLPct.toFixed(2)}%`}
            color={profitColor} bg={profitBg} c={c} />
          <SummaryCard label={he ? 'פוזיציות פתוחות' : 'Open Positions'} value={journal.length} c={c} />
        </div>
      )}

      {/* Trades table */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderTop: journal.length > 0 ? 'none' : `1px solid ${c.border}`, borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
        {journal.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: c.muted }}>
            <div style={{ fontSize: 48, marginBottom: 14, opacity: 0.6 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: c.text, marginBottom: 8 }}>
              {he ? 'אין עסקאות עדיין' : 'No trades yet'}
            </div>
            <div style={{ fontSize: 13 }}>
              {he ? 'לחץ "הוסף עסקה" למעלה כדי להתחיל לעקוב' : 'Click "Add Trade" above to start tracking'}
            </div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: c.thead }}>
                {[
                  he ? 'מנייה'         : 'Stock',
                  he ? 'יחידות'        : 'Qty',
                  he ? 'מחיר כניסה'    : 'Entry $',
                  he ? 'מחיר נוכחי'    : 'Current $',
                  he ? 'עלות'          : 'Cost Basis',
                  he ? 'שווי נוכחי'    : 'Value',
                  he ? 'P&L $'         : 'P&L $',
                  he ? 'P&L %'         : 'P&L %',
                  he ? 'ימים'          : 'Days',
                  '',
                ].map((h, i) => (
                  <th key={i} style={{
                    padding: '11px 14px', textAlign: 'left', fontSize: 10,
                    color: c.muted, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '.05em', borderBottom: `1px solid ${c.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {journal.map(trade => (
                <Fragment key={trade.id}>
                  <JournalRow trade={trade} removeTrade={removeTrade}
                    c={c} dark={dark} lang={lang}
                    isOpen={openTrade === trade.id}
                    onToggle={() => setOpenTrade(openTrade === trade.id ? null : trade.id)}
                  />
                  {openTrade === trade.id && (
                    <tr>
                      <td colSpan={10} style={{ padding: 0, borderBottom: `1px solid ${c.border}` }}>
                        <StockDeepDive ticker={trade.ticker} weeklyHistory={weeklyHistoryByTicker[trade.ticker]} c={c} dark={dark} lang={lang} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Live-price sync: invisible hooks that update totals when prices stream in */}
      <PriceSyncHelper journal={journal} onUpdate={setLivePrices} />
    </div>
  )
}

// Helper card for the summary row
function SummaryCard({ label, value, color, bg, c }) {
  return (
    <div style={{
      background: bg || c.card,
      border: `1px solid ${c.border}`,
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: color || c.text }}>{value}</div>
    </div>
  )
}

// Invisible helper that fetches live prices for each ticker in the journal
// and surfaces them up to the parent for the totals summary. Renders nothing.
function PriceSyncHelper({ journal, onUpdate }) {
  return (
    <div style={{ display: 'none' }}>
      {journal.map(t => <PriceSyncPoint key={t.id} ticker={t.ticker} onResolve={onUpdate} />)}
    </div>
  )
}
function PriceSyncPoint({ ticker, onResolve }) {
  const data = usePriceHistory(ticker)
  const closes = data?.closes || []
  const current = data?.current ?? (closes.length ? closes[closes.length - 1] : null)
  useEffect(() => {
    if (current != null) onResolve(prev => ({ ...prev, [ticker]: current }))
  }, [current, ticker])
  return null
}

// ──────────────────────────────────────────────────────────────────
// The Trend — the centerpiece tab.
// Top 10 stocks by compound return across all our scans, with full
// identity card (52W range, analyst targets, business summary, weekly
// trend visualization). Built to be the most professional tab — this
// is where the boss decides what to look at deeply.
// ──────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// Floating AI Analyst — "the brain". A chat bubble (bottom-right) on every
// tab. Reads ALL our data (weekly scan, The Trend, the Radar, track record,
// recurring stocks) and helps find the next multi-bagger early. /api/chat.
// ──────────────────────────────────────────────────────────────────
// ── Lightweight Markdown renderer — turns the AI's markdown into clean,
// professional formatted output (headers, bold, lists, tables, rules). ──
function mdInline(s, c) {
  // **bold**, `code`
  const out = []
  // Auto-color percentages (+12% green, -8% red) inside any text fragment —
  // the Wall-Street touch that makes numbers pop.
  const colorPct = (str, keyBase) => {
    const parts = []
    const pctRe = /([+\-]?\d[\d,]*\.?\d*\s?%|\$\d[\d,]*\.?\d*[BMK]?)/g
    let lastP = 0, mm, k = 0
    while ((mm = pctRe.exec(str)) !== null) {
      if (mm.index > lastP) parts.push(str.slice(lastP, mm.index))
      const tok = mm[0]
      const isNeg = /^-/.test(tok.trim())
      const isPos = /^\+/.test(tok.trim())
      const col = isNeg ? '#e5484d' : isPos ? '#1fab54' : null
      parts.push(col
        ? <span key={`${keyBase}-${k++}`} style={{ color: col, fontWeight: 700 }}>{tok}</span>
        : tok)
      lastP = mm.index + tok.length
    }
    if (lastP < str.length) parts.push(str.slice(lastP))
    return parts
  }

  let last = 0
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g
  let m
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) out.push(...colorPct(s.slice(last, m.index), `t${out.length}`))
    if (m[2] !== undefined) {
      out.push(<strong key={out.length} style={{ fontWeight: 800, color: c.text }}>{colorPct(m[2], `b${out.length}`)}</strong>)
    } else if (m[3] !== undefined) {
      out.push(<code key={out.length} style={{ background: c.chipBg, padding: '1px 5px', borderRadius: 4, fontSize: '0.92em' }}>{m[3]}</code>)
    }
    last = m.index + m[0].length
  }
  if (last < s.length) out.push(...colorPct(s.slice(last), `e${out.length}`))
  return out
}

function Markdown({ text, c, dark, rtl }) {
  if (!text) return null
  const lines = String(text).replace(/\r/g, '').split('\n')
  const blocks = []
  let i = 0
  const accent = '#16a0c5'

  while (i < lines.length) {
    let line = lines[i]

    // blank
    if (!line.trim()) { i++; continue }

    // horizontal rule
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<div key={blocks.length} style={{ height: 1, background: `linear-gradient(90deg, ${accent}55, transparent)`, margin: '16px 0' }} />)
      i++; continue
    }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const lvl = h[1].length
      if (lvl === 1) {
        blocks.push(
          <div key={blocks.length} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 19, fontWeight: 800, color: c.text,
            margin: blocks.length ? '18px 0 10px' : '0 0 10px',
          }}>
            <span style={{ width: 4, alignSelf: 'stretch', minHeight: 22, background: `linear-gradient(${accent}, #1f6ea0)`, borderRadius: 3 }} />
            <span>{mdInline(h[2], c)}</span>
          </div>
        )
      } else if (lvl === 2) {
        blocks.push(
          <div key={blocks.length} style={{
            fontSize: 16, fontWeight: 800, color: accent,
            margin: blocks.length ? '16px 0 8px' : '0 0 8px',
            paddingBottom: 5, borderBottom: `2px solid ${accent}33`,
          }}>{mdInline(h[2], c)}</div>
        )
      } else {
        blocks.push(
          <div key={blocks.length} style={{
            fontSize: 14, fontWeight: 800, color: c.text,
            margin: blocks.length ? '12px 0 5px' : '0 0 5px',
          }}>{mdInline(h[2], c)}</div>
        )
      }
      i++; continue
    }

    // blockquote / callout — > text
    if (/^\s*>\s?/.test(line)) {
      const quote = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, '')); i++
      }
      blocks.push(
        <div key={blocks.length} style={{
          [rtl ? 'borderRight' : 'borderLeft']: `4px solid ${accent}`,
          background: dark ? '#10283340' : '#eef7fb',
          padding: '10px 14px', borderRadius: 8, margin: '10px 0',
          fontSize: 13.5, lineHeight: 1.6, color: c.text,
        }}>
          {quote.map((q, qi) => <div key={qi}>{mdInline(q, c)}</div>)}
        </div>
      )
      continue
    }

    // table — consecutive lines starting with |
    if (/^\s*\|/.test(line)) {
      const tbl = []
      while (i < lines.length && /^\s*\|/.test(lines[i])) { tbl.push(lines[i]); i++ }
      const rows = tbl
        .map(r => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim()))
        .filter(r => !r.every(cell => /^-+$/.test(cell) || cell === ''))  // drop separator row
      if (rows.length) {
        const [head, ...body] = rows
        blocks.push(
          <div key={blocks.length} style={{ overflowX: 'auto', margin: '10px 0', borderRadius: 10, border: `1px solid ${c.border}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{head.map((cell, ci) => (
                <th key={ci} style={{ textAlign: rtl ? 'right' : 'left', padding: '9px 12px', background: dark ? '#10283a' : '#eef4fa', color: accent, fontWeight: 800, fontSize: 11.5, whiteSpace: 'nowrap' }}>{mdInline(cell, c)}</th>
              ))}</tr></thead>
              <tbody>{body.map((r, ri) => (
                <tr key={ri} style={{ background: ri % 2 ? (dark ? '#14142800' : '#fafcff') : (dark ? '#1a1a2e' : '#fff') }}>
                  {r.map((cell, ci) => (
                    <td key={ci} style={{ padding: '9px 12px', color: c.text, verticalAlign: 'top', borderTop: `1px solid ${c.border}` }}>{mdInline(cell, c)}</td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      }
      continue
    }

    // unordered list — custom colored markers
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++
      }
      blocks.push(
        <div key={blocks.length} style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {items.map((it, ii) => (
            <div key={ii} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.6, color: c.text }}>
              <span style={{ color: accent, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>{rtl ? '◂' : '▸'}</span>
              <span>{mdInline(it, c)}</span>
            </div>
          ))}
        </div>
      )
      continue
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++
      }
      blocks.push(
        <ol key={blocks.length} style={{ margin: '6px 0', paddingInlineStart: 22 }}>
          {items.map((it, ii) => (
            <li key={ii} style={{ fontSize: 13.5, lineHeight: 1.6, color: c.text, marginBottom: 3 }}>{mdInline(it, c)}</li>
          ))}
        </ol>
      )
      continue
    }

    // paragraph (gather consecutive plain lines)
    const para = []
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,4}\s|[-*]\s|\d+\.\s|\||>\s?|---+\s*$)/.test(lines[i])) {
      para.push(lines[i]); i++
    }
    blocks.push(
      <p key={blocks.length} style={{ fontSize: 13.5, lineHeight: 1.65, color: c.text, margin: '6px 0' }}>
        {para.map((pl, pi) => (
          <span key={pi}>{mdInline(pl, c)}{pi < para.length - 1 ? <br /> : null}</span>
        ))}
      </p>
    )
  }

  return <div style={{ direction: rtl ? 'rtl' : 'ltr', textAlign: rtl ? 'right' : 'left' }}>{blocks}</div>
}

// ── Live TradingView chart — embeds the full interactive candlestick chart
// (with moving averages, volume, drawing tools) right inside the card. ──
function TradingViewChart({ symbol, dark, height = 440 }) {
  const idRef = useRef('tv_' + Math.random().toString(36).slice(2, 9))
  useEffect(() => {
    let cancelled = false
    function init() {
      if (cancelled || !window.TradingView) return
      const el = document.getElementById(idRef.current)
      if (!el) return
      el.innerHTML = ''
      try {
        const UP = '#e3c000'    // yellow up candle
        const DOWN = '#e02d2d'  // red down candle
        new window.TradingView.widget({
          autosize: true,
          symbol: symbol,
          interval: 'D',               // daily (matches your chart); switch to W in toolbar anytime
          timezone: 'Etc/UTC',
          theme: dark ? 'dark' : 'light',
          style: '1',                  // candles
          locale: 'en',
          allow_symbol_change: true,
          hide_side_toolbar: false,
          // Your personal setup: yellow/red candles + 4 SMAs + pivots + volume pane
          studies: [
            { id: 'Volume@tv-basicstudies' },   // volume in its OWN pane below
            { id: 'MASimple@tv-basicstudies', inputs: { length: 20 } },
            { id: 'MASimple@tv-basicstudies', inputs: { length: 50 } },
            { id: 'MASimple@tv-basicstudies', inputs: { length: 150 } },
            { id: 'MASimple@tv-basicstudies', inputs: { length: 200 } },
            { id: 'PivotPointsHighLow@tv-basicstudies' },   // default 10/10 — works; custom length breaks the free embed
          ],
          overrides: {
            'mainSeriesProperties.candleStyle.upColor': UP,
            'mainSeriesProperties.candleStyle.downColor': DOWN,
            'mainSeriesProperties.candleStyle.borderUpColor': UP,
            'mainSeriesProperties.candleStyle.borderDownColor': DOWN,
            'mainSeriesProperties.candleStyle.wickUpColor': UP,
            'mainSeriesProperties.candleStyle.wickDownColor': DOWN,
            'mainSeriesProperties.showVolume': false,   // hide the overlaid volume so it lives in its own pane
          },
          studies_overrides: {
            // color.0 = Growing (up candle), color.1 = Falling (down candle)
            'volume.volume.color.0': UP,     // up candle = yellow volume
            'volume.volume.color.1': DOWN,   // down candle = red volume
            'volume.volume.transparency': 30,
          },
          container_id: idRef.current,
        })
      } catch {}
    }
    function ensure() {
      if (window.TradingView) return init()
      let s = document.getElementById('tv-js')
      if (!s) {
        s = document.createElement('script')
        s.id = 'tv-js'
        s.src = 'https://s3.tradingview.com/tv.js'
        s.async = true
        document.body.appendChild(s)
      }
      s.addEventListener('load', init)
    }
    ensure()
    return () => { cancelled = true }
  }, [symbol, dark])
  return <div id={idRef.current} style={{ height, width: '100%' }} />
}

// A section that shows the TradingView chart + an "open full" link.
function ChartSection({ ticker, c, dark, he }) {
  const [show, setShow] = useState(false)
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: show ? 12 : 0 }}>
        <div style={{ fontSize: 11, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em' }}>
          📈 {he ? 'גרף חי (TradingView)' : 'Live Chart (TradingView)'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShow(s => !s)} style={{
            background: show ? c.chipBg : '#2962ff', color: show ? c.text : 'white',
            border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>
            {show ? (he ? 'הסתר גרף' : 'Hide chart') : (he ? '📊 הצג גרף' : '📊 Show chart')}
          </button>
          <a href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}`} target="_blank" rel="noopener noreferrer" style={{
            background: c.chipBg, color: c.text, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, textDecoration: 'none',
          }}>
            🔗 {he ? 'מסך מלא' : 'Full screen'}
          </a>
        </div>
      </div>
      {show && <TradingViewChart symbol={ticker} dark={dark} />}
    </div>
  )
}

// ── Weekly returns bars (diverging: green up, red down) — the signature
// "Weekly Trend" view, reusable for the journal deep-dive. ──
function WeeklyBars({ history, c, dark, he }) {
  if (!history || !history.length) return null
  const HALF = 70, LABEL = 16, MID = HALF + LABEL, TOTAL = HALF * 2 + LABEL * 2
  const greens = '#00c853', reds = '#ff3b30'
  const maxAbs = Math.max(5, ...history.map(h => Math.abs(h.change_pct || 0)))
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em' }}>
          📅 {he ? 'המגמה השבועית — תשואה לכל שבוע' : 'Weekly Trend — Returns by Week'}
        </div>
        {history.some(h => h.in_scan) && (
          <span style={{ fontSize: 10, color: c.muted, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: '#FFD700', fontSize: 12 }}>★</span> {he ? 'הופיעה בסריקה' : 'in our scans'}
          </span>
        )}
      </div>
      <div style={{ position: 'relative', height: TOTAL, marginBottom: 6 }}>
        <div style={{ position: 'absolute', top: MID, left: 0, right: 0, height: 1, background: dark ? '#2a2a3e' : '#dcdce6' }} />
        <div style={{ display: 'flex', height: '100%', gap: 4, position: 'relative', zIndex: 2 }}>
          {history.map((h, i) => {
            const pos = h.change_pct >= 0
            const abs = Math.abs(h.change_pct)
            const barH = Math.max(5, Math.sqrt(abs / maxAbs) * HALF)
            const fill = pos ? greens : reds
            return (
              <div key={i} style={{ flex: 1, position: 'relative', minWidth: 0 }} title={`${h.week}: ${pos ? '+' : ''}${h.change_pct}%`}>
                {pos ? (
                  <>
                    <div style={{ position: 'absolute', top: MID - barH - LABEL, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 800, color: fill, whiteSpace: 'nowrap', display: 'flex', gap: 2, alignItems: 'center' }}>
                      {h.in_scan && <span style={{ color: '#FFD700', fontSize: 11 }}>★</span>}+{Math.round(h.change_pct)}%
                    </div>
                    <div style={{ position: 'absolute', top: MID - barH, left: '50%', transform: 'translateX(-50%)', width: '80%', maxWidth: 30, height: barH, background: fill, borderRadius: '4px 4px 0 0', border: '2px solid #0a5e30', boxShadow: `0 0 8px ${fill}40` }} />
                  </>
                ) : (
                  <>
                    <div style={{ position: 'absolute', top: MID, left: '50%', transform: 'translateX(-50%)', width: '80%', maxWidth: 30, height: barH, background: fill, borderRadius: '0 0 4px 4px', border: '2px solid #9c2a1f', boxShadow: `0 0 8px ${fill}40` }} />
                    <div style={{ position: 'absolute', top: MID + barH + 2, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 800, color: fill, whiteSpace: 'nowrap', display: 'flex', gap: 2, alignItems: 'center' }}>
                      {h.in_scan && <span style={{ color: '#FFD700', fontSize: 11 }}>★</span>}{Math.round(h.change_pct)}%
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, paddingTop: 8, borderTop: `1px solid ${c.border}` }}>
        {history.map((h, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', minWidth: 0, fontSize: 9, color: c.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {(h.week.split('-')[1] || h.week).replace(/\.20\d\d$/, '')}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Full identity card for ANY ticker (used in the Journal deep-dive). ──
// Fetches identity on demand and renders the same blocks as The Trend:
// hero, analyst target, 52W range, share structure, business overview, chart.
function StockDeepDive({ ticker, weeklyHistory, c, dark, lang }) {
  const he = lang === 'he'
  const [id, setId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/stock-identity?ticker=' + encodeURIComponent(ticker))
      .then(r => r.json())
      .then(d => { if (!cancelled) { setId(d || {}); setLoading(false) } })
      .catch(() => { if (!cancelled) { setId({}); setLoading(false) } })
    return () => { cancelled = true }
  }, [ticker])

  const x = id || {}
  const rec = _recBadge(x.recommendation)

  return (
    <div style={{ background: dark ? '#0a1422' : '#f3f7fc', padding: '22px 24px', borderTop: `2px solid #16486b` }}>
      {/* Hero */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: c.text }}>{ticker}</span>
            {x.market_cap && <span style={{ fontSize: 13, fontWeight: 600, color: c.muted, background: c.card, padding: '3px 9px', borderRadius: 6, border: `1px solid ${c.border}` }}>{_formatMcapShort(x.market_cap)}</span>}
            {x.price && <span style={{ fontSize: 15, fontWeight: 700, color: c.text }}>${x.price}</span>}
          </div>
          {x.name && <div style={{ fontSize: 14, color: c.text, marginTop: 4, fontWeight: 600 }}>{x.name}</div>}
          <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>
            {[x.industry || x.sector, x.country].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {loading && <div style={{ fontSize: 13, color: c.muted, marginBottom: 14 }}>{he ? 'טוען נתונים...' : 'Loading...'}</div>}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
        {/* Analyst target */}
        {x.target_mean ? (
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px', borderTop: '3px solid #1a6bb5' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em' }}>🎯 {he ? 'יעד אנליסטים' : 'Analyst Target'}</div>
              {rec && <span style={{ background: rec.bg, color: rec.color, padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>{rec.label}</span>}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: c.text }}>
              ${x.target_mean}
              {x.target_upside_pct !== undefined && (
                <span style={{ fontSize: 13, marginLeft: 8, color: x.target_upside_pct >= 15 ? '#097c3e' : x.target_upside_pct >= 0 ? '#cc8800' : '#c0392b', fontWeight: 700 }}>
                  {x.target_upside_pct >= 0 ? '+' : ''}{x.target_upside_pct}%
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>
              {x.target_low && x.target_high ? `${he ? 'טווח' : 'Range'}: $${x.target_low}–$${x.target_high}` : ''}{x.analyst_count ? ` · ${x.analyst_count} ${he ? 'אנליסטים' : 'analysts'}` : ''}
            </div>
          </div>
        ) : (!loading && (
          <div style={{ background: dark ? '#1a1623' : '#fafafa', border: `1px dashed ${c.border}`, borderRadius: 10, padding: '14px 16px', borderTop: '3px solid #888' }}>
            <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>🎯 {he ? 'יעד אנליסטים' : 'Analyst Target'}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.muted }}>⚠️ {he ? 'אין כיסוי אנליסטים' : 'No analyst coverage'}</div>
          </div>
        ))}

        {/* 52W range */}
        {x.high_52w !== undefined && x.low_52w !== undefined && (
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px', borderTop: '3px solid #cc8800' }}>
            <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em', marginBottom: 8 }}>📅 {he ? 'טווח 52 שבועות' : '52-Week Range'}</div>
            <div style={{ position: 'relative', height: 8, background: dark ? '#0a1520' : '#e6f0fa', borderRadius: 4, marginBottom: 8 }}>
              {x.pos_in_52w_range_pct !== undefined && (
                <div style={{ position: 'absolute', left: `${Math.max(0, Math.min(100, x.pos_in_52w_range_pct))}%`, top: -3, width: 14, height: 14, borderRadius: '50%', background: x.pos_in_52w_range_pct >= 80 ? '#097c3e' : x.pos_in_52w_range_pct >= 50 ? '#cc8800' : '#888', transform: 'translateX(-50%)', boxShadow: `0 0 0 2px ${c.card}` }} />
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: c.muted }}>
              <span style={{ fontWeight: 700, color: c.text }}>${x.low_52w}</span>
              {x.pos_in_52w_range_pct !== undefined && <span style={{ fontSize: 10 }}>{x.pos_in_52w_range_pct}%</span>}
              <span style={{ fontWeight: 700, color: c.text }}>${x.high_52w}</span>
            </div>
            {(x.gain_from_52w_low_pct !== undefined || x.gain_to_52w_high_pct !== undefined) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: c.muted, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${c.border}` }}>
                <span><span style={{ color: '#097c3e', fontWeight: 700 }}>+{x.gain_from_52w_low_pct}%</span> {he ? 'מהתחתית' : 'from low'}</span>
                <span><span style={{ color: '#cc8800', fontWeight: 700 }}>+{x.gain_to_52w_high_pct}%</span> {he ? 'לשיא' : 'to high'}</span>
              </div>
            )}
          </div>
        )}

        {/* Share structure */}
        {(x.float_m !== undefined || x.short_pct !== undefined || x.revenue_growth_pct !== undefined) && (
          <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px', borderTop: '3px solid #097c3e' }}>
            <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em', marginBottom: 8 }}>📊 {he ? 'נתונים' : 'Fundamentals'}</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {x.float_m !== undefined && <div><div style={{ fontSize: 11, color: c.muted }}>Float</div><div style={{ fontSize: 16, fontWeight: 800, color: x.float_m < 30 ? '#097c3e' : x.float_m > 100 ? '#c0392b' : c.text }}>{x.float_m}M</div></div>}
              {x.short_pct !== undefined && <div><div style={{ fontSize: 11, color: c.muted }}>{he ? 'שורט' : 'Short'}</div><div style={{ fontSize: 16, fontWeight: 800, color: x.short_pct > 15 ? '#cc8800' : c.text }}>{x.short_pct}%</div></div>}
              {x.revenue_growth_pct !== undefined && <div><div style={{ fontSize: 11, color: c.muted }}>{he ? 'צמיחת הכנסות' : 'Rev growth'}</div><div style={{ fontSize: 16, fontWeight: 800, color: x.revenue_growth_pct > 0 ? '#097c3e' : c.text }}>{x.revenue_growth_pct >= 0 ? '+' : ''}{x.revenue_growth_pct}%</div></div>}
            </div>
          </div>
        )}
      </div>

      {/* Business overview */}
      {x.business_summary && (
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 16, borderLeft: '4px solid #1a1a2e' }}>
          <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            🏢 {he ? 'תיאור עסקי' : 'Business Overview'}
            {x.website && <a href={x.website} target="_blank" rel="noopener noreferrer" style={{ color: '#1a6bb5', fontSize: 10, textDecoration: 'none', marginLeft: 'auto' }}>🔗 {he ? 'אתר' : 'Website'}</a>}
          </div>
          <div style={{ fontSize: 12.5, color: c.text, lineHeight: 1.6 }}>{x.business_summary}</div>
        </div>
      )}

      {/* Weekly trend bars — only when this ticker is in our scan history */}
      {weeklyHistory && weeklyHistory.length > 0 && (
        <WeeklyBars history={weeklyHistory} c={c} dark={dark} he={he} />
      )}

      {/* Live chart */}
      <ChartSection ticker={ticker} c={c} dark={dark} he={he} />
    </div>
  )
}

// ── Portfolio Watch — research & monitor what we OWN. Per holding: live P&L,
// then a deep AI research note (news + analysts + web buzz + hold/add call)
// and the full identity card. Built around the boss's exact requests. ──
function PortfolioWatchRow({ trade, weeklyHistory, c, dark, lang }) {
  const he = lang === 'he'
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const data = usePriceHistory(trade.ticker)
  const closes = data?.closes || []
  const current = data?.current ?? (closes.length ? closes[closes.length - 1] : null)
  const cost = trade.quantity * trade.entry_price
  const value = current != null ? trade.quantity * current : null
  const pnlPct = current != null ? (current - trade.entry_price) / trade.entry_price * 100 : null
  const isProfit = (pnlPct ?? 0) >= 0
  const GREEN = '#00c853', RED = '#ff3b30'
  const col = pnlPct == null ? c.muted : isProfit ? GREEN : RED

  async function research() {
    if (loading) return
    setReport(null); setLoading(true)
    try {
      const res = await fetch('/api/position-research', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: trade.ticker, name: trade.name, entry_price: trade.entry_price,
          quantity: trade.quantity, entry_date: trade.entry_date,
          current_price: current != null ? +current.toFixed(2) : null,
          pnl_pct: pnlPct != null ? +pnlPct.toFixed(2) : null,
        }),
      })
      const d = await res.json()
      setReport(d.report || '(no response)'); setSearched(!!d.searched)
    } catch (e) { setReport('שגיאה: ' + e.message) } finally { setLoading(false) }
  }

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, marginBottom: 12, overflow: 'hidden', background: c.card }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', cursor: 'pointer', background: open ? (dark ? '#12122a' : '#f7f9fc') : c.card }}>
        <div style={{ width: 170, flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: c.text }}>{trade.ticker}</div>
          <div style={{ fontSize: 11, color: c.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 165 }}>{trade.name}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}><Sparkline ticker={trade.ticker} width={90} height={22} /></div>
        <div style={{ textAlign: 'right', minWidth: 90 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: col }}>
            {pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%` : '—'}
          </div>
          <div style={{ fontSize: 11, color: c.muted }}>{value != null ? `$${value.toFixed(0)}` : ''}</div>
        </div>
        <span style={{ fontSize: 14, color: c.muted }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${c.border}` }}>
          {/* Research note */}
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: report || loading ? 12 : 0 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: c.text }}>🔍 {he ? 'מה אומרים על המנייה' : 'What they\'re saying'}</div>
              <button onClick={research} disabled={loading} style={{
                background: loading ? c.muted : '#16486b', color: 'white', border: 'none',
                borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              }}>
                {loading ? (he ? '🧠 חוקר...' : '🧠 Researching...') : (report ? (he ? '🔄 רענן' : '🔄 Refresh') : (he ? '🔍 חקור עכשיו' : '🔍 Research now'))}
              </button>
            </div>
            {loading && <div style={{ fontSize: 13, color: c.muted }}>{he ? 'חוקר חדשות, אנליסטים, ובאז ברשת... (~30 שניות)' : 'Researching news, analysts, web buzz... (~30s)'}</div>}
            {report && (
              <div style={{ background: dark ? '#0d1422' : '#f7f9fc', border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px' }}>
                {searched && <div style={{ fontSize: 10, color: c.muted, marginBottom: 6 }}>🔎 {he ? 'חיפש ברשת בזמן אמת' : 'searched the web live'}</div>}
                <Markdown text={report} c={c} dark={dark} rtl={he} />
              </div>
            )}
          </div>
          {/* Identity card + chart + weekly bars */}
          <StockDeepDive ticker={trade.ticker} weeklyHistory={weeklyHistory} c={c} dark={dark} lang={lang} />
        </div>
      )}
    </div>
  )
}

function PortfolioWatch({ journal, weeklyHistoryByTicker = {}, c, dark, lang }) {
  const he = lang === 'he'
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        background: `linear-gradient(135deg, ${dark ? '#0d2030' : '#0a2540'} 0%, ${dark ? '#1a3a4a' : '#16486b'} 100%)`,
        borderRadius: '14px 14px 0 0', padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 32 }}>🔭</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>{he ? 'מעקב וחקירת התיק' : 'Portfolio Watch'}</div>
            <div style={{ fontSize: 13, color: '#a8c5dd', marginTop: 4 }}>
              {he
                ? 'לכל החזקה: רווח/הפסד חי + חקירה מלאה — חדשות, אנליסטים, באז ברשת — והמלצה אם להחזיק או להוסיף.'
                : 'Per holding: live P&L + full research — news, analysts, web buzz — and a hold/add call.'}
            </div>
          </div>
        </div>
      </div>
      <div style={{ background: dark ? '#0f0f1a' : '#f5f6fa', border: `1px solid ${c.border}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: 16 }}>
        {(!journal || journal.length === 0) ? (
          <div style={{ padding: 40, textAlign: 'center', color: c.muted }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.6 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.text, marginBottom: 6 }}>{he ? 'אין החזקות עדיין' : 'No holdings yet'}</div>
            <div style={{ fontSize: 13 }}>{he ? 'הוסף עסקאות בטאב "יומן מסחר" כדי לעקוב ולחקור אותן כאן' : 'Add trades in the Journal tab to track & research them here'}</div>
          </div>
        ) : (
          journal.map(t => (
            <PortfolioWatchRow key={t.id} trade={t} weeklyHistory={weeklyHistoryByTicker[t.ticker]} c={c} dark={dark} lang={lang} />
          ))
        )}
      </div>
    </div>
  )
}

function FloatingAnalyst({ journal, c, dark, lang }) {
  const he = lang === 'he'
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [conversations, setConversations] = useState([])  // [{id,title,messages,updatedAt}]
  const [activeId, setActiveId] = useState(null)
  const [showHistory, setShowHistory] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)

  const active = conversations.find(cv => cv.id === activeId) || null
  const messages = active?.messages || []

  const suggestions = he ? [
    'מה המניה הכי מבטיחה לטווח ארוך כרגע ולמה?',
    'איזו מניה נראית כמו סנדיסק בהתחלה — מומנטום אמיתי ולא פאמפ?',
    'תן לי 3 מועמדות ל-multi-bagger והסבר את ה-DNA של כל אחת',
  ] : [
    'Which stock is most promising long-term right now, and why?',
    'Which stock looks like an early SanDisk — real momentum, not a pump?',
    'Give me 3 multi-bagger candidates and explain each one\'s DNA',
  ]

  // Load SHARED conversations from Supabase (so the whole team sees them)
  useEffect(() => {
    fetch('/api/chats')
      .then(r => r.json())
      .then(d => {
        if (d.chats && d.chats.length) {
          setConversations(d.chats)
          setActiveId(d.chats[0].id)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading, open])

  // Save a single conversation to the shared store (fire-and-forget)
  function saveChat(conv) {
    fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat: conv }),
    }).catch(() => {})
  }

  function newChat() {
    setActiveId(null)
    setShowHistory(false)
  }
  function selectChat(id) {
    setActiveId(id)
    setShowHistory(false)
  }
  function deleteChat(id) {
    const list = conversations.filter(cv => cv.id !== id)
    setConversations(list)
    if (activeId === id) setActiveId(list[0]?.id || null)
    fetch('/api/chats?id=' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {})
  }

  async function send(text) {
    const content = (text ?? input).trim()
    if (!content || loading) return

    // Ensure there's an active conversation; create one on first message
    let conv = active
    let list = conversations
    if (!conv) {
      conv = { id: 'c' + Date.now(), title: content.slice(0, 40), messages: [], updatedAt: Date.now() }
      list = [conv, ...conversations]
      setActiveId(conv.id)
    }

    const userMsgs = [...conv.messages, { role: 'user', content }]
    const title = conv.messages.length === 0 ? content.slice(0, 40) : conv.title
    const updated = list.map(cv => cv.id === conv.id ? { ...cv, messages: userMsgs, title, updatedAt: Date.now() } : cv)
    setConversations(updated)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: userMsgs, journal }),
      })
      const data = await res.json()
      const withReply = [...userMsgs, { role: 'assistant', content: data.reply || '(no response)', searched: data.searched }]
      const finalConv = { ...conv, messages: withReply, title, updatedAt: Date.now() }
      setConversations(updated.map(cv => cv.id === conv.id ? finalConv : cv))
      saveChat(finalConv)   // persist the full exchange to the shared store
    } catch (e) {
      const withErr = [...userMsgs, { role: 'assistant', content: `שגיאה: ${e.message}` }]
      setConversations(updated.map(cv => cv.id === conv.id ? { ...cv, messages: withErr } : cv))
    } finally {
      setLoading(false)
    }
  }

  const ACCENT = '#16486b'
  const sideStyle = he ? { left: 24 } : { right: 24 }

  return (
    <>
      {/* Bubble button */}
      <button
        onClick={() => setOpen(o => !o)}
        title={he ? 'העוזר החכם' : 'AI Analyst'}
        style={{
          position: 'fixed', bottom: 24, ...sideStyle, zIndex: 1000,
          width: 62, height: 62, borderRadius: '50%', border: 'none',
          background: `linear-gradient(135deg, ${ACCENT}, #1f6ea0)`,
          color: 'white', fontSize: 28, cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
          display: open ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        🧠
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', zIndex: 1001,
          background: c.card,
          border: `1px solid ${c.border}`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          ...(expanded
            ? { top: '3vh', bottom: '3vh', left: '50%', transform: 'translateX(-50%)', width: 'min(900px, 94vw)', height: '94vh', borderRadius: 16 }
            : { bottom: 24, ...sideStyle, width: 'min(440px, calc(100vw - 32px))', height: 'min(640px, calc(100vh - 48px))', borderRadius: 16 }),
        }}>
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg, ${dark ? '#0d2030' : '#0a2540'} 0%, ${dark ? '#10384a' : '#16486b'} 100%)`,
            padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>🧠</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'white' }}>{he ? 'העוזר החכם' : 'AI Analyst'}</div>
                <div style={{ fontSize: 11, color: '#a8c5dd' }}>{he ? 'כל הנתונים + חיפוש חדשות חי' : 'All our data + live news search'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={newChat} title={he ? 'שיחה חדשה' : 'New chat'} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 18 }}>+</button>
              <button onClick={() => setShowHistory(s => !s)} title={he ? 'היסטוריית שיחות' : 'Chat history'} style={{ background: showHistory ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>🕘</button>
              <button onClick={() => setExpanded(e => !e)} title={expanded ? (he ? 'הקטן' : 'Shrink') : (he ? 'הגדל' : 'Expand')} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 15 }}>{expanded ? '⤡' : '⤢'}</button>
              <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>
          </div>

          {/* History panel */}
          {showHistory && (
            <div style={{ background: dark ? '#0d0d1a' : '#f7f9fc', borderBottom: `1px solid ${c.border}`, maxHeight: 240, overflowY: 'auto' }}>
              <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{he ? 'שיחות קודמות' : 'Past chats'}</span>
                <button onClick={newChat} style={{ background: ACCENT, border: 'none', color: 'white', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+ {he ? 'חדשה' : 'New'}</button>
              </div>
              {conversations.length === 0 ? (
                <div style={{ padding: '0 16px 12px', fontSize: 12, color: c.muted }}>{he ? 'אין שיחות שמורות' : 'No saved chats'}</div>
              ) : conversations.map(cv => (
                <div key={cv.id} onClick={() => selectChat(cv.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', cursor: 'pointer',
                  background: cv.id === activeId ? (dark ? '#16283a' : '#e8f0fa') : 'transparent',
                  borderLeft: cv.id === activeId ? `3px solid ${ACCENT}` : '3px solid transparent',
                }}>
                  <span style={{ flex: 1, fontSize: 12.5, color: c.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    💬 {cv.title || (he ? 'שיחה' : 'Chat')}
                  </span>
                  <span style={{ fontSize: 10, color: c.muted, flexShrink: 0 }}>{new Date(cv.updatedAt).toLocaleDateString(he ? 'he-IL' : 'en-US')}</span>
                  <button onClick={e => { e.stopPropagation(); deleteChat(cv.id) }} title={he ? 'מחק' : 'Delete'} style={{ background: 'none', border: 'none', color: c.muted, cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 16 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.text, marginBottom: 4 }}>
                  {he ? 'שאל אותי כל דבר על המניות' : 'Ask me anything about the stocks'}
                </div>
                <div style={{ fontSize: 12, color: c.muted, marginBottom: 18 }}>
                  {he ? 'בחר שאלה או כתוב משלך' : 'Pick a question or write your own'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => send(s)} style={{
                      textAlign: he ? 'right' : 'left', padding: '10px 13px',
                      borderRadius: 10, border: `1px solid ${c.border}`,
                      background: dark ? '#12122a' : '#f7f9fc', color: c.text,
                      fontSize: 12.5, cursor: 'pointer', fontWeight: 500, lineHeight: 1.4,
                    }}>💡 {s}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                }}>
                  <div style={{
                    maxWidth: m.role === 'user' ? '88%' : '94%',
                    background: m.role === 'user' ? ACCENT : (dark ? '#12122a' : '#f3f5f9'),
                    color: m.role === 'user' ? 'white' : c.text,
                    padding: '11px 14px', borderRadius: 12,
                    fontSize: 13.5, lineHeight: 1.55,
                    whiteSpace: m.role === 'user' ? 'pre-wrap' : 'normal',
                    border: m.role === 'assistant' ? `1px solid ${c.border}` : 'none',
                  }}>
                    {m.role === 'assistant' && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#16a0c5', marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                        🧠 {he ? 'העוזר' : 'Analyst'}
                        {m.searched && <span style={{ color: c.muted, fontWeight: 600 }}>· 🔎 {he ? 'חיפש באינטרנט' : 'searched the web'}</span>}
                      </div>
                    )}
                    {m.role === 'assistant'
                      ? <Markdown text={m.content} c={c} dark={dark} rtl={he} />
                      : m.content}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                <div style={{ background: dark ? '#12122a' : '#f3f5f9', color: c.muted, padding: '10px 13px', borderRadius: 12, fontSize: 13.5, border: `1px solid ${c.border}` }}>
                  🧠 {he ? 'חושב...' : 'Thinking...'}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ borderTop: `1px solid ${c.border}`, padding: '12px 14px', display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={he ? 'כתוב שאלה...' : 'Type a question...'}
              disabled={loading}
              style={{
                flex: 1, padding: '10px 13px', borderRadius: 9,
                border: `1px solid ${c.border}`, background: dark ? '#0f0f1a' : '#fff',
                color: c.text, fontSize: 13.5, outline: 'none',
              }}
            />
            <button onClick={() => send()} disabled={loading || !input.trim()} style={{
              padding: '0 18px', borderRadius: 9, border: 'none',
              background: loading || !input.trim() ? c.muted : ACCENT,
              color: 'white', fontWeight: 800, fontSize: 13.5,
              cursor: loading || !input.trim() ? 'default' : 'pointer',
            }}>
              {he ? 'שלח' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────────
// Rising Stars — quiet base-builders across the WHOLE market.
// Strong sustained 6-month relative strength, NOT just this week's gainers.
// This is the scan that catches the early SanDisk before the parabolic run.
// ──────────────────────────────────────────────────────────────────
function RisingStars({ stars, c, dark, lang }) {
  const he = lang === 'he'
  const [openTicker, setOpenTicker] = useState(null)

  if (!stars || stars.length === 0) {
    return (
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 40, textAlign: 'center', color: c.muted }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⭐</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, marginBottom: 6 }}>
          {he ? 'אין נתוני כוכבים עולים עדיין' : 'No rising stars data yet'}
        </div>
        <div style={{ fontSize: 13 }}>
          {he ? 'הרץ את "Fix Rising Stars" ב-Actions כדי לחשב.' : 'Run "Fix Rising Stars" in Actions to compute.'}
        </div>
      </div>
    )
  }

  const scoreColor = (s) => s >= 70 ? '#00c853' : s >= 50 ? '#7cb342' : s >= 35 ? '#cc8800' : '#888'
  const medals = ['🥇', '🥈', '🥉']
  const medalBg = dark ? ['#2a2400', '#1e1e1e', '#1e1200'] : ['#fffdf0', '#f8f8f8', '#fff8f0']
  const medalBorder = ['#FFD700', '#C0C0C0', '#CD7F32']

  const COMPONENTS = [
    { key: 'rs_6mo',        max: 40, label: he ? 'חוזק יחסי (6ח׳)' : 'Relative Strength (6mo)', icon: '💪' },
    { key: 'consistency',   max: 25, label: he ? 'עקביות שבועית' : 'Weekly Consistency', icon: '📊' },
    { key: 'trend',         max: 20, label: he ? 'אישור מגמה (מעל ממוצעים)' : 'Trend (above MAs)', icon: '📈' },
    { key: 'still_rising',  max: 15, label: he ? 'עדיין עולה (חודש אחרון)' : 'Still Rising (1mo)', icon: '🚀' },
  ]

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${dark ? '#0d2818' : '#0a3520'} 0%, ${dark ? '#155030' : '#16683f'} 100%)`,
        borderRadius: '14px 14px 0 0', padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 32 }}>⭐</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-.02em' }}>
              {he ? 'כוכבים עולים — בנאים שקטים' : 'Rising Stars — Quiet Base-Builders'}
            </div>
            <div style={{ fontSize: 13, color: '#a8ddc0', marginTop: 4 }}>
              {he
                ? 'סריקת חוזק יחסי על כל השוק — מניות שמטפסות בעקביות חודשים, גם אם לא קפצו השבוע. כאן נמצא את סנדיסק הבאה לפני הריצה.'
                : 'Full-market relative-strength scan — stocks climbing steadily for months, even if they didn\'t spike this week. This is where the next SanDisk hides before the run.'}
            </div>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
        {stars.map((stock, i) => {
          const isTop3 = i < 3
          const isOpen = openTicker === stock.ticker
          const score = stock.rs_score || 0
          const sc = scoreColor(score)
          const b = stock.rs_breakdown || {}
          const quiet = (stock.this_week_pct || 0) < 15  // didn't spike this week

          return (
            <div key={stock.ticker}>
              <div
                onClick={() => setOpenTicker(isOpen ? null : stock.ticker)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px',
                  borderBottom: isOpen ? 'none' : `1px solid ${c.border}`,
                  background: isOpen ? (dark ? '#0d1f14' : '#f4fbf6') :
                              isTop3 ? medalBg[i] : (i % 2 === 0 ? c.card : (dark ? '#141428' : '#fafafa')),
                  borderLeft: isTop3 ? `4px solid ${medalBorder[i]}` : '4px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 42, textAlign: 'center', flexShrink: 0 }}>
                  {isTop3 ? <span style={{ fontSize: 26 }}>{medals[i]}</span>
                          : <span style={{ fontSize: 15, fontWeight: 700, color: c.muted }}>#{i + 1}</span>}
                </div>

                <div style={{ width: 200, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: c.text }}>{stock.ticker}</span>
                    {stock.sector && (
                      <span style={{ fontSize: 9, fontWeight: 600, background: dark ? '#1a2a3a' : '#e8f0fa', color: dark ? '#7daaff' : '#1a4d8f', padding: '2px 7px', borderRadius: 8 }}>{stock.sector}</span>
                    )}
                    {quiet && (
                      <span title={he ? 'לא קפצה השבוע — בנייה שקטה' : 'Didn\'t spike this week — quiet build'} style={{ fontSize: 9, fontWeight: 700, background: dark ? '#0d2818' : '#e3f5ea', color: '#097c3e', padding: '2px 7px', borderRadius: 8 }}>
                        🤫 {he ? 'שקט' : 'quiet'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: c.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 195 }}>{stock.name}</div>
                </div>

                {/* 6-month return — the headline number */}
                <div style={{ flex: 1, minWidth: 100, textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: stock.ret_6mo >= 0 ? '#097c3e' : '#c0392b' }}>
                    {stock.ret_6mo >= 0 ? '+' : ''}{stock.ret_6mo}%
                  </div>
                  <div style={{ fontSize: 10, color: c.muted }}>{he ? '6 חודשים' : '6-month return'}</div>
                </div>

                {/* Score gauge */}
                <div style={{ minWidth: 130, maxWidth: 200, flex: 1 }}>
                  <div style={{ position: 'relative', height: 9, background: dark ? '#0a1520' : '#e8e8ee', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, score)}%`, background: `linear-gradient(90deg, ${sc}aa, ${sc})`, borderRadius: 5 }} />
                  </div>
                  <div style={{ fontSize: 9, color: c.muted, marginTop: 3, textAlign: 'center' }}>{he ? 'ציון בנייה' : 'base-builder score'}</div>
                </div>

                <div style={{ textAlign: 'right', minWidth: 56 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: sc, lineHeight: 1 }}>{Math.round(score)}</div>
                  <div style={{ fontSize: 9, color: c.muted, marginTop: 2 }}>/ 100</div>
                </div>

                <span style={{ fontSize: 14, color: c.muted, marginLeft: 4 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Expanded */}
              {isOpen && (
                <div style={{ background: dark ? '#091509' : '#f4fbf6', padding: '22px 28px', borderBottom: `1px solid ${c.border}`, borderLeft: `4px solid ${isTop3 ? medalBorder[i] : sc}` }}>
                  {/* Returns strip */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 18 }}>
                    <MetricBox label={he ? 'מחיר' : 'Price'} value={stock.price ? `$${stock.price}` : '—'} c={c} />
                    <MetricBox label={he ? 'שווי שוק' : 'Market Cap'} value={_formatMcapShort(stock.market_cap)} c={c} />
                    <MetricBox label={he ? 'חודש' : '1-Month'} value={stock.ret_1mo != null ? `${stock.ret_1mo >= 0 ? '+' : ''}${stock.ret_1mo}%` : '—'} color={stock.ret_1mo >= 0 ? '#097c3e' : '#c0392b'} c={c} />
                    <MetricBox label={he ? '3 חודשים' : '3-Month'} value={stock.ret_3mo != null ? `${stock.ret_3mo >= 0 ? '+' : ''}${stock.ret_3mo}%` : '—'} color={stock.ret_3mo >= 0 ? '#097c3e' : '#c0392b'} c={c} />
                    <MetricBox label={he ? '6 חודשים' : '6-Month'} value={stock.ret_6mo != null ? `${stock.ret_6mo >= 0 ? '+' : ''}${stock.ret_6mo}%` : '—'} color={stock.ret_6mo >= 0 ? '#097c3e' : '#c0392b'} c={c} />
                    <MetricBox label={he ? 'שבועות חיוביים' : 'Positive Weeks'} value={stock.positive_weeks_pct != null ? `${stock.positive_weeks_pct}%` : '—'} c={c} />
                  </div>

                  {/* Trend confirmations */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, background: stock.above_50dma ? (dark ? '#0d2818' : '#e3f5ea') : (dark ? '#2a1a1a' : '#fcebeb'), color: stock.above_50dma ? '#097c3e' : '#c0392b' }}>
                      {stock.above_50dma ? '✓' : '✗'} {he ? 'מעל ממוצע 50 יום' : 'Above 50-day MA'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, background: stock.above_200dma ? (dark ? '#0d2818' : '#e3f5ea') : (dark ? '#2a1a1a' : '#fcebeb'), color: stock.above_200dma ? '#097c3e' : '#c0392b' }}>
                      {stock.above_200dma ? '✓' : '✗'} {he ? 'מעל ממוצע 200 יום' : 'Above 200-day MA'}
                    </span>
                    {b.spike_penalty < 0 && (
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, background: dark ? '#3a2a0a' : '#FAEEDA', color: '#cc8800' }}>
                        ⚠️ {he ? 'חלק גדול מהעלייה משבוע אחד' : 'Much of the gain from one week'}
                      </span>
                    )}
                  </div>

                  {/* Live TradingView chart */}
                  <div style={{ marginBottom: 18 }}>
                    <ChartSection ticker={stock.ticker} c={c} dark={dark} he={he} />
                  </div>

                  {/* Score breakdown */}
                  <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '16px 20px' }}>
                    <div style={{ fontSize: 11, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em', marginBottom: 14 }}>
                      ⭐ {he ? 'פירוט ציון הבנייה' : 'Base-Builder Score Breakdown'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {COMPONENTS.map(comp => {
                        const val = b[comp.key] || 0
                        const pct = comp.max > 0 ? (val / comp.max) * 100 : 0
                        const barColor = pct >= 70 ? '#00c853' : pct >= 40 ? '#7cb342' : pct >= 15 ? '#cc8800' : c.muted
                        return (
                          <div key={comp.key}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                              <span style={{ fontSize: 12, color: c.text, fontWeight: 600 }}>{comp.icon} {comp.label}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{val.toFixed(1)} <span style={{ color: c.muted, fontWeight: 400 }}>/ {comp.max}</span></span>
                            </div>
                            <div style={{ position: 'relative', height: 7, background: dark ? '#0a1520' : '#e8e8ee', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, pct)}%`, background: barColor, borderRadius: 4 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: c.muted, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.border}`, lineHeight: 1.5 }}>
                      {he
                        ? '⭐ ציון גבוה = מנייה שטיפסה בעקביות חודשים והכתה את השוק, גם אם לא בלטה בסריקה השבועית. בדוק אותה בעוזר החכם כדי להבין למה.'
                        : '⭐ A high score = a stock that climbed steadily for months and beat the market, even if it never stood out in the weekly scan. Ask the AI Analyst why.'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Multi-Bagger Radar — the forward-looking engine.
// Ranks stocks by 'DNA score': the traits of stocks that 5x-50x over a
// year BEFORE the parabolic move (relative strength, revenue growth,
// persistence, acceleration, small-cap room, sector tailwind).
// ──────────────────────────────────────────────────────────────────
function MultiBaggerRadar({ radar, c, dark, lang }) {
  const he = lang === 'he'
  const [openTicker, setOpenTicker] = useState(null)

  if (!radar || radar.length === 0) {
    return (
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 40, textAlign: 'center', color: c.muted }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, marginBottom: 6 }}>
          {he ? 'אין נתוני ראדאר עדיין' : 'No radar data yet'}
        </div>
        <div style={{ fontSize: 13 }}>
          {he ? 'הרץ את "Fix Radar" ב-Actions כדי לחשב.' : 'Run "Fix Radar" in Actions to compute.'}
        </div>
      </div>
    )
  }

  // DNA score → color tier
  const dnaColor = (s) => s >= 70 ? '#00c853' : s >= 50 ? '#7cb342' : s >= 35 ? '#cc8800' : '#888'
  const dnaLabel = (s) => s >= 70 ? (he ? 'DNA חזק מאוד' : 'Strong DNA')
                        : s >= 50 ? (he ? 'DNA טוב' : 'Good DNA')
                        : s >= 35 ? (he ? 'DNA בינוני' : 'Moderate DNA')
                        : (he ? 'DNA חלש' : 'Weak DNA')

  // Component metadata for the breakdown bars
  const COMPONENTS = [
    { key: 'relative_strength', max: 35, label: he ? 'חוזק יחסי' : 'Relative Strength', hint: he ? 'ביצוע מול השוק' : 'vs the market', icon: '💪' },
    { key: 'revenue_growth',    max: 20, label: he ? 'צמיחת הכנסות' : 'Revenue Growth', hint: he ? 'הדלק האמיתי' : 'the real fuel', icon: '📈' },
    { key: 'persistence',       max: 15, label: he ? 'התמדה' : 'Persistence', hint: he ? 'חוזרת בסריקות' : 'recurs in scans', icon: '🔁' },
    { key: 'acceleration',      max: 15, label: he ? 'האצה' : 'Acceleration', hint: he ? 'המהלך מתגבר' : 'move speeding up', icon: '🚀' },
    { key: 'smallcap_room',     max: 10, label: he ? 'מקום לגדול' : 'Room to Grow', hint: he ? 'שווי שוק קטן' : 'small cap', icon: '🌱' },
    { key: 'sector_heat',       max: 5,  label: he ? 'סקטור חם' : 'Sector Tailwind', hint: he ? 'רוח גבית' : 'megatrend', icon: '🔥' },
  ]

  const medals = ['🥇', '🥈', '🥉']
  const medalBg = dark ? ['#2a2400', '#1e1e1e', '#1e1200'] : ['#fffdf0', '#f8f8f8', '#fff8f0']
  const medalBorder = ['#FFD700', '#C0C0C0', '#CD7F32']

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${dark ? '#1a0d30' : '#2d1a4e'} 0%, ${dark ? '#2a1555' : '#3d2570'} 100%)`,
        borderRadius: '14px 14px 0 0', padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 32 }}>🎯</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-.02em' }}>
              {he ? 'ראדאר Multi-Bagger' : 'Multi-Bagger Radar'}
            </div>
            <div style={{ fontSize: 13, color: '#c9b8e8', marginTop: 4 }}>
              {he
                ? 'לתפוס את המניות שיעשו פי 5-50 — לפני הריצה הגדולה. דירוג לפי "DNA" של מנצחות גדולות: חוזק יחסי, צמיחה, התמדה והאצה.'
                : 'Catch the stocks that 5x-50x — before the run. Ranked by the DNA of big winners: relative strength, growth, persistence, acceleration.'}
            </div>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
        {radar.map((stock, i) => {
          const isTop3 = i < 3
          const isOpen = openTicker === stock.ticker
          const score = stock.dna_score || 0
          const scoreColor = dnaColor(score)
          const breakdown = stock.dna_breakdown || {}

          return (
            <div key={stock.ticker}>
              {/* Collapsed row */}
              <div
                onClick={() => setOpenTicker(isOpen ? null : stock.ticker)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px',
                  borderBottom: isOpen ? 'none' : `1px solid ${c.border}`,
                  background: isOpen ? (dark ? '#15102a' : '#f7f4fc') :
                              isTop3 ? medalBg[i] : (i % 2 === 0 ? c.card : (dark ? '#141428' : '#fafafa')),
                  borderLeft: isTop3 ? `4px solid ${medalBorder[i]}` : '4px solid transparent',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {/* Rank */}
                <div style={{ width: 42, textAlign: 'center', flexShrink: 0 }}>
                  {isTop3
                    ? <span style={{ fontSize: 26 }}>{medals[i]}</span>
                    : <span style={{ fontSize: 15, fontWeight: 700, color: c.muted }}>#{i + 1}</span>}
                </div>

                {/* Ticker + name + sector */}
                <div style={{ width: 200, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: c.text }}>{stock.ticker}</span>
                    {stock.sector && (
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        background: dark ? '#2a1a3a' : '#f0e8fa',
                        color: dark ? '#c9a0ff' : '#6a1a9f',
                        padding: '2px 7px', borderRadius: 8,
                        border: `1px solid ${dark ? '#3a2a5a' : '#d8c8f0'}`,
                      }}>{stock.sector}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: c.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 195 }}>
                    {stock.name}
                  </div>
                </div>

                {/* DNA score gauge — the centerpiece */}
                <div style={{ flex: 1, minWidth: 120, maxWidth: 320 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      {he ? 'ציון DNA' : 'DNA Score'}
                    </span>
                    <span style={{ fontSize: 11, color: scoreColor, fontWeight: 700 }}>{dnaLabel(score)}</span>
                  </div>
                  <div style={{ position: 'relative', height: 10, background: dark ? '#0a1520' : '#e8e8ee', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${Math.min(100, score)}%`,
                      background: `linear-gradient(90deg, ${scoreColor}aa, ${scoreColor})`,
                      borderRadius: 5,
                      boxShadow: `0 0 8px ${scoreColor}66`,
                    }} />
                  </div>
                </div>

                {/* Big DNA number */}
                <div style={{ textAlign: 'right', minWidth: 70 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                    {Math.round(score)}
                  </div>
                  <div style={{ fontSize: 9, color: c.muted, marginTop: 2 }}>/ 100</div>
                </div>

                <span style={{ fontSize: 14, color: c.muted, marginLeft: 4 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Expanded — DNA breakdown + metrics */}
              {isOpen && (
                <div style={{
                  background: dark ? '#0d0a1a' : '#f7f4fc',
                  padding: '24px 28px',
                  borderBottom: `1px solid ${c.border}`,
                  borderLeft: `4px solid ${isTop3 ? medalBorder[i] : scoreColor}`,
                }}>
                  {/* Top metrics strip */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 20 }}>
                    <MetricBox label={he ? 'מחיר' : 'Price'} value={stock.price ? `$${stock.price}` : '—'} c={c} />
                    <MetricBox label={he ? 'שווי שוק' : 'Market Cap'} value={_formatMcapShort(stock.market_cap)} c={c} />
                    <MetricBox
                      label={he ? 'תשואת 6 ח׳' : '6-Month Return'}
                      value={stock.ret_6mo != null ? `${stock.ret_6mo >= 0 ? '+' : ''}${stock.ret_6mo}%` : '—'}
                      color={stock.ret_6mo >= 0 ? '#097c3e' : '#c0392b'} c={c} />
                    <MetricBox
                      label={he ? 'חוזק מול שוק (6ח׳)' : 'RS vs Market (6mo)'}
                      value={stock.rs_6mo != null ? `${stock.rs_6mo >= 0 ? '+' : ''}${stock.rs_6mo}%` : '—'}
                      color={stock.rs_6mo >= 0 ? '#097c3e' : '#c0392b'} c={c}
                      hint={he ? 'כמה הכתה את S&P' : 'beat S&P by'} />
                    <MetricBox
                      label={he ? 'צמיחת הכנסות' : 'Revenue Growth'}
                      value={stock.revenue_growth_pct != null ? `${stock.revenue_growth_pct >= 0 ? '+' : ''}${stock.revenue_growth_pct}%` : (he ? 'אין נתון' : 'N/A')}
                      color={stock.revenue_growth_pct > 0 ? '#097c3e' : c.text} c={c}
                      hint={he ? 'שנה-על-שנה' : 'YoY'} />
                    <MetricBox
                      label={he ? 'הופעות בסריקה' : 'Scan Appearances'}
                      value={stock.appearances} c={c} />
                  </div>

                  {/* Live TradingView chart */}
                  <div style={{ marginBottom: 18 }}>
                    <ChartSection ticker={stock.ticker} c={c} dark={dark} he={he} />
                  </div>

                  {/* DNA breakdown bars */}
                  <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '16px 20px' }}>
                    <div style={{ fontSize: 11, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em', marginBottom: 14 }}>
                      🧬 {he ? 'פירוט ציון ה-DNA' : 'DNA Score Breakdown'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {COMPONENTS.map(comp => {
                        const val = breakdown[comp.key] || 0
                        const pct = comp.max > 0 ? (val / comp.max) * 100 : 0
                        const barColor = pct >= 70 ? '#00c853' : pct >= 40 ? '#7cb342' : pct >= 15 ? '#cc8800' : c.muted
                        return (
                          <div key={comp.key}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                              <span style={{ fontSize: 12, color: c.text, fontWeight: 600 }}>
                                {comp.icon} {comp.label}
                                <span style={{ fontSize: 10, color: c.muted, marginLeft: 6 }}>{comp.hint}</span>
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>
                                {val.toFixed(1)} <span style={{ color: c.muted, fontWeight: 400 }}>/ {comp.max}</span>
                              </span>
                            </div>
                            <div style={{ position: 'relative', height: 7, background: dark ? '#0a1520' : '#e8e8ee', borderRadius: 4, overflow: 'hidden' }}>
                              <div style={{
                                position: 'absolute', left: 0, top: 0, bottom: 0,
                                width: `${Math.min(100, pct)}%`,
                                background: barColor, borderRadius: 4,
                              }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 11, color: c.muted, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${c.border}`, lineHeight: 1.5 }}>
                      {he
                        ? '🎯 ציון גבוה = למנייה יש את התכונות של מנצחת גדולה בשלב מוקדם. זה לא הבטחה — זה זיהוי דפוס.'
                        : '🎯 A high score means the stock has early-stage big-winner traits. Not a promise — pattern recognition.'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MetricBox({ label, value, color, hint, c }) {
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: color || c.text, marginTop: 3 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: c.muted, marginTop: 1 }}>{hint}</div>}
    </div>
  )
}

// Analyst recommendation → label + color
function _recBadge(rec) {
  const r = (rec || '').toLowerCase()
  if (r === 'strong_buy')  return { label: 'Strong Buy',  color: '#fff', bg: '#097c3e' }
  if (r === 'buy')         return { label: 'Buy',         color: '#fff', bg: '#1e9c50' }
  if (r === 'hold')        return { label: 'Hold',        color: '#fff', bg: '#cc8800' }
  if (r === 'sell')        return { label: 'Sell',        color: '#fff', bg: '#cc4444' }
  if (r === 'strong_sell') return { label: 'Strong Sell', color: '#fff', bg: '#c0392b' }
  return null
}

function _formatMcapShort(n) {
  if (!n) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`
  return `$${n}`
}

// ===================== ENTRY ZONE — THE BUY LIST =====================
// The one tab that answers "which stock do we actually enter?" — and the one
// that needs no AI at all, so it keeps working when the API balance is empty.
// Built straight from what our 109 forward-tested picks measured: a confirmed
// uptrend that has NOT yet stretched away from its 50-day average.

function EntryZone({ entryZone, c, dark, lang }) {
  const he = lang === 'he'
  const [open, setOpen] = useState(null)

  if (!entryZone || entryZone.length === 0) {
    return (
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, marginBottom: 6 }}>
          {he ? 'רשימת הקנייה תיווצר בסריקה הבאה' : 'The buy list is built on the next scan'}
        </div>
        <div style={{ fontSize: 13, color: c.muted }}>
          {he ? 'הרץ "Full Run & Verify" ב-Actions כדי לחשב אותה עכשיו. לא דורש AI.'
              : 'Run "Full Run & Verify" in Actions to compute it now. No AI required.'}
        </div>
      </div>
    )
  }

  const zoneOf = (ext) => ext <= 20
    ? { label: he ? 'באזור הכניסה' : 'in the zone', color: '#097c3e', icon: '🟢' }
    : ext <= 30
      ? { label: he ? 'מעט מתוחה' : 'slightly extended', color: '#b8860b', icon: '🟡' }
      : { label: he ? 'בקצה העליון' : 'upper edge', color: '#c0662b', icon: '🟠' }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        background: `linear-gradient(135deg, ${dark ? '#07281a' : '#0b3d26'} 0%, ${dark ? '#0f4a2e' : '#14663f'} 100%)`,
        borderRadius: '14px 14px 0 0', padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 32 }}>🎯</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-.02em' }}>
              {he ? 'אזור הכניסה — רשימת הקנייה' : 'Entry Zone — The Buy List'}
            </div>
            <div style={{ fontSize: 13, color: '#a8d5bd', marginTop: 4 }}>
              {he
                ? 'מניות במגמה מאושרת שעדיין לא ברחו: מעל ממוצעי 50 ו-200, מובילות את השוק, מטפסות בעקביות — ועדיין קרובות לממוצע. זה הפרופיל היחיד שהרוויח כסף ב-109 הבחירות שנמדדו.'
                : 'Confirmed uptrends that have not run away yet: above the 50 and 200-day averages, leading the market, climbing steadily — and still close to the average. The only profile that made money across our 109 measured picks.'}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        background: dark ? '#0d2018' : '#EAF3DE', borderLeft: '4px solid #097c3e',
        padding: '10px 20px', fontSize: 12, color: c.text,
      }}>
        {he ? '✅ מחושב מנתוני מחיר בלבד — לא דורש AI ולא קרדיטים. מתעדכן בכל סריקה שבועית.'
            : '✅ Computed from price data alone — no AI, no credits. Refreshes every weekly scan.'}
      </div>

      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
        {entryZone.map((s, i) => {
          const z = zoneOf(s.pct_above_50dma)
          const isOpen = open === s.ticker
          return (
            <div key={s.ticker}>
              <div onClick={() => setOpen(isOpen ? null : s.ticker)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '15px 22px',
                  borderBottom: `1px solid ${c.border}`, cursor: 'pointer',
                  background: i % 2 === 0 ? c.card : (dark ? '#141428' : '#fafafa'),
                }}>
                <div style={{ width: 34, textAlign: 'center', fontSize: 14, fontWeight: 800, color: c.muted }}>#{i + 1}</div>
                <div style={{ width: 190, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: c.text }}>{s.ticker}</span>
                    <span style={{ fontSize: 10, fontWeight: 800, color: z.color, border: `1px solid ${z.color}`, borderRadius: 10, padding: '1px 7px' }}>
                      {z.icon} {z.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: c.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 185 }}>{s.name}</div>
                </div>

                <div style={{ flex: 1, minWidth: 90, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: c.text }}>
                    {s.pct_above_50dma > 0 ? '+' : ''}{s.pct_above_50dma}%
                  </div>
                  <div style={{ fontSize: 9, color: c.muted }}>{he ? 'מעל ממוצע 50' : 'above 50dma'}</div>
                </div>
                <div style={{ flex: 1, minWidth: 90, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#097c3e' }}>+{s.rs_vs_spy_6mo}%</div>
                  <div style={{ fontSize: 9, color: c.muted }}>{he ? 'מול השוק' : 'vs market'}</div>
                </div>
                <div style={{ flex: 1, minWidth: 80, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: c.text }}>{s.positive_weeks_pct}%</div>
                  <div style={{ fontSize: 9, color: c.muted }}>{he ? 'שבועות ירוקים' : 'green weeks'}</div>
                </div>

                <div style={{ textAlign: 'right', minWidth: 78 }}>
                  <div style={{ fontSize: 21, fontWeight: 800, color: '#097c3e', lineHeight: 1 }}>{s.entry_score}</div>
                  <div style={{ fontSize: 9, color: c.muted, marginTop: 2 }}>{he ? 'ציון כניסה' : 'entry score'}</div>
                </div>
                <span style={{ fontSize: 13, color: c.muted }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div style={{ background: dark ? '#0a1a12' : '#f4faf6', padding: '18px 26px', borderBottom: `1px solid ${c.border}` }}>
                  <div style={{ fontSize: 13.5, color: c.text, lineHeight: 1.7, marginBottom: 14 }}>{s.why}</div>
                  <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 12, color: c.muted }}>
                    <span>{he ? 'מחיר' : 'price'} <b style={{ color: c.text }}>${s.price}</b></span>
                    <span>{he ? 'שווי' : 'cap'} <b style={{ color: c.text }}>${(s.market_cap / 1e9).toFixed(2)}B</b></span>
                    <span>{he ? 'חודש' : '1mo'} <b style={{ color: c.text }}>{s.ret_1mo}%</b></span>
                    <span>{he ? '3 ח׳' : '3mo'} <b style={{ color: c.text }}>{s.ret_3mo}%</b></span>
                    <span>{he ? '6 ח׳' : '6mo'} <b style={{ color: c.text }}>{s.ret_6mo}%</b></span>
                    <span>{he ? 'שבוע הכי גדול' : 'biggest week'} <b style={{ color: c.text }}>{s.max_week_pct}%</b></span>
                    {s.vol_ratio && <span>{he ? 'מחזור' : 'volume'} <b style={{ color: c.text }}>×{s.vol_ratio}</b></span>}
                    {s.sector && <span>{s.sector}</span>}
                  </div>
                  {s.entry_breakdown && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                      {Object.entries(s.entry_breakdown).map(([k, v]) => (
                        <span key={k} style={{ fontSize: 10, background: c.chipBg, color: c.muted, padding: '3px 9px', borderRadius: 8 }}>
                          {k.replace(/_/g, ' ')}: <b style={{ color: c.text }}>{v}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===================== THE ANALYSIS LAB =====================
// Paste any ticker — a name the boss mentioned, a stock from the news, a
// candidate off any tab — and get a real research verdict instead of a score.
// The point of this tab is the entry question: our own 109 forward-tested picks
// say buying after a +80-150% week compounded to -89.5%, so "is the story good?"
// is the wrong question. "Where in the move is it, today?" is the right one.

const STAGE_UI = {
  'trending':      { he: 'בתוך מגמה',    en: 'trending',  color: '#097c3e', icon: '🟢' },
  'extended':      { he: 'מתוחה',        en: 'extended',  color: '#b8860b', icon: '🟡' },
  'parabolic':     { he: 'פרבולית',      en: 'parabolic', color: '#c0392b', icon: '🔴' },
  'basing/broken': { he: 'מתחת לממוצע',  en: 'below MA',  color: '#888',    icon: '⚪' },
}

function AnalysisLab({ risingStars, radar, trend, c, dark, lang }) {
  const he = lang === 'he'
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [results, setResults] = useState([])
  const [comparison, setComparison] = useState('')
  const [error, setError] = useState('')

  const parseTickers = (s) => Array.from(new Set(
    String(s).toUpperCase().split(/[\s,;]+/).map(x => x.replace(/[^A-Z.\-]/g, '')).filter(Boolean)
  )).slice(0, 5)

  async function run(tickersRaw) {
    const tickers = parseTickers(tickersRaw)
    if (!tickers.length) { setError(he ? 'הזן סימבול אחד לפחות' : 'Enter at least one ticker'); return }
    setError(''); setBusy(true); setResults([]); setComparison('')

    const done = []
    // One at a time: each analysis does its own web research and must finish
    // inside the serverless function's 60s ceiling.
    for (let i = 0; i < tickers.length; i++) {
      setProgress(he ? `חוקר את ${tickers[i]}… (${i + 1}/${tickers.length})` : `Researching ${tickers[i]}… (${i + 1}/${tickers.length})`)
      try {
        const r = await fetch('/api/deep-analysis', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ticker: tickers[i] }),
        })
        const d = await r.json()
        done.push(d)
      } catch (e) {
        done.push({ ticker: tickers[i], error: true, report: (he ? 'שגיאת רשת: ' : 'Network error: ') + e.message })
      }
      setResults([...done])
    }

    const ok = done.filter(d => d.report && !d.error)
    if (ok.length > 1) {
      setProgress(he ? 'משווה ביניהן…' : 'Comparing…')
      try {
        const r = await fetch('/api/deep-analysis', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ compare: ok.map(d => ({ ticker: d.ticker, report: d.report })) }),
        })
        const d = await r.json()
        if (d.report) setComparison(d.report)
      } catch {}
    }
    setProgress(''); setBusy(false)
  }

  const chip = (label, tickers) => (
    <button key={label} disabled={busy} onClick={() => { setInput(tickers.join(', ')); run(tickers) }}
      style={{
        padding: '6px 12px', borderRadius: 14, fontSize: 12, fontWeight: 700,
        border: `1px solid ${c.border}`, background: c.chipBg, color: c.text,
        cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
      }}>{label}</button>
  )

  const top5Stars = (risingStars || []).slice(0, 5).map(s => s.ticker)
  const top5Radar = (radar || []).slice(0, 5).map(s => s.ticker)
  const running = (trend || []).filter(t => t.momentum === 'running').slice(0, 5).map(t => t.ticker)

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${dark ? '#1a0d30' : '#2d1a4e'} 0%, ${dark ? '#2a1855' : '#43306b'} 100%)`,
        borderRadius: '14px 14px 0 0', padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 32 }}>🔬</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-.02em' }}>
              {he ? 'מעבדת ניתוח' : 'Analysis Lab'}
            </div>
            <div style={{ fontSize: 13, color: '#c3b5dd', marginTop: 4 }}>
              {he
                ? 'הזן כל מנייה — מהחדשות, מהבוס, מכל טאב — וקבל מחקר אמיתי: מה החברה עושה, מה מזיז אותה עכשיו, ובעיקר איפה היא במהלך. עד 5 בבת אחת, עם השוואה ביניהן.'
                : 'Drop in any ticker and get real research: what the company does, what is moving it now, and above all where in the move it is. Up to 5 at a time, with a head-to-head.'}
            </div>
          </div>
        </div>
      </div>

      {/* Evidence banner — why this tab judges the entry, not the story */}
      <div style={{
        background: dark ? '#2a1a0a' : '#FFF8E1', borderLeft: '4px solid #d9a406',
        borderRight: `1px solid ${c.border}`, padding: '12px 20px', fontSize: 12.5, color: c.text, lineHeight: 1.6,
      }}>
        {he ? (
          <>📊 <b>מה שהנתונים שלנו מוכיחים (109 בחירות שנבדקו קדימה):</b> קנייה אחרי שבוע של
            <b style={{ color: '#097c3e' }}> +20-50% הרוויחה +52.9%</b>, אחרי
            <b style={{ color: '#c0392b' }}> +80-150% הפסידה 89.5%</b>, ואחרי
            <b style={{ color: '#c0392b' }}> +150% הצליחה ב-17% מהמקרים בלבד</b>.
            לכן הטאב הזה שואל <b>איפה המנייה במהלך</b> — לא כמה הסיפור מרגש.</>
        ) : (
          <>📊 <b>What our own 109 forward-tested picks show:</b> buying after a
            <b style={{ color: '#097c3e' }}> +20-50% week compounded +52.9%</b>, after a
            <b style={{ color: '#c0392b' }}> +80-150% week it compounded -89.5%</b>, and after
            <b style={{ color: '#c0392b' }}> +150% only 17% won</b>. So this tab judges
            <b> where in the move</b> a stock is — not how exciting the story sounds.</>
        )}
      </div>

      {/* Input */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderTop: 'none', padding: '18px 22px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !busy) run(input) }}
            placeholder={he ? 'לדוגמה:  ETON, SMJF, TXG, LIFE, PAYS' : 'e.g.  ETON, SMJF, TXG, LIFE, PAYS'}
            style={{
              flex: 1, minWidth: 240, padding: '11px 14px', borderRadius: 10, fontSize: 15, fontWeight: 600,
              border: `1px solid ${c.border}`, background: c.inputBg, color: c.text, letterSpacing: '.5px',
            }} />
          <button onClick={() => run(input)} disabled={busy}
            style={{
              padding: '11px 26px', borderRadius: 10, border: 'none', fontSize: 15, fontWeight: 700,
              background: busy ? '#888' : '#6b3fa0', color: 'white', cursor: busy ? 'not-allowed' : 'pointer',
            }}>
            {busy ? (he ? 'חוקר…' : 'Researching…') : (he ? '🔬 נתח' : '🔬 Analyse')}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: c.muted, fontWeight: 600 }}>{he ? 'קיצורים:' : 'Shortcuts:'}</span>
          {top5Stars.length > 0 && chip(he ? '⭐ 5 הכוכבים המובילים' : '⭐ Top 5 Rising Stars', top5Stars)}
          {top5Radar.length > 0 && chip(he ? '🎯 5 מהראדאר' : '🎯 Top 5 Radar', top5Radar)}
          {running.length > 0 && chip(he ? '🔥 מגמות שעדיין רצות' : '🔥 Still-running trends', running)}
        </div>

        {error && <div style={{ marginTop: 10, fontSize: 13, color: '#c0392b', fontWeight: 600 }}>{error}</div>}
        {progress && (
          <div style={{ marginTop: 12, fontSize: 13, color: '#6b3fa0', fontWeight: 700 }}>
            ⏳ {progress} <span style={{ color: c.muted, fontWeight: 400 }}>
              {he ? '— כל מנייה לוקחת ~30 שניות (חיפוש רשת אמיתי)' : '— about 30s each (real web research)'}
            </span>
          </div>
        )}
      </div>

      {/* Head-to-head first: it is the answer to "which of these?" */}
      {comparison && (
        <div style={{
          background: dark ? '#0d1f14' : '#F1F8F2', border: '2px solid #097c3e',
          borderRadius: 12, padding: '20px 24px', marginTop: 16,
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#097c3e', marginBottom: 10 }}>
            🥇 {he ? 'ההשוואה' : 'Head to head'}
          </div>
          <Markdown text={comparison} c={c} dark={dark} rtl={he} />
        </div>
      )}

      {/* Per-ticker notes */}
      {results.map((r, i) => {
        const t = r.technicals
        const st = t && STAGE_UI[t.stage]
        return (
          <div key={r.ticker + i} style={{
            background: c.card, border: `1px solid ${c.border}`, borderRadius: 12,
            padding: '18px 22px', marginTop: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: c.text }}>{r.ticker}</span>
              {st && (
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: '4px 11px', borderRadius: 12,
                  border: `1px solid ${st.color}`, color: st.color,
                }}>{st.icon} {he ? st.he : st.en}</span>
              )}
              {t && t.climb_is_spike_driven && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 12, background: dark ? '#3a0a0a' : '#FCEBEB', color: '#c0392b' }}>
                  ⚡ {he ? 'עלייה מבוססת קפיצות' : 'spike-driven climb'}
                </span>
              )}
              {t && (
                <span style={{ fontSize: 12, color: c.muted, marginInlineStart: 'auto' }}>
                  ${t.price} · {he ? 'מעל ממוצע 50' : 'vs 50dma'} {t.pct_above_50dma > 0 ? '+' : ''}{t.pct_above_50dma}%
                  {' · '}{he ? 'חודש' : '1mo'} {t.ret_1mo > 0 ? '+' : ''}{t.ret_1mo}%
                  {t.volume_vs_normal ? ` · ${he ? 'מחזור' : 'vol'} ×${t.volume_vs_normal}` : ''}
                </span>
              )}
            </div>

            {/* 10-week path — the shape of the climb at a glance */}
            {t && t.weekly_path_10w?.length > 0 && (
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 34, marginBottom: 14 }}>
                {t.weekly_path_10w.map((w, wi) => {
                  const max = Math.max(10, ...t.weekly_path_10w.map(Math.abs))
                  return (
                    <div key={wi} title={`${w > 0 ? '+' : ''}${w}%`} style={{
                      width: 12, height: Math.max(2, (Math.abs(w) / max) * 30),
                      background: w >= 0 ? '#097c3e' : '#c0392b', borderRadius: 2,
                    }} />
                  )
                })}
                <span style={{ fontSize: 10, color: c.muted, marginInlineStart: 8, alignSelf: 'center' }}>
                  {he ? '10 שבועות אחרונים' : 'last 10 weeks'}
                </span>
              </div>
            )}

            <Markdown text={r.report} c={c} dark={dark} rtl={he} />
          </div>
        )
      })}

      {!busy && results.length === 0 && (
        <div style={{
          background: c.card, border: `1px solid ${c.border}`, borderTop: 'none',
          borderRadius: '0 0 12px 12px', padding: 30, textAlign: 'center', color: c.muted, fontSize: 13,
        }}>
          {he
            ? 'הזן סימבולים למעלה, או לחץ על אחד הקיצורים כדי לנתח ישר מהמערכת.'
            : 'Enter tickers above, or use a shortcut to analyse straight from the system.'}
        </div>
      )}
    </div>
  )
}

// Is this trend still ALIVE, or is it a finished move still coasting on an
// impressive cumulative number? Compound-since-February is history; the last
// four weeks are the signal. Derived here as well as in the scanner so scans
// saved before this existed still show a live status.
function _trendMomentum(stock, he) {
  let r4 = stock.recent_4w_pct
  if (r4 == null) {
    const last4 = (stock.weekly_history || []).slice(-4)
    if (!last4.length) return null
    r4 = (last4.reduce((acc, h) => acc * (1 + (h.change_pct || 0) / 100), 1) - 1) * 100
  }
  r4 = Math.round(r4 * 10) / 10
  if (r4 >= 10)  return { r4, label: he ? 'עדיין רצה' : 'running', icon: '🔥', color: '#097c3e', bg: '#EAF3DE' }
  if (r4 >= -10) return { r4, label: he ? 'מחזיקה'   : 'holding', icon: '➡️', color: '#8a6d0b', bg: '#FCF3D6' }
  if (r4 > -25)  return { r4, label: he ? 'מתקררת'   : 'cooling', icon: '🌡️', color: '#c0662b', bg: '#FBEADB' }
  return { r4, label: he ? 'נשברה' : 'broken', icon: '🔻', color: '#c0392b', bg: '#FCEBEB' }
}

function TheTrend({ trend, c, dark, lang }) {
  const he = lang === 'he'
  const [openTicker, setOpenTicker] = useState(null)
  const [summaryExpanded, setSummaryExpanded] = useState({})
  const [liveIdentity, setLiveIdentity] = useState({})  // live-fetched identity per ticker

  // When a row opens, fetch fresh identity (analyst target, 52W, business...)
  // from /api/stock-identity — reliable even when the weekly scan was rate-limited.
  useEffect(() => {
    if (!openTicker || liveIdentity[openTicker]) return
    let cancelled = false
    fetch('/api/stock-identity?ticker=' + encodeURIComponent(openTicker))
      .then(r => r.json())
      .then(d => { if (!cancelled && d) setLiveIdentity(prev => ({ ...prev, [openTicker]: d })) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [openTicker])

  if (!trend || trend.length === 0) {
    return (
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: 40, textAlign: 'center', color: c.muted }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📈</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, marginBottom: 6 }}>
          {he ? 'אין נתוני מגמה עדיין' : 'No trend data yet'}
        </div>
        <div style={{ fontSize: 13 }}>
          {he ? 'הרץ את "Fix Trend" ב-Actions כדי לחשב.' : 'Run "Fix Trend" in Actions to compute.'}
        </div>
      </div>
    )
  }

  const medals = ['🥇', '🥈', '🥉']
  const medalBg = dark ? ['#2a2400', '#1e1e1e', '#1e1200'] : ['#fffdf0', '#f8f8f8', '#fff8f0']
  const medalBorder = ['#FFD700', '#C0C0C0', '#CD7F32']

  // For the COLLAPSED sparkline (single line per stock in the list view),
  // use a shared scale so totals are visually comparable across rows.
  const allGains = trend.flatMap(s => (s.weekly_history || []).map(h => Math.abs(h.change_pct)))
  const maxAbs = Math.max(20, ...allGains)

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Header */}
      <div style={{
        background: `linear-gradient(135deg, ${dark ? '#0d1830' : '#1a1a2e'} 0%, ${dark ? '#1a2855' : '#2d3561'} 100%)`,
        borderRadius: '14px 14px 0 0', padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 32 }}>📈</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-.02em' }}>
              {he ? 'המגמה — מניות עם הביצוע הטוב ביותר' : 'The Trend — Best Performing Stocks'}
            </div>
            <div style={{ fontSize: 13, color: '#b0bbd9', marginTop: 4 }}>
              {he
                ? 'דירוג לפי תשואה מצטברת אמיתית — ולצידה הסטטוס העדכני: האם המגמה עדיין רצה ב-4 השבועות האחרונים. מגמה שנשברה יוצאת מהרשימה.'
                : 'Ranked by real compound return — with a live status: is the trend still running over the last 4 weeks? Broken trends drop out.'}
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.08)',
            padding: '8px 14px', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.12)',
          }}>
            <div style={{ fontSize: 10, color: '#9aa3c2', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              {he ? 'מתעדכן כל סריקה' : 'Updates each scan'}
            </div>
            <div style={{ fontSize: 13, color: 'white', fontWeight: 700, marginTop: 2 }}>
              🔄 {he ? 'מי שלא ראויה, יוצאת' : 'Dynamic ranking'}
            </div>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: '0 0 14px 14px', overflow: 'hidden' }}>
        {trend.map((stock, i) => {
          const isTop3 = i < 3
          const isOpen = openTicker === stock.ticker
          const fullCmp = stock.full_compound_pct || 0
          const scanCmp = stock.scan_compound_pct || 0
          const compColor = fullCmp >= 0 ? '#097c3e' : '#c0392b'
          const history = stock.weekly_history || []
          // Merge scan-stored identity with freshly-fetched live data (live wins,
          // fills gaps when the weekly scan was rate-limited).
          const identity = { ...(stock.identity || {}), ...(liveIdentity[stock.ticker] || {}) }
          const rec = _recBadge(identity.recommendation)
          const sector = identity.sector || ''
          const mom = _trendMomentum(stock, he)

          return (
            <div key={stock.ticker}>
              {/* Collapsed row */}
              <div
                onClick={() => setOpenTicker(isOpen ? null : stock.ticker)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px',
                  borderBottom: isOpen ? 'none' : `1px solid ${c.border}`,
                  background: isOpen ? (dark ? '#0e1828' : '#f6fafe') :
                              isTop3 ? medalBg[i] : (i % 2 === 0 ? c.card : (dark ? '#141428' : '#fafafa')),
                  borderLeft: isTop3 ? `4px solid ${medalBorder[i]}` : '4px solid transparent',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {/* Rank */}
                <div style={{ width: 42, textAlign: 'center', flexShrink: 0 }}>
                  {isTop3
                    ? <span style={{ fontSize: 26 }}>{medals[i]}</span>
                    : <span style={{ fontSize: 15, fontWeight: 700, color: c.muted }}>#{i + 1}</span>}
                </div>

                {/* Ticker + name + sector */}
                <div style={{ width: 200, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 17, fontWeight: 800, color: c.text }}>{stock.ticker}</span>
                    {sector && (
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        background: dark ? '#1a2a3a' : '#e8f0fa',
                        color: dark ? '#7daaff' : '#1a4d8f',
                        padding: '2px 7px', borderRadius: 8,
                        border: `1px solid ${dark ? '#2a3a5a' : '#c8d4f0'}`,
                      }}>{sector}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: c.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 195 }}>
                    {stock.name}
                  </div>
                </div>

                {/* Sparkline of weekly gains */}
                <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 42, flex: 1, minWidth: 100, maxWidth: 360, overflow: 'hidden' }}>
                  {history.map((h, hi) => {
                    const abs = Math.abs(h.change_pct)
                    const barHeight = Math.max(2, (abs / maxAbs) * 38)
                    const positive = h.change_pct >= 0
                    return (
                      <div key={hi} title={`${h.week}: ${positive ? '+' : ''}${h.change_pct}%${h.in_scan ? ' (in top picks)' : ''}`} style={{
                        width: 7,
                        height: barHeight,
                        background: positive ? '#097c3e' : '#c0392b',
                        opacity: h.in_scan ? 1 : 0.42,
                        borderRadius: 1.5,
                        flexShrink: 0,
                      }} />
                    )
                  })}
                </div>

                {/* Analyst rating badge — fixed-width slot so other columns stay aligned */}
                <div style={{ width: 90, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                  {rec ? (
                    <span style={{
                      background: rec.bg, color: rec.color,
                      padding: '3px 10px', borderRadius: 12,
                      fontSize: 10, fontWeight: 700, letterSpacing: '.3px',
                    }}>{rec.label}</span>
                  ) : (
                    <span style={{
                      color: c.muted, fontSize: 10, fontWeight: 600,
                      opacity: 0.5, padding: '3px 6px',
                    }}>—</span>
                  )}
                </div>

                {/* Momentum NOW — the answer to "is this still worth anything today?" */}
                <div style={{ width: 104, flexShrink: 0, textAlign: 'center' }}>
                  {mom ? (
                    <>
                      <span title={he ? 'תשואה ב-4 השבועות האחרונים' : 'return over the last 4 weeks'} style={{
                        display: 'inline-block', background: dark ? 'transparent' : mom.bg,
                        color: dark ? mom.color : mom.color,
                        border: `1px solid ${mom.color}`,
                        padding: '3px 9px', borderRadius: 12, fontSize: 10, fontWeight: 800,
                      }}>{mom.icon} {mom.label}</span>
                      <div style={{ fontSize: 12, fontWeight: 800, color: mom.color, marginTop: 4 }}>
                        {mom.r4 >= 0 ? '+' : ''}{mom.r4}%
                      </div>
                      <div style={{ fontSize: 9, color: c.muted }}>{he ? '4 שבועות' : '4 weeks'}</div>
                    </>
                  ) : <span style={{ color: c.muted, fontSize: 10 }}>—</span>}
                </div>

                {/* Compound return */}
                <div style={{ textAlign: 'right', minWidth: 120 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: compColor, lineHeight: 1 }}>
                    {fullCmp >= 0 ? '+' : ''}{fullCmp.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 10, color: c.muted, marginTop: 3 }}>
                    {he ? 'תשואה מצטברת' : 'full compound'}
                  </div>
                </div>

                {/* Appearance count */}
                <div style={{ textAlign: 'center', minWidth: 60 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: c.text }}>
                    {stock.scan_appearances}/{stock.total_weeks}
                  </div>
                  <div style={{ fontSize: 9, color: c.muted, marginTop: 2 }}>
                    {he ? 'בסריקה' : 'in picks'}
                  </div>
                </div>

                <span style={{ fontSize: 14, color: c.muted, marginLeft: 4 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Expanded — full identity card */}
              {isOpen && (
                <div style={{
                  background: dark ? '#0a1422' : '#f3f7fc',
                  padding: '24px 28px',
                  borderBottom: `1px solid ${c.border}`,
                  borderLeft: `4px solid ${isTop3 ? medalBorder[i] : '#097c3e'}`,
                }}>

                  {/* Identity hero — ticker, name, sector, industry */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 28, fontWeight: 800, color: c.text, letterSpacing: '-.02em' }}>{stock.ticker}</span>
                        {identity.market_cap && (
                          <span style={{ fontSize: 13, fontWeight: 600, color: c.muted, background: c.card, padding: '3px 9px', borderRadius: 6, border: `1px solid ${c.border}` }}>
                            {_formatMcapShort(identity.market_cap)}
                          </span>
                        )}
                        {identity.price && (
                          <span style={{ fontSize: 15, fontWeight: 700, color: c.text }}>
                            ${identity.price}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 14, color: c.text, marginTop: 4, fontWeight: 600 }}>{stock.name}</div>
                      <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>
                        {identity.industry && <span>{identity.industry}</span>}
                        {identity.sector && identity.industry && <span> · </span>}
                        {identity.sector && !identity.industry && <span>{identity.sector}</span>}
                        {identity.country && <span> · {identity.country}</span>}
                      </div>
                    </div>
                    {/* Big compound return card */}
                    <div style={{
                      background: `linear-gradient(135deg, ${compColor}20, ${compColor}05)`,
                      border: `2px solid ${compColor}`,
                      borderRadius: 12, padding: '12px 20px', textAlign: 'center',
                      minWidth: 160,
                    }}>
                      <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                        {he ? 'תשואה מצטברת' : 'Full Compound'}
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: compColor, lineHeight: 1.1, marginTop: 4 }}>
                        {fullCmp >= 0 ? '+' : ''}{fullCmp.toFixed(1)}%
                      </div>
                      <div style={{ fontSize: 10, color: c.muted, marginTop: 4 }}>
                        {he ? `מעל ${stock.total_weeks} שבועות` : `over ${stock.total_weeks} weeks`}
                      </div>
                    </div>
                  </div>

                  {/* Stats grid — analyst, 52W, float */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>

                    {/* Analyst target — show data when available, honest empty state when not */}
                    {identity.target_mean ? (
                      <div style={{
                        background: c.card, border: `1px solid ${c.border}`,
                        borderRadius: 10, padding: '14px 16px',
                        borderTop: `3px solid #1a6bb5`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em' }}>
                            🎯 {he ? 'יעד אנליסטים' : 'Analyst Target'}
                          </div>
                          {rec && (
                            <span style={{ background: rec.bg, color: rec.color, padding: '2px 8px', borderRadius: 10, fontSize: 9, fontWeight: 700 }}>
                              {rec.label}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: c.text }}>
                          ${identity.target_mean}
                          {identity.target_upside_pct !== undefined && (
                            <span style={{
                              fontSize: 13,
                              marginLeft: 8,
                              color: identity.target_upside_pct >= 15 ? '#097c3e' : identity.target_upside_pct >= 0 ? '#cc8800' : '#c0392b',
                              fontWeight: 700,
                            }}>
                              {identity.target_upside_pct >= 0 ? '+' : ''}{identity.target_upside_pct}%
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>
                          {identity.target_low && identity.target_high
                            ? `${he ? 'טווח' : 'Range'}: $${identity.target_low}–$${identity.target_high}`
                            : ''}
                          {identity.analyst_count ? ` · ${identity.analyst_count} ${he ? 'אנליסטים' : 'analysts'}` : ''}
                        </div>
                      </div>
                    ) : (
                      <div title={he ? 'יכול לקרות כשהמנייה קטנה מדי, IPO טרי, חברה זרה, או OTC' : 'Common with small-cap, recent IPOs, foreign listings, or OTC stocks'} style={{
                        background: dark ? '#1a1623' : '#fafafa',
                        border: `1px dashed ${c.border}`,
                        borderRadius: 10, padding: '14px 16px',
                        borderTop: `3px solid #888`,
                      }}>
                        <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em', marginBottom: 6 }}>
                          🎯 {he ? 'יעד אנליסטים' : 'Analyst Target'}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: c.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                          ⚠️ {he ? 'אין כיסוי אנליסטים' : 'No analyst coverage'}
                        </div>
                        <div style={{ fontSize: 11, color: c.muted, marginTop: 4, lineHeight: 1.4 }}>
                          {he
                            ? 'מנייה קטנה, IPO טרי, או חברה זרה — אין נתונים זמינים ב-Yahoo Finance'
                            : 'Small-cap, recent IPO, or foreign listing — no data in Yahoo Finance'}
                        </div>
                      </div>
                    )}

                    {/* 52W Range — visual bar */}
                    {identity.high_52w !== undefined && identity.low_52w !== undefined && (
                      <div style={{
                        background: c.card, border: `1px solid ${c.border}`,
                        borderRadius: 10, padding: '14px 16px',
                        borderTop: `3px solid #cc8800`,
                      }}>
                        <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em', marginBottom: 8 }}>
                          📅 {he ? 'טווח 52 שבועות' : '52-Week Range'}
                        </div>
                        <div style={{ position: 'relative', height: 8, background: dark ? '#0a1520' : '#e6f0fa', borderRadius: 4, marginBottom: 8 }}>
                          {identity.pos_in_52w_range_pct !== undefined && (
                            <div style={{
                              position: 'absolute', left: `${Math.max(0, Math.min(100, identity.pos_in_52w_range_pct))}%`,
                              top: -3, width: 14, height: 14, borderRadius: '50%',
                              background: identity.pos_in_52w_range_pct >= 80 ? '#097c3e' : identity.pos_in_52w_range_pct >= 50 ? '#cc8800' : '#888',
                              transform: 'translateX(-50%)',
                              boxShadow: `0 0 0 2px ${c.card}`,
                            }} />
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: c.muted }}>
                          <span style={{ fontWeight: 700, color: c.text }}>${identity.low_52w}</span>
                          {identity.pos_in_52w_range_pct !== undefined && (
                            <span style={{ fontSize: 10 }}>{identity.pos_in_52w_range_pct}%</span>
                          )}
                          <span style={{ fontWeight: 700, color: c.text }}>${identity.high_52w}</span>
                        </div>
                        {(identity.gain_from_52w_low_pct !== undefined || identity.gain_to_52w_high_pct !== undefined) && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: c.muted, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${c.border}` }}>
                            <span><span style={{ color: '#097c3e', fontWeight: 700 }}>+{identity.gain_from_52w_low_pct}%</span> {he ? 'מהתחתית' : 'from low'}</span>
                            <span><span style={{ color: '#cc8800', fontWeight: 700 }}>+{identity.gain_to_52w_high_pct}%</span> {he ? 'אפסייד לשיא' : 'upside to high'}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Float + short */}
                    {(identity.float_m !== undefined || identity.short_pct !== undefined) && (
                      <div style={{
                        background: c.card, border: `1px solid ${c.border}`,
                        borderRadius: 10, padding: '14px 16px',
                        borderTop: `3px solid #097c3e`,
                      }}>
                        <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em', marginBottom: 8 }}>
                          📊 {he ? 'מבנה ההון' : 'Share Structure'}
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          {identity.float_m !== undefined && (
                            <div>
                              <div style={{ fontSize: 11, color: c.muted }}>Float</div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: identity.float_m < 30 ? '#097c3e' : identity.float_m > 100 ? '#c0392b' : c.text }}>
                                {identity.float_m}M
                              </div>
                            </div>
                          )}
                          {identity.short_pct !== undefined && (
                            <div>
                              <div style={{ fontSize: 11, color: c.muted }}>{he ? 'שורט' : 'Short'}</div>
                              <div style={{ fontSize: 16, fontWeight: 800, color: identity.short_pct > 15 ? '#cc8800' : c.text }}>
                                {identity.short_pct}%
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Business summary */}
                  {identity.business_summary && (
                    <div style={{
                      background: c.card, border: `1px solid ${c.border}`,
                      borderRadius: 10, padding: '14px 18px', marginBottom: 18,
                      borderLeft: `4px solid #1a1a2e`,
                    }}>
                      <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        🏢 {he ? 'תיאור עסקי' : 'Business Overview'}
                        {identity.website && (
                          <a href={identity.website} target="_blank" rel="noopener noreferrer" style={{ color: '#1a6bb5', fontSize: 10, textDecoration: 'none', marginLeft: 'auto' }}>
                            🔗 {he ? 'אתר' : 'Website'}
                          </a>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: c.text, lineHeight: 1.6 }}>
                        {summaryExpanded[stock.ticker] || identity.business_summary.length < 240
                          ? identity.business_summary
                          : identity.business_summary.slice(0, 240) + '... '}
                        {identity.business_summary.length >= 240 && !summaryExpanded[stock.ticker] && (
                          <button
                            onClick={() => setSummaryExpanded(prev => ({ ...prev, [stock.ticker]: true }))}
                            style={{ background: 'none', border: 'none', color: '#1a6bb5', cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0 }}
                          >
                            {he ? '... קרא עוד' : '... read more'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Live TradingView chart */}
                  <ChartSection ticker={stock.ticker} c={c} dark={dark} he={he} />

                  {/* Weekly trend visualization — big & beautiful */}
                  <div style={{
                    background: c.card, border: `1px solid ${c.border}`,
                    borderRadius: 10, padding: '16px 20px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontSize: 11, color: c.muted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.06em' }}>
                        📅 {he ? 'המגמה השבועית — תשואה לכל שבוע' : 'Weekly Trend — Returns by Week'}
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: c.muted }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: '#FFD700', fontSize: 13, lineHeight: 1, textShadow: '0 0 4px rgba(255,215,0,0.5)' }}>★</span>
                          {he ? 'הופיעה בסריקה שלנו' : 'Appeared in our scans'}
                        </span>
                      </div>
                    </div>

                    {/* Pro-grade diverging bar chart: greens UP, reds DOWN, no visible axis */}
                    {(() => {
                      const HALF = 80   // pixels for each direction (up/down)
                      const LABEL_SPACE = 18  // pixels reserved above/below for labels
                      const MIDLINE = HALF + LABEL_SPACE  // y-coordinate of the invisible 0 line
                      const TOTAL_H = HALF * 2 + LABEL_SPACE * 2
                      const greens = '#00c853'
                      const greensDim = '#0a5e30'
                      const reds = '#ff3b30'
                      const redsDim = '#9c2a1f'
                      // PER-STOCK max so this stock's biggest week takes the full bar height —
                      // makes small weeks (+5% vs +10% vs +15%) visually distinguishable instead
                      // of squished against a global +229% maximum.
                      const stockMaxAbs = Math.max(5, ...history.map(h => Math.abs(h.change_pct)))
                      return (
                        <div style={{
                          position: 'relative',
                          height: TOTAL_H,
                          marginBottom: 8,
                        }}>
                          {/* Simple horizontal baseline — no label, just a clean line */}
                          <div style={{
                            position: 'absolute',
                            top: MIDLINE,
                            left: 0, right: 0,
                            height: 1,
                            background: dark ? '#2a2a3e' : '#dcdce6',
                            zIndex: 1,
                          }} />

                          <div style={{ display: 'flex', height: '100%', gap: 4, position: 'relative', zIndex: 2 }}>
                            {history.map((h, hi) => {
                              const positive = h.change_pct >= 0
                              const abs = Math.abs(h.change_pct)
                              // SQRT scaling — gives meaningful visual distinction between small
                              // weeks (+6 vs +10 vs +19) without losing the magnitude of huge
                              // weeks (+229 still dominates, but small ones aren't all flat 4px).
                              // This is how pro trading platforms (Bloomberg/TradingView) handle
                              // wide-range bar charts: linear scaling crushes small values.
                              const ratio = Math.sqrt(abs / stockMaxAbs)
                              const barH = Math.max(5, ratio * HALF)
                              // ALL bars get the vivid color treatment — bold and prominent regardless of scan presence
                              const fill = positive ? greens : reds
                              const borderColor = positive ? greensDim : redsDim
                              const glow = positive ? greens : reds
                              return (
                                <div key={hi} style={{
                                  flex: 1, position: 'relative', minWidth: 0,
                                }} title={`${h.week}: ${positive ? '+' : ''}${h.change_pct.toFixed(1)}%${h.in_scan ? ' · ★ appeared in our scans' : ''}`}>
                                  {positive ? (
                                    <>
                                      <div style={{
                                        position: 'absolute',
                                        top: MIDLINE - barH - LABEL_SPACE,
                                        left: '50%', transform: 'translateX(-50%)',
                                        fontSize: 11, fontWeight: 800,
                                        color: fill,
                                        whiteSpace: 'nowrap',
                                        display: 'flex', alignItems: 'center', gap: 3,
                                      }}>
                                        {h.in_scan && <span style={{ color: '#FFD700', fontSize: 12, textShadow: '0 0 3px rgba(255,215,0,0.6)' }}>★</span>}
                                        +{Math.round(h.change_pct)}%
                                      </div>
                                      <div style={{
                                        position: 'absolute',
                                        top: MIDLINE - barH,
                                        left: '50%', transform: 'translateX(-50%)',
                                        width: '85%', maxWidth: 34,
                                        height: barH,
                                        background: fill,
                                        borderRadius: '4px 4px 0 0',
                                        border: `2px solid ${borderColor}`,
                                        boxShadow: `0 0 8px ${glow}40`,
                                      }} />
                                    </>
                                  ) : (
                                    <>
                                      <div style={{
                                        position: 'absolute',
                                        top: MIDLINE,
                                        left: '50%', transform: 'translateX(-50%)',
                                        width: '85%', maxWidth: 34,
                                        height: barH,
                                        background: fill,
                                        borderRadius: '0 0 4px 4px',
                                        border: `2px solid ${borderColor}`,
                                        boxShadow: `0 0 8px ${glow}40`,
                                      }} />
                                      <div style={{
                                        position: 'absolute',
                                        top: MIDLINE + barH + 2,
                                        left: '50%', transform: 'translateX(-50%)',
                                        fontSize: 11, fontWeight: 800,
                                        color: fill,
                                        whiteSpace: 'nowrap',
                                        display: 'flex', alignItems: 'center', gap: 3,
                                      }}>
                                        {h.in_scan && <span style={{ color: '#FFD700', fontSize: 12, textShadow: '0 0 3px rgba(255,215,0,0.6)' }}>★</span>}
                                        {Math.round(h.change_pct)}%
                                      </div>
                                    </>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Week labels */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${c.border}` }}>
                      {history.map((h, hi) => {
                        const dateOnly = h.week.split('-')[1] || h.week
                        const short = dateOnly.replace(/\.20\d\d$/, '')
                        return (
                          <div key={hi} style={{
                            flex: 1, textAlign: 'center', minWidth: 0,
                            fontSize: 9, color: c.muted, fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}>
                            {short}
                          </div>
                        )
                      })}
                    </div>

                    {/* Quick summary footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.border}`, fontSize: 11, color: c.muted, flexWrap: 'wrap', gap: 12 }}>
                      <span><strong style={{ color: c.text }}>{stock.scan_appearances}</strong> {he ? 'הופעות בסריקה' : 'scan appearances'}</span>
                      <span><strong style={{ color: c.text }}>{history.filter(h => h.change_pct > 0).length}/{history.length}</strong> {he ? 'שבועות חיוביים' : 'positive weeks'}</span>
                      <span><strong style={{ color: c.text }}>{scanCmp >= 0 ? '+' : ''}{scanCmp}%</strong> {he ? 'תשואת סריקה (רק שבועות שהופיעה)' : 'scan compound only'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


function Chip({ label, bg, color }) {
  return <span style={{ background: bg, color, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{label}</span>
}

function formatMcap(market_cap) {
  if (!market_cap) return 'N/A'
  if (market_cap >= 1_000_000_000) return `$${(market_cap / 1_000_000_000).toFixed(1)}B`
  return `$${Math.round(market_cap / 1_000_000)}M`
}

function StockRow({ stock, rank, isOpen, onClick, c, t, dark, appearanceCount, totalScans }) {
  const buzz = stock.buzz || {}

  const count = appearanceCount || 1
  const pct = totalScans > 0 ? (count / totalScans) * 100 : 0
  const trendBadge =
    pct > 70 ? { bg: dark ? '#1a3a1a' : '#EAF3DE', color: dark ? '#7dcc7d' : '#27500A', text: `🟢 ${count}/${totalScans} ${t.appearances}` } :
    pct > 30 ? { bg: dark ? '#3a2a0a' : '#FAEEDA', color: dark ? '#ffcc66' : '#633806', text: `🟡 ${count}/${totalScans} ${t.appearances}` } :
    { bg: dark ? '#3a0a0a' : '#FCEBEB', color: dark ? '#ff8888' : '#791F1F', text: `🔴 ${count}/${totalScans} ${t.appearances}` }

  const buzzScore = buzz.score || 0
  const isBuzzAlert = stock.buzz_alert || buzzScore >= 7

  return (
    <tr onClick={onClick} style={{ borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: isOpen ? c.rowSelected : c.card }}
      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = c.rowHover }}
      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = c.card }}>
      <td style={{ padding: '11px 14px', color: c.muted, fontSize: 13 }}>{rank}</td>
      <td style={{ padding: '11px 14px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {stock.ticker}
          {isBuzzAlert && <span title="High buzz" style={{ fontSize: 13 }}>🔥</span>}
          {stock.recommended && (
            <span title={t.whyRecommended} style={{
              background: 'linear-gradient(90deg,#ff8c00 0%,#ffaa33 100%)',
              color: 'white', padding: '2px 8px', borderRadius: 10,
              fontSize: 10, fontWeight: 800, letterSpacing: '.3px',
            }}>
              {stock.rec_category === 'candidate' ? '✨ Candidate' : t.pickNextWeek}
            </span>
          )}
          {stock.rec_rejected && (
            <span title="Rejected — weak weekly close" style={{
              background: dark ? '#3a1a1a' : '#FCEBEB',
              color: '#c0392b', padding: '2px 8px', borderRadius: 10,
              fontSize: 10, fontWeight: 700, border: `1px solid ${dark ? '#5a1f1f' : '#f5c6c4'}`,
            }}>
              🔴 Rejected
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{stock.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          <Sparkline ticker={stock.ticker} width={72} height={20} />
          <RSIBadge ticker={stock.ticker} dark={dark} c={c} size="small" />
        </div>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#097c3e' }}>+{stock.change_pct}%</span>
      </td>
      <td style={{ padding: '11px 14px', color: c.muted, fontSize: 13 }}>{formatMcap(stock.market_cap)}</td>
      <td style={{ padding: '11px 14px' }}>
        <VolSpike ticker={stock.ticker} dark={dark} c={c} />
      </td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ background: trendBadge.bg, color: trendBadge.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{trendBadge.text}</span>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <button onClick={e => { e.stopPropagation(); onClick() }} style={{ fontSize: 11, color: '#097c3e', background: 'none', border: '1px solid #097c3e', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {isOpen ? t.close : t.details}
        </button>
      </td>
    </tr>
  )
}

function SentimentBar({ label, bullPct, c, t }) {
  const bearPct = 100 - bullPct
  const sentLabel = bullPct >= 60 ? t.bullish : bullPct <= 40 ? t.bearish : t.neutral
  const sentColor = bullPct >= 60 ? c.bullColor : bullPct <= 40 ? c.bearColor : c.neutralColor
  
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
        <span style={{ color: c.muted, fontWeight: 600 }}>{label}</span>
        <span style={{ color: sentColor, fontWeight: 700 }}>{bullPct}% {sentLabel}</span>
      </div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: c.chipBg }}>
        <div style={{ width: `${bullPct}%`, background: c.bullColor }} />
        <div style={{ width: `${bearPct}%`, background: c.bearColor }} />
      </div>
    </div>
  )
}

function QuoteCard({ quote, c, dark }) {
  const isReddit = quote.source === 'reddit'
  const sourceColor = isReddit ? '#FF4500' : '#378ADD'
  const sentimentEmoji = quote.sentiment === 'bullish' ? '📈' : quote.sentiment === 'bearish' ? '📉' : ''
  
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderLeft: `3px solid ${sourceColor}`, borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
      <div style={{ fontSize: 13, color: c.text, lineHeight: 1.6, fontStyle: 'italic' }}>
        {sentimentEmoji && <span style={{ marginRight: 6 }}>{sentimentEmoji}</span>}
        "{quote.text}"
      </div>
      <div style={{ fontSize: 11, color: c.muted, marginTop: 6, display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ color: sourceColor, fontWeight: 600 }}>
          {isReddit ? `r/${quote.subreddit}` : 'StockTwits'}
        </span>
        {quote.upvotes > 0 && <span>↑ {quote.upvotes}</span>}
      </div>
    </div>
  )
}

function IdentityCard({ stock, c, t, dark, lang }) {
  const sig = stock.rec_signals || {}
  const cats = stock.rec_catalysts || []
  const score = stock.rec_score
  const recommended = stock.recommended
  const breakdown = sig.score_breakdown || null
  const category = stock.rec_category || null
  const rejected = stock.rec_rejected === true || sig.rejected === true
  const rejectedReason = sig.rejected_reason
  const gap = stock.rec_gap

  // V3 breakdown: arrays of [label, value] tuples for plus and minus
  const plusSignals  = Array.isArray(breakdown?.plus)  ? breakdown.plus  : null
  const minusSignals = Array.isArray(breakdown?.minus) ? breakdown.minus : null
  const isV3 = !!(plusSignals || minusSignals)

  // Don't show anything if we don't have scoring data at all
  if (score === undefined && !Object.keys(sig).length) return null

  const he = lang === 'he'

  // V3 category styling
  const categoryInfo = {
    pick:      { label: he ? '🔥 הבחירה לשבוע הקרוב' : '🔥 Pick for Next Week',  color: '#fff', bg: 'linear-gradient(90deg,#ff8c00,#ffaa33)' },
    candidate: { label: he ? '✨ מועמדת מובילה'       : '✨ Best Candidate',       color: '#7a4a00', bg: dark ? '#3a2a0a' : '#FAEEDA' },
    possible:  { label: he ? '• אופציה'              : '• Possible',              color: c.muted, bg: dark ? '#1e1e32' : '#f0f0f0' },
    avoid:     { label: he ? '🔴 להימנע'              : '🔴 Avoid',                color: '#c0392b', bg: dark ? '#3a1a1a' : '#FCEBEB' },
    rejected:  { label: he ? '🔴 נדחתה — סגירה חלשה'  : '🔴 Rejected — weak close', color: '#c0392b', bg: dark ? '#3a1a1a' : '#FCEBEB' },
    no_pick:   { label: he ? '⚠️ אין בחירה'           : '⚠️ No Pick',              color: c.muted, bg: dark ? '#2a2a3e' : '#f0f0f0' },
  }
  const catTag = category && categoryInfo[category]

  const Stat = ({ label, value, color = c.text, hint }) => (
    <div style={{
      background: c.card, border: `1px solid ${c.border}`,
      borderRadius: 8, padding: '10px 12px', minWidth: 110, flex: '1 1 110px',
    }}>
      <div style={{ fontSize: 10, color: c.muted, textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: c.muted, marginTop: 2 }}>{hint}</div>}
    </div>
  )

  // Float hint for the boss
  const floatHint = sig.float_m
    ? (sig.float_m < 15  ? (he ? '🔥 זעיר — פוטנציאל פיצוץ' : '🔥 Tiny — explosive')
    : sig.float_m < 30   ? (he ? 'קטן — חיובי' : 'Small — bullish')
    : sig.float_m < 60   ? (he ? 'בינוני' : 'Medium')
    : sig.float_m > 100  ? (he ? 'גדול — שלילי' : 'Large — bearish')
    : null) : null

  const bg = recommended
    ? `linear-gradient(135deg, ${dark ? '#3a2a05' : '#fff8e8'} 0%, ${dark ? '#2a1f08' : '#fff3cd'} 100%)`
    : rejected
    ? (dark ? '#1f0d0d' : '#fdf0ef')
    : c.panelBg
  const border = recommended ? '#ff8c00' : rejected ? '#c0392b' : c.border

  return (
    <div style={{
      background: bg,
      border: `2px solid ${border}`,
      borderRadius: 12, padding: 16, marginBottom: 18,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: recommended ? '#7a4a00' : rejected ? '#c0392b' : c.muted, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            🧬 {t.identityCard}
          </div>
          {/* Category badge (V3) — shows pick / candidate / possible / avoid / rejected */}
          {catTag && (
            <span title={gap !== undefined && gap !== 0 ? `${t.gap}: +${gap}` : ''} style={{
              background: catTag.bg, color: catTag.color,
              padding: '4px 12px', borderRadius: 14,
              fontSize: 11, fontWeight: 800, letterSpacing: '.3px',
            }}>
              {catTag.label}
            </span>
          )}
        </div>
        {score !== undefined && !rejected && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 10, color: c.muted, fontWeight: 600 }}>{t.recScore}:</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: score >= 5 ? '#097c3e' : score >= 3 ? '#cc8800' : score > 0 ? c.text : '#c0392b' }}>{score}</span>
          </div>
        )}
      </div>

      {/* Rejected banner — explain why */}
      {rejected && rejectedReason && (
        <div style={{
          background: dark ? '#2a0e0e' : '#fef0ef',
          border: `1px solid ${dark ? '#5a1f1f' : '#f5c6c4'}`,
          borderLeft: `4px solid #c0392b`,
          padding: '10px 12px', borderRadius: 8, marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: '#c0392b', fontWeight: 800, marginBottom: 3 }}>
            {he ? '🔴 הסיבה לדחייה' : '🔴 Why rejected'}
          </div>
          <div style={{ fontSize: 13, color: c.text }}>{rejectedReason}</div>
          <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>
            {he ? 'סגירה מתחת ל-60% מטווח השבוע = הקונים איבדו שליטה' : 'Closing below 60% of weekly range = buyers lost control'}
          </div>
        </div>
      )}

      {/* V3 — Strength signals (the +s) */}
      {isV3 && plusSignals && plusSignals.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#097c3e', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
            🟢 {he ? 'אותות חוזק' : 'Strength signals'} (+{breakdown.plus_total || 0})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {plusSignals.map(([label, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: c.text }}>
                <span>{label}</span>
                <span style={{ color: '#097c3e', fontWeight: 700, marginLeft: 8, whiteSpace: 'nowrap' }}>+{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* V3 — Weakness signals (the -s) */}
      {isV3 && minusSignals && minusSignals.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#c0392b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
            🔴 {he ? 'אותות חולשה' : 'Weakness signals'} ({breakdown.minus_total || 0})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {minusSignals.map(([label, v], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: c.text }}>
                <span>{label}</span>
                <span style={{ color: '#c0392b', fontWeight: 700, marginLeft: 8, whiteSpace: 'nowrap' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: cats.length ? 12 : 0 }}>
        {sig.float_m !== undefined && (
          <Stat
            label={t.floatLabel}
            value={`${sig.float_m}M`}
            color={sig.float_m < 30 ? '#097c3e' : sig.float_m > 100 ? '#c0392b' : c.text}
            hint={floatHint}
          />
        )}
        {sig.volume_ratio !== undefined && (
          <Stat
            label={t.volRatio}
            value={`${sig.volume_ratio}x`}
            color={sig.volume_ratio >= 4 ? '#097c3e' : sig.volume_ratio >= 2 ? '#cc8800' : c.text}
            hint={he ? 'שבוע מול ממוצע 3 חודשים' : 'Week vs 3-mo avg'}
          />
        )}
        {sig.short_pct !== undefined && (
          <Stat label={t.shortInt} value={`${sig.short_pct}%`} />
        )}
        {sig.close_location_pct !== undefined && (
          <Stat
            label={t.closeLoc}
            value={`${sig.close_location_pct}%`}
            color={sig.close_location_pct >= 85 ? '#097c3e' : c.text}
          />
        )}
        {sig.earnings_in_days !== undefined && (
          <Stat
            label={t.earningsIn}
            value={`${sig.earnings_in_days} ${t.days}`}
            color="#cc8800"
            hint={he ? '📊 וולטיליות צפויה' : '📊 Volatility ahead'}
          />
        )}
      </div>

      {/* 52-week range — visual bar with high/low/current */}
      {(sig.high_52w !== undefined || sig.low_52w !== undefined) && (() => {
        const hi = sig.high_52w
        const lo = sig.low_52w
        const pos = sig.pos_in_52w_range_pct
        const fromLow = sig.gain_from_52w_low_pct
        const distHigh = sig.dist_from_52w_high_pct
        const gainToHigh = sig.gain_to_52w_high_pct
        const price = stock.price
        // Color the position dot: greener as it approaches the high
        const posColor = pos === undefined ? c.muted
          : pos >= 80 ? '#097c3e'
          : pos >= 50 ? '#cc8800'
          : '#888'
        return (
          <div style={{
            background: c.card, border: `1px solid ${c.border}`,
            borderRadius: 8, padding: '12px 14px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 10, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
              📅 {t.range52w}
            </div>
            {/* Bar */}
            {hi !== undefined && lo !== undefined && pos !== undefined && (
              <div style={{ position: 'relative', height: 8, background: dark ? '#0a1520' : '#e6f0fa', borderRadius: 4, marginBottom: 10 }}>
                <div style={{
                  position: 'absolute', left: `${Math.max(0, Math.min(100, pos))}%`,
                  top: -3, width: 14, height: 14, borderRadius: '50%',
                  background: posColor, transform: 'translateX(-50%)',
                  boxShadow: `0 0 0 2px ${c.card}`,
                }} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: c.muted }}>
              <div>
                <div style={{ fontWeight: 700, color: c.text }}>${lo !== undefined ? lo : '—'}</div>
                <div>{t.low52}</div>
              </div>
              {price !== undefined && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, color: posColor }}>${price}</div>
                  {pos !== undefined && <div>{pos}% {t.posInRange}</div>}
                </div>
              )}
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: c.text }}>${hi !== undefined ? hi : '—'}</div>
                <div>{t.high52}</div>
              </div>
            </div>
            {(fromLow !== undefined || gainToHigh !== undefined || distHigh !== undefined) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: c.muted, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${c.border}` }}>
                {fromLow !== undefined && (
                  <span><span style={{ color: '#097c3e', fontWeight: 700 }}>+{fromLow}%</span> {t.fromLow}</span>
                )}
                {gainToHigh !== undefined ? (
                  <span title={distHigh !== undefined ? `${distHigh}% ${he ? 'מהשיא' : 'below high'}` : ''}><span style={{ color: '#cc8800', fontWeight: 700 }}>+{gainToHigh}%</span> {t.gainToHigh}</span>
                ) : distHigh !== undefined && (
                  <span>-{distHigh}% {t.distHigh}</span>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Why this pick — catalysts */}
      {cats.length > 0 && (
        <div style={{
          background: dark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.5)',
          padding: '10px 12px', borderRadius: 8,
          borderLeft: `3px solid ${recommended ? '#ff8c00' : c.muted}`,
        }}>
          <div style={{ fontSize: 10, color: c.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
            ✨ {t.whyRecommended}
          </div>
          <div style={{ fontSize: 13, color: c.text, lineHeight: 1.5 }}>
            {cats.join(' · ')}
          </div>
        </div>
      )}
    </div>
  )
}

function StockPanel({ stock, scans, c, t, dark, lang, onClose, buzzByTicker }) {
  const buzz = (buzzByTicker && buzzByTicker[stock.ticker]) || stock.buzz || {}
  const quotes = buzz.quotes || []

  // Only the weeks where this stock actually appeared — sorted oldest first
  const appearances = scans
    .map((scan, scanIndex) => {
      const found = (scan.stocks || []).find(s => s.ticker === stock.ticker)
      if (!found) return null
      const rank = (scan.stocks || []).findIndex(x => x.ticker === stock.ticker) + 1
      const isCurrentWeek = scanIndex === 0
      return { week: scan.week_label, stock: found, rank, isCurrentWeek }
    })
    .filter(Boolean)
    .reverse() // oldest → newest

  const totalScans = scans.length
  const appearanceCount = appearances.length

  const buzzScore = buzz.score || 0
  const hasBuzz = (buzz.reddit_count || 0) + (buzz.stocktwits_count || 0) > 0
  const redditBull = buzz.reddit_bullish_pct ?? 50
  const stBull = buzz.stocktwits_bullish_pct ?? buzz.sentiment_pct ?? 50

  return (
    <div style={{ background: c.panelBg, borderTop: '2px solid #097c3e', padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: c.text }}>{stock.ticker}</span>
            <span style={{ background: dark ? '#1a3a1a' : '#EAF3DE', color: dark ? '#7dcc7d' : '#27500A', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              {appearanceCount}/{totalScans} {t.appearances}
            </span>
            {buzzScore > 0 && (
              <span style={{ background: dark ? '#1a3a1a' : '#EAF3DE', color: dark ? '#7dcc7d' : '#27500A', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                {t.buzzTitle} {buzzScore}/10
              </span>
            )}
            {(stock.buzz_alert || buzzScore >= 7) && (
              <span style={{ background: dark ? '#3a2a0a' : '#FAEEDA', color: dark ? '#ffcc66' : '#633806', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                🔥 {t.buzzAlert}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: c.muted }}>{stock.name}</div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#097c3e' }}>+{stock.change_pct}%</div>
          <div style={{ fontSize: 12, color: c.muted }}>{t.thisWeek}</div>
          <Sparkline ticker={stock.ticker} width={110} height={32} />
          <button onClick={onClose} style={{ marginTop: 2, fontSize: 12, background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 10px', color: c.muted, cursor: 'pointer' }}>
            ✕ {t.close}
          </button>
        </div>
      </div>

      {/* IDENTITY CARD — recommendation signals from the data-driven scoring */}
      <IdentityCard stock={stock} c={c} t={t} dark={dark} lang={lang} />

      {/* Analyst consensus banner — show when available */}
      {buzz.analyst_target && (() => {
        const upside  = buzz.analyst_upside_pct || 0
        const rec     = buzz.analyst_recommendation || ''
        const isBull  = rec === 'strong_buy' || rec === 'buy'
        const recLabel = rec === 'strong_buy' ? 'Strong Buy' : rec === 'buy' ? 'Buy' : rec === 'hold' ? 'Hold' : rec === 'sell' ? 'Sell' : rec
        const upsideColor = upside >= 15 ? '#097c3e' : upside >= 0 ? '#cc8800' : '#c0392b'
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: isBull ? (dark ? '#0e1e2e' : '#e8f4ff') : (dark ? '#2a2a3e' : '#f5f5f5'), border: `1px solid ${isBull ? (dark ? '#2a4a6a' : '#b8d4ef') : c.border}` }}>
            <span style={{ fontSize: 16 }}>🎯</span>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: c.text }}>
                {lang === 'he' ? 'יעד אנליסטים' : 'Analyst target'}: <span style={{ color: upsideColor }}>${buzz.analyst_target} ({upside >= 0 ? '+' : ''}{upside}% upside)</span>
              </span>
              <span style={{ fontSize: 11, color: c.muted, marginLeft: 8 }}>
                {recLabel}{buzz.analyst_count ? ` · ${buzz.analyst_count} analysts` : ''}
              </span>
            </div>
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* LEFT: Appearance history — only weeks where stock appeared */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
            {t.appHistory} ({appearanceCount}/{totalScans})
          </div>
          {appearances.map(({ week, stock: s, rank, isCurrentWeek }, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'center',
              padding: '8px 12px', marginBottom: 6, borderRadius: 8,
              background: isCurrentWeek ? (dark ? '#0d2a18' : '#e8f5ee') : c.card,
              border: `1px solid ${isCurrentWeek ? '#097c3e' : c.border}`,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#097c3e', flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: c.muted }}>{week}</span>
                  {isCurrentWeek && (
                    <span style={{ background: dark ? '#3a2a0a' : '#FAEEDA', color: dark ? '#ffcc66' : '#633806', padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>
                      {t.thisWeek}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#097c3e' }}>+{s.change_pct}%</span>
                  <span style={{ fontSize: 11, color: c.muted, background: c.chipBg, padding: '1px 6px', borderRadius: 6 }}>#{rank}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT: Sentiment + Buzz Score */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
            📊 {t.sentimentTitle}
          </div>

          {hasBuzz ? (
            <>
              <SentimentBar label={t.redditSentiment} bullPct={redditBull} c={c} t={t} />
              <SentimentBar label={t.stocktwitsSentiment} bullPct={stBull} c={c} t={t} />

              {/* Buzz Score Big */}
              <div style={{ marginTop: 16, padding: '14px 16px', background: c.card, border: `1px solid ${c.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: c.muted, marginBottom: 4 }}>🔥 {t.buzzScore}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: buzzScore >= 7 ? '#097c3e' : buzzScore >= 4 ? '#cc8800' : c.muted }}>
                    {buzzScore}
                  </span>
                  <span style={{ fontSize: 14, color: c.muted }}>/10</span>
                </div>
                <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{t.relativeBuzz}</div>
              </div>

              {/* Topics */}
              {buzz.topics && buzz.topics.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', marginBottom: 8 }}>{t.topTopics}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {buzz.topics.map((topic, i) => (
                      <span key={i} style={{ fontSize: 12, color: c.text, padding: '4px 10px', background: c.card, borderRadius: 12, border: `1px solid ${c.border}` }}>
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: c.muted, fontSize: 13, fontStyle: 'italic', background: c.card, borderRadius: 8, border: `1px solid ${c.border}` }}>
              {t.noBuzz}
            </div>
          )}
        </div>
      </div>

      {/* Quotes - full width */}
      {quotes.length > 0 && (
        <div style={{ marginTop: 20, borderTop: `1px solid ${c.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
            {t.whatSaying}
          </div>
          {quotes.map((q, i) => <QuoteCard key={i} quote={q} c={c} dark={dark} />)}
        </div>
      )}

      {/* Market data */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
        <MetaCard label={t.mktCap} value={formatMcap(stock.market_cap)} c={c} />
        <MetaCard label={t.price} value={`$${stock.price?.toFixed(2) || 'N/A'}`} c={c} />
        <MetaCard label={t.volume} value={stock.volume ? `${(stock.volume / 1_000_000).toFixed(0)}M` : 'N/A'} c={c} />
        <MetaCard label={t.buzzScore} value={buzzScore > 0 ? `${buzzScore}/10` : '—'} c={c} />
        {buzz.analyst_target && <MetaCard label={lang === 'he' ? 'יעד אנליסטים' : 'Analyst target'} value={`$${buzz.analyst_target}`} c={c} />}
        {buzz.analyst_upside_pct != null && <MetaCard label={lang === 'he' ? 'פוטנציאל עלייה' : 'Upside'} value={`${buzz.analyst_upside_pct >= 0 ? '+' : ''}${buzz.analyst_upside_pct}%`} c={c} />}
        <MetaCard label="RSI (14)" value={<RSIBadge ticker={stock.ticker} dark={dark} c={c} size="large" />} c={c} />
      </div>
    </div>
  )
}

function MetaCard({ label, value, c }) {
  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: c.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{value}</div>
    </div>
  )
}
