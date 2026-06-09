import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY
)

// Shared AI-chat history — stored in Supabase so the whole team sees the
// same conversations (not per-browser localStorage).
// Requires a table:
//   create table shared_chats (
//     id text primary key, title text, messages jsonb,
//     updated_at timestamptz default now()
//   );
//   alter table shared_chats disable row level security;
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('shared_chats')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) return res.status(200).json({ chats: [], error: error.message })
      return res.status(200).json({
        chats: (data || []).map(r => ({
          id: r.id, title: r.title, messages: r.messages || [], updatedAt: r.updated_at,
        })),
      })
    }

    if (req.method === 'POST') {
      const { chat } = req.body || {}
      if (!chat || !chat.id) return res.status(400).json({ error: 'chat required' })
      const { error } = await supabase.from('shared_chats').upsert({
        id: chat.id,
        title: chat.title || 'Chat',
        messages: chat.messages || [],
        updated_at: new Date().toISOString(),
      })
      if (error) return res.status(200).json({ ok: false, error: error.message })
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id
      if (id) await supabase.from('shared_chats').delete().eq('id', id)
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    return res.status(200).json({ error: e.message, chats: [] })
  }
}
