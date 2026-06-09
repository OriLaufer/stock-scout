export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ closes: [] })
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.toUpperCase())}?range=1mo&interval=1d`
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const d = await r.json()
    const result  = d.chart?.result?.[0] || {}
    const quote   = result.indicators?.quote?.[0] || {}
    const closes  = (quote.close  || []).filter(v => v != null)
    const volumes = (quote.volume || []).filter(v => v != null)
    // Live/last price from meta — more current than the last daily close
    const meta = result.meta || {}
    const current = meta.regularMarketPrice ?? (closes.length ? closes[closes.length - 1] : null)
    // Short cache (2 min) so prices stay fresh
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=120')
    res.json({ closes, volumes, current })
  } catch {
    res.json({ closes: [], current: null })
  }
}
