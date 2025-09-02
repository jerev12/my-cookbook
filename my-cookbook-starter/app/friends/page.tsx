'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RecipeModal from '../components/RecipeModal';
import { RecipeTile } from '../components/RecipeBadges';

// Match your public feed's Recipe type
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
  _profile?: Profile | null; // attached after fetch
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

  // infinite scroll
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // de-dupe & re-entrancy guards
  const seenIdsRef = useRef<Set<string>>(new Set());
  const fetchingPageRef = useRef<number | null>(null);

  // modal state (match public page)
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [open, setOpen] = useState(false);

  // current user
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) {
        setMsg(error.message);
      } else {
        setUserId(data.user?.id ?? null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // friends (accepted either direction)
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
          data?.map((row) =>
            row.requester_id === userId ? row.addressee_id : row.requester_id
          ) ?? [];
        setFriendIds(ids);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  // candidates = you + friends
  const visibleUserIds = useMemo(() => {
    return userId ? [userId, ...friendIds] : friendIds;
  }, [userId, friendIds]);

  // fetch profiles for given userIds
  const fetchProfiles = useCallback(async (userIds: string[]) => {
    if (!userIds.length) return new Map<string, Profile>();
    const uniq = Array.from(new Set(userIds));
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', uniq);

    if (error) throw error;

    const map = new Map<string, Profile>();
    (data ?? []).forEach((p) => map.set(p.id, p as Profile));
    return map;
  }, []);

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

        // 1) Pull recipes (no relational join)
        const { data: recipeRows, error: recipeErr } = await supabase
          .from('recipes')
          .select(
            'id,user_id,title,cuisine,recipe_types,photo_url,source_url,created_at,visibility'
          )
          .in(
            'user_id',
            visibleUserIds.length
              ? visibleUserIds
              : ['00000000-0000-0000-0000-000000000000'] // guard
          )
          .order('created_at', { ascending: false })
          .range(from, to);

        if (recipeErr) throw recipeErr;

        // 2) Visibility rules
        const filtered: Recipe[] =
          (recipeRows as Recipe[] | null)?.filter((r) => {
            if (r.user_id === userId) return true;
            const vis = (r.visibility ?? '').toLowerCase();
            return vis === 'public' || vis === 'friends';
          }) ?? [];

        // 3) De-dupe by id
        const newOnes = filtered.filter((r) => !seenIdsRef.current.has(r.id));
        newOnes.forEach((r) => seenIdsRef.current.add(r.id));

        // 4) Fetch/attach profiles for new rows
        const needProfilesFor = newOnes.map((r) => r.user_id);
        const profileMap = await fetchProfiles(needProfilesFor);

        const withProfiles: Recipe[] = newOnes.map((r) => ({
          ...r,
          _profile: profileMap.get(r.user_id) ?? null,
        }));

        const gotAll = (recipeRows?.length ?? 0) < PAGE_SIZE;

        setRows((prev) => [...prev, ...withProfiles]);
        setHasMore(!gotAll);
        setPage(nextPage);
      } catch (e: any) {
        setMsg(e.message ?? 'Failed to load friends feed.');
      } finally {
        setLoading(false);
        fetchingPageRef.current = null;
      }
    },
    [userId, visibleUserIds, fetchProfiles]
  );

  // reset & first page on dependency change
  useEffect(() => {
    if (!userId) return;
    setRows([]);
    setPage(0);
    setHasMore(true);
    seenIdsRef.current.clear();
    fetchPage(0);
  }, [userId, friendIds.join('|'), fetchPage]);

  // infinite scroll
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

  function openRecipe(r: Recipe) {
    setSelected(r);
    setOpen(true);
  }
  function closeRecipe() {
    setOpen(false);
    setSelected(null);
  }

  // ------- INLINE LAYOUT (so it works even if Tailwind classes don't apply) -------
  const containerStyle: React.CSSProperties = {
    // cap the width so iPad/Desktop never get huge tiles
    maxWidth: 560,          // tweak to taste: 520/560/600
    width: '100%',
    margin: '0 auto',
  };

  const headerRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderBottom: '1px solid #e5e7eb',
  };

  const articleStyle: React.CSSProperties = {
    paddingTop: 16,
    borderBottom: '1px solid #e5e7eb',
  };

  const boldNameStyle: React.CSSProperties = {
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <main style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Friends</h1>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Your recipes + friends’ recipes (public & friends-only)
          </p>
        </div>

        {/* Error */}
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

        {/* Empty state */}
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

        {/* Single-column feed */}
        <div>
          {rows.map((r) => (
            <article key={r.id} style={articleStyle}>
              {/* Avatar + bold name INLINE (never below) */}
              <div style={headerRowStyle}>
                <Avatar
                  src={r._profile?.avatar_url ?? null}
                  name={r._profile?.display_name ?? 'User'}
                  size={48} // larger avatar
                />
                <span style={boldNameStyle} title={r._profile?.display_name ?? 'Unknown User'}>
                  {r._profile?.display_name ?? 'Unknown User'}
                </span>
              </div>

              {/* Image tile with shaded bottom overlay (your RecipeTile) */}
              <div style={{ paddingLeft: 0, paddingRight: 0 }}>
                <RecipeTile
                  title={r.title}
                  types={r.recipe_types ?? []}
                  photoUrl={r.photo_url}
                  onClick={() => openRecipe(r)}
                  ariaLabel={`Open ${r.title}`}
                />
              </div>

              <div style={{ height: 8 }} />
            </article>
          ))}

          {/* Skeletons */}
          {loading && rows.length === 0 && (
            <div style={{ padding: 16 }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 9999, background: '#e5e7eb' }} />
                    <div style={{ height: 12, width: 128, background: '#e5e7eb', borderRadius: 6 }} />
                  </div>
                  <div style={{ width: '100%', aspectRatio: '1 / 1', background: '#e5e7eb', borderRadius: 8 }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} style={{ height: 48 }} />

        {/* Shared modal */}
        <RecipeModal open={open} onClose={closeRecipe} recipe={selected} />
      </div>
    </main>
  );
}

/** Avatar with initials fallback (inline styles; size-controlled) */
function Avatar({
  src,
  name,
  size = 48,
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
        fontSize: 14,
        fontWeight: 700,
      }}
      aria-label={name}
      title={name}
    >
      {initials}
    </div>
  );
}
