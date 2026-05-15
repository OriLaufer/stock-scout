import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)

export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'ticker required' })

  try {
    const { data } = await supabase
      .from('ticker_buzz')
      .select('buzz_json, updated_at')
      .eq('ticker', ticker.toUpperCase())
      .single()

    if (data?.buzz_json) {
      const buzz = typeof data.buzz_json === 'string'
        ? JSON.parse(data.buzz_json)
        : data.buzz_json
      if ((buzz.score || 0) > 0) {
        return res.json({ found: true, buzz, updated_at: data.updated_at })
      }
    }
    res.json({ found: false })
  } catch {
    res.json({ found: false })
  }
}
