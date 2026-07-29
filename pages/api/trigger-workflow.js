// Trigger one of our GitHub Actions workflows on demand.
//
// trigger-scan.js only ever fires the weekly scan, so there was no way to run a
// verification pass without waiting 20 minutes for a full scan. Allowlisted by
// filename — this endpoint is public, so it must never be able to dispatch an
// arbitrary workflow.
const ALLOWED = {
  'weekly-scan.yml': 'Full weekly scan (~20 min) + verification + emails',
  'full-run-verify.yml': 'Run and verify, or verify only',
  'keepalive.yml': 'Database keep-alive health check',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { workflow, inputs } = req.body || {}
  if (!workflow || !ALLOWED[workflow]) {
    return res.status(400).json({ error: 'unknown workflow', allowed: Object.keys(ALLOWED) })
  }
  if (!process.env.GH_TOKEN || !process.env.GH_USERNAME) {
    return res.status(500).json({ error: 'GH_TOKEN / GH_USERNAME not configured in Vercel' })
  }

  try {
    const r = await fetch(
      `https://api.github.com/repos/${process.env.GH_USERNAME}/stock-scout/actions/workflows/${workflow}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main', ...(inputs ? { inputs } : {}) }),
      }
    )
    if (r.ok) return res.status(200).json({ success: true, workflow, what: ALLOWED[workflow] })
    // GitHub explains refused dispatches (bad input, missing workflow) in the
    // body — pass it through instead of a blank "failed".
    return res.status(502).json({ error: 'GitHub refused the dispatch', status: r.status, detail: (await r.text()).slice(0, 300) })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
