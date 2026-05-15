import { createClient } from '@supabase/supabase-js'
import { useState, useEffect, useRef } from 'react'

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
    scanMsg: 'סריקה הופעלה! רענן בעוד 2 דקות.',
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
  },
  en: {
    title: 'Stock Scout',
    subtitle: 'Weekly Stock Scanner',
    minCap: 'Min Market Cap',
    million: 'Million',
    runScan: '▶ Run Scan',
    running: 'Running...',
    scanMsg: 'Scan triggered! Refresh in 2 minutes.',
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
  const { data: scans } = await supabase
    .from('weekly_scans')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  const processed = (scans || []).map(scan => {
    try {
      const parsed = JSON.parse(scan.stocks_json)
      return { ...scan, stocks: parsed.stocks || parsed, bonus: parsed.bonus || [] }
    } catch { return { ...scan, stocks: [], bonus: [] } }
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

  return { props: { scans: unique, appearanceCounts, totalScans, hallOfFame, weekLabelsOldestFirst, buzzByTicker } }
}

export default function Dashboard({ scans, appearanceCounts, totalScans, hallOfFame, weekLabelsOldestFirst, buzzByTicker }) {
  const [dark, setDark] = useState(false)
  const [lang, setLang] = useState('he')
  const [tab, setTab] = useState('weekly')
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [openStock, setOpenStock] = useState(null)
  const [marketCapInput, setMarketCapInput] = useState('250')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const t = T[lang]
  const c = COLORS[dark ? 'dark' : 'light']

  useEffect(() => {
    if (localStorage.getItem('dark') === 'true') setDark(true)
    if (localStorage.getItem('lang')) setLang(localStorage.getItem('lang'))
  }, [])

  const toggleDark = () => setDark(d => { localStorage.setItem('dark', !d); return !d })
  const toggleLang = () => setLang(l => { const nl = l === 'he' ? 'en' : 'he'; localStorage.setItem('lang', nl); return nl })

  const currentScan = scans[selectedWeek] || {}
  const stocks = currentScan.stocks || []
  const bonus = currentScan.bonus || []

  async function saveAndScan() {
    setSaving(true)
    setSaveMsg('')
    try {
      await fetch('/api/trigger-scan', { method: 'POST' })
      setSaveMsg(t.scanMsg)
    } catch { setSaveMsg(t.scanMsg) }
    setSaving(false)
  }

  const dir = lang === 'he' ? 'rtl' : 'ltr'

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
              onChange={e => { setSelectedWeek(Number(e.target.value)); setOpenStock(null) }}
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
          {saveMsg && <span style={{ fontSize: 13, color: '#097c3e' }}>{saveMsg}</span>}
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[['weekly', `📊 ${lang === 'he' ? 'שבועי' : 'Weekly'}`], ['hof', '🏆 Hall of Fame']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ padding: '9px 22px', borderRadius: 22, border: `1px solid ${tab === key ? '#097c3e' : c.border}`, background: tab === key ? '#097c3e' : c.card, color: tab === key ? 'white' : c.muted, fontWeight: 700, cursor: 'pointer', fontSize: 14, transition: 'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'hof' && (
          <HallOfFame hallOfFame={hallOfFame} totalScans={totalScans} weekLabels={weekLabelsOldestFirst} c={c} dark={dark} lang={lang} buzzByTicker={buzzByTicker} />
        )}

        {tab === 'weekly' && (<>

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
                  {[t.rank, t.stock, t.gain, t.mktCap, lang === 'he' ? 'רצף' : 'Streak', t.trend, ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: `1px solid ${c.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock, i) => {
                  const hof = hallOfFame[stock.ticker]
                  const wp = hof?.weekPresence || []
                  let streak = 0
                  for (let j = wp.length - 1; j >= 0; j--) {
                    if (wp[j] != null) streak++
                    else break
                  }
                  return (<>
                    <StockRow key={stock.ticker} stock={stock} rank={i + 1} isOpen={openStock === stock.ticker}
                      onClick={() => setOpenStock(openStock === stock.ticker ? null : stock.ticker)} c={c} t={t} dark={dark}
                      appearanceCount={appearanceCounts[stock.ticker] || 1} totalScans={totalScans} streak={streak} />
                    {openStock === stock.ticker && (
                      <tr key={`${stock.ticker}-panel`}>
                        <td colSpan={7} style={{ padding: 0, borderBottom: `1px solid ${c.border}` }}>
                          <StockPanel stock={stock} scans={scans} c={c} t={t} dark={dark} onClose={() => setOpenStock(null)} />
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
    </div>
  )
}

function HallOfFame({ hallOfFame, totalScans, weekLabels, c, dark, lang, buzzByTicker }) {
  const medals = ['🥇', '🥈', '🥉']
  const medalBorder = ['#FFD700', '#C0C0C0', '#CD7F32']
  const medalBg = dark ? ['#2a2400', '#1e1e1e', '#1e1200'] : ['#fffdf0', '#f8f8f8', '#fff8f0']
  const [openBuzz, setOpenBuzz] = useState(null)
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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            {weekLabels.map((w, i) => (
              <div key={i} style={{ fontSize: 10, color: '#666', textAlign: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', lineHeight: 1.2 }}>{w.split('-')[1] || w}</div>
            ))}
          </div>
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

                {/* Ticker + name */}
                <div style={{ width: 150, flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: c.text }}>{stock.ticker}</div>
                  <div style={{ fontSize: 10, color: c.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 145 }}>{stock.name}</div>
                </div>

                {/* Dot timeline — intensity reflects gain magnitude */}
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>
                  {stock.weekPresence.map((gain, wi) => (
                    <div key={wi} title={gain !== null ? `${weekLabels[wi]}: +${gain.toFixed(1)}%` : weekLabels[wi]} style={{
                      width: 13, height: 13, borderRadius: '50%',
                      ...dotStyle(gain),
                    }} />
                  ))}
                </div>

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

function Chip({ label, bg, color }) {
  return <span style={{ background: bg, color, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{label}</span>
}

function formatMcap(market_cap) {
  if (!market_cap) return 'N/A'
  if (market_cap >= 1_000_000_000) return `$${(market_cap / 1_000_000_000).toFixed(1)}B`
  return `$${Math.round(market_cap / 1_000_000)}M`
}

function StockRow({ stock, rank, isOpen, onClick, c, t, dark, appearanceCount, totalScans, streak }) {
  const buzz = stock.buzz || {}

  const count = appearanceCount || 1
  const pct = totalScans > 0 ? (count / totalScans) * 100 : 0
  const trendBadge =
    pct > 70 ? { bg: dark ? '#1a3a1a' : '#EAF3DE', color: dark ? '#7dcc7d' : '#27500A', text: `🟢 ${count}/${totalScans} ${t.appearances}` } :
    pct > 30 ? { bg: dark ? '#3a2a0a' : '#FAEEDA', color: dark ? '#ffcc66' : '#633806', text: `🟡 ${count}/${totalScans} ${t.appearances}` } :
    { bg: dark ? '#3a0a0a' : '#FCEBEB', color: dark ? '#ff8888' : '#791F1F', text: `🔴 ${count}/${totalScans} ${t.appearances}` }

  const s = streak || 1
  const streakBg   = s >= 4 ? (dark ? '#2a1a00' : '#FFF3CD') : s >= 2 ? (dark ? '#1a2a3a' : '#E8F4FD') : (dark ? '#2a2a2a' : '#F5F5F5')
  const streakColor = s >= 4 ? (dark ? '#ffcc44' : '#7a4f00') : s >= 2 ? (dark ? '#66aaff' : '#1a5a9a') : c.muted
  const streakLabel = s >= 4 ? `🔥 ${s} ${t.weeks}` : s >= 2 ? `⚡ ${s} ${t.weeks}` : t.new

  const buzzScore = buzz.score || 0
  const isBuzzAlert = stock.buzz_alert || buzzScore >= 7

  return (
    <tr onClick={onClick} style={{ borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: isOpen ? c.rowSelected : c.card }}
      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = c.rowHover }}
      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = c.card }}>
      <td style={{ padding: '11px 14px', color: c.muted, fontSize: 13 }}>{rank}</td>
      <td style={{ padding: '11px 14px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text, display: 'flex', alignItems: 'center', gap: 6 }}>
          {stock.ticker}
          {isBuzzAlert && <span title="High buzz" style={{ fontSize: 13 }}>🔥</span>}
        </div>
        <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{stock.name}</div>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#097c3e' }}>+{stock.change_pct}%</span>
      </td>
      <td style={{ padding: '11px 14px', color: c.muted, fontSize: 13 }}>{formatMcap(stock.market_cap)}</td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        <span style={{ background: streakBg, color: streakColor, padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{streakLabel}</span>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ background: trendBadge.bg, color: trendBadge.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{trendBadge.text}</span>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <button style={{ fontSize: 11, color: '#097c3e', background: 'none', border: '1px solid #097c3e', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
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

function StockPanel({ stock, scans, c, t, dark, onClose }) {
  const buzz = stock.buzz || {}
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
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#097c3e' }}>+{stock.change_pct}%</div>
          <div style={{ fontSize: 12, color: c.muted }}>{t.thisWeek}</div>
          <button onClick={onClose} style={{ marginTop: 6, fontSize: 12, background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 10px', color: c.muted, cursor: 'pointer' }}>
            ✕ {t.close}
          </button>
        </div>
      </div>

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
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <MetaCard label={t.mktCap} value={formatMcap(stock.market_cap)} c={c} />
        <MetaCard label={t.price} value={`$${stock.price?.toFixed(2) || 'N/A'}`} c={c} />
        <MetaCard label={t.volume} value={stock.volume ? `${(stock.volume / 1_000_000).toFixed(0)}M` : 'N/A'} c={c} />
        <MetaCard label={t.buzzScore} value={buzzScore > 0 ? `${buzzScore}/10` : '—'} c={c} />
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
