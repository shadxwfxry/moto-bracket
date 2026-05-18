import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { data, error } = await supabase
    .from('tournament')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (!data || !data.state || data.state.status === 'empty') {
    return res.json({ status: 'empty' });
  }

  res.json(data);
}
