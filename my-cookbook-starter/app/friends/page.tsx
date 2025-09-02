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
  _profile?: Profile | null;
  _heartCount?: number;
  _bookmarkCount?: number;
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) setMsg(error.message);
      setUserId(data.user?.id ?? null);
    })();
    return () => { mounted = false; };
  }, []);

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
        return;
      }
      const ids = (data ?? []).map((row: any) =>
        row.requester_id === userId ? row.addressee_id : row.requester_id
      );
      setFriendIds(ids);
    })();
    return () => { mounted = false; };
  }, [userId]);

  const visibleUserIds = useMemo(
    () => (userId ? [userId, ...friendIds] : friendIds),
    [userId, friendIds]
  );

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

  const fetchCounts = useCallback(async (recipeIds: string[]) => {
    const ids = Array.from(new Set(recipeIds));
    if (!ids.length) return { hearts: new Map<string, number>(), bookmarks: new Map<string, number>() };

    const { data: heartRows, error: heartErr } = await supabase
      .from('hearts')
      .select('recipe_id')
      .in('recipe_id', ids);
    if (heartErr) throw heartErr;

    const { data: bookmarkRows, error: bookmarkErr } = await supabase
      .from('bookmarks')
      .select('recipe_id')
      .in('recipe_id', ids);
    if (bookmarkErr) throw bookmarkErr;

    const heartMap = new Map<string, number>();
    (heartRows ?? []).forEach((r: any) => {
      heartMap.set(r.recipe_id, (heartMap.get(r.recipe_id) ?? 0) + 1);
    });
    const bookmarkMap = new Map<string, number>();
    (bookmarkRows ?? []).forEach((r: any) => {
      bookmarkMap.set(r.recipe_id, (bookmarkMap.get(r.recipe_id) ?? 0) + 1);
    });
    return { hearts: heartMap, bookmarks: bookmarkMap };
  }, []);

  const isFriendVisible = (visibility: string | null | undefined) => {
    // Show for friends unless explicitly "private"
    const v = (visibility ?? '').trim().toLowerCase();
    if (v === 'private') return false;
    return true; // includes 'public', 'friends', 'friend', 'friends_only', '', null, etc.
  };

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
          .select('id,user_id,title,cuisine,recipe_types,photo_url,source_url,created_at,visibility')
          .in(
            'user_id',
            visibleUserIds.length
              ? visibleUserIds
              : ['00000000-0000-0000-0000-000000000000']
          )
          .order('created_at', { ascending: false })
          .range(from, to);

        if (recipeErr) throw recipeErr;

        const filtered: Recipe[] = (recipeRows as Recipe[] | null)?.filter((r) => {
          if (r.user_id === userId) return true;           // always show your own
          return isFriendVisible(r.visibility);            // friends: anything not "private"
        }) ?? [];

        const newOnes = filtered.filter((r) => !seenIdsRef.current.has(r.id));
        newOnes.forEach((r) => seenIdsRef.current.add(r.id));

        const needProfilesFor = newOnes.map((r) => r.user_id);
        const profileMap = await fetchProfiles(needProfilesFor);

        const { hearts, bookmarks } = await fetchCounts(newOnes.map((r) => r.id));

        const withMeta: Recipe[] = newOnes.map((r) => ({
          ...r,
          _profile: profileMap.get(r.user_id) ?? null,
          _heartCount: hearts.get(r.id) ?? 0,
          _bookmarkCount: bookmarks.get(r.id) ?? 0,
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
    [userId, visibleUserIds, fetchProfiles, fetchCounts]
  );

  useEffect(() => {
    if (!userId) return;
    setRows([]);
    setPage(0);
    setHasMore(true);
    seenIdsRef.current.clear();
    fetchPage(0);
  }, [userId, friendIds.join('|'), fetchPage]);

  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !loading && hasMore) fetchPage(page + 1);
      },
      { rootMargin: '800px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, page, fetchPage]);

  function openRecipe(r: Recipe) { setSelected(r); setOpen(true); }
  function closeRecipe() { setOpen(false); setSelected(null); }

  // layout (inline styles so they apply everywhere)
  const containerStyle: React.CSSProperties = { maxWidth: 560, width: '100%', margin: '0 auto' };
  const headerRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px', // tighter
  };
  const articleStyle: React.CSSProperties = { paddingTop: 4, borderBottom: '1px solid #e5e7eb' };
  const boldNameStyle: React.CSSProperties = {
    fontWeight: 700, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  };
  const actionsRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 14, padding: '6px 10px 8px 10px', color: '#374151', fontSize: 13,
  };

  return (
    <main style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Friends</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Your recipes + friends’ recipes (non-private)
          </p>
        </div>

        {msg && (
          <div style={{ margin: 16, border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, padding: 12, fontSize: 14 }}>
            {msg}
          </div>
        )}

        {!loading && rows.length === 0 && !msg && (
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16, color: '#606375', margin: 16 }}>
            No recipes to show yet.
          </div>
        )}

        <div>
          {rows.map((r) => (
            <article key={r.id} style={articleStyle}>
              {/* tighter avatar row */}
              <div style={headerRowStyle}>
                <Avatar src={r._profile?.avatar_url ?? null} name={r._profile?.display_name ?? 'User'} size={44} />
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

              {/* actions */}
              <div style={actionsRowStyle}>
                <span title={r.created_at ? new Date(r.created_at).toLocaleString() : undefined}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#6b7280' }}>
                  <CalendarIcon />
                  {r.created_at ? formatDate(r.created_at) : '—'}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <HeartIcon />
                  {r._heartCount ?? 0}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: r.user_id === userId ? '#374151' : '#9CA3AF' }}>
                  <BookmarkIcon />
                  {r.user_id === userId ? (r._bookmarkCount ?? 0) : null}
                </span>
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

/** helpers & icons */
function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function CalendarIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor"><path d="M7 2a1 1 0 1 1 2 0v1h6V2a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h1V2Zm-1 5h12a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1Z"/></svg>); }
function HeartIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor"><path d="M12.001 5.53C10.2 3.5 6.9 3.5 5.1 5.53c-1.92 2.17-1.45 5.3.93 7.06l5.97 4.55 5.97-4.55c2.38-1.76 2.85-4.89.93-7.06-1.8-2.03-5.1-2.03-6.9 0l-.1.11-.1-.11Z"/></svg>); }
function BookmarkIcon() { return (<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="currentColor"><path d="M6 3a2 2 0 0 0-2 2v16l8-4 8 4V5a2 2 0 0 0-2-2H6Z"/></svg>); }

function Avatar({ src, name, size = 44 }: { src: string | null; name: string; size?: number; }) {
  const initials = (name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || 'U';
  const style: React.CSSProperties = { width: size, height: size, borderRadius: '9999px', objectFit: 'cover', display: 'block', border: '1px solid #e5e7eb', flex: '0 0 auto' };
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name ?? 'User'} style={style} />
  ) : (
    <div style={{ ...style, background: '#e5e7eb', color: '#374151', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }} aria-label={name} title={name}>
      {initials}
    </div>
  );
}
