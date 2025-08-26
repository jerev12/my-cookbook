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
};

export default function PublicRecipesFeed() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [heartCounts, setHeartCounts] = useState<Record<string, number>>({});
  const [didHeartSet, setDidHeartSet] = useState<Set<string>>(new Set());
  const [didSaveSet, setDidSaveSet] = useState<Set<string>>(new Set());
  const [ownerBookmarkCounts, setOwnerBookmarkCounts] = useState<Record<string, number>>({});
  const [debugErr, setDebugErr] = useState<string | null>(null);

  // Which Supabase project is this build talking to?
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setDebugErr(null);

      // 1) Who’s the viewer?
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr && mounted) {
        console.error('auth.getUser error', authErr);
        setDebugErr(`auth.getUser: ${authErr.message ?? String(authErr)}`);
      }
      const uid = authData?.user?.id ?? null;
      if (!mounted) return;
      setCurrentUserId(uid);

      // 2) Fetch PUBLIC recipes (no embed)
      const { data: recs, error: e1 } = await supabase
        .from('recipes')
        .select('id, user_id, title, cuisine, photo_url, instructions, created_at, visibility')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(60);

      if (e1) {
        console.error('recipes error', e1);
        if (mounted) {
          setDebugErr(`recipes select: ${e1.code ?? ''} ${e1.message ?? String(e1)}`);
          setLoading(false);
        }
        return;
      }

      const recipes = (recs ?? []) as RecipeRow[];
      if (!mounted) return;
      setRows(recipes);

      const recipeIds = recipes.map(r => r.id);
      const authorIds = Array.from(new Set(recipes.map(r => r.user_id)));

      // If nothing to do, stop early
      if (recipeIds.length === 0) {
        if (mounted) setLoading(false);
        return;
      }

      // 3) Load author profiles in one call
      if (authorIds.length > 0) {
        const { data: profs, error: pe } = await supabase
          .from('profiles')
          .select('id, display_name, nickname, avatar_url')
          .in('id', authorIds);

        if (pe) {
          console.error('profiles error', pe);
          if (mounted) setDebugErr(prev => prev ?? `profiles: ${pe.message ?? String(pe)}`);
        } else if (mounted) {
          const map: Record<string, Profile> = {};
          for (const p of (profs ?? []) as Profile[]) map[p.id] = p;
          setProfilesMap(map);
        }
      }

      // 4) HEART COUNTS (fetch rows, aggregate in JS)
      {
        const { data: heartRows, error } = await supabase
          .from('recipe_hearts')
          .select('recipe_id')
          .in('recipe_id', recipeIds);

        if (error) {
          console.error('heart rows error', error);
          if (mounted) setDebugErr(prev => prev ?? `heart rows: ${error.message ?? String(error)}`);
        } else if (mounted) {
          const map: Record<string, number> = {};
          for (const row of heartRows ?? []) {
            const rid = (row as any).recipe_id as string;
            map[rid] = (map[rid] ?? 0) + 1;
          }
          setHeartCounts(map);
        }
      }

      // 5) Viewer-specific hearts & saves
      if (uid) {
        // did I heart?
        const { data: myHearts, error: eH } = await supabase
          .from('recipe_hearts')
          .select('recipe_id')
          .eq('user_id', uid)
          .in('recipe_id', recipeIds);
        if (eH) {
          console.error('myHearts error', eH);
          if (mounted) setDebugErr(prev => prev ?? `myHearts: ${eH.message ?? String(eH)}`);
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
          console.error('mySaves error', eS);
          if (mounted) setDebugErr(prev => prev ?? `mySaves: ${eS.message ?? String(eS)}`);
        } else if (mounted) {
          setDidSaveSet(new Set((mySaves ?? []).map(r => (r as any).recipe_id as string)));
        }

        // 6) BOOKMARK COUNTS for recipes I own (aggregate in JS)
        const myOwnedIds = recipes.filter(r => r.user_id === uid).map(r => r.id);
        if (myOwnedIds.length > 0) {
          const { data: bmRows, error: eBM } = await supabase
            .from('recipe_bookmarks')
            .select('recipe_id')
            .in('recipe_id', myOwnedIds);

          if (eBM) {
            console.error('bookmark rows error', eBM);
            if (mounted) setDebugErr(prev => prev ?? `bookmark rows: ${eBM.message ?? String(eBM)}`);
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
          const p = profilesMap[r.user_id] || null;
          const author = p
            ? {
                id: p.id,
                display_name: p.display_name,
                nickname: p.nickname,
                avatar_url: p.avatar_url,
              }
            : undefined;

          return (
            <RecipeCard
              key={r.id}
              id={r.id}
              title={r.title}
              cuisine={r.cuisine}
              photo_url={r.photo_url}
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
  }, [loading, rows, profilesMap, currentUserId, heartCounts, didHeartSet, didSaveSet, ownerBookmarkCounts]);

  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold mb-1">Community — Public Recipes</h1>

      {/* Debug strip */}
      <p className="text-[11px] text-gray-500 mb-1 break-all">supabase: {SUPA_URL}</p>
      <p className="text-[11px] text-gray-500 mb-1">
        viewer: {currentUserId ?? 'anon'} • recipes: {rows.length}
      </p>
      {debugErr && (
        <p className="text-[11px] text-rose-600 mb-2">{debugErr}</p>
      )}

      {content}
    </main>
  );
}
