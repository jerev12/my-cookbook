'use client';
import { supabase } from '@/lib/supabaseClient';

export default function EnvCheck() {
  // @ts-ignore
  const url = (supabase as any).rest?.url || 'unknown';
  // @ts-ignore
  const key = (supabase as any).rest?.headers?.apikey || 'unknown';

  const mask = (s: string) => {
    if (!s || s === 'unknown') return s;
    return s.slice(0, 6) + '...' + s.slice(-6);
  };

  return (
    <div style={{maxWidth:720, margin:'40px auto', padding:16}}>
      <h1>Environment Check</h1>
      <p><strong>Supabase URL:</strong> {url}</p>
      <p><strong>Anon Key (masked):</strong> {mask(key)}</p>
    </div>
  );
}
