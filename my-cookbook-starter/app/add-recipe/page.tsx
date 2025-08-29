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

  // NEW (optional in DB, used when present)
  section_label?: string | null;
  ingredient_order?: number | null;
};

type StepRow = {
  step_number: number;
  body: string;
  section_label?: string | null;
};

type ComponentBlock = {
  id: string;
  name: string;
  ingredients: string[];   // simple strings per component
  instructions: string;    // multiline textarea; split into steps on save
};

// Suggested recipe type options (customize anytime)
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

/* ----------------- helpers ----------------- */
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

// Build a single instructions blob from components for recipes.instructions (NOT NULL)
function buildCollapsedInstructions(components: ComponentBlock[]): string {
  const parts: string[] = [];
  components.forEach((c) => {
    const name = (c.name || 'Main').trim();
    if (name) parts.push(`${name}:`);
    const steps = c.instructions
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    steps.forEach((body, i) => parts.push(`${i + 1}. ${body}`));
    parts.push(''); // spacing between components
  });
  return parts.join('\n').trim();
}

/* ----------------- page wrapper ----------------- */
export default function AddRecipePage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>Loading…</div>}>
      <AddRecipeForm />
    </Suspense>
  );
}

/* ----------------- styles ----------------- */
const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: 8,
  borderRadius: 6,
  border: '1px solid #e5e7eb',
  background: '#fff',
  boxSizing: 'border-box',
};
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

/* ----------------- components editor ----------------- */
function ComponentsEditor({
  components,
  setComponents,
}: {
  components: ComponentBlock[];
  setComponents: React.Dispatch<React.SetStateAction<ComponentBlock[]>>;
}) {
  function addComponent() {
    setComponents((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: `Component ${prev.length + 1}`,
        ingredients: [''],
        instructions: '',
      },
    ]);
  }
  function removeComponent(id: string) {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }
  function move(id: string, dir: -1 | 1) {
    setComponents((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const swap = idx + dir;
      if (swap < 0 || swap >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }
  const inputStyle: React.CSSProperties = fieldStyle;

  return (
    <section
      style={{
        background: '#fff',
        border: '1px solid #eee',
        borderRadius: 12,
        padding: 14,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Components</h3>
        <button
          type="button"
          onClick={addComponent}
          style={{
            background: 'transparent',
            border: '1px dashed #cbd5e1',
            padding: '8px 12px',
            borderRadius: 8,
          }}
        >
          + Add component
        </button>
      </div>

      {components.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>
          No components yet. Add one to start.
        </div>
      ) : (
        components.map((comp, i) => (
          <div
            key={comp.id}
            style={{
              border: '1px solid #f1f5f9',
              borderRadius: 10,
              padding: 12,
              display: 'grid',
              gap: 10,
            }}
          >
            {/* Header row: name + actions */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <input
                value={comp.name}
                onChange={(e) =>
                  setComponents((prev) =>
                    prev.map((c) => (c.id === comp.id ? { ...c, name: e.target.value } : c))
                  )
                }
                placeholder="Component name (e.g., Cake, Frosting)"
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => move(comp.id, -1)}
                  disabled={i === 0}
                  style={{
                    background: 'transparent',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '8px 10px',
                    opacity: i === 0 ? 0.5 : 1,
                  }}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(comp.id, +1)}
                  disabled={i === components.length - 1}
                  style={{
                    background: 'transparent',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '8px 10px',
                    opacity: i === components.length - 1 ? 0.5 : 1,
                  }}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeComponent(comp.id)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    borderRadius: 8,
                    padding: '8px 10px',
                  }}
                  title="Remove component"
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Ingredients for this component */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600 }}>Ingredients</label>
              <div style={{ display: 'grid', gap: 6 }}>
                {comp.ingredients.map((val, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 6,
                    }}
                  >
                    <input
                      value={val}
                      onChange={(e) =>
                        setComponents((prev) =>
                          prev.map((c) =>
                            c.id === comp.id
                              ? {
                                  ...c,
                                  ingredients: c.ingredients.map((iv, ii) =>
                                    ii === idx ? e.target.value : iv
                                  ),
                                }
                              : c
                          )
                        )
                      }
                      placeholder={`Ingredient ${idx + 1}`}
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setComponents((prev) =>
                          prev.map((c) =>
                            c.id === comp.id
                              ? {
                                  ...c,
                                  ingredients: c.ingredients.filter((_, ii) => ii !== idx),
                                }
                              : c
                          )
                        )
                      }
                      style={{
                        background: 'transparent',
                        border: '1px solid #e5e7eb',
                        borderRadius: 6,
                        padding: '8px 10px',
                      }}
                      title="Remove ingredient"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() =>
                    setComponents((prev) =>
                      prev.map((c) =>
                        c.id === comp.id
                          ? { ...c, ingredients: [...c.ingredients, ''] }
                          : c
                      )
                    )
                  }
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

            {/* Instructions for this component */}
            <div style={{ display: 'grid', gap: 6 }}>
              <label style={{ fontWeight: 600 }}>
                Instructions{' '}
                <span style={{ color: '#6b7280', fontWeight: 400 }}>
                  (one step per line)
                </span>
              </label>
              <textarea
                value={comp.instructions}
                onChange={(e) =>
                  setComponents((prev) =>
                    prev.map((c) =>
                      c.id === comp.id ? { ...c, instructions: e.target.value } : c
                    )
                  )
                }
                rows={6}
                placeholder={`1. Do something...\n2. Do next thing...\n3. ...`}
                style={{ ...fieldStyle, resize: 'vertical', minHeight: 120 }}
              />
            </div>
          </div>
        ))
      )}
    </section>
  );
}

/* ----------------- main form ----------------- */
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
  const [visibility, setVisibility] = useState<Visibility>('private');

  // recipe types (multi-select)
  const [recipeTypes, setRecipeTypes] = useState<string[]>([]);

  // NEW: components (sections)
  const [components, setComponents] = useState<ComponentBlock[]>([
    { id: crypto.randomUUID(), name: 'Main', ingredients: [''], instructions: '' },
  ]);

  // photo state
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const oldPhotoPathRef = useRef<string | null>(null);
  const [localPhotoSrc, setLocalPhotoSrc] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ------ auth ------ */
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

  /* ------ prefill (edit mode) ------ */
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
      const r = (recs as any)?.[0];
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

      // load ingredients & steps with section labels
      const [{ data: ingData, error: ingErr }, { data: stepData, error: stepErr }] = await Promise.all([
        supabase.from('recipe_ingredients').select('item_name, section_label, ingredient_order').eq('recipe_id', editId).order('ingredient_order', { ascending: true }),
        supabase.from('recipe_steps').select('step_number, body, section_label').eq('recipe_id', editId).order('step_number', { ascending: true }),
      ]);
      if (!mounted) return;

      if (ingErr || stepErr) {
        setMsg(ingErr?.message || stepErr?.message || 'Failed to load ingredients/steps.');
        setBusy(false);
        return;
      }

      // rebuild components from section_label (fallback to "Main")
      const sectionMap = new Map<string, { ingredients: string[]; steps: string[] }>();
      (ingData ?? []).forEach((i: any) => {
        const key = i.section_label || 'Main';
        if (!sectionMap.has(key)) sectionMap.set(key, { ingredients: [], steps: [] });
        sectionMap.get(key)!.ingredients.push(i.item_name);
      });
      (stepData ?? []).forEach((s: any) => {
        const key = s.section_label || 'Main';
        if (!sectionMap.has(key)) sectionMap.set(key, { ingredients: [], steps: [] });
        sectionMap.get(key)!.steps.push(s.body);
      });

      const rebuilt: ComponentBlock[] =
        sectionMap.size > 0
          ? Array.from(sectionMap.entries()).map(([name, b]) => ({
              id: crypto.randomUUID(),
              name,
              ingredients: b.ingredients.length ? b.ingredients : [''],
              instructions: b.steps.join('\n'),
            }))
          : [
              { id: crypto.randomUUID(), name: 'Main', ingredients: [''], instructions: '' },
            ];

      setComponents(rebuilt);
      setBusy(false);
    })();
    return () => {
      mounted = false;
    };
  }, [isEditing, editId]);

  /* ------ photo handlers ------ */
  function onPickFile() {
    fileInputRef.current?.click();
  }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    setLocalPhotoSrc(url);
    setShowCropper(true);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  }
  function onCropComplete(_: any, areaPixels: any) {
    setCroppedPixels(areaPixels);
  }

  async function confirmCrop() {
    if (!localPhotoSrc || !croppedPixels) return;
    try {
      setBusy(true);
      setMsg(null);
      const blob = await getCroppedBlob(localPhotoSrc, croppedPixels);
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error('No signed-in user — please log in again.');

      const base = (sp.get('id') || crypto.randomUUID()).toString();
      const filename = `${base}-${Date.now()}.jpg`;
      const newPath = `${userId}/${filename}`;

      const upRes = await supabase.storage.from('recipe-photos').upload(newPath, blob, {
        contentType: 'image/jpeg',
      });
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
    const ok =
      typeof window !== 'undefined'
        ? window.confirm('Remove this photo? This cannot be undone.')
        : true;
    if (!ok) return;
    try {
      setBusy(true);
      setMsg(null);
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error('No signed-in user — please log in again.');

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

  /* ------ delete recipe (edit mode) ------ */
  async function deleteRecipe() {
    if (!isEditing || !editId) return;
    const ok =
      typeof window !== 'undefined'
        ? window.confirm(
            'Delete this recipe? This will remove the photo, ingredients, and steps. This cannot be undone.'
          )
        : true;
    if (!ok) return;
    try {
      setBusy(true);
      setMsg(null);
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error('No signed-in user — please log in again.');

      const path =
        oldPhotoPathRef.current || (photoUrl ? storagePathFromPublicUrl(photoUrl) : null);
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

  /* ------ submit ------ */
  async function submit() {
    setMsg(null);

    if (!title.trim()) return setMsg('Please add a title');

    // Ensure each component has at least one instruction line total
    const hasAnyStep = components.some((c) =>
      c.instructions.split('\n').map((s) => s.trim()).filter(Boolean).length > 0
    );
    if (!hasAnyStep) {
      return setMsg('Add instructions (at least one step in any component)');
    }

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) {
      setMsg('No signed-in user — please log in again.');
      return;
    }

    setBusy(true);

    // Build flattened arrays with section labels
    const ingArray: IngredientRow[] = components.flatMap((comp) =>
      comp.ingredients
        .map((txt) => txt.trim())
        .filter(Boolean)
        .map((item_name, idx) => ({
          item_name,
          section_label: comp.name || null,
          ingredient_order: idx + 1,
        }))
    );

    const steps: StepRow[] = components.flatMap((comp) => {
      const lines = comp.instructions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      return lines.map((body, i) => ({
        step_number: i + 1, // numbering restarts per component
        body,
        section_label: comp.name || null,
      }));
    });

    // Collapsed instructions blob for recipes.instructions NOT NULL
    const collapsedInstructions = buildCollapsedInstructions(components);

    try {
      if (isEditing && editId) {
        // transactional update RPC
        const { error: upErr } = await supabase.rpc('update_full_recipe', {
          p_recipe_id: editId,
          p_title: title,
          p_cuisine: cuisine || null,
          p_photo_url: photoUrl || null,
          p_source_url: sourceUrl || null,
          p_instructions: collapsedInstructions,
          p_ingredients: ingArray as any,
          p_steps: steps as any,
          p_visibility: visibility,
          p_recipe_types: recipeTypes || [],
        });
        if (upErr) throw upErr;

        router.replace('/cookbook');
        return;
      }

      // transactional create RPC
      const { error } = await supabase.rpc('add_full_recipe', {
        p_title: title,
        p_cuisine: cuisine || null,
        p_photo_url: photoUrl || null,
        p_source_url: sourceUrl || null,
        p_instructions: collapsedInstructions,
        p_ingredients: ingArray as any,
        p_steps: steps as any,
        p_visibility: visibility,
        p_recipe_types: recipeTypes || [],
      });
      if (error) throw error;

      // Reset
      setTitle('');
      setCuisine('');
      setSourceUrl('');
      setVisibility('private');
      setPhotoUrl(null);
      setRecipeTypes([]);
      setComponents([{ id: crypto.randomUUID(), name: 'Main', ingredients: [''], instructions: '' }]);
      oldPhotoPathRef.current = null;

      router.replace('/cookbook');
    } catch (err: any) {
      setMsg(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  /* ------ UI states ------ */
  if (loading)
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>Loading…</div>
    );
  if (!session) {
    return (
      <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
        <h1>Sign in required</h1>
        <p>You need to be signed in to add or edit recipes.</p>
        <a href="/login">Go to sign in</a>
      </div>
    );
  }

  /* ------ layout ------ */
  return (
    <main style={{ maxWidth: 760, margin: '28px auto', padding: 16 }}>
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

      <section
        style={{
          background: '#fff',
          border: '1px solid #eee',
          borderRadius: 12,
          padding: 14,
          display: 'grid',
          gap: 12,
        }}
      >
        {/* Photo */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Photo</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '110px 1fr',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: 10,
                overflow: 'hidden',
                border: '1px solid #e5e7eb',
                background: '#f8fafc',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Recipe"
                  src={photoUrl}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span>No photo</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={onPickFile}
                style={{
                  background: 'transparent',
                  border: '1px solid #cbd5e1',
                  padding: '8px 12px',
                  borderRadius: 8,
                }}
              >
                {photoUrl ? 'Change Photo' : 'Upload Photo'}
              </button>
              {photoUrl && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowCropper(true)}
                    style={{
                      background: 'transparent',
                      border: '1px solid #cbd5e1',
                      padding: '8px 12px',
                      borderRadius: 8,
                    }}
                  >
                    Edit Crop
                  </button>
                  <button
                    type="button"
                    onClick={removePhoto}
                    style={{
                      background: 'transparent',
                      border: '1px solid #ef4444',
                      color: '#ef4444',
                      padding: '8px 12px',
                      borderRadius: 8,
                    }}
                  >
                    Remove Photo
                  </button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileChange}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        </div>

        {/* Title */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Spicy Chicken Tacos"
            style={fieldStyle}
          />
        </div>

        {/* Cuisine (kept; not shown elsewhere if empty) */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Cuisine</label>
          <input
            value={cuisine}
            onChange={(e) => setCuisine(e.target.value)}
            placeholder="e.g., Mexican"
            style={fieldStyle}
          />
        </div>

        {/* Recipe URL (optional) */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>
            Recipe URL <span style={{ color: '#6b7280', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://example.com"
            style={fieldStyle}
          />
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

        {/* Components (Cake, Frosting, etc.) */}
        <ComponentsEditor components={components} setComponents={setComponents} />

        {/* Visibility */}
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontWeight: 600 }}>Visibility</label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            style={fieldStyle}
          >
            <option value="private">Private (only you)</option>
            <option value="friends">Friends (your friends)</option>
            <option value="public">Public (everyone)</option>
          </select>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 10,
          }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '12px 14px',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            style={{
              width: '100%',
              background: '#111827',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '12px 14px',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Recipe'}
          </button>
        </div>

        {/* Danger: Delete (edit mode) */}
        {isEditing && (
          <div style={{ marginTop: 4 }}>
            <button
              type="button"
              onClick={deleteRecipe}
              style={{
                width: '100%',
                background: 'transparent',
                border: '1px solid #ef4444',
                color: '#ef4444',
                borderRadius: 8,
                padding: '12px 14px',
              }}
            >
              Delete Recipe
            </button>
          </div>
        )}
      </section>

      {/* Cropper modal */}
      {showCropper && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 50,
            padding: 16,
          }}
        >
          <div
            style={{
              width: 'min(92vw, 520px)',
              background: '#fff',
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid #e5e7eb',
              display: 'grid',
              gridTemplateRows: 'auto 1fr auto',
            }}
          >
            <div
              style={{
                padding: 12,
                borderBottom: '1px solid #f1f5f9',
                fontWeight: 600,
              }}
            >
              Adjust Photo
            </div>
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
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  style={{ gridColumn: '1 / -1', width: '100%' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (localPhotoSrc) URL.revokeObjectURL(localPhotoSrc);
                    setLocalPhotoSrc(null);
                    setShowCropper(false);
                  }}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: '10px 12px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmCrop}
                  style={{
                    width: '100%',
                    background: '#111827',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '10px 12px',
                  }}
                >
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
