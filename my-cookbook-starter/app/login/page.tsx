'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const redirectTo = `${location.origin}/add-recipe`; // after clicking email
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div style={{maxWidth: 480, margin:'40px auto', padding:16}}>
      <h1>Sign in</h1>
      <p>Enter your email and we’ll send you a sign‑in link.</p>
      <form onSubmit={sendLink}>
        <input
          type="email"
          required
          value={email}
          onChange={e=>setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{width:'100%', padding:10, margin:'12px 0'}}
        />
        <button type="submit">Send sign‑in link</button>
      </form>
      {sent && <p>Check your email for the link. After tapping it, you’ll land on <code>/add-recipe</code>.</p>}
      {error && <p style={{color:'crimson'}}>Error: {error}</p>}
    </div>
  );
}
