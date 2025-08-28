'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Recipe = {
  id: string;
  user_id: string;
  title: string;
  cuisine: string | null;
  photo_url: string | null;
  source_url: string | null;
  created_at: string | null;
};

type Step = { step_number: number; body: string };
type Ingredient = {
  item_name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

function isSameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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
  const [bookmarkCount, setBookmarkCount] = useState<number>(0); // owner only display

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
    return () => {
      mounted = false;
    };
  }, [open, recipe]);

  async function toggleHeart() {
    if (!currentUserId || !recipe || busyHeart) return;
    setBusyHeart(true);
    const next = !didHeart;
    setDidHeart(next);
    setHeartCount((c) => Math.max(0, c + (next ? 1 : -1)));
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
      setDidHeart(!next);
      setHeartCount((c) => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setBusyHeart(false);
    }
  }

  async function toggleSave() {
    if (!currentUserId || !recipe || busySave) return;
    setBusySave(true);
    const next = !didSave;
    setDidSave(next);
    if (isOwner) setBookmarkCount((c) => Math.max(0, c + (next ? 1 : -1)));
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
      setDidSave(!next);
      if (isOwner) setBookmarkCount((c) => Math.max(0, c + (next ? -1 : 1)));
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
          padding: 0,                // we’ll pad inner sections instead
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',        // content scrolls; header/footer fixed
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #eee',
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{recipe.title}</div>
            <div style={{ color: '#666' }}>{recipe.cuisine || ''}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: '#111827', // black-ish
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 0,
            }}
          >
            {/* 24px X icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ padding: 16, overflowY: 'auto', flex: '1 1 auto' }}>
          <section>
            <h3 style={{ margin: '8px 0' }}>Ingredients</h3>
            {loading ? (
              <div>Loading…</div>
            ) : (
              <ul style={{ paddingLeft: 16 }}>
                {ings.length ? (
                  ings.map((i, idx) => {
                    const qty = i.quantity ?? '';
                    const parts = [qty, i.unit, i.item_name].filter(Boolean).join(' ');
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

        {/* Fixed Footer (inside panel) */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flex: '0 0 auto',
            background: '#fff',
          }}
        >
          <div style={{ fontSize: 12, color: '#6b7280' }}>{addedText ?? ''}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Heart */}
            <button
              onClick={toggleHeart}
              disabled={!currentUserId || busyHeart}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: !currentUserId || busyHeart ? 'not-allowed' : 'pointer',
                color: didHeart ? '#dc2626' : '#374151',
                opacity: !currentUserId || busyHeart ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              aria-label={didHeart ? 'Remove heart' : 'Add heart'}
              title={didHeart ? 'Unheart' : 'Heart'}
            >
              {/* Better heart icon (fills nicely) */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill={didHeart ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12.1 21.35c-.07.05-.15.05-.22 0C7.14 17.86 4 15.17 2.28 12.64 1.04 10.83 1.3 8.3 3 6.86a5.01 5.01 0 0 1 6.4.37l.6.6.6-.6a5.01 5.01 0 0 1 6.4-.37c1.7 1.44 1.96 3.97.72 5.78-1.72 2.53-4.86 5.22-9.22 8.71z" />
              </svg>
              <span style={{ fontSize: 14 }}>{heartCount}</span>
            </button>

            {/* Bookmark */}
            <button
              onClick={toggleSave}
              disabled={!currentUserId || busySave}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: !currentUserId || busySave ? 'not-allowed' : 'pointer',
                color: didSave ? '#2563eb' : '#374151',
                opacity: !currentUserId || busySave ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
              aria-label={didSave ? 'Remove bookmark' : 'Add bookmark'}
              title={didSave ? 'Remove bookmark' : 'Add bookmark'}
            >
              {didSave ? (
                // filled
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M6 2h12a1 1 0 0 1 1 1v19l-7-4-7 4V3a1 1 0 0 1 1-1z" />
                </svg>
              ) : (
                // outline
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 2h12a1 1 0 0 1 1 1v19l-7-4-7 4V3a1 1 0 0 1 1-1z" />
                </svg>
              )}
              {isOwner ? <span style={{ fontSize: 14 }}>{bookmarkCount}</span> : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
