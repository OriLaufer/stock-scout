export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const response = await fetch(
      `https://api.github.com/repos/${process.env.GH_USERNAME}/stock-scout/actions/workflows/weekly-scan.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GH_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ref: 'main' })
      }
    )

    if (response.ok) {
      res.status(200).json({ success: true })
    } else {
      res.status(500).json({ error: 'Failed to trigger scan' })
    }
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
