import { createClient } from '@supabase/supabase-js'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_KEY)
export default async function handler(req, res) {
  const { data } = await supabase.from('weekly_scans').select('id,week_label,created_at,stocks_json').order('created_at', { ascending: false }).limit(20)
  const rows = (data || []).map(r => {
    let stocks = 0, trend = false, len = (r.stocks_json || '').length, parseOk = true
    try { const p = JSON.parse(r.stocks_json); const s = p.stocks || p; stocks = Array.isArray(s) ? s.length : 0; trend = !!p.trend } catch { parseOk = false }
    return { week: r.week_label, created_at: r.created_at, id: r.id.slice(0, 8), json_len: len, stocks, trend, parseOk }
  })
  res.json({ count: rows.length, rows })
}
