'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RecipeModal from '../components/RecipeModal';
import { RecipeTile } from '../components/RecipeBadges';
import {
  emitRecipeMutation,
  subscribeRecipeMutations,
} from '@/lib/recipeSync';

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

  // Friend list (mutual)
  useEffect(() => {
    if (!userId) return;
    let mounted = true;

    (async () => {
      try {
        const { data: outRows } = await supabase
          .from('friendships')
          .select('addressee_id')
          .eq('requester_id', userId)
          .eq('status', 'accepted');

        const { data: inRows } = await supabase
          .from('friendships')
          .select('requester_id')
          .eq('addressee_id', userId)
          .eq('status', 'accepted');

        if (!mounted) return;

        const a = (outRows ?? []).map((r: any) => r.addressee_id);
        const b = (inRows ?? []).map((r: any) => r.requester_id);
        const uniq = Array.from(new Set([...a, ...b])).filter((id) => id && id !== userId);

        setFriendIds(uniq);
      } catch (e: any) {
        if (!mounted) return;
        setMsg(e?.message ?? 'Failed to load friends.');
        setFriendIds([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);

  // Profiles
  const fetchProfiles = useCallback(async (userIds: string[]) => {
    if (!userIds.length) return new Map<string, Profile>();
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', userIds);
    const map = new Map<string, Profile>();
    (data ?? []).forEach((p: any) => map.set(p.id, p as Profile));
    return map;
  }, []);

  // Fetch page (TEST: friends only)
  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (fetchingPageRef.current === nextPage) return;
      fetchingPageRef.current = nextPage;

      if (!userId && friendIds.length === 0) {
        fetchingPageRef.current = null;
        return;
      }

      setLoading(true);
      setMsg(null);

      try {
        const { data: session } = await supabase.auth.getSession();
        console.log('live session user id passed to DB:', session.session?.user?.id);

        const from = nextPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data: recipeRows, error: recipeErr } = await supabase
          .from('recipes')
          .select(
            'id,user_id,title,cuisine,recipe_types,photo_url,source_url,created_at,visibility'
          )
          // 🔑 FRIENDS ONLY (test)
          .in(
            'user_id',
            friendIds.length
              ? friendIds
              : ['00000000-0000-0000-0000-000000000000']
          )
          .order('created_at', { ascending: false })
          .range(from, to);

        if (recipeErr) throw recipeErr;

        const filtered: Recipe[] = (recipeRows as Recipe[] | null) ?? [];

        const newOnes = filtered.filter((r) => !seenIdsRef.current.has(r.id));
        newOnes.forEach((r) => seenIdsRef.current.add(r.id));

        const profileMap = await fetchProfiles(newOnes.map((r) => r.user_id));

        const withMeta: Recipe[] = newOnes.map((r) => ({
          ...r,
          _profile: profileMap.get(r.user_id) ?? null,
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
    [userId, friendIds, fetchProfiles]
  );

  // Reset
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

  // Modal
  function openRecipe(r: Recipe) {
    setSelected(r);
    setOpen(true);
  }
  function closeRecipe() {
    setOpen(false);
    setSelected(null);
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: 560,
    width: '100%',
    margin: '0 auto',
  };
  const articleStyle: React.CSSProperties = {
    paddingTop: 4,
    borderBottom: '1px solid #e5e7eb',
  };

  return (
    <main style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <div style={containerStyle}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Friends (TEST: friends only)</h1>
        </div>

        {!loading && rows.length === 0 && !msg && (
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            No recipes to show yet.
          </div>
        )}

        <div>
          {rows.map((r) => (
            <article key={r.id} style={articleStyle}>
              <div style={{ padding: '4px 12px' }}>
                <strong>{r._profile?.display_name ?? 'Unknown User'}</strong>
              </div>
              <div>
                <RecipeTile
                  title={r.title}
                  types={r.recipe_types ?? []}
                  photoUrl={r.photo_url}
                  onClick={() => openRecipe(r)}
                />
              </div>
            </article>
          ))}
        </div>

        <div ref={sentinelRef} style={{ height: 32 }} />
        <RecipeModal open={open} onClose={closeRecipe} recipe={selected} />
      </div>
    </main>
  );
}
