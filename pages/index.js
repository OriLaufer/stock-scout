import { createClient } from '@supabase/supabase-js'
import { useState, useEffect } from 'react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)

export async function getServerSideProps() {
  const { data: scans } = await supabase
    .from('weekly_scans')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  const processed = (scans || []).map(scan => {
    try {
      const parsed = JSON.parse(scan.stocks_json)
      return {
        ...scan,
        stocks: parsed.stocks || parsed,
        bonus: parsed.bonus || []
      }
    } catch { return { ...scan, stocks: [], bonus: [] } }
  })

  // מסיר כפילויות שבועות
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
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [openStock, setOpenStock] = useState(null)
  const [marketCapInput, setMarketCapInput] = useState('500')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('dark')
    if (saved === 'true') setDark(true)
  }, [])

  const toggleDark = () => {
    setDark(d => {
      localStorage.setItem('dark', !d)
      return !d
    })
  }

  const c = dark ? colors.dark : colors.light

  const currentScan = scans[selectedWeek] || {}
  const stocks = currentScan.stocks || []
  const bonus = currentScan.bonus || []

  async function saveAndScan() {
    setSaving(true)
    setSaveMsg('Running scan...')
    try {
      await fetch('/api/trigger-scan', { method: 'POST' })
      setSaveMsg('Scan triggered! Refresh in 2 minutes.')
    } catch {
      setSaveMsg('Saved! Next scan runs Sunday.')
    }
    setSaving(false)
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: c.pageBg, color: c.text, transition: 'background 0.2s, color 0.2s' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: c.text }}>Stock Scout</h1>
            <p style={{ margin: '4px 0 0', color: c.muted, fontSize: 13 }}>Weekly Stock Scanner</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={selectedWeek}
              onChange={e => { setSelectedWeek(Number(e.target.value)); setOpenStock(null) }}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 14, background: c.card, color: c.text, cursor: 'pointer' }}
            >
              {scans.map((scan, i) => (<option key={i} value={i}>{scan.week_label}</option>))}
            </select>

            {/* Dark mode toggle */}
            <button
              onClick={toggleDark}
              style={{ width: 40, height: 40, borderRadius: 20, border: `1px solid ${c.border}`, background: c.card, color: c.text, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: c.muted, fontWeight: 600 }}>Min Market Cap:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, color: c.muted }}>$</span>
            <input
              type="number"
              value={marketCapInput}
              onChange={e => setMarketCapInput(e.target.value)}
              style={{ width: 90, padding: '6px 10px', borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 14, background: c.inputBg, color: c.text }}
            />
            <span style={{ fontSize: 13, color: c.muted }}>Million</span>
          </div>
          <button
            onClick={saveAndScan}
            disabled={saving}
            style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: saving ? '#888' : '#097c3e', color: 'white', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Running...' : '▶ Run Scan'}
          </button>
          {saveMsg && <span style={{ fontSize: 13, color: '#097c3e' }}>{saveMsg}</span>}
        </div>

        {/* Stats chips */}
        {stocks.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <Chip label={`${stocks.filter(s => s.streak >= 2).length} returning`} bg={dark ? '#1a3a1a' : '#EAF3DE'} color={dark ? '#7dcc7d' : '#27500A'} />
            <Chip label={`${stocks.filter(s => s.streak >= 3).length} three weeks`} bg={dark ? '#3a2a0a' : '#FAEEDA'} color={dark ? '#ffcc66' : '#633806'} />
            <Chip label={`${stocks.filter(s => s.streak >= 4).length} four weeks+`} bg={dark ? '#3a0a0a' : '#FCEBEB'} color={dark ? '#ff8888' : '#791F1F'} />
            <Chip label={`${stocks.length} stocks`} bg={c.chipBg} color={c.muted} />
          </div>
        )}

        {/* Main table */}
        <div style={{ background: c.card, borderRadius: 12, border: `1px solid ${c.border}`, overflow: 'hidden', marginBottom: 20 }}>
          {stocks.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: c.muted, fontSize: 15 }}>
              No data yet. Click "Run Scan" to start.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: c.thead }}>
                  {['#', 'Stock', 'Gain', 'Mkt Cap', 'Buzz', 'Trend', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: c.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: `1px solid ${c.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock, i) => (
                  <>
                    <StockRow
                      key={stock.ticker}
                      stock={stock}
                      rank={i + 1}
                      isOpen={openStock === stock.ticker}
                      onClick={() => setOpenStock(openStock === stock.ticker ? null : stock.ticker)}
                      c={c}
                    />
                    {openStock === stock.ticker && (
                      <tr key={`${stock.ticker}-detail`}>
                        <td colSpan={7} style={{ padding: 0, borderBottom: `1px solid ${c.border}` }}>
                          <StockPanel stock={stock} scans={scans} c={c} onClose={() => setOpenStock(null)} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Bonus stocks */}
        {bonus.length > 0 && (
          <div style={{ background: c.card, borderRadius: 12, border: `1px solid ${c.border}`, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>
              Bonus Stocks — Not in TOP 20 but worth watching
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {bonus.map(b => (
                <div
                  key={b.ticker}
                  style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', background: c.card }}
                  onClick={() => setOpenStock(openStock === b.ticker ? null : b.ticker)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: 16, color: c.text }}>{b.ticker}</strong>
                    <span style={{ background: dark ? '#3a2a0a' : '#FAEEDA', color: dark ? '#ffcc66' : '#633806', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>Buzz Alert</span>
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

const colors = {
  light: {
    pageBg: '#f5f6fa',
    card: 'white',
    thead: '#f8f9fa',
    text: '#1a1a2e',
    muted: '#888',
    border: '#eee',
    inputBg: 'white',
    chipBg: '#f0f0f0',
    panelBg: '#f0faf5',
    rowHover: '#fafafa',
    rowSelected: '#f0faf5',
  },
  dark: {
    pageBg: '#0f0f1a',
    card: '#1a1a2e',
    thead: '#12122a',
    text: '#e8e8f0',
    muted: '#888',
    border: '#2a2a3e',
    inputBg: '#12122a',
    chipBg: '#2a2a3e',
    panelBg: '#0d2018',
    rowHover: '#1e1e32',
    rowSelected: '#0d2018',
  }
}

function Chip({ label, bg, color }) {
  return <span style={{ background: bg, color, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{label}</span>
}

function StockRow({ stock, rank, isOpen, onClick, c }) {
  const streak = stock.streak || 1
  const buzz = stock.buzz || {}
  const mcapB = (stock.market_cap / 1_000_000_000).toFixed(1)

  const streakBadge =
    streak >= 4 ? { bg: '#3a0a0a', color: '#ff8888', text: `4+ weeks` } :
    streak >= 3 ? { bg: '#3a2a0a', color: '#ffcc66', text: `${streak} weeks` } :
    streak >= 2 ? { bg: '#1a3a1a', color: '#7dcc7d', text: `${streak} weeks` } :
    { bg: c.chipBg, color: c.muted, text: 'New' }

  const buzzColor = buzz.score >= 7 ? '#097c3e' : buzz.score >= 4 ? '#cc8800' : c.muted

  return (
    <tr
      onClick={onClick}
      style={{ borderBottom: `1px solid ${c.border}`, cursor: 'pointer', background: isOpen ? c.rowSelected : c.card }}
      onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = c.rowHover }}
      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = c.card }}
    >
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
        <span style={{ background: streakBadge.bg, color: streakBadge.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
          {streakBadge.text}
        </span>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <button style={{ fontSize: 11, color: '#097c3e', background: 'none', border: '1px solid #097c3e', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
          {isOpen ? 'Close' : 'Details'}
        </button>
      </td>
    </tr>
  )
}

function StockPanel({ stock, scans, c, onClose }) {
  const buzz = stock.buzz || {}
  const quotes = buzz.quotes || []

  const timeline = scans.map(scan => {
    const found = (scan.stocks || []).find(s => s.ticker === stock.ticker)
    return { week: scan.week_label, stock: found }
  }).slice(0, 8)

  return (
    <div style={{ background: c.panelBg, borderTop: '2px solid #097c3e', padding: '20px 24px' }}>

      {/* Panel header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: c.text }}>{stock.ticker}</span>
            <span style={{ background: '#1a3a1a', color: '#7dcc7d', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              Buzz {buzz.score}/10
            </span>
            {stock.streak >= 2 && (
              <span style={{ background: '#1a3a1a', color: '#7dcc7d', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                {stock.streak} weeks streak
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: c.muted }}>{stock.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#097c3e' }}>+{stock.change_pct}%</div>
          <div style={{ fontSize: 12, color: c.muted }}>This week</div>
          <button
            onClick={onClose}
            style={{ marginTop: 6, fontSize: 12, background: 'none', border: `1px solid ${c.border}`, borderRadius: 6, padding: '4px 10px', color: c.muted, cursor: 'pointer' }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Timeline */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
            Appearance History
          </div>
          {timeline.map(({ week, stock: s }, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s ? '#097c3e' : '#444', marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, color: c.muted }}>
                  {week}
                  {i === 0 && <span style={{ marginLeft: 6, background: '#3a2a0a', color: '#ffcc66', padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>This week</span>}
                </div>
                {s ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#097c3e' }}>+{s.change_pct}%</span>
                    <span style={{ fontSize: 11, color: c.muted }}>#{(scans[i]?.stocks || []).findIndex(x => x.ticker === stock.ticker) + 1}</span>
                    {i === timeline.filter(t => t.stock).length - 1 && i > 0 && (
                      <span style={{ background: '#0d2018', color: '#7dcc7d', padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>First</span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#555', fontStyle: 'italic', marginTop: 3 }}>Not in list</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Buzz */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
            Buzz — {buzz.total_count || 0} posts total
          </div>
          <BuzzBar label="Reddit" value={buzz.reddit_count || 0} total={buzz.total_count || 1} color="#FF4500" c={c} />
          <BuzzBar label="StockTwits" value={buzz.stocktwits_count || 0} total={buzz.total_count || 1} color="#378ADD" c={c} />
          <div style={{ marginTop: 12, fontSize: 13, color: c.muted }}>
            Sentiment: <strong style={{ color: (buzz.sentiment_pct || 50) >= 60 ? '#097c3e' : (buzz.sentiment_pct || 50) <= 40 ? '#cc3333' : '#cc8800' }}>
              {buzz.sentiment_pct || 50}% bullish
            </strong>
          </div>

          {/* נושאים */}
          {buzz.topics && buzz.topics.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', marginBottom: 8 }}>Top Topics</div>
              {buzz.topics.map((t, i) => (
                <div key={i} style={{ fontSize: 12, color: c.text, padding: '4px 10px', background: c.card, borderRadius: 6, marginBottom: 5, border: `1px solid ${c.border}` }}>
                  • {t}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ציטוטים אמיתיים */}
      {quotes.length > 0 && (
        <div style={{ marginTop: 20, borderTop: `1px solid ${c.border}`, paddingTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
            What people are saying — Reddit
          </div>
          {quotes.map((q, i) => (
            <div key={i} style={{ background: c.card, border: `1px solid ${c.border}`, borderLeft: '3px solid #FF4500', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: c.text, lineHeight: 1.5, fontStyle: 'italic' }}>"{q.text}"</div>
              <div style={{ fontSize: 11, color: c.muted, marginTop: 6, display: 'flex', gap: 12 }}>
                <span>r/{q.subreddit}</span>
                {q.upvotes > 0 && <span>↑ {q.upvotes} upvotes</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Market data */}
      <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <MetaCard label="Market Cap" value={`$${(stock.market_cap / 1_000_000_000).toFixed(1)}B`} c={c} />
        <MetaCard label="Price" value={`$${stock.price?.toFixed(2) || 'N/A'}`} c={c} />
        <MetaCard label="Volume" value={stock.volume ? `${(stock.volume / 1_000_000).toFixed(1)}M` : 'N/A'} c={c} />
        <MetaCard label="Buzz Score" value={`${buzz.score || 0}/10`} c={c} />
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
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: 100 }}>
      <div style={{ fontSize: 11, color: c.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{value}</div>
    </div>
  )
}
