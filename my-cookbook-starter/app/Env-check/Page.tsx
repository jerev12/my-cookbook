'use client';
import { supabase } from '@/lib/supabaseClient';

export default function EnvCheck() {
  // @ts-ignore - reach into the client to read the url it was built with
  const url = (supabase as any).rest?.url || 'unknown';
  // @ts-ignore
  const key = (supabase as any).rest?.headers?.apikey || 'unknown';

  function mask(s: string) {
    if (!s || s === 'unknown') return s;
    if (s.length <= 12) return '********';
    return s.slice(0, 6) + '...' + s.slice(-6);
  }

  return (
    <div style={{maxWidth:720, margin:'40px auto', padding:16}}>
      <h1>Environment Check</h1>
      <p><strong>Supabase URL:</strong> {url}</p>
      <p><strong>Anon Key (masked):</strong> {mask(key)}</p>
      <p>Now open the browser dev tools → Network tab (if possible) and try visiting <code>/login</code> again after this.</p>
    </div>
  );
}
