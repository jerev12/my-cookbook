'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RecipeCard from '../components/RecipeCard';

type Profile = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
};

type RecipeRow = {
  id: string;
  user_id: string;
  title: string;
  cuisine: string | null;
  photo_url: string | null;
  instructions: string | null;
  created_at: string | null;
  visibility: string;
  // joined author (we’ll map it below)
  profiles?: Profile;
};

type HeartAgg = { recipe_id: string; count: number };
type BookmarkAgg = { recipe_id: string; count: number };

export default function PublicRecipesFeed() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [heartCounts, setHeartCounts] = useState<Record<string, number>>({});
  const [didHeartSet, setDidHeartSet] = useState<Set<string>>(new Set());
  const [didSaveSet, setDidSaveSet] = useState<Set<string>>(new Set());
  const [ownerBookmarkCounts, setOwnerBookmarkCounts] = useState<Record<string, number>>({});

  // -------------- Load everything once on mount --------------
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      // 1) Who’s the viewer?
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      if (!mounted) return;
      setCurrentUserId(uid);

      // 2) Fetch PUBLIC recipes + author profile (newest first)
      // visibility = 'public'
      const { data: recs, error: e1 } = await supabase
        .from('recipes')
        .select(
          'id, user_id, title, cuisine, photo_url, instructions, created_at, visibility, profiles:profiles!recipes_user_id_fkey(id, display_name, nickname, avatar_url)'
        )
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(60);

      if (e1) {
        console.error(e1);
        if (mounted) setLoading(false);
        return;
      }
      const recipes = (recs ?? []) as unknown as RecipeRow[];
      if (!mounted) return;
      setRows(recipes);

      const recipeIds = recipes.map(r => r.id);

      if (recipeIds.length === 0) {
        if (mounted) setLoading(false);
        return;
      }

      // 3) HEART COUNTS (one grouped query)
      const { data: heartAgg, error: e2 } = await supabase
        .from('recipe_hearts')
        .select('recipe_id, count:count()')
        .in('recipe_id', recipeIds)
        .group('recipe_id');

      if (e2) {
        console.error(e2);
      } else if (mounted) {
        const map: Record<string, number> = {};
        for (const row of (heartAgg ?? []) as HeartAgg[]) {
          map[row.recipe_id] = Number(row.count) || 0;
        }
        setHeartCounts(map);
      }

      // 4) DID *I* HEART / SAVE (two tiny queries filtered by user_id)
      if (uid) {
        // hearts by me
        const { data: myHearts, error: e3 } = await supabase
          .from('recipe_hearts')
          .select('recipe_id')
          .eq('user_id', uid)
          .in('recipe_id', recipeIds);

        if (e3) {
          console.error(e3);
        } else if (mounted) {
          setDidHeartSet(new Set((myHearts ?? []).map(r => r.recipe_id as string)));
        }

        // bookmarks by me
        const { data: mySaves, error: e4 } = await supabase
          .from('recipe_bookmarks')
          .select('recipe_id')
          .eq('user_id', uid)
          .in('recipe_id', recipeIds);

        if (e4) {
          console.error(e4);
        } else if (mounted) {
          setDidSaveSet(new Set((mySaves ?? []).map(r => r.recipe_id as string)));
        }

        // 5) BOOKMARK COUNTS (ONLY for recipes I own)
        const myOwnedIds = recipes.filter(r => r.user_id === uid).map(r => r.id);
        if (myOwnedIds.length > 0) {
          const { data: bmAgg, error: e5 } = await supabase
            .from('recipe_bookmarks')
            .select('recipe_id, count:count()')
            .in('recipe_id', myOwnedIds)
            .group('recipe_id');

          if (e5) {
            console.error(e5);
          } else if (mounted) {
            const map: Record<string, number> = {};
            for (const row of (bmAgg ?? []) as BookmarkAgg[]) {
              map[row.recipe_id] = Number(row.count) || 0;
            }
            setOwnerBookmarkCounts(map);
          }
        }
      }

      if (mounted) setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const content = useMemo(() => {
    if (loading) {
      return (
        <p className="text-sm text-gray-600">Loading public recipes…</p>
      );
    }
    if (!rows.length) {
      return <p className="text-sm text-gray-600">No public recipes yet.</p>;
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((r) => {
          const author = r.profiles
            ? {
                id: r.profiles.id,
                display_name: r.profiles.display_name,
                nickname: r.profiles.nickname,
                avatar_url: r.profiles.avatar_url,
              }
            : undefined;

          return (
            <RecipeCard
              key={r.id}
              id={r.id}
              title={r.title}
              cuisine={r.cuisine}
              photo_url={r.photo_url}
              // If you store ingredients elsewhere, pass them here.
              // For now we’ll omit ingredients so the section hides automatically.
              instructions={r.instructions}
              created_at={r.created_at}
              author={author ?? null}
              currentUserId={currentUserId ?? null}
              // HYDRATION (no per-card queries):
              initialHeartCount={heartCounts[r.id] ?? 0}
              initialDidHeart={didHeartSet.has(r.id)}
              initialDidSave={didSaveSet.has(r.id)}
              initialBookmarkCountForOwner={r.user_id === currentUserId ? (ownerBookmarkCounts[r.id] ?? 0) : undefined}
            />
          );
        })}
      </div>
    );
  }, [loading, rows, currentUserId, heartCounts, didHeartSet, didSaveSet, ownerBookmarkCounts]);

  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold mb-4">Community — Public Recipes</h1>
      {content}
    </main>
  );
}
