'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { createClient } from '@supabase/supabase-js';

type Visibility = 'private' | 'friends' | 'public';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export default function AddRecipePage() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);

  // form state
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [ingredients, setIngredients] = useState<string[]>(['']);
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  async function submit() {
    if (!title.trim()) {
      alert('Please add a title');
      return;
    }
    if (!instructions.trim()) {
      alert('Please add instructions (one step per line)');
      return;
    }

    // 1) Client-side: who does Supabase think you are?
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    alert(
      'User check:\n' +
        JSON.stringify(userRes?.user, null, 2) +
        '\nError: ' +
        JSON.stringify(userErr, null, 2)
    );
    if (userErr || !userRes?.user) {
      alert('No signed-in user — please log in again.');
      return;
    }

    // 2) Get the current access_token and create an authed client with it
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    if (!accessToken) {
      alert('No access token found on this page session.');
      return;
    }

    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false }, // not needed; we’re just using this client for the calls below
    });

    // 3) Ask the DATABASE who it sees (should be your UUID now)
    const { data: serverUserId, error: whoErr } = await authed.rpc('who_am_i');
    alert(
      'Server sees user id: ' +
        JSON.stringify(serverUserId) +
        '\nError: ' +
        JSON.stringify(whoErr, null, 2)
    );
    if (!serverUserId) {
      alert('The server still did not get your token. Double-check env vars & Supabase URL config after this test.');
      return;
    }

    setBusy(true);

    // Build steps from the textarea (one step per line)
    const steps = instructions
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((body, i) => ({ step_number: i + 1, body }));

    // Build ingredients array (one per input line)
    const ingArray = ingredients
      .map((i) => i.trim())
      .filter(Boolean)
      .map((i) => ({ item_name: i }));

    // 4) Call your RPC using the authed client so auth.uid() resolves properly
    const { error } = await authed.rpc('add_full_recipe', {
      p_title: title,
      p_cuisine: cuisine || null,
      p_photo_url: null,
      p_source_url: sourceUrl || null,
      p_instructions: instructions,
      p_ingredients: ingArray,
      p_steps: steps,
      p_visibility: visibility,
    });

    setBusy(false);

    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }

    alert('Recipe saved!');
    // reset form
    setTitle('');
    setCuisine('');
    setSourceUrl('');
    setInstructions('');
    setIngredients(['']);
    setVisibility('private');
  }

  // ------- UI states -------
  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
        <h1>Sign in required</h1>
        <p>You need to be signed in to add recipes.</p>
        <a href="/login">Go to sign in</a>
      </div>
    );
  }

  // signed-in form
  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h1>Add a Recipe</h1>

      <label>Title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 10 }}
      />

      <label>Cuisine</label>
      <input
        value={cuisine}
        onChange={(e) => setCuisine(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 10 }}
      />

      <label>Source URL (optional)</label>
      <input
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 10 }}
      />

      <label>Ingredients (one per line or add more boxes)</label>
      {ingredients.map((val, idx) => (
        <input
          key={idx}
          value={val}
          onChange={(e) => {
            const copy = [...ingredients];
            copy[idx] = e.target.value;
            setIngredients(copy);
          }}
          style={{ width: '100%', padding: 8, marginBottom: 8 }}
          placeholder={`Ingredient ${idx + 1}`}
        />
      ))}
      <button
        type="button"
        onClick={() => setIngredients([...ingredients, ''])}
      >
        + Add ingredient
      </button>

      <label style={{ display: 'block', marginTop: 16 }}>
        Instructions (one step per line)
      </label>
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={8}
        style={{ width: '100%', padding: 8 }}
      />

      <label style={{ display: 'block', marginTop: 16 }}>Visibility</label>
      <select
        value={visibility}
        onChange={(e) => setVisibility(e.target.value as Visibility)}
        style={{ width: '100%', padding: 8, marginBottom: 10 }}
      >
        <option value="private">Private (only you)</option>
        <option value="friends">Friends (your friends)</option>
        <option value="public">Public (everyone)</option>
      </select>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button type="button" onClick={submit} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
