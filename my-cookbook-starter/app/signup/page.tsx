'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient'; // adjust path if needed

export default function SignUpPage() {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const validate = () => {
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return 'Please enter a valid email.';
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password))
      return 'Password must be at least 6 characters and include an uppercase and lowercase letter, number, and special character.';
    if (password !== confirm) return 'Passwords do not match.';
    if (!displayName.trim()) return 'Display name is required.';
    if (!/^[a-zA-Z0-9_\.]{3,20}$/.test(displayName))
      return 'Display name must be 3–20 characters, letters/numbers/._ only.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    const v = validate();
    if (v) { setErr(v); return; }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } } // stores it in user_metadata
    });
    setLoading(false);

    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes('already registered')) setErr('That email is already registered. Try logging in.');
      else setErr(error.message);
      return;
    }

    // If email confirmation is ON in Supabase, session will be null until they click the email link
    if (!data.session) {
      setMsg('Check your inbox to confirm your email, then come back to log in.');
    } else {
      setMsg('Account created! Redirecting…');
      window.location.href = '/dashboard';
    }
  };

  return (
    <main style={{ maxWidth: 420, margin: '40px auto', padding: 16 }}>
      <h1>Create your account</h1>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>Email
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
        </label>

        <label>Display name
          <input type="text" value={displayName} onChange={e=>setDisplayName(e.target.value)} required placeholder="e.g. john_e" />
        </label>

        <label>Password
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
        </label>

        <label>Confirm password
          <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? 'Creating…' : 'Sign Up'}
        </button>
      </form>

      {err && <p style={{ color: 'crimson', marginTop: 12 }}>{err}</p>}
      {msg && <p style={{ color: 'green', marginTop: 12 }}>{msg}</p>}

      <p style={{ marginTop: 20 }}>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
