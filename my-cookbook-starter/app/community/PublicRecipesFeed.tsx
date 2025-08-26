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
  profiles?: Profile;
};

export default function PublicRecipesFeed() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [heartCounts, setHeartCounts] = useState<Record<string, number>>({});
  const [didHeartSet, setDidHeartSet] = useState<Set<string>>(new Set());
  const [didSaveSet, setDidSaveSet] = useState<Set<string>>(new Set());
  const [ownerBookmarkCounts, setOwnerBookmarkCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      // 1) Who’s the viewer?
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;
      if (!mounted) return;
      setCurrentUserId(uid);

      // 2) Public recipes + author
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

      // 3) HEART COUNTS (fetch rows, aggregate in JS)
      {
        const { data: heartRows, error } = await supabase
          .from('recipe_hearts')
          .select('recipe_id')
          .in('recipe_id', recipeIds);

        if (error) {
          console.error(error);
        } else if (mounted) {
          const map: Record<string, number> = {};
          for (const row of heartRows ?? []) {
            const rid = (row as any).recipe_id as string;
            map[rid] = (map[rid] ?? 0) + 1;
          }
          setHeartCounts(map);
        }
      }

      // 4) Viewer-specific hearts & saves
      if (uid) {
        // did I heart?
        const { data: myHearts, error: eH } = await supabase
          .from('recipe_hearts')
          .select('recipe_id')
          .eq('user_id', uid)
          .in('recipe_id', recipeIds);
        if (eH) {
          console.error(eH);
        } else if (mounted) {
          setDidHeartSet(new Set((myHearts ?? []).map(r => (r as any).recipe_id as string)));
        }

        // did I save?
        const { data: mySaves, error: eS } = await supabase
          .from('recipe_bookmarks')
          .select('recipe_id')
          .eq('user_id', uid)
          .in('recipe_id', recipeIds);
        if (eS) {
          console.error(eS);
        } else if (mounted) {
          setDidSaveSet(new Set((mySaves ?? []).map(r => (r as any).recipe_id as string)));
        }

        // 5) BOOKMARK COUNTS for recipes I own (fetch rows, aggregate in JS)
        const myOwnedIds = recipes.filter(r => r.user_id === uid).map(r => r.id);
        if (myOwnedIds.length > 0) {
          const { data: bmRows, error: eBM } = await supabase
            .from('recipe_bookmarks')
            .select('recipe_id')
            .in('recipe_id', myOwnedIds);

          if (eBM) {
            console.error(eBM);
          } else if (mounted) {
            const map: Record<string, number> = {};
            for (const row of bmRows ?? []) {
              const rid = (row as any).recipe_id as string;
              map[rid] = (map[rid] ?? 0) + 1;
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
    if (loading) return <p className="text-sm text-gray-600">Loading public recipes…</p>;
    if (!rows.length) return <p className="text-sm text-gray-600">No public recipes yet.</p>;

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
              // Pass ingredients here when you have them
              instructions={r.instructions}
              created_at={r.created_at}
              author={author ?? null}
              currentUserId={currentUserId ?? null}
              initialHeartCount={heartCounts[r.id] ?? 0}
              initialDidHeart={didHeartSet.has(r.id)}
              initialDidSave={didSaveSet.has(r.id)}
              initialBookmarkCountForOwner={
                r.user_id === currentUserId ? (ownerBookmarkCounts[r.id] ?? 0) : undefined
              }
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
