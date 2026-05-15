export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { ticker, name, market_cap } = req.body || {}
  if (!ticker) return res.status(400).json({ error: 'ticker is required' })

  try {
    const response = await fetch(
      `https://api.github.com/repos/${process.env.GH_USERNAME}/stock-scout/actions/workflows/buzz-on-demand.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GH_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            ticker: ticker.toUpperCase(),
            name: name || '',
            market_cap: String(market_cap || 500000000),
          },
        }),
      }
    )

    if (response.ok) {
      res.status(200).json({ success: true })
    } else {
      const text = await response.text()
      res.status(500).json({ error: 'GitHub dispatch failed', detail: text })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
