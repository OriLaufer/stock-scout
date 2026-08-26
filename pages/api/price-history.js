// Price history for a ticker.
//   ?ticker=XYZ                 -> 1 month of daily closes + the live price
//   ?ticker=XYZ&weeks=13        -> also the last N weekly % changes
//
// The weekly series exists because the Entry Zone surfaces stocks that have
// NEVER appeared in a weekly scan — that is the whole point of the screen — so
// there is no stored history to draw their trend from. Without this the one tab
// built to find entries was the only tab with no trend view.
export default async function handler(req, res) {
  const { ticker, weeks } = req.query
  if (!ticker) return res.status(400).json({ closes: [] })
  const wantWeeks = Math.min(52, Math.max(0, parseInt(weeks, 10) || 0))

  try {
    const range = wantWeeks ? '1y' : '1mo'
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.toUpperCase())}?range=${range}&interval=1d`
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const d = await r.json()
    const result = d.chart?.result?.[0] || {}
    const quote = result.indicators?.quote?.[0] || {}
    const meta = result.meta || {}
    const stamps = result.timestamp || []

    // Keep closes aligned with their timestamps — filtering the two separately
    // would silently shift every date against its price.
    const rawClose = quote.close || []
    const closes = [], volumes = [], dates = []
    for (let i = 0; i < rawClose.length; i++) {
      if (rawClose[i] == null) continue
      closes.push(rawClose[i])
      volumes.push(quote.volume?.[i] ?? 0)
      dates.push(stamps[i] ? new Date(stamps[i] * 1000) : null)
    }
    const current = meta.regularMarketPrice ?? (closes.length ? closes[closes.length - 1] : null)

    const out = { closes: wantWeeks ? closes.slice(-22) : closes, volumes: volumes.slice(-22), current }

    if (wantWeeks && closes.length > 10) {
      const weekly = []
      for (let i = wantWeeks; i >= 1; i--) {
        const end = closes.length - (i - 1) * 5 - 1
        const start = end - 5
        if (start < 0 || end >= closes.length) continue
        const dEnd = dates[end]
        weekly.push({
          week: dEnd ? `${String(dEnd.getDate()).padStart(2, '0')}.${String(dEnd.getMonth() + 1).padStart(2, '0')}` : '',
          change_pct: +(((closes[end] - closes[start]) / closes[start]) * 100).toFixed(1),
        })
      }
      out.weekly = weekly
    }

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300')
    res.json(out)
  } catch {
    res.json({ closes: [], current: null })
  }
}
