import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)

// Shared trading journal — stored in Supabase so the whole team sees the
// same open trades. Requires a table:
//   create table shared_journal (
//     id text primary key, data jsonb, updated_at timestamptz default now()
//   );
//   alter table shared_journal enable row level security;
//   create policy "allow_all_shared_journal" on shared_journal
//     for all to anon, authenticated using (true) with check (true);
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('shared_journal')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) return res.status(200).json({ trades: [], error: error.message })
      return res.status(200).json({ trades: (data || []).map(r => r.data).filter(Boolean) })
    }

    if (req.method === 'POST') {
      const { trade } = req.body || {}
      if (!trade || !trade.id) return res.status(400).json({ error: 'trade required' })
      const { error } = await supabase.from('shared_journal').upsert({
        id: trade.id, data: trade, updated_at: new Date().toISOString(),
      })
      if (error) return res.status(200).json({ ok: false, error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id
      if (id) await supabase.from('shared_journal').delete().eq('id', id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    return res.status(200).json({ error: e.message, trades: [] })
  }
}
