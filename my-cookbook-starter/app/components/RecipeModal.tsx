'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Recipe = {
  id: string;
  user_id: string;           // ← make sure we have this
  title: string;
  cuisine: string | null;
  photo_url: string | null;
  source_url: string | null;
  created_at: string | null; // ← and this
};

type Step = { step_number: number; body: string };
type Ingredient = {
  item_name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

function isSameLocalDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function formatMonthDayYearWithComma(d: Date) {
  const month = d.toLocaleString(undefined, { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month}, ${day}, ${year}`;
}

export default function RecipeModal({
  open,
  onClose,
  recipe,
}: {
  open: boolean;
  onClose: () => void;
  recipe: Recipe | null;
}) {
  // detail data
  const [steps, setSteps] = useState<Step[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);

  // viewer & ownership
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const isOwner = useMemo(
    () => !!(currentUserId && recipe?.user_id && currentUserId === recipe.user_id),
    [currentUserId, recipe?.user_id]
  );

  // hearts / bookmarks
  const [heartCount, setHeartCount] = useState<number>(0);
  const [didHeart, setDidHeart] = useState<boolean>(false);
  const [busyHeart, setBusyHeart] = useState<boolean>(false);

  const [didSave, setDidSave] = useState<boolean>(false);
  const [busySave, setBusySave] = useState<boolean>(false);
  const [bookmarkCount, setBookmarkCount] = useState<number>(0); // only shown if owner

  // added on text
  const addedText = useMemo(() => {
    if (!recipe?.created_at) return null;
    const created = new Date(recipe.created_at);
    const today = new Date();
    return isSameLocalDate(created, today)
      ? 'Added today'
      : `Added on ${formatMonthDayYearWithComma(created)}`;
  }, [recipe?.created_at]);

  // Load details and meta when modal opens
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!open || !recipe) return;

      setLoading(true);

      // viewer
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      if (!mounted) return;
      setCurrentUserId(uid);

      // ingredients & steps
      const [{ data: stepData }, { data: ingData }] = await Promise.all([
        supabase
          .from('recipe_steps')
          .select('step_number,body')
          .eq('recipe_id', recipe.id)
          .order('step_number'),
        supabase
          .from('recipe_ingredients')
          .select('item_name,quantity,unit,note')
          .eq('recipe_id', recipe.id),
      ]);
      if (!mounted) return;
      setSteps((stepData as Step[]) || []);
      setIngs((ingData as Ingredient[]) || []);

      // heart count
      const { data: heartRows } = await supabase
        .from('recipe_hearts')
        .select('recipe_id')
        .eq('recipe_id', recipe.id);
      if (!mounted) return;
      setHeartCount((heartRows ?? []).length);

      // your heart/save + owner bookmark count
      if (uid) {
        const [{ data: myHeart }, { data: mySave }] = await Promise.all([
          supabase
            .from('recipe_hearts')
            .select('recipe_id')
            .eq('recipe_id', recipe.id)
            .eq('user_id', uid)
            .limit(1),
          supabase
            .from('recipe_bookmarks')
            .select('recipe_id')
            .eq('recipe_id', recipe.id)
            .eq('user_id', uid)
            .limit(1),
        ]);
        if (!mounted) return;
        setDidHeart(!!myHeart?.length);
        setDidSave(!!mySave?.length);

        if (recipe.user_id === uid) {
          const { data: bmRows } = await supabase
            .from('recipe_bookmarks')
            .select('recipe_id')
            .eq('recipe_id', recipe.id);
          if (!mounted) return;
          setBookmarkCount((bmRows ?? []).length);
        } else {
          setBookmarkCount(0);
        }
      } else {
        setDidHeart(false);
        setDidSave(false);
        setBookmarkCount(0);
      }

      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [open, recipe]);

  async function toggleHeart() {
    if (!currentUserId || !recipe || busyHeart) return;
    setBusyHeart(true);
    const next = !didHeart;
    setDidHeart(next);
    setHeartCount(c => Math.max(0, c + (next ? 1 : -1)));
    try {
      if (next) {
        const { error } = await supabase.from('recipe_hearts').insert({
          recipe_id: recipe.id,
          user_id: currentUserId,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('recipe_hearts')
          .delete()
          .eq('recipe_id', recipe.id)
          .eq('user_id', currentUserId);
        if (error) throw error;
      }
    } catch {
      // rollback
      setDidHeart(!next);
      setHeartCount(c => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setBusyHeart(false);
    }
  }

  async function toggleSave() {
    if (!currentUserId || !recipe || busySave) return;
    setBusySave(true);
    const next = !didSave;
    setDidSave(next);
    if (isOwner) setBookmarkCount(c => Math.max(0, c + (next ? 1 : -1)));
    try {
      if (next) {
        const { error } = await supabase.from('recipe_bookmarks').insert({
          recipe_id: recipe.id,
          user_id: currentUserId,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('recipe_bookmarks')
          .delete()
          .eq('recipe_id', recipe.id)
          .eq('user_id', currentUserId);
        if (error) throw error;
      }
    } catch {
      // rollback
      setDidSave(!next);
      if (isOwner) setBookmarkCount(c => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setBusySave(false);
    }
  }

  if (!open || !recipe) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        zIndex: 50,
      }}
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        style={{
          width: 'min(800px, 94vw)',
          background: '#fff',
          borderRadius: 12,
          padding: 16,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: title + cuisine + close */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{recipe.title}</div>
            <div style={{ color: '#666' }}>{recipe.cuisine || ''}</div>
          </div>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Actions: Heart & Bookmark */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <button
            type="button"
            onClick={toggleHeart}
            disabled={!currentUserId || busyHeart}
            aria-pressed={didHeart}
            aria-label={didHeart ? 'Remove heart' : 'Add heart'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #eee',
              background: '#fff',
              color: didHeart ? '#dc2626' : '#374151',
              opacity: !currentUserId || busyHeart ? 0.6 : 1,
              cursor: !currentUserId || busyHeart ? 'not-allowed' : 'pointer',
            }}
          >
            ♥
            <span>{heartCount}</span>
          </button>

          <button
            type="button"
            onClick={toggleSave}
            disabled={!currentUserId || busySave}
            aria-pressed={didSave}
            aria-label={didSave ? 'Remove bookmark' : 'Add bookmark'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #eee',
              background: '#fff',
              color: didSave ? '#2563eb' : '#374151',
              opacity: !currentUserId || busySave ? 0.6 : 1,
              cursor: !currentUserId || busySave ? 'not-allowed' : 'pointer',
            }}
          >
            🔖
            {isOwner ? <span>{bookmarkCount}</span> : <span>{didSave ? 'Saved' : 'Save'}</span>}
          </button>
        </div>

        {/* Body — Ingredients + Instructions */}
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <section>
            <h3 style={{ margin: '8px 0' }}>Ingredients</h3>
            {loading ? (
              <div>Loading…</div>
            ) : (
              <ul style={{ paddingLeft: 16 }}>
                {ings.length ? (
                  ings.map((i, idx) => {
                    const qty = i.quantity ?? '';
                    const parts = [qty, i.unit, i.item_name]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <li key={idx}>
                        {parts}
                        {i.note ? ` (${i.note})` : ''}
                      </li>
                    );
                  })
                ) : (
                  <li>No ingredients yet.</li>
                )}
              </ul>
            )}
          </section>

          <section>
            <h3 style={{ margin: '8px 0' }}>Instructions</h3>
            {loading ? (
              <div>Loading…</div>
            ) : (
              <ol style={{ paddingLeft: 18 }}>
                {steps.length ? (
                  steps.map((s, idx) => <li key={idx}>{s.body}</li>)
                ) : (
                  <li>This recipe has no steps yet.</li>
                )}
              </ol>
            )}
          </section>

          {recipe.source_url ? (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#0b5' }}
            >
              Open Source
            </a>
          ) : null}
        </div>

        {/* Added on */}
        {addedText && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
            {addedText}
          </div>
        )}
      </div>
    </div>
  );
}
