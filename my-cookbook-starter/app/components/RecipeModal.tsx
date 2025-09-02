'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  emitRecipeMutation,
  subscribeRecipeMutations,
} from '@/lib/recipeSync';

type Recipe = {
  id: string;
  user_id: string;
  title: string;
  cuisine: string | null;
  photo_url: string | null;
  source_url: string | null;
  created_at: string | null;
  instructions?: string | null;
};

type StepRow = { step_number: number; body: string; section_label: string | null };
type IngredientRow = {
  item_name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  section_label: string | null;
  ingredient_order?: number | null;
};

type Profile = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
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

const FOOTER_HEIGHT_PX = 44;

export default function RecipeModal({
  open,
  onClose,
  recipe,
}: {
  open: boolean;
  onClose: () => void;
  recipe: Recipe | null;
}) {
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [ings, setIngs] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [author, setAuthor] = useState<Profile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [fullRecipe, setFullRecipe] = useState<Recipe | null>(recipe);

  const isOwner = useMemo(
    () => !!(currentUserId && recipe?.user_id && currentUserId === recipe.user_id),
    [currentUserId, recipe?.user_id]
  );

  // hearts/bookmarks
  const [heartCount, setHeartCount] = useState<number>(0);
  const [didHeart, setDidHeart] = useState<boolean>(false);
  const [busyHeart, setBusyHeart] = useState<boolean>(false);
  const [didSave, setDidSave] = useState<boolean>(false);
  const [busySave, setBusySave] = useState<boolean>(false);
  const [bookmarkCount, setBookmarkCount] = useState<number>(0);

  const addedText = useMemo(() => {
    const created = fullRecipe?.created_at ? new Date(fullRecipe.created_at) : null;
    if (!created) return null;
    const today = new Date();
    return isSameLocalDate(created, today)
      ? 'Added today'
      : `Added on ${formatMonthDayYearWithComma(created)}`;
  }, [fullRecipe?.created_at]);

  // lock page scroll
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // load details
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!open || !recipe) return;

      setLoading(true);

      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      if (!mounted) return;
      setCurrentUserId(uid);

      // fetch latest core
      const { data: rRow } = await supabase
        .from('recipes')
        .select('id,user_id,title,cuisine,photo_url,source_url,created_at,instructions')
        .eq('id', recipe.id)
        .single();
      if (!mounted) return;
      setFullRecipe((rRow as Recipe) ?? recipe);

      // author
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url')
        .eq('id', recipe.user_id)
        .limit(1);
      if (!mounted) return;
      setAuthor((profs?.[0] as Profile) ?? null);

      // children
      const [{ data: stepData }, { data: ingData }] = await Promise.all([
        supabase
          .from('recipe_steps')
          .select('step_number,body,section_label')
          .eq('recipe_id', recipe.id)
          .order('step_number'),
        supabase
          .from('recipe_ingredients')
          .select('item_name,quantity,unit,note,section_label,ingredient_order')
          .eq('recipe_id', recipe.id)
          .order('ingredient_order', { ascending: true }),
      ]);
      if (!mounted) return;
      setSteps((stepData as StepRow[]) || []);
      setIngs((ingData as IngredientRow[]) || []);

      // hearts/bookmarks
      const { data: heartRows } = await supabase
        .from('recipe_hearts')
        .select('recipe_id')
        .eq('recipe_id', recipe.id);
      if (!mounted) return;
      setHeartCount((heartRows ?? []).length);

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

  // subscribe to sync messages
  useEffect(() => {
    if (!recipe) return;
    const unsubscribe = subscribeRecipeMutations((m) => {
      if (m.id !== recipe.id) return;

      if (m.heartDelta != null) {
        setHeartCount((c) => Math.max(0, c + m.heartDelta!));
      }
      if (m.bookmarkDelta != null && isOwner) {
        setBookmarkCount((c) => Math.max(0, c + m.bookmarkDelta!));
      }
      if (m.heartedByMe != null) setDidHeart(m.heartedByMe);
      if (m.bookmarkedByMe != null) setDidSave(m.bookmarkedByMe);
    });
    return unsubscribe;
  }, [recipe, isOwner]);

  async function toggleHeart() {
    if (!currentUserId || !recipe || busyHeart) return;
    setBusyHeart(true);
    const next = !didHeart;
    setDidHeart(next);
    setHeartCount((c) => Math.max(0, c + (next ? 1 : -1)));

    emitRecipeMutation({
      id: recipe.id,
      heartDelta: next ? +1 : -1,
      heartedByMe: next,
    });

    try {
      if (next) {
        await supabase.from('recipe_hearts').insert({
          recipe_id: recipe.id,
          user_id: currentUserId,
        });
      } else {
        await supabase
          .from('recipe_hearts')
          .delete()
          .eq('recipe_id', recipe.id)
          .eq('user_id', currentUserId);
      }
    } catch {
      setDidHeart(!next);
      setHeartCount((c) => Math.max(0, c + (next ? -1 : 1)));
      emitRecipeMutation({
        id: recipe.id,
        heartDelta: next ? -1 : +1,
        heartedByMe: !next,
      });
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

    emitRecipeMutation({
      id: recipe.id,
      bookmarkDelta: next ? +1 : -1,
      bookmarkedByMe: next,
    });

    try {
      if (next) {
        await supabase.from('recipe_bookmarks').insert({
          recipe_id: recipe.id,
          user_id: currentUserId,
        });
      } else {
        await supabase
          .from('recipe_bookmarks')
          .delete()
          .eq('recipe_id', recipe.id)
          .eq('user_id', currentUserId);
      }
    } catch {
      setDidSave(!next);
      if (isOwner) setBookmarkCount((c) => Math.max(0, c + (next ? -1 : 1)));
      emitRecipeMutation({
        id: recipe.id,
        bookmarkDelta: next ? -1 : +1,
        bookmarkedByMe: !next,
      });
    } finally {
      setBusySave(false);
    }
  }

  if (!open || !recipe) return null;
  const authorName = author?.display_name || author?.nickname || 'Unknown user';

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
        zIndex: 1000,
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
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <a
              href={`/profile/${author?.id ?? ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                textDecoration: 'none',
                flex: '1 1 auto',
                minWidth: 0,
              }}
            >
              {author?.avatar_url ? (
                <img
                  src={author.avatar_url}
                  alt={authorName}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: '#e5e7eb',
                  }}
                  aria-hidden="true"
                />
              )}
              <span style={{ color: '#111827', fontWeight: 600, fontSize: 15 }}>
                {authorName}
              </span>
            </a>

            {isOwner && (
              <a
                href={`/add-recipe?id=${recipe.id}`}
                title="Edit recipe"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 0,
                  textDecoration: 'none',
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24" height="24" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M3 21l3.8-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L3 21z" />
                  <path d="M15 6l3 3" />
                </svg>
              </a>
            )}

            <button
              onClick={onClose}
              aria-label="Close"
              title="Close"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: '#111827',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 0,
              }}
            >
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
        </div>

        {/* Scrollable body */}
        <div
          style={{
            overflowY: 'auto',
            flex: '1 1 auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {fullRecipe?.photo_url ? (
            <img
              src={fullRecipe.photo_url}
              alt={fullRecipe.title}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          ) : null}

          <div
            style={{
              padding: 16,
              paddingBottom: `calc(${FOOTER_HEIGHT_PX}px + env(safe-area-inset-bottom))`,
              display: 'grid',
              gap: 12,
            }}
          >
            {/* Title + cuisine */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {fullRecipe?.title ?? recipe.title}
              </div>
              <div style={{ color: '#666' }}>{fullRecipe?.cuisine || ''}</div>
            </div>

            {/* Ingredients */}
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Ingredients:</div>
              {loading ? (
                <div>Loading…</div>
              ) : (
                ings.map((i, idx) => (
                  <div key={idx}>
                    {i.quantity ?? ''} {i.unit ?? ''} {i.item_name}
                    {i.note ? ` (${i.note})` : ''}
                  </div>
                ))
              )}
            </div>

            {/* Instructions */}
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Instructions:</div>
              {loading ? (
                <div>Loading…</div>
              ) : (
                steps.map((s, idx) => (
                  <div key={idx}>
                    {s.step_number}. {s.body}
                  </div>
                ))
              )}
            </div>

            {fullRecipe?.source_url ? (
              <a
                href={fullRecipe.source_url}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#0b5' }}
              >
                Open Source
              </a>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '6px 16px',
            paddingBottom: 'calc(6px + env(safe-area-inset-bottom))',
            borderTop: '1px solid #eee',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flex: '0 0 auto',
            background: '#fff',
            minHeight: FOOTER_HEIGHT_PX,
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill={didHeart ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 21c-4.8-3.7-8-6.4-8-10a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 3.6-3.2 6.3-8 10z" />
              </svg
