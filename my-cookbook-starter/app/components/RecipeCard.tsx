'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type RecipeCardProps = {
  // Core recipe fields
  id: string;
  title: string;
  cuisine?: string | null;
  photo_url?: string | null;
  ingredients?: string[];        // list of ingredient strings (already parsed)
  instructions?: string | null;  // newline-separated text is fine
  created_at?: string | null;

  // Author (for avatar/name link AND to detect owner)
  author?: {
    id: string;
    display_name?: string | null;
    nickname?: string | null;
    avatar_url?: string | null;
  } | null;

  /**
   * HYDRATION PROPS (pass these from your page to avoid per-card queries):
   * - counts
   * - whether the current viewer has hearted/saved
   * - current user id (so the card doesn't call auth.getUser())
   */
  currentUserId?: string | null;             // pass viewer id if you have it
  initialHeartCount?: number;               // total hearts on this recipe
  initialDidHeart?: boolean;                // did the viewer heart this?
  initialDidSave?: boolean;                 // did the viewer save this?
  initialBookmarkCountForOwner?: number;    // total bookmarks (only shown to owner)
};

/* ---------- helpers ---------- */

// Part E: split instructions string into steps by newline
function parseInstructions(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/g)
    .map(s => s.trim())
    .filter(Boolean);
}

// Part F: date helpers
function formatMonthDayYearWithComma(d: Date) {
  const month = d.toLocaleString(undefined, { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  return `${month}, ${day}, ${year}`;
}
function isSameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function RecipeCard(props: RecipeCardProps) {
  const {
    id, title, cuisine, photo_url, author,
    ingredients, instructions, created_at,
    currentUserId,
    initialHeartCount, initialDidHeart, initialDidSave, initialBookmarkCountForOwner,
  } = props;

  const steps = useMemo(() => parseInstructions(instructions), [instructions]);

  /* ---------- Auth / owner detection ---------- */
  const [viewerId, setViewerId] = useState<string | null>(currentUserId ?? null);
  const [isOwner, setIsOwner]   = useState<boolean>(() =>
    !!(currentUserId && author?.id && currentUserId === author.id)
  );
  const [canToggle, setCanToggle] = useState<boolean>(!!currentUserId);

  // If page didn't pass currentUserId, we’ll do a lightweight auth check once.
  useEffect(() => {
    let mounted = true;
    async function ensureViewer() {
      if (viewerId !== null) return; // already known (passed from page)
      const { data } = await supabase.auth.getUser();
      const uid = data?.user?.id ?? null;
      if (!mounted) return;
      setViewerId(uid);
      setCanToggle(!!uid);
      setIsOwner(!!uid && !!author?.id && uid === author.id);
    }
    ensureViewer();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerId, author?.id]);

  /* ---------- HEART state (no per-card fetch if hydrated) ---------- */
  const [heartCount, setHeartCount] = useState<number>(initialHeartCount ?? 0);
  const [didHeart, setDidHeart]     = useState<boolean>(!!initialDidHeart);
  const [busyHeart, setBusyHeart]   = useState<boolean>(false);

  /* ---------- BOOKMARK state (no per-card fetch if hydrated) ---------- */
  const [didSave, setDidSave]                 = useState<boolean>(!!initialDidSave);
  const [busySave, setBusySave]               = useState<boolean>(false);
  const [bookmarkCount, setBookmarkCount]     = useState<number>(initialBookmarkCountForOwner ?? 0);

  /**
   * NOTE: Because you asked to avoid per-card queries,
   * we are NOT fetching heart/bookmark meta here.
   * Please pass:
   *   - initialHeartCount
   *   - initialDidHeart
   *   - initialDidSave
   *   - initialBookmarkCountForOwner (only for owner)
   * from your page queries.
   *
   * If you DO want automatic fallback fetching, I can add it back — but it's disabled now by design.
   */

  /* ---------- Heart toggle (optimistic) ---------- */
  async function toggleHeart() {
    if (!canToggle || busyHeart) return;
    setBusyHeart(true);

    const next = !didHeart;
    setDidHeart(next);
    setHeartCount(c => Math.max(0, c + (next ? 1 : -1)));

    try {
      // ensure we actually have a user (in case currentUserId wasn't passed)
      let uid = viewerId;
      if (!uid) {
        const { data } = await supabase.auth.getUser();
        uid = data?.user?.id ?? null;
      }
      if (!uid) throw new Error('No user');

      if (next) {
        const { error } = await supabase
          .from('recipe_hearts')
          .insert({ recipe_id: id, user_id: uid });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('recipe_hearts')
          .delete()
          .eq('recipe_id', id)
          .eq('user_id', uid);
        if (error) throw error;
      }
    } catch {
      // revert on failure
      setDidHeart(!next);
      setHeartCount(c => Math.max(0, c + (next ? -1 : 1)));
    } finally {
      setBusyHeart(false);
    }
  }

  /* ---------- Bookmark toggle (optimistic) ---------- */
  async function toggleSave() {
    if (!canToggle || busySave) return;
    setBusySave(true);

    const next = !didSave;
    setDidSave(next);

    // If viewer is owner, we also show the aggregate bookmark count.
    if (isOwner) {
      setBookmarkCount(c => Math.max(0, c + (next ? 1 : -1)));
    }

    try {
      let uid = viewerId;
      if (!uid) {
        const { data } = await supabase.auth.getUser();
        uid = data?.user?.id ?? null;
      }
      if (!uid) throw new Error('No user');

      if (next) {
        const { error } = await supabase
          .from('recipe_bookmarks')
          .insert({ recipe_id: id, user_id: uid });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('recipe_bookmarks')
          .delete()
          .eq('recipe_id', id)
          .eq('user_id', uid);
        if (error) throw error;
      }
    } catch {
      // revert on failure
      setDidSave(!next);
      if (isOwner) {
        setBookmarkCount(c => Math.max(0, c + (next ? -1 : 1)));
      }
    } finally {
      setBusySave(false);
    }
  }

  /* ---------- Part F: Added text ---------- */
  let addedText: string | null = null;
  if (created_at) {
    const created = new Date(created_at);
    const today = new Date();
    addedText = isSameLocalDate(created, today)
      ? 'Added today'
      : `Added on ${formatMonthDayYearWithComma(created)}`;
  }

  /* ---------- Render ---------- */
  return (
    <article className="rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
      {/* Author strip */}
      <div className="flex items-center gap-3 p-4">
        <Link
          href={author?.id ? `/users/${author.id}` : '#'}
          className="inline-flex items-center gap-3 group"
        >
          {author?.avatar_url ? (
            <Image
              src={author.avatar_url}
              alt={author.display_name ?? author.nickname ?? 'User'}
              width={32}
              height={32}
              className="rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200" />
          )}
          <span className="text-sm font-medium text-gray-800 group-hover:underline">
            {author?.display_name || author?.nickname || 'Unknown user'}
          </span>
        </Link>
      </div>

      {/* Part A: Full-width image */}
      <div className="relative w-full aspect-[16/9] bg-gray-100">
        {photo_url ? (
          <Image
            src={photo_url}
            alt={title}
            fill
            sizes="100vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-gray-400 text-sm">
            No image
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Part B: Title */}
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>

        {/* Part C: Cuisine (hide if empty) */}
        {cuisine && <p className="mt-1 text-sm text-gray-500">{cuisine}</p>}

        {/* Part D: Ingredients (hide if none) */}
        {ingredients && ingredients.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-gray-800">Ingredients</h4>
            <ul className="mt-2 list-disc list-outside pl-5 text-sm text-gray-700 space-y-1">
              {ingredients.map((ing, idx) => (
                <li key={idx}>{ing}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Part E: Instructions (hide if none) */}
        {steps.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-gray-800">Instructions</h4>
            <ol className="mt-2 list-decimal list-outside pl-5 text-sm text-gray-700 space-y-1">
              {steps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Actions: Heart + Bookmark */}
        <div className="mt-4 flex items-center gap-4">
          {/* Heart */}
          <button
            type="button"
            onClick={toggleHeart}
            disabled={!canToggle || busyHeart}
            aria-pressed={didHeart}
            aria-label={didHeart ? 'Remove heart' : 'Add heart'}
            className={`inline-flex items-center gap-1 text-sm ${
              didHeart ? 'text-red-600' : 'text-gray-600'
            } ${!canToggle || busyHeart ? 'opacity-50 cursor-not-allowed' : 'hover:text-gray-800'}`}
            title={canToggle ? (didHeart ? 'Unheart' : 'Heart') : 'Sign in to heart'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={didHeart ? 'fill-current' : ''}>
              <path d="M12 21s-7-4.534-9.5-7.5C.5 11.5 2 7 6 7c2.09 0 3.41 1.08 4 2 0.59-0.92 1.91-2 4-2 4 0 5.5 4.5 3.5 6.5C19 16.466 12 21 12 21z"/>
            </svg>
            <span>{heartCount}</span>
          </button>

          {/* Bookmark (owner sees a count; others see label) */}
          <button
            type="button"
            onClick={toggleSave}
            disabled={!canToggle || busySave}
            aria-pressed={didSave}
            aria-label={didSave ? 'Remove bookmark' : 'Add bookmark'}
            className={`inline-flex items-center gap-1 text-sm ${
              didSave ? 'text-blue-600' : 'text-gray-600'
            } ${!canToggle || busySave ? 'opacity-50 cursor-not-allowed' : 'hover:text-gray-800'}`}
            title={canToggle ? (didSave ? 'Unsave' : 'Save') : 'Sign in to save'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className={didSave ? 'fill-current' : ''}>
              <path d="M6 2h12a1 1 0 0 1 1 1v19l-7-4-7 4V3a1 1 0 0 1 1-1z"/>
            </svg>
            {isOwner ? <span>{bookmarkCount}</span> : <span>{didSave ? 'Saved' : 'Save'}</span>}
          </button>
        </div>

        {/* Part F: Added on */}
        {addedText && <div className="mt-5 text-xs text-gray-500">{addedText}</div>}
      </div>
    </article>
  );
}
