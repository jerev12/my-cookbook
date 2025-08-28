'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Visibility = 'private' | 'friends' | 'public';
type IngredientRow = {
  item_name: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
};

// ---- Page wrapper: provides the Suspense boundary ----
export default function AddRecipePage() {
  return (
    <Suspense
      fallback={
        <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
          Loading…
        </div>
      }
    >
      <AddRecipeForm />
    </Suspense>
  );
}

// ---- Inner component: safe to use useSearchParams here ----
function AddRecipeForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const editId = sp.get('id'); // when present => edit mode
  const isEditing = useMemo(() => !!editId, [editId]);

  // session & page state
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // form state
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [instructions, setInstructions] = useState(''); // one step per line
  const [ingredients, setIngredients] = useState<string[]>(['']);
  const [visibility, setVisibility] = useState<Visibility>('private');

  // ------ AUTH LOAD ------
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // ------ PREFILL (EDIT MODE) ------
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isEditing || !editId) return;
      setMsg(null);
      setBusy(true);

      // Load base recipe
      const { data: recs, error: recErr } = await supabase
        .from('recipes')
        .select('id, user_id, title, cuisine, source_url, visibility')
        .eq('id', editId)
        .limit(1);

      if (!mounted) return;
      if (recErr) {
        setMsg(recErr.message);
        setBusy(false);
        return;
      }
      const r = recs?.[0];
      if (!r) {
        setMsg('Recipe not found.');
        setBusy(false);
        return;
      }

      // Set form fields
      setTitle(r.title ?? '');
      setCuisine(r.cuisine ?? '');
      setSourceUrl(r.source_url ?? '');
      setVisibility((r.visibility as Visibility) ?? 'private');

      // Load ingredients and steps
      const [{ data: ingData, error: ingErr }, { data: stepData, error: stepErr }] =
        await Promise.all([
          supabase
            .from('recipe_ingredients')
            .select('item_name')
            .eq('recipe_id', editId),
          supabase
            .from('recipe_steps')
            .select('step_number, body')
            .eq('recipe_id', editId)
            .order('step_number'),
        ]);

      if (!mounted) return;

      if (ingErr || stepErr) {
        setMsg(ingErr?.message || stepErr?.message || 'Failed to load ingredients/steps.');
        setBusy(false);
        return;
      }

      // Map DB → form
      const ingStrings = (ingData ?? []).map((i: any) => i.item_name as string);
      setIngredients(ingStrings.length ? ingStrings : ['']);

      const stepLines = (stepData ?? []).map((s: any) => s.body as string);
      setInstructions(stepLines.join('\n'));

      setBusy(false);
    })();
    return () => {
      mounted = false;
    };
  }, [isEditing, editId]);

  // ------ SUBMIT ------
  async function submit() {
    setMsg(null);

    if (!title.trim()) return setMsg('Please add a title');
    if (!instructions.trim()) return setMsg('Add instructions (one step per line)');

    // Ensure user is signed in
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) {
      setMsg('No signed-in user — please log in again.');
      return;
    }

    setBusy(true);

    // Derive steps + ingredients for DB
    const steps = instructions
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((body, i) => ({ step_number: i + 1, body }));

    const ingArray: IngredientRow[] = ingredients
      .map((i) => i.trim())
      .filter(Boolean)
      .map((item_name) => ({ item_name }));

    try {
      if (isEditing && editId) {
        // --- EDIT: update recipe & replace its ingredients/steps ---
        const { error: upErr } = await supabase
          .from('recipes')
          .update({
            title,
            cuisine: cuisine || null,
            source_url: sourceUrl || null,
            visibility,
          })
          .eq('id', editId)
          .eq('user_id', userId); // RLS: only owner updates
        if (upErr) throw upErr;

        const [{ error: d1 }, { error: d2 }] = await Promise.all([
          supabase.from('recipe_ingredients').delete().eq('recipe_id', editId),
          supabase.from('recipe_steps').delete().eq('recipe_id', editId),
        ]);
        if (d1 || d2) throw d1 || d2;

        if (ingArray.length) {
          const { error: insIngErr } = await supabase
            .from('recipe_ingredients')
            .insert(ingArray.map((row) => ({ ...row, recipe_id: editId })));
          if (insIngErr) throw insIngErr;
        }

        if (steps.length) {
          const { error: insStepErr } = await supabase
            .from('recipe_steps')
            .insert(steps.map((s) => ({ ...s, recipe_id: editId })));
          if (insStepErr) throw insStepErr;
        }

        router.replace('/cookbook'); // where you want to land after edit
        return;
      }

      // --- CREATE: your existing RPC ---
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

      if (error) throw error;

      // Reset + go back
      setTitle('');
      setCuisine('');
      setSourceUrl('');
      setInstructions('');
      setIngredients(['']);
      setVisibility('private');
      router.replace('/cookbook');
    } catch (err: any) {
      setMsg(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  // ------ UI STATES ------
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
        <p>You need to be signed in to add or edit recipes.</p>
        <a href="/login">Go to sign in</a>
      </div>
    );
  }

  // ------ CLEANER UI ------
  return (
    <main style={{ maxWidth: 760, margin: '28px auto', padding: 16 }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>
          {isEditing ? 'Edit Recipe' : 'Add a Recipe'}
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              background: 'transparent',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '8px 12px',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{
              background: '#111827',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '8px 12px',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Saving…' : isEditing ? 'Save Changes' : 'Save'}
          </button>
        </div>
      </header>

      {msg && (
        <div
          style={{
            marginBottom: 12,
            color: '#b42318',
            background: '#fef2f2',
            border: '1px solid #fee2e2',
            padding: 10,
            borderRadius: 10,
          }}
        >
          {msg}
        </div>
      )}

      {/* Form card */}
      <section
        style={{
          background: '#fff',
          border: '1px solid #eee',
          borderRadius: 12,
          padding: 16,
          display: 'grid',
          gap: 14,
        }}
      >
        {/* Title / Cuisine */}
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Spicy Chicken Tacos"
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
            }}
          />
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Cuisine</label>
          <input
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            placeholder="e.g., Mexican"
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
            }}
          />
        </div>

        {/* Source URL */}
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Source URL (optional)</label>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://example.com"
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
            }}
          />
        </div>

        {/* Ingredients */}
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>
            Ingredients <span style={{ color: '#6b7280' }}>(one per line or add more boxes)</span>
          </label>
          <div style={{ display: 'grid', gap: 8 }}>
            {ingredients.map((val, idx) => (
              <input
                key={idx}
                value={val}
                onChange={(e) => {
                  const copy = [...ingredients];
                  copy[idx] = e.target.value;
                  setIngredients(copy);
                }}
                placeholder={`Ingredient ${idx + 1}`}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                }}
              />
            ))}
          </div>
          <div>
            <button
              type="button"
              onClick={() => setIngredients([...ingredients, ''])}
              style={{
                background: 'transparent',
                border: '1px dashed #cbd5e1',
                padding: '8px 12px',
                borderRadius: 8,
              }}
            >
              + Add ingredient
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>
            Instructions <span style={{ color: '#6b7280' }}>(one step per line)</span>
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={8}
            placeholder={`1. Preheat oven...\n2. Mix dry ingredients...\n3. ...`}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              resize: 'vertical',
              minHeight: 160,
            }}
          />
        </div>

        {/* Visibility */}
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Visibility</label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            style={{
              width: '100%',
              padding: 10,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: '#fff',
            }}
          >
            <option value="private">Private (only you)</option>
            <option value="friends">Friends (your friends)</option>
            <option value="public">Public (everyone)</option>
          </select>
        </div>
      </section>

      {/* Sticky footer actions (mobile friendly) */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          marginTop: 16,
          background: 'linear-gradient(to top, white 70%, transparent)',
          paddingTop: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              background: 'transparent',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '10px 14px',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{
              background: '#111827',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '10px 14px',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Recipe'}
          </button>
        </div>
      </div>
    </main>
  );
}
