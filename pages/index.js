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

  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'min_market_cap')
    .single()

  return {
    props: {
      scans: scans || [],
      currentMarketCap: settings?.value || '500000000'
    }
  }
}

export default function Dashboard({ scans, currentMarketCap }) {
  const [selectedWeek, setSelectedWeek] = useState(0)
  const [selectedStock, setSelectedStock] = useState(null)
  const [marketCapInput, setMarketCapInput] = useState((Number(currentMarketCap) / 1_000_000).toString())
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const currentScan = scans[selectedWeek]
  const stocks = currentScan ? JSON.parse(currentScan.stocks_json) : []

  async function saveAndScan() {
    setSaving(true)
    setSaveMsg('')
    const newCap = Number(marketCapInput) * 1_000_000
    await supabase.from('settings').upsert({ key: 'min_market_cap', value: String(newCap) })
    setSaving(false)
    setScanning(true)
    setSaveMsg('מריץ סריקה חדשה... זה יקח כ־2 דקות')
    try {
      await fetch('/api/trigger-scan', { method: 'POST' })
      setSaveMsg('✅ הסריקה הופעלה! הדשבורד יתעדכן בעוד כ־2 דקות')
    } catch {
      setSaveMsg('✅ ההגדרה נשמרה! הסריקה הבאה תרוץ ביום ראשון')
    }
    setScanning(false)
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>📈 Stock Scout</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 14 }}>סורק מניות שבועי</p>
        </div>
        <select value={selectedWeek} onChange={e => { setSelectedWeek(Number(e.target.value)); setSelectedStock(null) }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}>
          {scans.map((scan, i) => (<option key={i} value={i}>{scan.week_label}</option>))}
        </select>
      </div>

      <div style={{ background: '#f8f9fa', border: '1px solid #eee', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 10, fontWeight: 500, textTransform: 'uppercase' }}>הגדרות סינון</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 14, color: '#444', fontWeight: 500 }}>מרקט קאפ מינימום:</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, color: '#666' }}>$</span>
            <input type="number" value={marketCapInput} onChange={e => setMarketCapInput(e.target.value)} style={{ width: 100, padding: '6px 10px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }} />
            <span style={{ fontSize: 14, color: '#666' }}>מיליון</span>
          </div>
          <button onClick={saveAndScan} disabled={saving || scanning} style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: saving || scanning ? '#ccc' : '#097c3e', color: 'white', fontSize: 14, fontWeight: 500, cursor: saving || scanning ? 'not-allowed' : 'pointer' }}>
            {saving ? 'שומר...' : scanning ? 'סורק...' : '💾 שמור והפעל סריקה'}
          </button>
          {saveMsg && <span style={{ fontSize: 13, color: '#097c3e' }}>{saveMsg}</span>}
        </div>
      </div>

      {stocks.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <StatChip label={`${stocks.filter(s => s.streak >= 2).length} חוזרות`} color="#EAF3DE" textColor="#27500A" />
          <StatChip label={`${stocks.filter(s => s.streak >= 3).length} שלושה שבועות`} color="#FAEEDA" textColor="#633806" />
          <StatChip label={`${stocks.filter(s => s.streak >= 4).length} ארבעה ומעלה`} color="#FCEBEB" textColor="#791F1F" />
        </div>
      )}

      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8f9fa', borderBottom: '1px solid #eee' }}>
              {['#', 'מנייה', 'עלייה', 'מרקט קאפ', 'באז', 'מגמה', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: '#999', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stocks.map((stock, i) => (
              <StockRow key={stock.ticker} stock={stock} rank={i + 1} onClick={() => setSelectedStock(selectedStock?.ticker === stock.ticker ? null : stock)} />
            ))}
          </tbody>
        </table>
      </div>

      {selectedStock && <StockPanel stock={selectedStock} scans={scans} onClose={() => setSelectedStock(null)} />}
    </div>
  )
}

function StatChip({ label, color, textColor }) {
  return <span style={{ background: color, color: textColor, padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 500 }}>{label}</span>
}

function StockRow({ stock, rank, onClick }) {
  const streak = stock.streak || 1
  const buzz = stock.buzz || {}
  const mcapB = (stock.market_cap / 1_000_000_000).toFixed(1)
  const streakBadge = streak >= 4 ? { bg: '#FCEBEB', color: '#791F1F', text: `🔴 ${streak} שבועות` } : streak >= 3 ? { bg: '#FAEEDA', color: '#633806', text: `🟠 ${streak} שבועות` } : streak >= 2 ? { bg: '#EAF3DE', color: '#27500A', text: `🟡 ${streak} שבועות` } : { bg: '#f0f0f0', color: '#999', text: 'חדשה' }

  return (
    <tr onClick={onClick} style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = '#fafafa'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
      <td style={{ padding: '10px 12px', color: '#999', fontSize: 12 }}>{rank}</td>
      <td style={{ padding: '10px 12px' }}><strong style={{ fontSize: 14 }}>{stock.ticker}</strong><br /><span style={{ fontSize: 11, color: '#999' }}>{stock.name}</span></td>
      <td style={{ padding: '10px 12px', color: '#097c3e', fontWeight: 700, fontSize: 18 }}>+{stock.change_pct}%</td>
      <td style={{ padding: '10px 12px', color: '#666', fontSize: 12 }}>${mcapB}B</td>
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        <strong style={{ fontSize: 14 }}>{buzz.score || 0}/10</strong><br />
        <span style={{ fontSize: 11, color: '#097c3e', fontWeight: 600 }}>פי {buzz.spike_ratio || 1}x מהרגיל</span>
      </td>
      <td style={{ padding: '10px 12px' }}><span style={{ background: streakBadge.bg, color: streakBadge.color, padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>{streakBadge.text}</span></td>
      <td style={{ padding: '10px 12px' }}><button style={{ fontSize: 11, color: '#097c3e', background: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>פרטים</button></td>
    </tr>
  )
}

function StockPanel({ stock, scans, onClose }) {
  const buzz = stock.buzz || {}
  const timeline = scans.map(scan => {
    const stocks = JSON.parse(scan.stocks_json)
    const found = stocks.find(s => s.ticker === stock.ticker)
    return { week: scan.week_label, stock: found }
  })

  return (
    <div style={{ marginTop: 20, background: 'white', borderRadius: 12, border: '1px solid #eee', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <strong style={{ fontSize: 22 }}>{stock.ticker}</strong>
          <span style={{ marginLeft: 8, background: '#FAEEDA', color: '#633806', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>באז {buzz.score}/10</span>
          {stock.streak >= 2 && <span style={{ marginLeft: 6, background: '#EAF3DE', color: '#27500A', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>{stock.streak} שבועות ברצף</span>}
          <br /><span style={{ fontSize: 13, color: '#666' }}>{stock.name}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#097c3e' }}>+{stock.change_pct}%</div>
          <div style={{ fontSize: 12, color: '#999' }}>השבוע</div>
          <button onClick={onClose} style={{ marginTop: 4, fontSize: 12, background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>✕ סגור</button>
        </div>
      </div>

      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 12 }}>היסטוריית הופעות</div>
        {timeline.map(({ week, stock: s }, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s ? '#097c3e' : '#ddd', marginTop: 4, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, color: '#999' }}>{week}</div>
              {s ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#097c3e' }}>+{s.change_pct}%</span>
                  {i === timeline.length - 1 && <span style={{ fontSize: 11, background: '#E1F5EE', color: '#085041', padding: '1px 7px', borderRadius: 10 }}>הופעה ראשונה</span>}
                  {i === 0 && <span style={{ fontSize: 11, background: '#FAEEDA', color: '#633806', padding: '1px 7px', borderRadius: 10 }}>השבוע</span>}
                </div>
              ) : <span style={{ fontSize: 12, color: '#bbb', fontStyle: 'italic' }}>לא הופיעה ברשימה</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 12 }}>באז שבועי — {buzz.total_count} פוסטים סה"כ</div>
        <BuzzBar label="Reddit" value={buzz.reddit_count} total={buzz.total_count} color="#097c3e" />
        <BuzzBar label="StockTwits" value={buzz.stocktwits_count} total={buzz.total_count} color="#378ADD" />
        <div style={{ marginTop: 10, fontSize: 13, color: '#666' }}>
          סנטימנט: <strong style={{ color: '#097c3e' }}>{buzz.sentiment_pct || 50}% חיובי</strong>
          {buzz.spike_ratio > 1 && <span style={{ marginLeft: 12, color: '#633806', fontWeight: 600 }}>· פי {buzz.spike_ratio}x מהממוצע השבועי</span>}
        </div>
      </div>

      {buzz.topics && buzz.topics.length > 0 && (
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 12 }}>נושאים מובילים</div>
          {buzz.topics.map((topic, i) => (
            <div key={i} style={{ fontSize: 13, color: '#444', marginBottom: 6, padding: '6px 10px', background: '#f8f9fa', borderRadius: 6 }}>• {topic}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function BuzzBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: '#666', width: 80 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: '#999', width: 40, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
