'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Visibility = 'private' | 'friends' | 'public';

export default function AddRecipePage() {
  const router = useRouter();
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
  const [msg, setMsg] = useState<string | null>(null);

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
    setMsg(null);

    if (!title.trim()) return setMsg('Please add a title');
    if (!instructions.trim()) return setMsg('Add instructions (one step per line)');

    // Ensure user is present (avoids anonymous inserts)
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      setMsg('No signed-in user — please log in again.');
      return;
    }

    setBusy(true);

    const steps = instructions
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((body, i) => ({ step_number: i + 1, body }));

    const ingArray = ingredients
      .map((i) => i.trim())
      .filter(Boolean)
      .map((i) => ({ item_name: i }));

    const { error } = await supabase.rpc('add_full_recipe', {
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
      setMsg(error.message);
      return;
    }

    // Reset + go back to My Cookbook
    setTitle('');
    setCuisine('');
    setSourceUrl('');
    setInstructions('');
    setIngredients(['']);
    setVisibility('private');
    router.replace('/cookbook');
  }

  // ------- UI states -------
  if (loading) {
    return <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>Loading…</div>;
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

      {msg && (
        <div style={{ margin: '8px 0 12px', color: '#b42318' }}>
          {msg}
        </div>
      )}

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
      <button type="button" onClick={() => setIngredients([...ingredients, ''])}>
        + Add ingredient
      </button>

      <label style={{ display: 'block', marginTop: 16 }}>Instructions (one step per line)</label>
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
