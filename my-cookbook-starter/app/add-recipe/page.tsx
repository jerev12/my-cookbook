'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Cropper from 'react-easy-crop';
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

// Suggested recipe type options (you can change these anytime)
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
async function getCroppedBlob(
  imageSrc: string,
  crop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = imageSrc;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width);
  canvas.height = Math.round(crop.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.9)
  );
}
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
  padding: 8,
  borderRadius: 6,
  border: '1px solid #e5e7eb',
  background: '#fff',
  boxSizing: 'border-box',
};

// ---------- Chip styles ----------
const chipBase: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid #e5e7eb',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
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
  ingredients: string[];    // simple item lines
  instructions: string;     // one step per line
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
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
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
        // Build components from labels
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
        // hide simple fields
        setIngredients(['']);
        setInstructions('');
      } else {
        // Simple mode: fill simple fields
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
    setZoom(1); setCrop({ x: 0, y: 0 });
  }
  function onCropComplete(_: any, areaPixels: any) { setCroppedPixels(areaPixels); }

  async function confirmCrop() {
    if (!localPhotoSrc || !croppedPixels) return;
    try {
      setBusy(true); setMsg(null);
      const blob = await getCroppedBlob(localPhotoSrc, croppedPixels);
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id; if (!userId) throw new Error('No signed-in user — please log in again.');

      const base = (sp.get('id') || crypto.randomUUID()).toString();
      const filename = `${base}-${Date.now()}.jpg`;
      const newPath = `${userId}/${filename}`;

      const upRes = await supabase.storage.from('recipe-photos').upload(newPath, blob, { contentType: 'image/jpeg' });
      if (upRes.error) throw upRes.error;

      const { data: pub } = supabase.storage.from('recipe-photos').getPublicUrl(newPath);
      const newPublicUrl = pub.publicUrl;

      if (isEditing && editId) {
        const { error: upErr } = await supabase
          .from('recipes')
          .update({ photo_url: newPublicUrl })
          .eq('id', editId)
          .eq('user_id', userId);
        if (upErr) throw upErr;
      }

      setPhotoUrl(newPublicUrl);
      const prevPath = oldPhotoPathRef.current;
      if (prevPath && prevPath !== newPath) {
        await supabase.storage.from('recipe-photos').remove([prevPath]);
      }
      oldPhotoPathRef.current = newPath;

      setShowCropper(false);
      URL.revokeObjectURL(localPhotoSrc);
      setLocalPhotoSrc(null);
    } catch (e: any) {
      setMsg(e?.message || 'Image upload failed.');
    } finally {
      setBusy(false);
    }
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
    // Build a single "Main" component using existing simple fields
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

    // Validate depending on mode
    if (!useComponents) {
      if (!instructions.trim()) return setMsg('Add instructions (one step per line)');
    } else {
      // ensure at least one component has content
      if (components.length === 0) return setMsg('Add at least one component or switch back to simple mode.');
      const anySteps = components.some(c => c.instructions.trim().length > 0);
      if (!anySteps) return setMsg('Each recipe needs instructions. Add steps to at least one component.');
    }

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) { setMsg('No signed-in user — please log in again.'); return; }

    setBusy(true);

    try {
      // ---- EDIT MODE ----
      if (isEditing && editId) {
        // Update core recipe data
        const { error: upErr } = await supabase
          .from('recipes')
          .update({
            title,
            cuisine: cuisine || null,
            source_url: sourceUrl || null,
            visibility,
            photo_url: photoUrl || null,
            recipe_types: recipeTypes,
            // keep instructions text (used for ordering hints). If in component mode, we keep as concatenation of headings + steps:
            instructions: useComponents
              ? components.map(c => `${(c.title || 'Main').trim() || 'Main'}:\n${c.instructions.trim()}\n`).join('\n')
              : instructions,
          })
          .eq('id', editId)
          .eq('user_id', userId);
        if (upErr) throw upErr;

        // Replace child rows
        const [{ error: d1 }, { error: d2 }] = await Promise.all([
          supabase.from('recipe_ingredients').delete().eq('recipe_id', editId),
          supabase.from('recipe_steps').delete().eq('recipe_id', editId),
        ]);
        if (d1 || d2) throw (d1 || d2);

        if (!useComponents) {
          // SIMPLE: ingredients + steps from simple fields
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
          // COMPONENT MODE
          // Flatten ingredients and steps with section labels
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
            lines.forEach((body, i) => {
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

      // ---- CREATE MODE ----
      if (!useComponents) {
        // SIMPLE: use your existing RPC
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
        // COMPONENT MODE: create recipe row, then insert labeled children
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
            instructions: instrForHints, // keep headings for modal ordering hints
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
    <main style={{ maxWidth: 760, margin: '28px auto', padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>{isEditing ? 'Edit Recipe' : 'Add a Recipe'}</h1>
      </header>

      {msg && (
        <div style={{ marginBottom: 12, color: '#b42318', background: '#fef2f2', border: '1px solid #fee2e2', padding: 10, borderRadius: 10 }}>
          {msg}
        </div>
      )}

      <section style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, display: 'grid', gap: 12 }}>
        {/* Photo */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Photo</label>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, alignItems: 'center' }}>
            <div style={{ width: 110, height: 110, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f8fafc', display: 'grid', placeItems: 'center', fontSize: 12, textAlign: 'center' }}>
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="Recipe" src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (<span>No photo</span>)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={onPickFile} style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: 8 }}>
                {photoUrl ? 'Change Photo' : 'Upload Photo'}
              </button>
              {photoUrl && (
                <>
                  <button type="button" onClick={() => setShowCropper(true)} style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: 8 }}>
                    Edit Crop
                  </button>
                  <button type="button" onClick={removePhoto} style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 12px', borderRadius: 8 }}>
                    Remove Photo
                  </button>
                </>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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

        {/* ------------ SIMPLE MODE (default) ------------ */}
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
                <button type="button" onClick={() => setIngredients([...ingredients, ''])} style={{ background: 'transparent', border: '1px dashed #cbd5e1', padding: '8px 12px', borderRadius: 8 }}>
                  + Add ingredient
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600 }}>
                Instructions <span style={{ color: '#6b7280', fontWeight: 400 }}>(one step per line)</span>
              </label>
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={7} placeholder={`1. Preheat oven...\n2. Mix dry ingredients...\n3. ...`} style={{ ...fieldStyle, resize: 'vertical', minHeight: 140 }} />
            </div>

            {/* Add Component CTA + info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={enterComponentModeFromSimple}
                style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: 8 }}
              >
                Add Component
              </button>

              <button
                type="button"
                aria-label="What are components?"
                onClick={() => setShowInfo(v => !v)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 0 }}
                title="What are components?"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="8" />
                  <path d="M10.5 12a1.5 1.5 0 1 1 3 0c0 1.5-1.5 1.5-1.5 3" />
                </svg>
              </button>

              {showInfo && (
                <div
                  role="tooltip"
                  style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    color: '#374151',
                    borderRadius: 8,
                    padding: '8px 10px',
                    fontSize: 13,
                  }}
                >
                  Use <b>components</b> for recipes with multiple parts (e.g., cake + frosting) where each part has its own ingredients and instructions.
                </div>
              )}
            </div>
          </>
        )}

        {/* ------------ COMPONENT MODE (accordion) ------------ */}
        {useComponents && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 600 }}>Components</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={addComponent} style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: 8 }}>
                  + Add Component
                </button>
                <button
                  type="button"
                  onClick={() => { setUseComponents(false); setComponents([]); }}
                  style={{ background: 'transparent', border: '1px solid #e5e7eb', padding: '8px 12px', borderRadius: 8 }}
                  title="Return to simple ingredients & instructions"
                >
                  Use Simple Fields
                </button>
              </div>
            </div>

            {components.map((c, idx) => (
              <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10 }}>
                {/* Header row */}
                <button
                  type="button"
                  onClick={() => toggleCollapsed(c.id)}
                  aria-expanded={!c.collapsed}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: '#f8fafc',
                    border: 'none',
                    padding: '10px 12px',
                    borderTopLeftRadius: 10,
                    borderTopRightRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>
                    {c.title?.trim() || `Component ${idx + 1}`}
                  </span>
                  <span aria-hidden="true" style={{ transform: c.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform .15s ease' }}>▾</span>
                </button>

                {!c.collapsed && (
                  <div style={{ padding: 12, display: 'grid', gap: 10 }}>
                    {/* Title */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontWeight: 600 }}>Component Title</label>
                      <input
                        value={c.title}
                        onChange={(e) => updateComponentTitle(c.id, e.target.value)}
                        placeholder={`e.g., Cake, Frosting`}
                        style={fieldStyle}
                      />
                    </div>

                    {/* Ingredients (per component) */}
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
                          style={{ background: 'transparent', border: '1px dashed #cbd5e1', padding: '8px 12px', borderRadius: 8 }}
                        >
                          + Add ingredient
                        </button>
                      </div>
                    </div>

                    {/* Instructions (per component) */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      <label style={{ fontWeight: 600 }}>
                        Instructions <span style={{ color: '#6b7280', fontWeight: 400 }}>(one step per line)</span>
                      </label>
                      <textarea
                        value={c.instructions}
                        onChange={(e) => updateComponentInstructions(c.id, e.target.value)}
                        rows={6}
                        placeholder={`1. ...\n2. ...`}
                        style={{ ...fieldStyle, resize: 'vertical', minHeight: 120 }}
                      />
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => deleteComponent(c.id)}
                        style={{ background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '8px 12px', borderRadius: 8 }}
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          <button type="button" onClick={() => router.back()} style={{ width: '100%', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px' }}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={busy} style={{ width: '100%', background: '#111827', color: 'white', border: 'none', borderRadius: 8, padding: '12px 14px', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Recipe'}
          </button>
        </div>

        {/* Danger: Delete (only in edit mode) */}
        {isEditing && (
          <div style={{ marginTop: 4 }}>
            <button type="button" onClick={deleteRecipe} style={{ width: '100%', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 8, padding: '12px 14px' }}>
              Delete Recipe
            </button>
          </div>
        )}
      </section>

      {/* Cropper modal */}
      {showCropper && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ width: 'min(92vw, 520px)', background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', display: 'grid', gridTemplateRows: 'auto 1fr auto' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>Adjust Photo</div>
            <div style={{ position: 'relative', height: 360 }}>
              {localPhotoSrc && (
                <Cropper
                  image={localPhotoSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                  restrictPosition={false}
                  cropShape="rect"
                  showGrid={false}
                />
              )}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid #f1f5f9' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ gridColumn: '1 / -1', width: '100%' }} />
                <button type="button" onClick={() => { if (localPhotoSrc) URL.revokeObjectURL(localPhotoSrc); setLocalPhotoSrc(null); setShowCropper(false); }} style={{ width: '100%', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' }}>
                  Cancel
                </button>
                <button type="button" onClick={confirmCrop} style={{ width: '100%', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 12px' }}>
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
