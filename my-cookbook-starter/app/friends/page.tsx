'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import RecipeModal from '../components/RecipeModal'; // mirrors your public feed import

// Match your existing Recipe type from the public feed
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
  // we'll attach the author's profile after fetching:
  _profile?: Profile | null;
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

  // modal state (mirror your public page)
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [open, setOpen] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Get current user id
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

  // Fetch friend ids (accepted either direction)
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

  // Users whose recipes we consider: you + your friends
  const visibleUserIds = useMemo(() => {
    return userId ? [userId, ...friendIds] : friendIds;
  }, [userId, friendIds]);

  // Fetch profiles for a set of userIds
  const fetchProfiles = useCallback(async (userIds: string[]) => {
    if (!userIds.length) return new Map<string, Profile>();
    const uniq = Array.from(new Set(userIds));
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', uniq);

    if (error) throw error;

    const m = new Map<string, Profile>();
    (data ?? []).forEach((p) => m.set(p.id, p as Profile));
    return m;
  }, []);

  // Fetch one page (recipes only, then profiles; no relational join)
  const fetchPage = useCallback(
    async (nextPage: number) => {
      // If we don't know the current user and also have no friends, nothing to do
      if (!userId && visibleUserIds.length === 0) return;

      setLoading(true);
      setMsg(null);
      try {
        const from = nextPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        // 1) Pull recipes for you + friends
        const { data: recipeRows, error: recipeErr } = await supabase
          .from('recipes')
          .select(
            'id,user_id,title,cuisine,recipe_types,photo_url,source_url,created_at,visibility'
          )
          .in(
            'user_id',
            visibleUserIds.length
              ? visibleUserIds
              : ['00000000-0000-0000-0000-000000000000'] // guard for empty in()
          )
          .order('created_at', { ascending: false })
          .range(from, to);

        if (recipeErr) throw recipeErr;

        // 2) Apply visibility rules client-side:
        // - Your own recipes: show regardless of visibility
        // - Friends' recipes: only show if visibility IN ('public','friends')
        const filtered: Recipe[] = (recipeRows as Recipe[] | null)?.filter((r) => {
          if (r.user_id === userId) return true;
          const vis = (r.visibility ?? '').toLowerCase();
          return vis === 'public' || vis === 'friends';
        }) ?? [];

        // 3) Fetch needed profiles and attach
        const neededIds = filtered.map((r) => r.user_id);
        const profilesMap = await fetchProfiles(neededIds);
        const withProfiles: Recipe[] = filtered.map((r) => ({
          ...r,
          _profile: profilesMap.get(r.user_id) ?? null,
        }));

        // 4) Append to rows
        const gotAll = (recipeRows?.length ?? 0) < PAGE_SIZE;
        setRows((prev) => [...prev, ...withProfiles]);
        setHasMore(!gotAll);
        setPage(nextPage);
      } catch (e: any) {
        setMsg(e.message ?? 'Failed to load friends feed.');
      } finally {
        setLoading(false);
      }
    },
    [userId, visibleUserIds, fetchProfiles]
  );

  // Initial load when we have the userId/friends list
  useEffect(() => {
    if (!userId) return; // wait for auth
    setRows([]);
    setPage(0);
    setHasMore(true);
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

  function openRecipe(r: Recipe) {
    setSelected(r);
    setOpen(true);
  }
  function closeRecipe() {
    setOpen(false);
    setSelected(null);
  }

  return (
    <main className="w-full flex justify-center">
      <div className="w-full max-w-[420px]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-neutral-200">
          <h1 className="text-xl font-semibold m-0">Friends</h1>
          <p className="text-sm text-neutral-500 m-0">
            Your recipes + friends’ recipes (public & friends-only)
          </p>
        </div>

        {/* Messages */}
        {msg && (
          <div className="m-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
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

        {/* Feed (single column IG style) */}
        <div className="flex flex-col">
          {rows.map((r) => (
            <article key={r.id} className="pt-4 border-b border-neutral-200">
              {/* Row header with avatar + display name */}
              <div className="px-4 pb-3 flex items-center gap-3">
                <Avatar
                  src={r._profile?.avatar_url ?? null}
                  name={r._profile?.display_name ?? 'User'}
                />
                <div className="flex flex-col leading-tight">
                  <span className="font-medium">
                    {r._profile?.display_name ?? 'Unknown User'}
                  </span>
                </div>
              </div>

              {/* Image with overlay (title + types) */}
              <div className="px-0">
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: '4 / 3' }}>
                  <button
                    onClick={() => openRecipe(r)}
                    className="absolute inset-0"
                    aria-label={`Open ${r.title}`}
                  />
                  {r.photo_url ? (
                    <Image
                      src={r.photo_url}
                      alt={r.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 420px) 100vw, 420px"
                      priority={false}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-neutral-200" />
                  )}

                  <div className="absolute bottom-2 left-2 right-2">
                    <button
                      onClick={() => openRecipe(r)}
                      className="rounded-md bg-black/60 backdrop-blur-[2px] px-3 py-2 text-left w-fit max-w-full"
                    >
                      <h3 className="text-white font-semibold leading-snug line-clamp-2">
                        {r.title}
                      </h3>
                      {!!(r.recipe_types?.length) && (
                        <p className="text-white/90 text-xs uppercase mt-0.5 truncate">
                          {r.recipe_types.join(' • ')}
                        </p>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="h-2" />
            </article>
          ))}

          {/* Skeletons for initial load */}
          {loading && rows.length === 0 && (
            <div className="p-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="mb-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-200" />
                    <div className="h-3 w-32 bg-neutral-200 rounded" />
                  </div>
                  <div className="w-full rounded-md bg-neutral-200" style={{ aspectRatio: '4 / 3' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-12" />

        {/* Shared modal (same contract as your public page) */}
        <RecipeModal open={open} onClose={closeRecipe} recipe={selected} />
      </div>
    </main>
  );
}

/** Minimal avatar with initials fallback (no external component needed) */
function Avatar({ src, name }: { src: string | null; name: string }) {
  const initials =
    (name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'U';

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name ?? 'User'}
      className="w-10 h-10 rounded-full object-cover border border-neutral-200"
    />
  ) : (
    <div className="w-10 h-10 rounded-full bg-neutral-300 text-neutral-700 grid place-items-center text-sm font-semibold border border-neutral-200">
      {initials}
    </div>
  );
}
