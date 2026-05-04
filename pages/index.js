import { createClient } from '@supabase/supabase-js'
import { useState } from 'react'

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

  return { props: { scans: processed } }
}

export default function Dashboard({ scans }) {
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [selectedStock, setSelectedStock] = useState(null)
  const [marketCapInput, setMarketCapInput] = useState('500')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const currentScan = scans[selectedWeek] || {}
  const stocks = currentScan.stocks || []
  const bonus = currentScan.bonus || []

  async function saveAndScan() {
    setSaving(true)
    setSaveMsg('Running scan... check back in 2 minutes')
    try {
      await fetch('/api/trigger-scan', { method: 'POST' })
      setSaveMsg('Scan triggered! Refresh in 2 minutes.')
    } catch {
      setSaveMsg('Saved! Next scan runs Sunday morning.')
    }
    setSaving(false)
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: 960, margin: '0 auto', padding: 24, background: '#f5f6fa', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#1a1a2e' }}>📈 Stock Scout</h1>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>Weekly Stock Scanner</p>
        </div>
        <select
          value={selectedWeek}
          onChange={e => { setSelectedWeek(Number(e.target.value)); setSelectedStock(null) }}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, background: 'white', cursor: 'pointer' }}
        >
          {scans.map((scan, i) => (<option key={i} value={i}>{scan.week_label}</option>))}
        </select>
      </div>

      {/* Filter bar */}
      <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>Min Market Cap:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#888' }}>$</span>
          <input type="number" value={marketCapInput} onChange={e => setMarketCapInput(e.target.value)}
            style={{ width: 90, padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }} />
          <span style={{ fontSize: 13, color: '#888' }}>Million</span>
        </div>
        <button onClick={saveAndScan} disabled={saving}
          style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: saving ? '#ccc' : '#097c3e', color: 'white', fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Running...' : '▶ Run Scan'}
        </button>
        {saveMsg && <span style={{ fontSize: 13, color: '#097c3e' }}>{saveMsg}</span>}
      </div>

      {/* Stats chips */}
      {stocks.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <Chip label={`${stocks.filter(s => s.streak >= 2).length} returning`} bg="#EAF3DE" color="#27500A" />
          <Chip label={`${stocks.filter(s => s.streak >= 3).length} three weeks`} bg="#FAEEDA" color="#633806" />
          <Chip label={`${stocks.filter(s => s.streak >= 4).length} four weeks+`} bg="#FCEBEB" color="#791F1F" />
          <Chip label={`${stocks.length} total stocks`} bg="#f0f0f0" color="#555" />
        </div>
      )}

      {/* Main table */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden', marginBottom: 20 }}>
        {stocks.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa', fontSize: 15 }}>
            No data yet. Click "Run Scan" to start.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                {['#', 'Stock', 'Gain', 'Mkt Cap', 'Buzz', 'Trend', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock, i) => (
                <StockRow key={stock.ticker} stock={stock} rank={i + 1}
                  isSelected={selectedStock?.ticker === stock.ticker}
                  onClick={() => setSelectedStock(selectedStock?.ticker === stock.ticker ? null : stock)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stock detail panel */}
      {selectedStock && (
        <StockPanel stock={selectedStock} scans={scans} onClose={() => setSelectedStock(null)} />
      )}

      {/* Bonus stocks */}
      {bonus.length > 0 && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #eee', padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>
            Bonus Stocks — Not in TOP 20 but worth watching
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {bonus.map(b => (
              <div key={b.ticker} style={{ border: '1px solid #eee', borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }}
                onClick={() => setSelectedStock(selectedStock?.ticker === b.ticker ? null : b)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ fontSize: 16 }}>{b.ticker}</strong>
                  <span style={{ background: '#FAEEDA', color: '#633806', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>Buzz Alert</span>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>{b.name}</div>
                <div style={{ fontSize: 13, color: '#097c3e', fontWeight: 700 }}>+{b.change_pct}%</div>
                <div style={{ fontSize: 12, color: '#633806', marginTop: 4 }}>{b.buzz?.total_count || 0} posts · {b.buzz?.score || 0}/10 buzz</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ label, bg, color }) {
  return <span style={{ background: bg, color, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{label}</span>
}

function StockRow({ stock, rank, isSelected, onClick }) {
  const streak = stock.streak || 1
  const buzz = stock.buzz || {}
  const mcapB = (stock.market_cap / 1_000_000_000).toFixed(1)
  const streakBadge = streak >= 4
    ? { bg: '#FCEBEB', color: '#791F1F', text: `4+ weeks` }
    : streak >= 3 ? { bg: '#FAEEDA', color: '#633806', text: `${streak} weeks` }
    : streak >= 2 ? { bg: '#EAF3DE', color: '#27500A', text: `${streak} weeks` }
    : { bg: '#f0f0f0', color: '#999', text: 'New' }
  const buzzColor = buzz.score >= 7 ? '#097c3e' : buzz.score >= 4 ? '#633806' : '#888'

  return (
    <tr onClick={onClick} style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer', background: isSelected ? '#f0faf5' : 'white' }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fafafa' }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'white' }}>
      <td style={{ padding: '11px 14px', color: '#bbb', fontSize: 13 }}>{rank}</td>
      <td style={{ padding: '11px 14px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{stock.ticker}</div>
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{stock.name}</div>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#097c3e' }}>+{stock.change_pct}%</span>
      </td>
      <td style={{ padding: '11px 14px', color: '#666', fontSize: 13 }}>${mcapB}B</td>
      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: buzzColor }}>{buzz.score || 0}/10</div>
        <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>{buzz.total_count || 0} posts</div>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ background: streakBadge.bg, color: streakBadge.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
          {streakBadge.text}
        </span>
      </td>
      <td style={{ padding: '11px 14px' }}>
        <button style={{ fontSize: 11, color: '#097c3e', background: 'none', border: '1px solid #097c3e', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
          {isSelected ? 'Close' : 'Details'}
        </button>
      </td>
    </tr>
  )
}

function StockPanel({ stock, scans, onClose }) {
  const buzz = stock.buzz || {}
  const timeline = scans.map(scan => {
    const found = (scan.stocks || []).find(s => s.ticker === stock.ticker)
    return { week: scan.week_label, stock: found }
  }).filter((_, i) => i < 8)

  return (
    <div style={{ background: 'white', borderRadius: 12, border: '2px solid #097c3e', overflow: 'hidden', marginBottom: 20 }}>

      {/* Panel header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#f0faf5' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e' }}>{stock.ticker}</span>
            <span style={{ background: '#FAEEDA', color: '#633806', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
              Buzz {buzz.score}/10
            </span>
            {stock.streak >= 2 && (
              <span style={{ background: '#EAF3DE', color: '#27500A', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                {stock.streak} weeks streak
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#888' }}>{stock.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#097c3e' }}>+{stock.change_pct}%</div>
          <div style={{ fontSize: 12, color: '#aaa' }}>This week</div>
          <button onClick={onClose} style={{ marginTop: 6, fontSize: 12, background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '4px 10px', color: '#888', cursor: 'pointer' }}>
            ✕ Close
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

        {/* Timeline */}
        <div style={{ padding: '16px 20px', borderRight: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
            Appearance History
          </div>
          {timeline.map(({ week, stock: s }, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: s ? '#097c3e' : '#e0e0e0', marginTop: 4, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, color: '#aaa' }}>{week}
                  {i === 0 && <span style={{ marginLeft: 6, background: '#FAEEDA', color: '#633806', padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>This week</span>}
                </div>
                {s ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#097c3e' }}>+{s.change_pct}%</span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>#{(scans[i]?.stocks || []).findIndex(x => x.ticker === stock.ticker) + 1}</span>
                    {i === timeline.filter(t => t.stock).length - 1 && (
                      <span style={{ background: '#E1F5EE', color: '#085041', padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>First appearance</span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#ccc', fontStyle: 'italic', marginTop: 3 }}>Not in list</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Buzz breakdown */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
            Buzz — {buzz.total_count || 0} posts total
          </div>
          <BuzzBar label="Reddit" value={buzz.reddit_count || 0} total={buzz.total_count || 1} color="#097c3e" />
          <BuzzBar label="StockTwits" value={buzz.stocktwits_count || 0} total={buzz.total_count || 1} color="#378ADD" />
          <div style={{ marginTop: 12, fontSize: 13, color: '#555' }}>
            Sentiment: <strong style={{ color: buzz.sentiment_pct >= 60 ? '#097c3e' : buzz.sentiment_pct <= 40 ? '#c0392b' : '#633806' }}>
              {buzz.sentiment_pct || 50}% bullish
            </strong>
          </div>
          {buzz.topics && buzz.topics.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', textTransform: 'uppercase', marginBottom: 8 }}>Top Topics</div>
              {buzz.topics.map((t, i) => (
                <div key={i} style={{ fontSize: 13, color: '#444', padding: '5px 10px', background: '#f8f9fa', borderRadius: 6, marginBottom: 6 }}>
                  • {t}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Market data */}
      <div style={{ padding: '14px 20px', display: 'flex', gap: 20 }}>
        <MetaCard label="Market Cap" value={`$${(stock.market_cap / 1_000_000_000).toFixed(1)}B`} />
        <MetaCard label="Price" value={`$${stock.price?.toFixed(2) || 'N/A'}`} />
        <MetaCard label="Volume" value={stock.volume ? `${(stock.volume / 1_000_000).toFixed(1)}M` : 'N/A'} />
        <MetaCard label="Buzz Score" value={`${buzz.score || 0}/10`} />
      </div>
    </div>
  )
}

function BuzzBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#666', width: 80 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: '#aaa', width: 36, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function MetaCard({ label, value }) {
  return (
    <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '10px 14px', flex: 1 }}>
      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
    </div>
  )
}
