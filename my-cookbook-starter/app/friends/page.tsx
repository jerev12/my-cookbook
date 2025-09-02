'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RecipeModal from '../components/RecipeModal';
import { RecipeTile } from '../components/RecipeBadges';

type Recipe = {
  id: string;
  user_id: string;
  title: string;
  cuisine: string | null;
  recipe_types: string[] | null;
  photo_url: string | null;
  source_url: string | null;
  created_at: string | null;
  visibility?: string | null;

  // attached client-side:
  _profile?: Profile | null;
  _heartCount?: number;
  _bookmarkCount?: number;
  _heartedByMe?: boolean;
  _bookmarkedByMe?: boolean;
};

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

const PAGE_SIZE = 12;

export default function FriendsFeed() {
  const [userId, setUserId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [rows, setRows] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const fetchingPageRef = useRef<number | null>(null);

  const [selected, setSelected] = useState<Recipe | null>(null);
  const [open, setOpen] = useState(false);

  // Auth
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) setMsg(error.message);
      setUserId(data.user?.id ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Friends
  useEffect(() => {
    if (!userId) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
      if (!mounted) return;

      if (error) {
        setMsg(error.message);
        setFriendIds([]);
      } else {
        const ids =
          data?.map((row: any) =>
            row.requester_id === userId ? row.addressee_id : row.requester_id
          ) ?? [];
        setFriendIds(ids);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  // you + friends
  const visibleUserIds = useMemo(
    () => (userId ? [userId, ...friendIds] : friendIds),
    [userId, friendIds]
  );

  // Helpers
  const fetchProfiles = useCallback(async (userIds: string[]) => {
    if (!userIds.length) return new Map<string, Profile>();
    const uniq = Array.from(new Set(userIds));
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', uniq);
    if (error) throw error;

    const map = new Map<string, Profile>();
    (data ?? []).forEach((p: any) => map.set(p.id, p as Profile));
    return map;
  }, []);

  // Counts + "by me" status. If RLS/tables block, default to empty maps.
  const fetchCountsAndMine = useCallback(
    async (recipeIds: string[]) => {
      const ids = Array.from(new Set(recipeIds));
      const empty = {
        hearts: new Map<string, number>(),
        bookmarks: new Map<string, number>(),
        myHearts: new Set<string>(),
        myBookmarks: new Set<string>(),
      };
      if (!ids.length || !userId) return empty;

      try {
        const [
          { data: heartRows, error: heartErr },
          { data: bookmarkRows, error: bmErr },
          { data: myHeartsRows, error: myHeartsErr },
          { data: myBookmarksRows, error: myBmErr },
        ] = await Promise.all([
          supabase.from('hearts').select('recipe_id').in('recipe_id', ids),
          supabase.from('bookmarks').select('recipe_id').in('recipe_id', ids),
          supabase
            .from('hearts')
            .select('recipe_id')
            .eq('user_id', userId)
            .in('recipe_id', ids),
          supabase
            .from('bookmarks')
            .select('recipe_id')
            .eq('user_id', userId)
            .in('recipe_id', ids),
        ]);

        if (heartErr || bmErr || myHeartsErr || myBmErr) return empty;

        const hearts = new Map<string, number>();
        (heartRows ?? []).forEach((r: any) =>
          hearts.set(r.recipe_id, (hearts.get(r.recipe_id) ?? 0) + 1)
        );

        const bookmarks = new Map<string, number>();
        (bookmarkRows ?? []).forEach((r: any) =>
          bookmarks.set(r.recipe_id, (bookmarks.get(r.recipe_id) ?? 0) + 1)
        );

        const myHearts = new Set<string>((myHeartsRows ?? []).map((r: any) => r.recipe_id));
        const myBookmarks = new Set<string>((myBookmarksRows ?? []).map((r: any) => r.recipe_id));

        return { hearts, bookmarks, myHearts, myBookmarks };
      } catch {
        return empty;
      }
    },
    [userId]
  );

  const isFriendVisible = (visibility: string | null | undefined) => {
    const v = (visibility ?? '').trim().toLowerCase();
    return v !== 'private';
  };

  // Fetch page (recipes → profiles → counts+mine)
  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (fetchingPageRef.current === nextPage) return;
      fetchingPageRef.current = nextPage;

      if (!userId && visibleUserIds.length === 0) {
        fetchingPageRef.current = null;
        return;
      }

      setLoading(true);
      setMsg(null);

      try {
        const from = nextPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data: recipeRows, error: recipeErr } = await supabase
          .from('recipes')
          .select(
            'id,user_id,title,cuisine,recipe_types,photo_url,source_url,created_at,visibility'
          )
          .in(
            'user_id',
            visibleUserIds.length
              ? visibleUserIds
              : ['00000000-0000-0000-0000-000000000000']
          )
          .order('created_at', { ascending: false })
          .range(from, to);

        if (recipeErr) throw recipeErr;

        const filtered: Recipe[] =
          (recipeRows as Recipe[] | null)?.filter((r) => {
            if (r.user_id === userId) return true;
            return isFriendVisible(r.visibility);
          }) ?? [];

        const newOnes = filtered.filter((r) => !seenIdsRef.current.has(r.id));
        newOnes.forEach((r) => seenIdsRef.current.add(r.id));

        const profileMap = await fetchProfiles(newOnes.map((r) => r.user_id));
        const { hearts, bookmarks, myHearts, myBookmarks } = await fetchCountsAndMine(
          newOnes.map((r) => r.id)
        );

        const withMeta: Recipe[] = newOnes.map((r) => ({
          ...r,
          _profile: profileMap.get(r.user_id) ?? null,
          _heartCount: hearts.get(r.id) ?? 0,
          _bookmarkCount: bookmarks.get(r.id) ?? 0,
          _heartedByMe: myHearts.has(r.id),
          _bookmarkedByMe: myBookmarks.has(r.id),
        }));

        const gotAll = (recipeRows?.length ?? 0) < PAGE_SIZE;

        setRows((prev) => [...prev, ...withMeta]);
        setHasMore(!gotAll);
        setPage(nextPage);
      } catch (e: any) {
        setMsg(e.message ?? 'Failed to load friends feed.');
      } finally {
        setLoading(false);
        fetchingPageRef.current = null;
      }
    },
    [userId, visibleUserIds, fetchProfiles, fetchCountsAndMine]
  );

  // Reset on dependency change
  useEffect(() => {
    if (!userId) return;
    setRows([]);
    setPage(0);
    setHasMore(true);
    seenIdsRef.current.clear();
    fetchPage(0);
  }, [userId, friendIds.join('|'), fetchPage]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !loading && hasMore) {
          fetchPage(page + 1);
        }
      },
      { rootMargin: '800px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, page, fetchPage]);

  // Modal handlers
  function openRecipe(r: Recipe) {
    setSelected(r);
    setOpen(true);
  }
  function closeRecipe() {
    setOpen(false);
    setSelected(null);
  }

  // Toggle heart/bookmark (optimistic)
  const toggleHeart = async (r: Recipe) => {
    if (!userId) return;
    const wasOn = !!r._heartedByMe;
    setRows((prev) =>
      prev.map((x) =>
        x.id === r.id
          ? {
              ...x,
              _heartedByMe: !wasOn,
              _heartCount: (x._heartCount ?? 0) + (wasOn ? -1 : 1),
            }
          : x
      )
    );
    try {
      if (wasOn) {
        await supabase.from('hearts').delete().eq('recipe_id', r.id).eq('user_id', userId);
      } else {
        await supabase.from('hearts').insert({ recipe_id: r.id, user_id: userId });
      }
    } catch {
      // rollback on failure
      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                _heartedByMe: wasOn,
                _heartCount: (x._heartCount ?? 0) + (wasOn ? 1 : -1),
              }
            : x
        )
      );
    }
  };

  const toggleBookmark = async (r: Recipe) => {
    if (!userId) return;
    const wasOn = !!r._bookmarkedByMe;
    setRows((prev) =>
      prev.map((x) =>
        x.id === r.id
          ? {
              ...x,
              _bookmarkedByMe: !wasOn,
              _bookmarkCount:
                x.user_id === userId
                  ? (x._bookmarkCount ?? 0) + (wasOn ? -1 : 1)
                  : x._bookmarkCount, // count only visible for own recipes
            }
          : x
      )
    );
    try {
      if (wasOn) {
        await supabase.from('bookmarks').delete().eq('recipe_id', r.id).eq('user_id', userId);
      } else {
        await supabase.from('bookmarks').insert({ recipe_id: r.id, user_id: userId });
      }
    } catch {
      // rollback on failure
      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id
            ? {
                ...x,
                _bookmarkedByMe: wasOn,
                _bookmarkCount:
                  x.user_id === userId
                    ? (x._bookmarkCount ?? 0) + (wasOn ? 1 : -1)
                    : x._bookmarkCount,
              }
            : x
        )
      );
    }
  };

  // ---- Layout (inline styles) ----
  const containerStyle: React.CSSProperties = {
    maxWidth: 560, // keep column narrow on iPad/desktop
    width: '100%',
    margin: '0 auto',
  };
  const articleStyle: React.CSSProperties = {
    paddingTop: 4,
    borderBottom: '1px solid #e5e7eb',
  };
  const headerRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '4px 12px', // compact
  };
  const boldNameStyle: React.CSSProperties = {
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
  // space-between: "Added on ..." left, buttons right
  const actionsRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px 8px 10px',
    fontSize: 13,
    color: '#374151',
  };
  const actionsRightStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 14,
  };
  const iconBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
    background: 'transparent',
    border: 'none',
    padding: 0,
    color: '#374151',
  };
  const iconMuted: React.CSSProperties = { color: '#9CA3AF' };

  return (
    <main style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div style={containerStyle}>
        {/* Page header */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Friends</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Your recipes + friends’ recipes (non-private)
          </p>
        </div>

        {msg && (
          <div
            style={{
              margin: 16,
              border: '1px solid #fecaca',
              background: '#fef2f2',
              color: '#b91c1c',
              borderRadius: 8,
              padding: 12,
              fontSize: 14,
            }}
          >
            {msg}
          </div>
        )}

        {!loading && rows.length === 0 && !msg && (
          <div
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 12,
              padding: 16,
              color: '#606375',
              margin: 16,
            }}
          >
            No recipes to show yet.
          </div>
        )}

        <div>
          {rows.map((r) => (
            <article key={r.id} style={articleStyle}>
              {/* compact avatar row */}
              <div style={headerRowStyle}>
                <Avatar
                  src={r._profile?.avatar_url ?? null}
                  name={r._profile?.display_name ?? 'User'}
                  size={44}
                />
                <span style={boldNameStyle} title={r._profile?.display_name ?? 'Unknown User'}>
                  {r._profile?.display_name ?? 'Unknown User'}
                </span>
              </div>

              {/* image tile */}
              <div style={{ paddingLeft: 0, paddingRight: 0 }}>
                <RecipeTile
                  title={r.title}
                  types={r.recipe_types ?? []}
                  photoUrl={r.photo_url}
                  onClick={() => openRecipe(r)}
                  ariaLabel={`Open ${r.title}`}
                />
              </div>

              {/* actions: Added on ... (left) + heart/bookmark (right) */}
              <div style={actionsRowStyle}>
                <span style={{ color: '#6b7280' }}>
                  Added on {r.created_at ? formatDate(r.created_at) : '—'}
                </span>

                <div style={actionsRightStyle}>
                  <button
                    type="button"
                    onClick={() => toggleHeart(r)}
                    aria-label={r._heartedByMe ? 'Remove heart' : 'Add heart'}
                    style={iconBtnStyle}
                    title={r._heartedByMe ? 'Unheart' : 'Heart'}
                  >
                    <HeartIcon filled={!!r._heartedByMe} />
                    <span>{r._heartCount ?? 0}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleBookmark(r)}
                    aria-label={r._bookmarkedByMe ? 'Remove bookmark' : 'Add bookmark'}
                    style={{
                      ...iconBtnStyle,
                      ...(r.user_id !== userId ? iconMuted : undefined),
                    }}
                    title={r._bookmarkedByMe ? 'Remove bookmark' : 'Bookmark'}
                  >
                    <BookmarkIcon filled={!!r._bookmarkedByMe} />
                    {r.user_id === userId ? <span>{r._bookmarkCount ?? 0}</span> : null}
                  </button>
                </div>
              </div>
            </article>
          ))}

          {loading && rows.length === 0 && (
            <div style={{ padding: 16 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 9999, background: '#e5e7eb' }} />
                    <div style={{ height: 12, width: 128, background: '#e5e7eb', borderRadius: 6 }} />
                  </div>
                  <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#e5e7eb', borderRadius: 8 }} />
                  <div style={{ height: 24 }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div ref={sentinelRef} style={{ height: 32 }} />
        <RecipeModal open={open} onClose={closeRecipe} recipe={selected} />
      </div>
    </main>
  );
}

/** helpers */
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Icons with "filled" state */
function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill={filled ? '#ef4444' : 'none'} stroke="#ef4444" strokeWidth="2">
      <path d="M20.84 4.61c-1.54-1.42-3.98-1.42-5.52 0L12 7.17l-3.32-2.56c-1.54-1.42-3.98-1.42-5.52 0-1.82 1.68-1.82 4.4 0 6.08L12 21l8.84-10.31c1.82-1.68 1.82-4.4 0-6.08z" />
    </svg>
  );
}
function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill={filled ? '#111827' : 'none'} stroke="#111827" strokeWidth="2">
      <path d="M6 3a2 2 0 0 0-2 2v16l8-4 8 4V5a2 2 0 0 0-2-2H6Z" />
    </svg>
  );
}

/** avatar with initials fallback */
function Avatar({
  src,
  name,
  size = 44,
}: {
  src: string | null;
  name: string;
  size?: number;
}) {
  const initials =
    (name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'U';

  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '9999px',
    objectFit: 'cover',
    display: 'block',
    border: '1px solid #e5e7eb',
    flex: '0 0 auto',
  };

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name ?? 'User'} style={style} />
  ) : (
    <div
      style={{
        ...style,
        background: '#e5e7eb',
        color: '#374151',
        display: 'grid',
        placeItems: 'center',
        fontSize: 13,
        fontWeight: 700,
      }}
      aria-label={name}
      title={name}
    >
      {initials}
    </div>
  );
}
