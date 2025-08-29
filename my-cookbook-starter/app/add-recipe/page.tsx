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

  // form state
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [ingredients, setIngredients] = useState<string[]>(['']);
  const [visibility, setVisibility] = useState<Visibility>('private');

  // NEW: recipe types (multi-select)
  const [recipeTypes, setRecipeTypes] = useState<string[]>([]);

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
        .select('id, user_id, title, cuisine, source_url, visibility, photo_url, recipe_types')
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

      setTitle(r.title ?? '');
      setCuisine(r.cuisine ?? '');
      setSourceUrl(r.source_url ?? '');
      setVisibility((r.visibility as Visibility) ?? 'private');
      setPhotoUrl(r.photo_url ?? null);
      setRecipeTypes(Array.isArray(r.recipe_types) ? r.recipe_types : []); // prefill types
      oldPhotoPathRef.current = r.photo_url ? storagePathFromPublicUrl(r.photo_url) : null;

      const [{ data: ingData, error: ingErr }, { data: stepData, error: stepErr }] = await Promise.all([
        supabase.from('recipe_ingredients').select('item_name').eq('recipe_id', editId),
        supabase.from('recipe_steps').select('step_number, body').eq('recipe_id', editId).order('step_number'),
      ]);
      if (!mounted) return;

      if (ingErr || stepErr) {
        setMsg(ingErr?.message || stepErr?.message || 'Failed to load ingredients/steps.');
        setBusy(false);
        return;
      }

      const ingStrings = (ingData ?? []).map((i: any) => i.item_name as string);
      setIngredients(ingStrings.length ? ingStrings : ['']);

      const stepLines = (stepData ?? []).map((s: any) => s.body as string);
      setInstructions(stepLines.join('\n'));

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

      // If editing, persist the new photo URL immediately
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

  // ------ SUBMIT ------
  async function submit() {
    setMsg(null);
    if (!title.trim()) return setMsg('Please add a title');
    if (!instructions.trim()) return setMsg('Add instructions (one step per line)');

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) { setMsg('No signed-in user — please log in again.'); return; }

    setBusy(true);

    // Build steps & ingredients
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
        // --- EDIT: single transactional RPC (updates row + replaces ingredients/steps) ---
        const { error: upErr } = await supabase.rpc('update_full_recipe', {
          p_recipe_id: editId,
          p_title: title,
          p_cuisine: cuisine || null,
          p_photo_url: photoUrl || null,
          p_source_url: sourceUrl || null,
          p_instructions: instructions,
          p_ingredients: ingArray,        // [{ item_name, quantity?, unit?, note? }]
          p_steps: steps,                  // [{ step_number, body }]
          p_visibility: visibility,        // enum labels: 'private' | 'friends' | 'public'
          p_recipe_types: recipeTypes || [], // text[]
        });
        if (upErr) throw upErr;

        router.replace('/cookbook');
        return;
      }

      // --- CREATE: single transactional RPC (inserts row + ingredients/steps) ---
      const { error } = await supabase.rpc('add_full_recipe', {
        p_title: title,
        p_cuisine: cuisine || null,
        p_photo_url: photoUrl || null,
        p_source_url: sourceUrl || null,
        p_instructions: instructions,
        p_ingredients: ingArray,          // [{ item_name, quantity?, unit?, note? }]
        p_steps: steps,                    // [{ step_number, body }]
        p_visibility: visibility,          // enum labels
        p_recipe_types: recipeTypes || [], // text[]
      });
      if (error) throw error;

      // Reset + go back
      setTitle('');
      setCuisine('');
      setSourceUrl('');
      setInstructions('');
      setIngredients(['']);
      setVisibility('private');
      setPhotoUrl(null);
      setRecipeTypes([]);
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

        {/* Visibility */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Visibility</label>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} style={fieldStyle}>
            <option value="private">Private (only you)</option>
            <option value="friends">Friends (your friends)</option>
            <option value="public">Public (everyone)</option>
          </select>
        </div>

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
