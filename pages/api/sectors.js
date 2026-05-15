export default async function handler(req, res) {
  const { tickers } = req.query
  if (!tickers) return res.status(400).json({ sectors: {} })

  const tickerList = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 25)

  const results = await Promise.allSettled(
    tickerList.map(async ticker => {
      const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=assetProfile`
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const d = await r.json()
      const profile = d?.quoteSummary?.result?.[0]?.assetProfile
      return { ticker, sector: profile?.sector || null, industry: profile?.industry || null }
    })
  )

  const sectors = {}
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.sector) {
      sectors[r.value.ticker] = { sector: r.value.sector, industry: r.value.industry || '' }
    }
  }

  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
  res.json({ sectors })
}
