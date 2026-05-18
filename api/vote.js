import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET - получить текущие голоса по матчу
  if (req.method === 'GET') {
    const { match_key } = req.query;
    if (!match_key) return res.status(400).json({ error: 'Missing match_key' });

    const { data, error } = await supabase
      .from('votes')
      .select('participant')
      .eq('match_key', match_key);

    if (error) return res.status(500).json({ error: error.message });
    const tally = {};
    data?.forEach(v => { tally[v.participant] = (tally[v.participant] || 0) + 1; });

    res.setHeader('Cache-Control', 'public, s-maxage=1, stale-while-revalidate=1');
    return res.json({ tally, total: data?.length || 0 });
  }

  // POST - проголосовать
  if (req.method === 'POST') {
    const { match_key, participant, voter_token } = req.body;
    if (!match_key || !participant || !voter_token) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Проверка: уже голосовал?
    const { data: existing } = await supabase
      .from('votes')
      .select('id')
      .eq('match_key', match_key)
      .eq('voter_token', voter_token)
      .maybeSingle();

    if (existing) return res.status(400).json({ error: 'already_voted' });

    const { error } = await supabase
      .from('votes')
      .insert({ match_key, participant, voter_token });

    if (error) return res.status(500).json({ error: error.message });

    // Мгновенный ответ. Точный счет подтянется фоновым пуллингом.
    return res.json({ ok: true });
  }

  res.status(405).end();
}