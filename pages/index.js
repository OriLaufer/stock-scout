import { createClient } from '@supabase/supabase-js'
import { useState, useEffect } from 'react'

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
    returning: 'חוזרות',
    threeWeeks: 'שלושה שבועות',
    fourPlus: 'ארבעה+',
    stocks: 'מניות',
    noData: 'אין נתונים. לחץ על "הפעל סריקה".',
    bonus: 'מניות בונוס — לא ב-TOP 20 אבל שווה עין',
    buzzAlert: 'באז חריג',
    details: 'פרטים',
    close: 'סגור',
    thisWeek: 'השבוע',
    firstApp: 'הופעה ראשונה',
    notInList: 'לא הופיעה',
    appHistory: 'היסטוריית הופעות',
    buzzTitle: 'באז',
    postsTotal: 'פוסטים סה"כ',
    sentiment: 'סנטימנט',
    bullish: 'חיובי',
    topTopics: 'נושאים מובילים',
    whatSaying: 'מה אומרים — Reddit',
    upvotes: 'לייקים',
    mktCap: 'מרקט קאפ',
    price: 'מחיר',
    volume: 'נפח',
    buzzScore: 'ציון באז',
    streak: 'שבועות ברצף',
    new: 'חדשה',
    weeks: 'שבועות',
    rank: '#',
    stock: 'מנייה',
    gain: 'עלייה',
    buzz: 'באז',
    trend: 'מגמה',
  },
  en: {
    title: 'Stock Scout',
    subtitle: 'Weekly Stock Scanner',
    minCap: 'Min Market Cap',
    million: 'Million',
    runScan: '▶ Run Scan',
    running: 'Running...',
    scanMsg: 'Scan triggered! Refresh in 2 minutes.',
    returning: 'returning',
    threeWeeks: 'three weeks',
    fourPlus: 'four weeks+',
    stocks: 'stocks',
    noData: 'No data yet. Click "Run Scan" to start.',
    bonus: 'Bonus Stocks — Not in TOP 20 but worth watching',
    buzzAlert: 'Buzz Alert',
    details: 'Details',
    close: 'Close',
    thisWeek: 'This week',
    firstApp: 'First appearance',
    notInList: 'Not in list',
    appHistory: 'Appearance History',
    buzzTitle: 'Buzz',
    postsTotal: 'posts total',
    sentiment: 'Sentiment',
    bullish: 'bullish',
    topTopics: 'Top Topics',
    whatSaying: 'What people are saying — Reddit',
    upvotes: 'upvotes',
    mktCap: 'Market Cap',
    price: 'Price',
    volume: 'Volume',
    buzzScore: 'Buzz Score',
    streak: 'weeks streak',
    new: 'New',
    weeks: 'weeks',
    rank: '#',
    stock: 'Stock',
    gain: 'Gain',
    buzz: 'Buzz',
    trend: 'Trend',
  }
}

const COLORS = {
  light: {
    pageBg: '#f5f6fa', card: '#ffffff', thead: '#f8f9fa',
    text: '#1a1a2e', muted: '#888', border: '#eeeeee',
    inputBg: '#ffffff', chipBg: '#f0f0f0',
    panelBg: '#f0faf5', rowHover: '#fafafa', rowSelected: '#f0faf5',
  },
  dark: {
    pageBg: '#0f0f1a', card: '#1a1a2e', thead: '#12122a',
    text: '#e8e8f0', muted: '#777', border: '#2a2a3e',
    inputBg: '#12122a', chipBg: '#2a2a3e',
    panelBg: '#0d2018', rowHover: '#1e1e32', rowSelected: '#0d2018',
  }
}

export async function getServerSideProps() {
  const { data: scans } = await supabase
    .from('weekly_scans')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

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

  return { props: { scans: unique } }
}

export default function Dashboard({ scans }) {
  const [dark, setDark] = useState(false)
  const [lang, setLang] = useState('he')
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [openStock, setOpenStock] = useState(null)
  const [marketCapInput, setMarketCapInput] = useState('500')
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

        {/* Stats chips */}
        {stocks.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <Chip label={`${stocks.filter(s => s.streak >= 2).length} ${t.returning}`} bg={dark ? '#1a3a1a' : '#EAF3DE'} color={dark ? '#7dcc7d' : '#27500A'} />
            <Chip label={`${stocks.filter(s => s.streak >= 3).length} ${t.threeWeeks}`} bg={dark ? '#3a2a0a' : '#FAEEDA'} color={dark ? '#ffcc66' : '#633806'} />
            <Chip label={`${stocks.filter(s => s.streak >= 4).length} ${t.fourPlus}`} bg={dark ? '#3a0a0a' : '#FCEBEB'} color={dark ? '#ff8888' : '#791F1F'} />
            <Chip label={`${stocks.length} ${t.stocks}`} bg={c.chipBg} color={c.muted} />
          </div>
        )}

        {/* Main table */}
        <div style={{ background: c.card, borderRadius: 12, border: `1px solid ${c.border}`, overflow: 'hidden', marginBottom: 20 }}>
          {stocks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: c.muted, fontSize: 15 }}>{t.noData}</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: c.thead }}>
                  {[t.rank, t.stock, t.gain, t.mktCap, t.buzz, t.trend, ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: `1px solid ${c.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock, i) => (
                  <>
                    <StockRow key={stock.ticker} stock={stock} rank={i + 1} isOpen={openStock === stock.ticker}
                      onClick={() => setOpenStock(openStock === stock.ticker ? null : stock.ticker)} c={c} t={t} dark={dark} />
                    {openStock === stock.ticker && (
                      <tr key={`${stock.ticker}-panel`}>
                        <td colSpan={7} style={{ padding: 0, borderBottom: `1px solid ${c.border}` }}>
                          <StockPanel stock={stock} scans={scans} c={c} t={t} dark={dark} onClose={() => setOpenStock(null)} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
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
                  <div style={{ fontSize: 12, color: c.muted, marginTop: 4 }}>{b.buzz?.total_count || 0} posts · {b.buzz?.score || 0}/10 buzz</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Chip({ label, bg, color }) {
  return <span style={{ background: bg, color, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{label}</span>
}

function StockRow({ stock, rank, isOpen, onClick, c, t, dark }) {
  const streak = stock.streak || 1
  const buzz = stock.buzz || {}
  const mcapB = (stock.market_cap / 1_000_000_000).toFixed(1)

  const streakBadge =
    streak >= 4 ? { bg: dark ? '#3a0a0a' : '#FCEBEB', color: dark ? '#ff8888' : '#791F1F', text: `🔴 4+ ${t.weeks}` } :
    streak >= 3 ? { bg: dark ? '#3a2a0a' : '#FAEEDA', color: dark ? '#ffcc66' : '#633806', text: `🟠 ${streak} ${t.weeks}` } :
    streak >= 2 ? { bg: dark ? '#1a3a1a' : '#EAF3DE', color: dark ? '#7dcc7d' : '#27500A', text: `🟡 ${streak} ${t.weeks}` } :
    { bg: c.chipBg, color: c.muted, text: t.new }

  const buzzColor = buzz.score >= 7 ? '#097c3e' : buzz.score >= 4 ? '#cc8800' : c.muted

  return (
    <tr onClick={onClick} style={{ borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: isOpen ? c.rowSelected : c.card }}
      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = c.rowHover }}
      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = c.card }}>
      <td style={{ padding: '11px 14px', color: c.muted, fontSize: 13 }}>{rank}</td>
      <td style={{ padding: '11px 14px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{stock.ticker}</div>
        <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>{stock.name}</div>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#097c3e' }}>+{stock.change_pct}%</span>
      </td>
      <td style={{ padding: '11px 14px', color: c.muted, fontSize: 13 }}>${mcapB}B</td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: buzzColor }}>{buzz.score || 0}/10</div>
        <div style={{ fontSize: 10, color: c.muted, marginTop: 2 }}>{buzz.total_count || 0} posts</div>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ background: streakBadge.bg, color: streakBadge.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{streakBadge.text}</span>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <button style={{ fontSize: 11, color: '#097c3e', background: 'none', border: '1px solid #097c3e', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
          {isOpen ? t.close : t.details}
        </button>
      </td>
    </tr>
  )
}

function StockPanel({ stock, scans, c, t, dark, onClose }) {
  const buzz = stock.buzz || {}
  const quotes = buzz.quotes || []

  const timeline = scans.map(scan => {
    const found = (scan.stocks || []).find(s => s.ticker === stock.ticker)
    return { week: scan.week_label, stock: found }
  }).slice(0, 8)

  const firstAppIndex = timeline.map(x => x.stock).lastIndexOf(timeline.find(x => x.stock)?.stock)

  return (
    <div style={{ background: c.panelBg, borderTop: '2px solid #097c3e', padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: c.text }}>{stock.ticker}</span>
            <span style={{ background: dark ? '#1a3a1a' : '#EAF3DE', color: dark ? '#7dcc7d' : '#27500A', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              {t.buzzTitle} {buzz.score}/10
            </span>
            {stock.streak >= 2 && (
              <span style={{ background: dark ? '#1a3a1a' : '#EAF3DE', color: dark ? '#7dcc7d' : '#27500A', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                {stock.streak} {t.streak}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Timeline */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>{t.appHistory}</div>
          {timeline.map(({ week, stock: s }, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s ? '#097c3e' : (dark ? '#333' : '#ddd'), marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, color: c.muted, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {week}
                  {i === 0 && s && <span style={{ background: dark ? '#3a2a0a' : '#FAEEDA', color: dark ? '#ffcc66' : '#633806', padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{t.thisWeek}</span>}
                </div>
                {s ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#097c3e' }}>+{s.change_pct}%</span>
                    <span style={{ fontSize: 11, color: c.muted }}>#{(scans[i]?.stocks || []).findIndex(x => x.ticker === stock.ticker) + 1}</span>
                    {i === timeline.filter(x => x.stock).length - 1 && i > 0 && (
                      <span style={{ background: dark ? '#0d2018' : '#E1F5EE', color: dark ? '#7dcc7d' : '#085041', padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{t.firstApp}</span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: dark ? '#444' : '#bbb', fontStyle: 'italic', marginTop: 3 }}>{t.notInList}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Buzz breakdown */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
            {t.buzzTitle} — {buzz.total_count || 0} {t.postsTotal}
          </div>
          <BuzzBar label="Reddit" value={buzz.reddit_count || 0} total={buzz.total_count || 1} color="#FF4500" c={c} />
          <BuzzBar label="StockTwits" value={buzz.stocktwits_count || 0} total={buzz.total_count || 1} color="#378ADD" c={c} />
          <div style={{ marginTop: 12, fontSize: 13, color: c.muted }}>
            {t.sentiment}: <strong style={{ color: (buzz.sentiment_pct || 50) >= 60 ? '#097c3e' : (buzz.sentiment_pct || 50) <= 40 ? '#cc3333' : '#cc8800' }}>
              {buzz.sentiment_pct || 50}% {t.bullish}
            </strong>
          </div>

          {buzz.topics && buzz.topics.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', marginBottom: 8 }}>{t.topTopics}</div>
              {buzz.topics.map((topic, i) => (
                <div key={i} style={{ fontSize: 12, color: c.text, padding: '4px 10px', background: c.card, borderRadius: 6, marginBottom: 5, border: `1px solid ${c.border}` }}>
                  • {topic}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ציטוטים */}
      {quotes.length > 0 && (
        <div style={{ marginTop: 20, borderTop: `1px solid ${c.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
            {t.whatSaying}
          </div>
          {quotes.map((q, i) => (
            <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderLeft: '3px solid #FF4500', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: c.text, lineHeight: 1.6, fontStyle: 'italic' }}>"{q.text}"</div>
              <div style={{ fontSize: 11, color: c.muted, marginTop: 6, display: 'flex', gap: 12 }}>
                <span>r/{q.subreddit}</span>
                {q.upvotes > 0 && <span>↑ {q.upvotes} {t.upvotes}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Market data */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <MetaCard label={t.mktCap} value={`$${(stock.market_cap / 1_000_000_000).toFixed(1)}B`} c={c} />
        <MetaCard label={t.price} value={`$${stock.price?.toFixed(2) || 'N/A'}`} c={c} />
        <MetaCard label={t.volume} value={stock.volume ? `${(stock.volume / 1_000_000).toFixed(1)}M` : 'N/A'} c={c} />
        <MetaCard label={t.buzzScore} value={`${buzz.score || 0}/10`} c={c} />
      </div>
    </div>
  )
}

function BuzzBar({ label, value, total, color, c }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: c.muted, width: 80 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: c.chipBg, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: c.muted, width: 36, textAlign: 'right' }}>{value}</span>
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
