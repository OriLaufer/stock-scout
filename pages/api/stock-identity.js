// Fetch a full identity card for ANY ticker (for the Journal deep-dive).
// Tries Yahoo quoteSummary (rich: analyst targets, business, sector, float);
// falls back to the chart endpoint (always works) for price + 52W range.
export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })
  const T = ticker.toUpperCase()
  const out = { ticker: T }

  // --- Rich data via quoteSummary (best effort) ---
  try {
    const modules = 'price,summaryDetail,assetProfile,financialData,defaultKeyStatistics'
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(T)}?modules=${modules}`
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (r.ok) {
      const j = await r.json()
      const q = j.quoteSummary?.result?.[0] || {}
      const price = q.price || {}
      const sd = q.summaryDetail || {}
      const ap = q.assetProfile || {}
      const fd = q.financialData || {}
      const ks = q.defaultKeyStatistics || {}

      out.name = price.longName || price.shortName || T
      if (price.regularMarketPrice?.raw != null) out.price = +price.regularMarketPrice.raw.toFixed(2)
      if (price.marketCap?.raw) out.market_cap = price.marketCap.raw
      out.sector = ap.sector || ''
      out.industry = ap.industry || ''
      out.country = ap.country || ''
      out.website = ap.website || ''
      if (ap.longBusinessSummary) out.business_summary = ap.longBusinessSummary.slice(0, 600) + (ap.longBusinessSummary.length > 600 ? '...' : '')
      const hi = sd.fiftyTwoWeekHigh?.raw, lo = sd.fiftyTwoWeekLow?.raw
      if (hi) out.high_52w = +hi.toFixed(2)
      if (lo) out.low_52w = +lo.toFixed(2)
      if (hi && lo && out.price && hi > lo) {
        out.pos_in_52w_range_pct = +(((out.price - lo) / (hi - lo)) * 100).toFixed(1)
        out.gain_from_52w_low_pct = +(((out.price - lo) / lo) * 100).toFixed(1)
        out.gain_to_52w_high_pct = +(((hi - out.price) / out.price) * 100).toFixed(1)
      }
      if (fd.targetMeanPrice?.raw) out.target_mean = +fd.targetMeanPrice.raw.toFixed(2)
      if (fd.targetHighPrice?.raw) out.target_high = +fd.targetHighPrice.raw.toFixed(2)
      if (fd.targetLowPrice?.raw) out.target_low = +fd.targetLowPrice.raw.toFixed(2)
      if (fd.numberOfAnalystOpinions?.raw) out.analyst_count = fd.numberOfAnalystOpinions.raw
      if (fd.recommendationKey) out.recommendation = fd.recommendationKey
      if (fd.revenueGrowth?.raw != null) out.revenue_growth_pct = +(fd.revenueGrowth.raw * 100).toFixed(1)
      if (out.target_mean && out.price) out.target_upside_pct = +(((out.target_mean - out.price) / out.price) * 100).toFixed(1)
      if (ks.floatShares?.raw) out.float_m = +(ks.floatShares.raw / 1e6).toFixed(1)
      if (ks.shortPercentOfFloat?.raw != null) out.short_pct = +(ks.shortPercentOfFloat.raw * 100).toFixed(1)
    }
  } catch {}

  // --- Fallback: chart endpoint for price + 52W (very reliable) ---
  if (out.price == null || out.high_52w == null) {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(T)}?range=1y&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const j = await r.json()
      const result = j.chart?.result?.[0] || {}
      const meta = result.meta || {}
      const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => v != null)
      const highs = (result.indicators?.quote?.[0]?.high || []).filter(v => v != null)
      const lows = (result.indicators?.quote?.[0]?.low || []).filter(v => v != null)
      if (out.price == null && meta.regularMarketPrice != null) out.price = +meta.regularMarketPrice.toFixed(2)
      if (out.high_52w == null && highs.length) out.high_52w = +Math.max(...highs).toFixed(2)
      if (out.low_52w == null && lows.length) out.low_52w = +Math.min(...lows).toFixed(2)
      if (out.high_52w && out.low_52w && out.price && out.high_52w > out.low_52w) {
        out.pos_in_52w_range_pct = +(((out.price - out.low_52w) / (out.high_52w - out.low_52w)) * 100).toFixed(1)
        out.gain_from_52w_low_pct = +(((out.price - out.low_52w) / out.low_52w) * 100).toFixed(1)
        out.gain_to_52w_high_pct = +(((out.high_52w - out.price) / out.price) * 100).toFixed(1)
      }
      if (!out.name) out.name = meta.longName || T
    } catch {}
  }

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=600')
  res.json(out)
}
