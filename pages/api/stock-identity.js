// Full identity card for ANY ticker. Yahoo's rich quoteSummary API needs a
// cookie + crumb token (yfinance does this internally); we replicate it so we
// get analyst targets, business summary, sector, float, etc. live.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

let _auth = { cookie: '', crumb: '', ts: 0 }
async function yahooAuth() {
  if (_auth.crumb && Date.now() - _auth.ts < 3600000) return _auth
  try {
    const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } })
    let cookie = ''
    try {
      const sc = r1.headers.getSetCookie?.()
      if (sc && sc.length) cookie = sc.map(x => x.split(';')[0]).join('; ')
    } catch {}
    if (!cookie) {
      const sc = r1.headers.get('set-cookie')
      if (sc) cookie = sc.split(';')[0]
    }
    const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, 'Cookie': cookie },
    })
    const crumb = (await r2.text()).trim()
    if (crumb && crumb.length < 40 && !crumb.includes('<')) {
      _auth = { cookie, crumb, ts: Date.now() }
    }
  } catch {}
  return _auth
}

export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })
  const T = ticker.toUpperCase()
  const out = { ticker: T }

  // --- Rich data via quoteSummary (with cookie+crumb) ---
  try {
    const { cookie, crumb } = await yahooAuth()
    const modules = 'price,summaryDetail,assetProfile,financialData,defaultKeyStatistics'
    const base = crumb ? `&crumb=${encodeURIComponent(crumb)}` : ''
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(T)}?modules=${modules}${base}`
    const r = await fetch(url, { headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) } })
    if (r.ok) {
      const j = await r.json()
      const q = j.quoteSummary?.result?.[0] || {}
      const price = q.price || {}, sd = q.summaryDetail || {}, ap = q.assetProfile || {}, fd = q.financialData || {}, ks = q.defaultKeyStatistics || {}
      const num = (v) => (v && typeof v === 'object' ? v.raw : v)

      out.name = price.longName || price.shortName || T
      if (num(price.regularMarketPrice) != null) out.price = +(+num(price.regularMarketPrice)).toFixed(2)
      if (num(price.marketCap)) out.market_cap = num(price.marketCap)
      out.sector = ap.sector || ''
      out.industry = ap.industry || ''
      out.country = ap.country || ''
      out.website = ap.website || ''
      if (ap.longBusinessSummary) out.business_summary = ap.longBusinessSummary.slice(0, 600) + (ap.longBusinessSummary.length > 600 ? '...' : '')
      const hi = num(sd.fiftyTwoWeekHigh), lo = num(sd.fiftyTwoWeekLow)
      if (hi) out.high_52w = +(+hi).toFixed(2)
      if (lo) out.low_52w = +(+lo).toFixed(2)
      if (num(fd.targetMeanPrice)) out.target_mean = +(+num(fd.targetMeanPrice)).toFixed(2)
      if (num(fd.targetHighPrice)) out.target_high = +(+num(fd.targetHighPrice)).toFixed(2)
      if (num(fd.targetLowPrice)) out.target_low = +(+num(fd.targetLowPrice)).toFixed(2)
      if (num(fd.numberOfAnalystOpinions)) out.analyst_count = num(fd.numberOfAnalystOpinions)
      if (fd.recommendationKey) out.recommendation = fd.recommendationKey
      if (num(fd.revenueGrowth) != null) out.revenue_growth_pct = +(+num(fd.revenueGrowth) * 100).toFixed(1)
      if (num(ks.floatShares)) out.float_m = +(+num(ks.floatShares) / 1e6).toFixed(1)
      if (num(ks.shortPercentOfFloat) != null) out.short_pct = +(+num(ks.shortPercentOfFloat) * 100).toFixed(1)
    }
  } catch {}

  // --- Fallback / fill: chart endpoint for price + 52W (no auth needed) ---
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(T)}?range=1y&interval=1d`, { headers: { 'User-Agent': UA } })
    const j = await r.json()
    const result = j.chart?.result?.[0] || {}
    const meta = result.meta || {}
    const highs = (result.indicators?.quote?.[0]?.high || []).filter(v => v != null)
    const lows = (result.indicators?.quote?.[0]?.low || []).filter(v => v != null)
    if (out.price == null && meta.regularMarketPrice != null) out.price = +meta.regularMarketPrice.toFixed(2)
    if (out.high_52w == null && highs.length) out.high_52w = +Math.max(...highs).toFixed(2)
    if (out.low_52w == null && lows.length) out.low_52w = +Math.min(...lows).toFixed(2)
    if (!out.name) out.name = meta.longName || T
  } catch {}

  // Derived 52W positions
  if (out.high_52w && out.low_52w && out.price && out.high_52w > out.low_52w) {
    out.pos_in_52w_range_pct = +(((out.price - out.low_52w) / (out.high_52w - out.low_52w)) * 100).toFixed(1)
    out.gain_from_52w_low_pct = +(((out.price - out.low_52w) / out.low_52w) * 100).toFixed(1)
    out.gain_to_52w_high_pct = +(((out.high_52w - out.price) / out.price) * 100).toFixed(1)
  }
  if (out.target_mean && out.price) out.target_upside_pct = +(((out.target_mean - out.price) / out.price) * 100).toFixed(1)

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=600')
  res.json(out)
}
