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

// Utility: crop a File/URL to a Blob using canvas
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
  // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), 'image/jpeg', 0.9)
  );
}

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

  // photo state
  const [photoUrl, setPhotoUrl] = useState<string | null>(null); // existing or newly uploaded URL
  const [localPhotoSrc, setLocalPhotoSrc] = useState<string | null>(null); // object URL for cropper
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
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
        .select('id, user_id, title, cuisine, source_url, visibility, photo_url')
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
      setPhotoUrl(r.photo_url ?? null);

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

  // ------ PHOTO HANDLERS ------
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

  // react-easy-crop provides pixel area on complete
  function onCropComplete(_: any, areaPixels: any) {
    setCroppedPixels(areaPixels);
  }

  async function confirmCrop() {
    if (!localPhotoSrc || !croppedPixels) return;
    try {
      setBusy(true);
      const blob = await getCroppedBlob(localPhotoSrc, croppedPixels);

      // Ensure user is signed in
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes?.user?.id;
      if (!userId) throw new Error('No signed-in user — please log in again.');

      // Build a stable path; if editing, prefer recipe id
      const filename = `${isEditing && editId ? editId : crypto.randomUUID()}.jpg`;
      const path = `${userId}/${filename}`;

      // Upload to Storage
      const { data: _u, error: upErr } = await supabase.storage
        .from('recipe-photos')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });

      if (upErr) throw upErr;

      // Get public URL (simple start)
      const { data: pub } = supabase.storage.from('recipe-photos').getPublicUrl(path);
      setPhotoUrl(pub.publicUrl || null);
      setShowCropper(false);
      // clean object URL
      URL.revokeObjectURL(localPhotoSrc);
      setLocalPhotoSrc(null);
    } catch (e: any) {
      setMsg(e?.message || 'Image upload failed.');
    } finally {
      setBusy(false);
    }
  }

  function cancelCrop() {
    if (localPhotoSrc) URL.revokeObjectURL(localPhotoSrc);
    setLocalPhotoSrc(null);
    setShowCropper(false);
  }

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
            photo_url: photoUrl || null,
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

        router.replace('/cookbook');
        return;
      }

      // --- CREATE: your existing RPC, now with photo_url ---
      const { error } = await supabase.rpc('add_full_recipe', {
        p_title: title,
        p_cuisine: cuisine || null,
        p_photo_url: photoUrl || null,
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
      setPhotoUrl(null);
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
    <main style={{ maxWidth: 760, margin: '28px auto', padding: 16, paddingBottom: 96 }}>
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
          overflow: 'hidden',          // <- keeps inputs “inside” the card
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          position: 'relative',
        }}
      >
        {/* Photo */}
        <div style={{ display: 'grid', gap: 8 }}>
          <label style={{ fontWeight: 600 }}>Photo</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 12,
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
              background: '#fff',
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
              background: '#fff',
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
              background: '#fff',
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
                  background: '#fff',
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
              background: '#fff',
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
          zIndex: 10, // make sure it stays above content
        }}
      >
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', background: '#fff', padding: '8px 0' }}>
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

      {/* Simple cropper modal */}
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
            }}
          >
            <div style={{ padding: 12, borderBottom: '1px solid #f1f5f9', fontWeight: 600 }}>
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 12 }}>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={cancelCrop}
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
                onClick={confirmCrop}
                style={{
                  background: '#111827',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 12px',
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
