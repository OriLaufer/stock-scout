export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ closes: [] })
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.toUpperCase())}?range=1mo&interval=1d`
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const d = await r.json()
    const closes = (d.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(v => v != null)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    res.json({ closes })
  } catch {
    res.json({ closes: [] })
  }
}
