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
  instructions?: string | null; // NEW: used to infer component order
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

// smaller footer height
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
  const isOwner = useMemo(
    () => !!(currentUserId && recipe?.user_id && currentUserId === recipe.user_id),
    [currentUserId, recipe?.user_id]
  );

  const [heartCount, setHeartCount] = useState<number>(0);
  const [didHeart, setDidHeart] = useState<boolean>(false);
  const [busyHeart, setBusyHeart] = useState<boolean>(false);

  const [didSave, setDidSave] = useState<boolean>(false);
  const [busySave, setBusySave] = useState<boolean>(false);
  const [bookmarkCount, setBookmarkCount] = useState<number>(0);

  const [fullRecipe, setFullRecipe] = useState<Recipe | null>(recipe);

  const addedText = useMemo(() => {
    const created = fullRecipe?.created_at ? new Date(fullRecipe.created_at) : null;
    if (!created) return null;
    const today = new Date();
    return isSameLocalDate(created, today)
      ? 'Added today'
      : `Added on ${formatMonthDayYearWithComma(created)}`;
  }, [fullRecipe?.created_at]);

  // Lock page scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Load details (including instructions to compute section order)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!open || !recipe) return;

      setLoading(true);

      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      if (!mounted) return;
      setCurrentUserId(uid);

      // Fetch latest core recipe row to get instructions (section order)
      const { data: rRow } = await supabase
        .from('recipes')
        .select('id,user_id,title,cuisine,photo_url,source_url,created_at,instructions')
        .eq('id', recipe.id)
        .single();
      if (!mounted) return;
      setFullRecipe((rRow as Recipe) ?? recipe);

      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url')
        .eq('id', recipe.user_id)
        .limit(1);
      if (!mounted) return;
      setAuthor((profs?.[0] as Profile) ?? null);

      // Fetch children WITH section labels + ordering
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

  // Compute section display order from instructions headings ("Name:")
  const sectionOrderFromInstructions = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    const lines = (fullRecipe?.instructions || '').split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.endsWith(':')) {
        const name = line.slice(0, -1).trim();
        const normalized = name || 'Main';
        if (!seen.has(normalized)) {
          seen.add(normalized);
          order.push(normalized);
        }
      }
    }
    return order;
  }, [fullRecipe?.instructions]);

  // Group by section_label (fallback "Main") and order by creation order
  const sections = useMemo(() => {
    type Sec = { ingredients: IngredientRow[]; steps: StepRow[] };
    const map = new Map<string, Sec>();

    const add = (key: string) => {
      if (!map.has(key)) map.set(key, { ingredients: [], steps: [] });
    };

    ings.forEach((i) => {
      const key = (i.section_label || 'Main').trim() || 'Main';
      add(key);
      map.get(key)!.ingredients.push(i);
    });

    steps.forEach((s) => {
      const key = (s.section_label || 'Main').trim() || 'Main';
      add(key);
      map.get(key)!.steps.push(s);
    });

    // Build ordered names from instructions (creation order), then append leftovers
    const keys = new Set(map.keys());
    const ordered: string[] = [];

    sectionOrderFromInstructions.forEach((name) => {
      if (keys.has(name)) {
        ordered.push(name);
        keys.delete(name);
      }
    });

    // Ensure "Main" first if present but not captured
    if (keys.has('Main') && !ordered.includes('Main')) {
      ordered.unshift('Main');
      keys.delete('Main');
    }

    // Append any remaining sections (stable alpha fallback)
    const remaining = Array.from(keys).sort((a, b) => a.localeCompare(b));
    ordered.push(...remaining);

    return ordered.map((name) => ({ name, ...map.get(name)! }));
  }, [ings, steps, sectionOrderFromInstructions]);

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
        {/* FIXED HEADER */}
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

        {/* SCROLLABLE: image + body */}
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
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
              }}
            />
          ) : null}

          <div
            style={{
              padding: 16,
              paddingBottom: `calc(${FOOTER_HEIGHT_PX}px + env(safe-area-inset-bottom))`,
            }}
          >
            {/* Title + cuisine */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>
                {fullRecipe?.title ?? recipe.title}
              </div>
              <div style={{ color: '#666' }}>{fullRecipe?.cuisine || ''}</div>
            </div>

            {/* === COMPONENTS RENDER === */}
            <section>
              <h3 style={{ margin: '8px 0' }}>Ingredients & Instructions</h3>
              {loading ? (
                <div>Loading…</div>
              ) : sections.length === 0 ? (
                <div>No details yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {sections.map((sec) => (
                    <div
                      key={sec.name}
                      style={{
                        border: '1px solid #eef2f7',
                        borderRadius: 10,
                        padding: 12,
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{sec.name}</div>

                      {sec.ingredients.length > 0 && (
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 13,
                              marginBottom: 6,
                            }}
                          >
                            Ingredients
                          </div>
                          <ul style={{ paddingLeft: 16, margin: 0 }}>
                            {sec.ingredients.map((i, idx) => {
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
                            })}
                          </ul>
                        </div>
                      )}

                      {sec.steps.length > 0 && (
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 13,
                              marginBottom: 6,
                            }}
                          >
                            Instructions
                          </div>
                          <ol style={{ paddingLeft: 18, margin: 0 }}>
                            {sec.steps.map((s, idx) => (
                              <li key={idx}>{s.body}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

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

        {/* FIXED FOOTER */}
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
