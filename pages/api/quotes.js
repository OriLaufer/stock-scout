// Live prices for a batch of tickers.
//
// Why this exists: every list on the dashboard renders numbers frozen at the
// moment of the weekly scan. SMJF sat in Rising Stars at 92.8/100 and $11.41
// for days after it had collapsed to $1.47 — a top rating on a stock that had
// lost 87%. A weekly snapshot presented as if it were current is the most
// dangerous thing this dashboard can do, so every "what to buy" list checks the
// live price against the scan price and says so when they have diverged.
export default async function handler(req, res) {
  const raw = String(req.query.tickers || '')
  const tickers = Array.from(new Set(
    raw.toUpperCase().split(',').map(t => t.replace(/[^A-Z.\-]/g, '')).filter(Boolean)
  )).slice(0, 60)
  if (!tickers.length) return res.status(400).json({ error: 'tickers required' })

  const prices = {}
  try {
    // The spark endpoint returns many symbols in one request and needs no auth.
    const url = 'https://query1.finance.yahoo.com/v7/finance/spark?symbols='
      + encodeURIComponent(tickers.join(',')) + '&range=1d&interval=1d'
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (r.ok) {
      const j = await r.json()
      for (const item of (j.spark?.result || [])) {
        const meta = item?.response?.[0]?.meta
        if (meta?.regularMarketPrice != null) prices[item.symbol] = +meta.regularMarketPrice
      }
    }
  } catch {}

  // Anything spark missed, fetch individually rather than reporting it as
  // unchanged — a silent gap here reads as "no move", which is the exact
  // failure this endpoint exists to prevent.
  const missing = tickers.filter(t => prices[t] == null)
  if (missing.length) {
    await Promise.all(missing.slice(0, 25).map(async t => {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=1d&interval=1d`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } })
        if (!r.ok) return
        const j = await r.json()
        const p = j.chart?.result?.[0]?.meta?.regularMarketPrice
        if (p != null) prices[t] = +p
      } catch {}
    }))
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  res.json({ prices, asOf: new Date().toISOString() })
}
