'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AvatarCropModal from '@/app/components/AvatarCropModal';
import { supabase } from '@/lib/supabaseClient';

type Visibility = 'private' | 'friends' | 'public';

type IngredientRow = {
  item_name: string;
  quantity?: number | null;
  unit?: string | null;
  note?: string | null;
};

type DBIngredient = {
  item_name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  section_label: string | null;
  ingredient_order?: number | null;
};

type DBStep = {
  step_number: number;
  body: string;
  section_label: string | null;
};

// Suggested recipe type options
const RECIPE_TYPE_OPTIONS = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Main Dish',
  'Side Dish',
  'Appetizer',
  'Snack',
  'Dessert',
  'Drink',
];

// ---------- Helpers ----------
function storagePathFromPublicUrl(publicUrl: string): string | null {
  try {
    const u = new URL(publicUrl);
    const marker = '/recipe-photos/';
    const i = u.pathname.indexOf(marker);
    if (i === -1) return null;
    return decodeURIComponent(u.pathname.slice(i + marker.length));
  } catch {
    return null;
  }
}

// ---------- Page wrapper ----------
export default function AddRecipePage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>Loading…</div>}>
      <AddRecipeForm />
    </Suspense>
  );
}

// ---------- Reusable field style ----------
const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: 10,
  borderRadius: 6,
  border: '1px solid #e5e7eb',
  background: '#fff',
  boxSizing: 'border-box',
  fontSize: 16,
  lineHeight: 1.35,
};

// ---------- Chip styles ----------
const chipBase: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  border: '1px solid #e5e7eb',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1.2,
};
const chipActive: React.CSSProperties = {
  ...chipBase,
  background: '#111827',
  color: '#fff',
  border: '1px solid #111827',
};

// ---------- Component types ----------
type UiComponent = {
  id: string;
  title: string;
  ingredients: string[];
  instructions: string;
  collapsed?: boolean;
};

// ---------- Main component ----------
function AddRecipeForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const editId = sp.get('id');
  const isEditing = useMemo(() => !!editId, [editId]);

  // session & page state
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // form state (core)
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [recipeTypes, setRecipeTypes] = useState<string[]>([]);

  // simple (non-component) fields (default view)
  const [ingredients, setIngredients] = useState<string[]>(['']);
  const [instructions, setInstructions] = useState('');

  // component mode toggle + data
  const [useComponents, setUseComponents] = useState(false);
  const [components, setComponents] = useState<UiComponent[]>([]);
  const [showInfo, setShowInfo] = useState(false);

  // photo state
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const oldPhotoPathRef = useRef<string | null>(null);
  const [localPhotoSrc, setLocalPhotoSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ------ AUTH LOAD ------
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // ------ PREFILL (EDIT MODE) ------
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isEditing || !editId) return;
      setMsg(null);
      setBusy(true);

      const { data: recs, error: recErr } = await supabase
        .from('recipes')
        .select('id, user_id, title, cuisine, source_url, visibility, photo_url, recipe_types, instructions')
        .eq('id', editId)
        .limit(1);

      if (!mounted) return;
      if (recErr) {
        setMsg(recErr.message);
        setBusy(false);
        return;
      }
      const r = recs?.[0] as any;
      if (!r) {
        setMsg('Recipe not found.');
        setBusy(false);
        return;
      }

      setTitle(r.title ?? '');
      setCuisine(r.cuisine ?? '');
      setSourceUrl(r.source_url ?? '');
      setVisibility((r.visibility as Visibility) ?? 'private');
      setPhotoUrl(r.photo_url ?? null);
      setRecipeTypes(Array.isArray(r.recipe_types) ? r.recipe_types : []);
      oldPhotoPathRef.current = r.photo_url ? storagePathFromPublicUrl(r.photo_url) : null;

      // Load ingredients & steps with section labels to detect components
      const [{ data: ingData, error: ingErr }, { data: stepData, error: stepErr }] = await Promise.all([
        supabase.from('recipe_ingredients').select('item_name,section_label,ingredient_order').eq('recipe_id', editId).order('ingredient_order', { ascending: true }),
        supabase.from('recipe_steps').select('step_number,body,section_label').eq('recipe_id', editId).order('step_number'),
      ]);
      if (!mounted) return;

      if (ingErr || stepErr) {
        setMsg(ingErr?.message || stepErr?.message || 'Failed to load ingredients/steps.');
        setBusy(false);
        return;
      }

      const ings = (ingData as DBIngredient[]) ?? [];
      const steps = (stepData as DBStep[]) ?? [];

      // Determine if we should enter component mode
      const labels = new Set(
        [...ings.map(i => (i.section_label ?? 'Main').trim() || 'Main'),
         ...steps.map(s => (s.section_label ?? 'Main').trim() || 'Main')]
      );
      const hasMultiple = labels.size > 1 || (labels.size === 1 && !labels.has('Main'));

      if (hasMultiple) {
        const orderedLabels = Array.from(labels);
        const built: UiComponent[] = orderedLabels.map(lbl => {
          const ingList = ings
            .filter(i => (i.section_label ?? 'Main') === lbl)
            .map(i => i.item_name);
          const stepLines = steps
            .filter(s => (s.section_label ?? 'Main') === lbl)
            .sort((a, b) => a.step_number - b.step_number)
            .map(s => s.body)
            .join('\n');
          return {
            id: crypto.randomUUID(),
            title: lbl,
            ingredients: ingList.length ? ingList : [''],
            instructions: stepLines,
            collapsed: false,
          };
        });
        setComponents(built);
        setUseComponents(true);
        setIngredients(['']);
        setInstructions('');
      } else {
        const ingStrings = ings.length ? ings.map(i => i.item_name) : [''];
        setIngredients(ingStrings);
        const stepLines = steps.sort((a,b)=>a.step_number-b.step_number).map(s => s.body);
        setInstructions(stepLines.join('\n'));
        setUseComponents(false);
        setComponents([]);
      }

      setBusy(false);
    })();
    return () => { mounted = false; };
  }, [isEditing, editId]);

  // ------ PHOTO HANDLERS ------
  function onPickFile() { fileInputRef.current?.click(); }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    setLocalPhotoSrc(url);
    setShowCropper(true);
  }

  async function removePhoto() {
    if (!photoUrl) return;
    const ok = typeof window !== 'undefined' ? window.confirm('Remove this photo? This cannot be undone.') : true;
    if (!ok) return;
    try {
      setBusy(true); setMsg(null);
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id; if (!userId) throw new Error('No signed-in user — please log in again.');

      const path = oldPhotoPathRef.current || storagePathFromPublicUrl(photoUrl);
      if (path) await supabase.storage.from('recipe-photos').remove([path]);

      if (isEditing && editId) {
        const { error: upErr } = await supabase
          .from('recipes')
          .update({ photo_url: null })
          .eq('id', editId)
          .eq('user_id', userId);
        if (upErr) throw upErr;
      }

      setPhotoUrl(null);
      oldPhotoPathRef.current = null;
      setLocalPhotoSrc(null);
      setShowCropper(false);
    } catch (e: any) {
      setMsg(e?.message || 'Failed to remove photo.');
    } finally {
      setBusy(false);
    }
  }

  // NOTE: removed the local body-scroll lock useEffect to avoid post-close “stuck scroll”.
  // AvatarCropModal handles locking/unlocking scroll while it’s open.

  // ------ DELETE RECIPE (Edit mode) ------
  async function deleteRecipe() {
    if (!isEditing || !editId) return;
    const ok = typeof window !== 'undefined'
      ? window.confirm('Delete this recipe? This will remove the photo, ingredients, and steps. This cannot be undone.')
      : true;
    if (!ok) return;
    try {
      setBusy(true); setMsg(null);
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id; if (!userId) throw new Error('No signed-in user — please log in again.');

      const path = oldPhotoPathRef.current || (photoUrl ? storagePathFromPublicUrl(photoUrl) : null);
      if (path) await supabase.storage.from('recipe-photos').remove([path]);

      await supabase.from('recipe_ingredients').delete().eq('recipe_id', editId);
      await supabase.from('recipe_steps').delete().eq('recipe_id', editId);

      const { error: delErr } = await supabase
        .from('recipes')
        .delete()
        .eq('id', editId)
        .eq('user_id', userId);
      if (delErr) throw delErr;

      router.replace('/cookbook');
    } catch (e: any) {
      setMsg(e?.message || 'Failed to delete recipe.');
    } finally {
      setBusy(false);
    }
  }

  // ------ COMPONENT HELPERS ------
  function enterComponentModeFromSimple() {
    const first: UiComponent = {
      id: crypto.randomUUID(),
      title: 'Main',
      ingredients: ingredients.length ? ingredients : [''],
      instructions: instructions,
      collapsed: false,
    };
    setComponents([first]);
    setUseComponents(true);
  }
  function addComponent() {
    setComponents(prev => [
      ...prev,
      { id: crypto.randomUUID(), title: `Component ${prev.length + 1}`, ingredients: [''], instructions: '', collapsed: false },
    ]);
  }
  function deleteComponent(id: string) {
    setComponents(prev => prev.filter(c => c.id !== id));
  }
  function toggleCollapsed(id: string) {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, collapsed: !c.collapsed } : c));
  }
  function updateComponentTitle(id: string, val: string) {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, title: val } : c));
  }
  function updateComponentIngredients(id: string, idx: number, val: string) {
    setComponents(prev => prev.map(c => {
      if (c.id !== id) return c;
      const list = [...c.ingredients];
      list[idx] = val;
      return { ...c, ingredients: list };
    }));
  }
  function addComponentIngredientRow(id: string) {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, ingredients: [...c.ingredients, ''] } : c));
  }
  function updateComponentInstructions(id: string, val: string) {
    setComponents(prev => prev.map(c => c.id === id ? { ...c, instructions: val } : c));
  }

  // ------ SUBMIT ------
  async function submit() {
    setMsg(null);
    if (!title.trim()) return setMsg('Please add a title');

    if (!useComponents) {
      if (!instructions.trim()) return setMsg('Add instructions (one step per line)');
    } else {
      if (components.length === 0) return setMsg('Add at least one component or switch back to simple mode.');
      const anySteps = components.some(c => c.instructions.trim().length > 0);
      if (!anySteps) return setMsg('Each recipe needs instructions. Add steps to at least one component.');
    }

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) { setMsg('No signed-in user — please log in again.'); return; }

    setBusy(true);

    try {
      // EDIT
      if (isEditing && editId) {
        const { error: upErr } = await supabase
          .from('recipes')
          .update({
            title,
            cuisine: cuisine || null,
            source_url: sourceUrl || null,
            visibility,
            photo_url: photoUrl || null,
            recipe_types: recipeTypes,
            instructions: useComponents
              ? components.map(c => `${(c.title || 'Main').trim() || 'Main'}:\n${c.instructions.trim()}\n`).join('\n')
              : instructions,
          })
          .eq('id', editId)
          .eq('user_id', userId);
        if (upErr) throw upErr;

        const [{ error: d1 }, { error: d2 }] = await Promise.all([
          supabase.from('recipe_ingredients').delete().eq('recipe_id', editId),
          supabase.from('recipe_steps').delete().eq('recipe_id', editId),
        ]);
        if (d1 || d2) throw (d1 || d2);

        if (!useComponents) {
          const ingArray: IngredientRow[] = (ingredients || [])
            .map(i => i.trim()).filter(Boolean).map(item_name => ({ item_name }));
          const steps = (instructions || '')
            .split('\n').map(s => s.trim()).filter(Boolean)
            .map((body, i) => ({ step_number: i + 1, body }));

          if (ingArray.length) {
            const { error } = await supabase
              .from('recipe_ingredients')
              .insert(ingArray.map(row => ({ ...row, recipe_id: editId, section_label: 'Main', ingredient_order: null } as any)));
            if (error) throw error;
          }
          if (steps.length) {
            const { error } = await supabase
              .from('recipe_steps')
              .insert(steps.map(s => ({ ...s, recipe_id: editId, section_label: 'Main' } as any)));
            if (error) throw error;
          }
        } else {
          const flatIngs: DBIngredient[] = [];
          const flatSteps: DBStep[] = [];
          components.forEach((c) => {
            const label = (c.title || 'Main').trim() || 'Main';
            c.ingredients
              .map(t => t.trim())
              .filter(Boolean)
              .forEach((item_name, idx) => {
                flatIngs.push({ item_name, quantity: null, unit: null, note: null, section_label: label, ingredient_order: idx + 1 });
              });
            const lines = c.instructions.split('\n').map(s => s.trim()).filter(Boolean);
            lines.forEach((body) => {
              flatSteps.push({ step_number: flatSteps.length + 1, body, section_label: label });
            });
          });

          if (flatIngs.length) {
            const { error } = await supabase.from('recipe_ingredients').insert(
              flatIngs.map(r => ({ ...r, recipe_id: editId }))
            );
            if (error) throw error;
          }
          if (flatSteps.length) {
            const { error } = await supabase.from('recipe_steps').insert(
              flatSteps.map(s => ({ ...s, recipe_id: editId }))
            );
            if (error) throw error;
          }
        }

        router.replace('/cookbook');
        return;
      }

      // CREATE
      if (!useComponents) {
        const ingArray: IngredientRow[] = (ingredients || [])
          .map(i => i.trim()).filter(Boolean).map(item_name => ({ item_name }));
        const steps = (instructions || '')
          .split('\n').map(s => s.trim()).filter(Boolean)
          .map((body, i) => ({ step_number: i + 1, body }));

        const { error } = await supabase.rpc('add_full_recipe', {
          p_title: title,
          p_cuisine: cuisine || null,
          p_photo_url: photoUrl || null,
          p_source_url: sourceUrl || null,
          p_instructions: instructions,
          p_ingredients: ingArray,
          p_steps: steps,
          p_visibility: visibility,
          p_recipe_types: recipeTypes,
        });
        if (error) throw error;
      } else {
        const instrForHints = components
          .map(c => `${(c.title || 'Main').trim() || 'Main'}:\n${c.instructions.trim()}\n`).join('\n');

        const { data: inserted, error: insErr } = await supabase
          .from('recipes')
          .insert({
            title,
            cuisine: cuisine || null,
            source_url: sourceUrl || null,
            visibility,
            photo_url: photoUrl || null,
            recipe_types: recipeTypes,
            instructions: instrForHints,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        const newId = (inserted as any).id as string;

        const flatIngs: DBIngredient[] = [];
        const flatSteps: DBStep[] = [];
        components.forEach((c) => {
          const label = (c.title || 'Main').trim() || 'Main';
          c.ingredients
            .map(t => t.trim())
            .filter(Boolean)
            .forEach((item_name, idx) => {
              flatIngs.push({ item_name, quantity: null, unit: null, note: null, section_label: label, ingredient_order: idx + 1 });
            });
          const lines = c.instructions.split('\n').map(s => s.trim()).filter(Boolean);
          lines.forEach((body) => {
            flatSteps.push({ step_number: flatSteps.length + 1, body, section_label: label });
          });
        });

        if (flatIngs.length) {
          const { error } = await supabase.from('recipe_ingredients').insert(
            flatIngs.map(r => ({ ...r, recipe_id: newId }))
          );
          if (error) throw error;
        }
        if (flatSteps.length) {
          const { error } = await supabase.from('recipe_steps').insert(
            flatSteps.map(s => ({ ...s, recipe_id: newId }))
          );
          if (error) throw error;
        }
      }

      // Reset + go back
      setTitle(''); setCuisine(''); setSourceUrl('');
      setInstructions(''); setIngredients(['']); setVisibility('private');
      setPhotoUrl(null); setRecipeTypes([]);
      setUseComponents(false); setComponents([]);
      oldPhotoPathRef.current = null;

      router.replace('/cookbook');
    } catch (err: any) {
      setMsg(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  // ------ UI STATES ------
  if (loading) return <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>Loading…</div>;
  if (!session) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
        <h1>Sign in required</h1>
        <p>You need to be signed in to add or edit recipes.</p>
        <a href="/login">Go to sign in</a>
      </div>
    );
  }

  // ------ LAYOUT ------
  return (
    <main className="ar-container" style={{ maxWidth: 760, margin: '28px auto', padding: 16 }}>
      <header className="ar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{isEditing ? 'Edit Recipe' : 'Add a Recipe'}</h1>
      </header>

      {msg && (
        <div style={{ marginBottom: 12, color: '#b42318', background: '#fef2f2', border: '1px solid #fee2e2', padding: 10, borderRadius: 10 }}>
          {msg}
        </div>
      )}

      <section className="ar-card" style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, display: 'grid', gap: 12 }}>
        {/* Photo */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Photo</label>
          <div className="ar-photo-row" style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 110, height: 110, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f8fafc', display: 'grid', placeItems: 'center', fontSize: 12, textAlign: 'center' }}>
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Recipe" src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (<span>No photo</span>)}
            </div>
            <div className="ar-photo-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={onPickFile} className="ar-btn">
                {photoUrl ? 'Change Photo' : 'Upload Photo'}
              </button>
              {/* Removed separate "Edit Crop" button */}
              {photoUrl && (
                <button type="button" onClick={removePhoto} className="ar-btn-danger">Remove Photo</button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} style={{ display: 'none' }} />
            </div>
          </div>
        </div>

        {/* Title */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Spicy Chicken Tacos" style={fieldStyle} />
        </div>

        {/* Cuisine */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Cuisine</label>
          <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="e.g., Mexican" style={fieldStyle} />
        </div>

        {/* Recipe URL (optional) */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>
            Recipe URL <span style={{ color: '#6b7280', fontWeight: 400 }}>(optional)</span>
          </label>
          <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://example.com" style={fieldStyle} />
        </div>

        {/* Recipe Type (multi-select chips) */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Recipe Type</label>
          <div className="ar-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {RECIPE_TYPE_OPTIONS.map((opt) => {
              const selected = recipeTypes.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setRecipeTypes((prev) =>
                      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                    );
                  }}
                  style={selected ? chipActive : chipBase}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Visibility (pill toggle group) */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Who can view my recipe:</label>
          <div role="radiogroup" aria-label="Who can view my recipe" className="ar-chips" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center' }}>
              <input type="radio" name="visibility" value="public" checked={visibility === 'public'} onChange={() => setVisibility('public')} style={{ display: 'none' }} />
              <span style={visibility === 'public' ? chipActive : chipBase}>Public</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center' }}>
              <input type="radio" name="visibility" value="friends" checked={visibility === 'friends'} onChange={() => setVisibility('friends')} style={{ display: 'none' }} />
              <span style={visibility === 'friends' ? chipActive : chipBase}>Friends</span>
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center' }}>
              <input type="radio" name="visibility" value="private" checked={visibility === 'private'} onChange={() => setVisibility('private')} style={{ display: 'none' }} />
              <span style={visibility === 'private' ? chipActive : chipBase}>Private</span>
            </label>
          </div>
        </div>

        {/* SIMPLE MODE (default) */}
        {!useComponents && (
          <>
            {/* Ingredients */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Ingredients</label>
              <div style={{ display: 'grid', gap: 6 }}>
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
                    style={fieldStyle}
                  />
                ))}
              </div>
              <div>
                <button type="button" onClick={() => setIngredients([...ingredients, ''])} className="ar-btn-dashed">
                  + Add ingredient
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600 }}>
                Instructions <span style={{ color: '#6b7280', fontWeight: 400 }}>(one step per line)</span>
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={7}
                placeholder={`e.g., Preheat oven...\ne.g., Mix dry ingredients...\ne.g., Bake for 30 minutes`}
                style={{ ...fieldStyle, resize: 'vertical', minHeight: 140 }}
              />
            </div>

            {/* Add Component CTA + info */}
            <div className="ar-info-row" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={enterComponentModeFromSimple}
                className="ar-btn"
              >
                Add Component
              </button>

              <button
                type="button"
                aria-label="What are components?"
                onClick={() => setShowInfo(v => !v)}
                className="ar-icon"
                title="What are components?"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>

              {showInfo && (
                <div role="tooltip" className="ar-tip">
                  Use <b>components</b> for recipes with multiple parts (e.g., cake + frosting)
                  where each part has its own ingredients and instructions.
                </div>
              )}
            </div>
          </>
        )}

        {/* COMPONENT MODE (accordion) */}
        {useComponents && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 600 }}>Components</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={addComponent} className="ar-btn">+ Add Component</button>
                <button
                  type="button"
                  onClick={() => { setUseComponents(false); setComponents([]); }}
                  className="ar-btn-light"
                  title="Return to simple ingredients & instructions"
                >
                  Use Simple Fields
                </button>
              </div>
            </div>

            {components.map((c, idx) => (
              <div key={c.id} className="ar-accordion">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(c.id)}
                  aria-expanded={!c.collapsed}
                  className="ar-accordion-head"
                >
                  <span style={{ fontWeight: 600 }}>
                    {c.title?.trim() || `Component ${idx + 1}`}
                  </span>
                  <span aria-hidden="true" className={`ar-caret ${c.collapsed ? 'rot' : ''}`}>▾</span>
                </button>

                {!c.collapsed && (
                  <div className="ar-accordion-body">
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontWeight: 600 }}>Component Title</label>
                      <input
                        value={c.title}
                        onChange={(e) => updateComponentTitle(c.id, e.target.value)}
                        placeholder={`e.g., Cake, Frosting`}
                        style={fieldStyle}
                      />
                    </div>

                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontWeight: 600 }}>Ingredients</label>
                      <div style={{ display: 'grid', gap: 6 }}>
                        {c.ingredients.map((val, i) => (
                          <input
                            key={i}
                            value={val}
                            onChange={(e) => updateComponentIngredients(c.id, i, e.target.value)}
                            placeholder={`Ingredient ${i + 1}`}
                            style={fieldStyle}
                          />
                        ))}
                      </div>
                      <div>
                        <button
                          type="button"
                          onClick={() => addComponentIngredientRow(c.id)}
                          className="ar-btn-dashed"
                        >
                          + Add ingredient
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontWeight: 600 }}>
                        Instructions <span style={{ color: '#6b7280', fontWeight: 400 }}>(one step per line)</span>
                      </label>
                      <textarea
                        value={c.instructions}
                        onChange={(e) => updateComponentInstructions(c.id, e.target.value)}
                        rows={6}
                        placeholder={`e.g., Preheat oven...\ne.g., Mix dry ingredients...\ne.g., Bake for 30 minutes`}
                        style={{ ...fieldStyle, resize: 'vertical', minHeight: 120 }}
                      />
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => deleteComponent(c.id)}
                        className="ar-btn-danger"
                      >
                        Delete Component
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Action buttons inside the card */}
        <div className="ar-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <button type="button" onClick={() => router.back()} className="ar-btn-light">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy} className="ar-btn-primary">
            {busy ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Recipe'}
          </button>
        </div>

        {/* Danger: Delete (only in edit mode) */}
        {isEditing && (
          <div style={{ marginTop: 4 }}>
            <button type="button" onClick={deleteComponent as any} className="ar-btn-danger" style={{ width: '100%' }}>
              Delete Recipe
            </button>
          </div>
        )}
      </section>

      {/* Shared cropper modal */}
      {showCropper && localPhotoSrc && (
        <AvatarCropModal
          open
          imageSrc={localPhotoSrc}
          aspect={1}              // square recipe images
          cropShape="rect"        // rectangular mask
          title="Adjust Photo"
          showGrid={true}         // rule-of-thirds grid ON
          // showCenterGuides removed
          onCancel={() => {
            try { if (localPhotoSrc) URL.revokeObjectURL(localPhotoSrc); } catch {}
            setLocalPhotoSrc(null);
            setShowCropper(false);
          }}
          onSave={async (blob: Blob) => {
            try {
              setBusy(true); setMsg(null);
              const { data: userRes } = await supabase.auth.getUser();
              const userId = userRes?.user?.id;
              if (!userId) throw new Error('No signed-in user — please log in again.');

              const base = (sp.get('id') || crypto.randomUUID()).toString();
              const filename = `${base}-${Date.now()}.jpg`;
              const newPath = `${userId}/${filename}`;

              const upRes = await supabase
                .storage
                .from('recipe-photos')
                .upload(newPath, blob, { contentType: 'image/jpeg' });
              if (upRes.error) throw upRes.error;

              const { data: pub } = await supabase
                .storage
                .from('recipe-photos')
                .getPublicUrl(newPath);
              const newPublicUrl = pub.publicUrl;

              if (isEditing && editId) {
                const { error: upErr } = await supabase
                  .from('recipes')
                  .update({ photo_url: newPublicUrl })
                  .eq('id', editId);
                if (upErr) throw upErr;
              }

              const prevPath = oldPhotoPathRef.current;
              if (prevPath && prevPath !== newPath) {
                await supabase.storage.from('recipe-photos').remove([prevPath]);
              }
              oldPhotoPathRef.current = newPath;

              setPhotoUrl(newPublicUrl);
            } catch (e: any) {
              setMsg(e?.message || 'Image upload failed.');
            } finally {
              try { if (localPhotoSrc) URL.revokeObjectURL(localPhotoSrc); } catch {}
              setLocalPhotoSrc(null);
              setShowCropper(false);
              setBusy(false);
            }
          }}
        />
      )}

      {/* Responsive styles */}
      <style jsx>{`
        .ar-container { box-sizing: border-box; }
        .ar-card :global(input), 
        .ar-card :global(textarea), 
        .ar-card :global(select) { font-size: 16px; } /* iOS no-zoom */

        .ar-btn, .ar-btn-light, .ar-btn-primary, .ar-btn-danger, .ar-btn-dashed {
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 14px;
          line-height: 1.2;
          background: transparent;
          border: 1px solid #cbd5e1;
        }
        .ar-btn-primary {
          background: #111827;
          color: #fff;
          border-color: #111827;
        }
        .ar-btn-light {
          background: #fff;
          border: 1px solid #e5e7eb;
        }
        .ar-btn-danger {
          color: #ef4444;
          border: 1px solid #ef4444;
          background: #fff;
        }
        .ar-btn-dashed {
          border-style: dashed;
        }

        .ar-icon {
          background: transparent;
          border: none;
          padding: 6px;
          border-radius: 6px;
        }
        .ar-tip {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
        }

        .ar-accordion {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          overflow: hidden;
        }
        .ar-accordion-head {
          width: 100%;
          text-align: left;
          background: #f8fafc;
          border: none;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
        }
        .ar-accordion-body {
          padding: 12px;
          display: grid;
          gap: 10px;
        }
        .ar-caret { transition: transform .15s ease; }
        .ar-caret.rot { transform: rotate(-90deg); }

        /* --------- Responsive tweaks --------- */
        @media (max-width: 380px) {
          .ar-container { padding: 12px; }
          .ar-header h1 { font-size: 18px; }

          .ar-photo-row {
            grid-template-columns: 1fr;
          }
          .ar-photo-actions { gap: 6px; }
          .ar-chips > * { font-size: 13px; padding: 7px 10px; }

          .ar-actions {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 330px) {
          .ar-chips { gap: 6px; }
          .ar-btn, .ar-btn-light, .ar-btn-primary, .ar-btn-danger, .ar-btn-dashed {
            padding: 9px 10px;
            font-size: 13.5px;
          }
        }
      `}</style>
    </main>
  );
}
