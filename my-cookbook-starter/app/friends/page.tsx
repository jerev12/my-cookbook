'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import RecipeModal from '@/app/components/RecipeModal';

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type RecipeRow = {
  id: string;
  user_id: string;
  title: string;
  recipes_types: string | null;
  photo_url: string | null;
  privacy: 'public' | 'friends' | 'private';
  created_at: string;
  profiles?: Profile; // joined profile
};

const PAGE_SIZE = 12;

export default function FriendsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Get current user id
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      setUserId(data.user?.id ?? null);
    })();
  }, []);

  // Fetch friend ids (accepted, either direction)
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const ids =
        data?.map((row) =>
          row.requester_id === userId ? row.addressee_id : row.requester_id
        ) ?? [];

      setFriendIds(ids);
    })();
  }, [userId]);

  const visibleUserIds = useMemo(() => {
    // Only fetch from you + friends (not “everyone public”)
    return userId ? [userId, ...friendIds] : friendIds;
  }, [userId, friendIds]);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (!userId || visibleUserIds.length === 0) {
        // You might have no friends yet; still show your own recipes
        if (!userId) return;
      }
      setLoading(true);
      setErrorMsg(null);
      try {
        const from = nextPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        // Single query over just you + your friends.
        // We’ll client-filter away friends’ "private" recipes (your own still show).
        const { data, error } = await supabase
          .from('recipes')
          .select(
            `
              id,
              user_id,
              title,
              recipes_types,
              photo_url,
              privacy,
              created_at,
              profiles:profiles (
                id,
                display_name,
                avatar_url
              )
            `
          )
          .in('user_id', userId ? [userId, ...friendIds] : friendIds)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;

        const filtered =
          (data ?? []).filter((r) => {
            if (r.user_id === userId) return true; // always see your own
            return r.privacy === 'public' || r.privacy === 'friends';
          }) as RecipeRow[];

        // If the server returned fewer than PAGE_SIZE, we *might* be done.
        // However, because we filter on the client, we should determine hasMore
        // by checking if the raw server response was < PAGE_SIZE.
        const gotAll = (data?.length ?? 0) < PAGE_SIZE;

        setRecipes((prev) => [...prev, ...filtered]);
        setHasMore(!gotAll);
        setPage(nextPage);
      } catch (e: any) {
        setErrorMsg(e.message ?? 'Failed to load feed.');
      } finally {
        setLoading(false);
      }
    },
    [userId, friendIds, visibleUserIds.length]
  );

  // Initial load
  useEffect(() => {
    if (!userId) return;
    setRecipes([]);
    setPage(0);
    setHasMore(true);
    // Kick off first page
    fetchPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, friendIds.join('|')]);

  // Infinite scroll observer
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

  const handleOpen = (id: string) => {
    setActiveRecipeId(id);
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setActiveRecipeId(null);
  };

  return (
    <main className="w-full flex justify-center">
      <div className="w-full max-w-[420px]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-neutral-200">
          <h1 className="text-xl font-semibold">Friends</h1>
          <p className="text-sm text-neutral-500">
            Your recipes + friends’ recipes (public & friends-only)
          </p>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="m-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {errorMsg}
          </div>
        )}

        {/* Empty state */}
        {!loading && recipes.length === 0 && (
          <div className="px-4 py-12 text-center text-neutral-500">
            No recipes to show yet.
          </div>
        )}

        {/* Feed */}
        <div className="flex flex-col divide-y divide-neutral-200">
          {recipes.map((r) => (
            <article key={r.id} className="pt-4">
              {/* Post header */}
              <div className="px-4 pb-3 flex items-center gap-3">
                <Avatar
                  src={r.profiles?.avatar_url ?? null}
                  name={r.profiles?.display_name ?? 'User'}
                />
                <div className="flex flex-col leading-tight">
                  <span className="font-medium">
                    {r.profiles?.display_name ?? 'Unknown User'}
                  </span>
                  {/* Optional timestamp: */}
                  {/* <span className="text-xs text-neutral-500">
                    {new Date(r.created_at).toLocaleString()}
                  </span> */}
                </div>
              </div>

              {/* Image + overlay */}
              <div className="px-0">
                <div
                  className="relative w-full overflow-hidden"
                  style={{ aspectRatio: '4 / 3' }}
                >
                  {/* Clickable image */}
                  <button
                    onClick={() => handleOpen(r.id)}
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

                  {/* Shaded box overlay with title + type (clickable) */}
                  <div className="absolute bottom-2 left-2">
                    <button
                      onClick={() => handleOpen(r.id)}
                      className="rounded-md bg-black/60 backdrop-blur-[2px] px-3 py-2 text-left"
                    >
                      <h3 className="text-white font-semibold leading-snug line-clamp-2">
                        {r.title}
                      </h3>
                      {r.recipes_types && (
                        <p className="text-white/90 text-xs uppercase mt-0.5">
                          {r.recipes_types}
                        </p>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom spacer like IG */}
              <div className="h-2" />
            </article>
          ))}

          {/* Skeletons */}
          {loading && recipes.length === 0 && (
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

        {/* Modal */}
        {activeRecipeId && (
          <RecipeModal
            open={isModalOpen}
            onClose={handleClose}
            // Assuming your modal takes recipeId; adjust if it expects a recipe object
            recipeId={activeRecipeId}
          />
        )}
      </div>
    </main>
  );
}

/** Minimal avatar with fallback initials */
function Avatar({ src, name }: { src: string | null; name: string }) {
  const initials = useMemo(() => {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || 'U';
  }, [name]);

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className="w-10 h-10 rounded-full object-cover border border-neutral-200"
    />
  ) : (
    <div className="w-10 h-10 rounded-full bg-neutral-300 text-neutral-700 grid place-items-center text-sm font-semibold border border-neutral-200">
      {initials}
    </div>
  );
}
