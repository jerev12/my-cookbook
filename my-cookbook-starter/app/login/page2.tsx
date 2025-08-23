'use client';

import { useState } from 'react';
// If you have tsconfig paths set, this works:
import { supabase } from '@/lib/supabaseClient';
// If not, use a relative import instead (uncomment & fix the path):
// import { supabase } from '../../lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes('invalid login credentials')) setErr('Invalid email or password.');
      else if (m.includes('email not confirmed')) setErr('Please confirm your email first. Check your inbox.');
      else setErr(error.message);
      return;
    }

    // On success, route to your app’s main page
    window.location.href = '/dashboard';
  };

  return (
    <main style={{ maxWidth: 420, margin: '40px auto', padding: 16 }}>
      <h1>Log in</h1>
      <form onSubmit={handleLogin} style={{ display: 'grid', gap: 12 }}>
        <label>Email
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
        </label>

        <label>Password
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Log In'}
        </button>
      </form>

      {err && <p style={{ color: 'crimson', marginTop: 12 }}>{err}</p>}

      <p style={{ marginTop: 20 }}>
        New here? <a href="/signup">Create an account</a>
      </p>

      <p style={{ marginTop: 8 }}>
        Forgot it? <a href="/forgot-password">Reset your password</a>
      </p>
    </main>
  );
}
