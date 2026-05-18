import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { data, error } = await supabase
    .from('tournament')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data || !data.state || data.state.status === 'empty') {
    res.setHeader('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=1');
    return res.json({ status: 'empty' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=1');
  res.json(data);
}
