'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import Modal from '@/components/Modal';
import RecipeCard from '@/components/RecipeCard';

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
  created_at: string | null;
  photo_url: string | null;         // we’ll pass through if present
  instructions: string | null;      // for detail view fallback if needed
  visibility: string;
};

export default function PublicRecipesFeed() {
  // List state
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  // Modal/detail state
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [detailRecipe, setDetailRecipe] = useState<RecipeRow | null>(null);
  const [detailAuthor, setDetailAuthor] = useState<Profile | null>(null);

  // Pre-hydrated card meta
  const [initialHeartCount, setInitialHeartCount] = useState<number>(0);
  const [initialDidHeart, setInitialDidHeart] = useState<boolean>(false);
  const [initialDidSave, setInitialDidSave] = useState<boolean>(false);
  const [initialBookmarkCountForOwner, setInitialBookmarkCountForOwner] = useState<number | undefined>(undefined);

  // -------------------- Load the list (titles + author display names) --------------------
  useEffect(() => {
    let mounted = true;

    async function loadList() {
      setLoading(true);

      // 1) Public recipes (light, list-friendly fields)
      const { data: recs } = await supabase
        .from('recipes')
        .select('id, user_id, title, cuisine, photo_url, instructions, created_at, visibility')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(120);

      const recipes = (recs ?? []) as RecipeRow[];
      if (!mounted) return;
      setRows(recipes);

      // 2) Authors (display name / nickname) — single query for all authors
      const authorIds = Array.from(new Set(recipes.map(r => r.user_id)));
      if (authorIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, nickname, avatar_url')
          .in('id', authorIds);
        if (mounted) {
          const map: Record<string, Profile> = {};
          for (const p of (profs ?? []) as Profile[]) map[p.id] = p;
          setProfilesMap(map);
        }
      } else {
        if (mounted) setProfilesMap({});
      }

      setLoading(false);
    }

    loadList();
    return () => { mounted = false; };
  }, []);

  // -------------------- On click: load detail for modal --------------------
  async function openRecipe(id: string) {
    setSelectedId(id);
    setOpen(true);
    setDetailLoading(true);

    // Who is viewing?
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id ?? null;
    setCurrentUserId(uid);

    // Recipe row (ensure we have fresh detail fields)
    const { data: recs } = await supabase
      .from('recipes')
      .select('id, user_id, title, cuisine, photo_url, instructions, created_at, visibility')
      .eq('id', id)
      .limit(1);
    const row = (recs?.[0] as RecipeRow) ?? null;
    setDetailRecipe(row);

    // Author
    if (row) {
      const existing = profilesMap[row.user_id];
      if (existing) {
        setDetailAuthor(existing);
      } else {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, nickname, avatar_url')
          .eq('id', row.user_id)
          .limit(1);
        setDetailAuthor((profs?.[0] as Profile) ?? null);
      }
    } else {
      setDetailAuthor(null);
    }

    // Heart count
    if (row) {
      const { data: heartRows } = await supabase
        .from('recipe_hearts')
        .select('recipe_id')
        .eq('recipe_id', row.id);
      setInitialHeartCount((heartRows ?? []).length);

      // did I heart/save?
      if (uid) {
        const { data: myHeart } = await supabase
          .from('recipe_hearts')
          .select('recipe_id')
          .eq('recipe_id', row.id)
          .eq('user_id', uid)
          .limit(1);
        setInitialDidHeart(!!myHeart?.length);

        const { data: mySave } = await supabase
          .from('recipe_bookmarks')
          .select('recipe_id')
          .eq('recipe_id', row.id)
          .eq('user_id', uid)
          .limit(1);
        setInitialDidSave(!!mySave?.length);

        // owner-only bookmark count
        if (row.user_id === uid) {
          const { data: bmRows } = await supabase
            .from('recipe_bookmarks')
            .select('recipe_id')
            .eq('recipe_id', row.id);
          setInitialBookmarkCountForOwner((bmRows ?? []).length);
        } else {
          setInitialBookmarkCountForOwner(undefined);
        }
      } else {
        setInitialDidHeart(false);
        setInitialDidSave(false);
        setInitialBookmarkCountForOwner(undefined);
      }
    } else {
      setInitialHeartCount(0);
      setInitialDidHeart(false);
      setInitialDidSave(false);
      setInitialBookmarkCountForOwner(undefined);
    }

    setDetailLoading(false);
  }

  function closeModal() {
    setOpen(false);
    // optional: clear detail state to free memory
    // setSelectedId(null);
    // setDetailRecipe(null);
    // setDetailAuthor(null);
  }

  const content = useMemo(() => {
    if (loading) return <p className="text-sm text-gray-600">Loading public recipes…</p>;
    if (!rows.length) return <p className="text-sm text-gray-600">No public recipes yet.</p>;

    // Title-only list (similar to My Cookbook)
    return (
      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
        {rows.map((r) => {
          const author = profilesMap[r.user_id];
          const byline = author?.display_name || author?.nickname || 'Unknown user';
          return (
            <li key={r.id} className="p-3 hover:bg-gray-50 transition">
              <button
                type="button"
                onClick={() => openRecipe(r.id)}
                className="block w-full text-left"
                aria-label={`Open ${r.title}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="font-semibold text-gray-900 truncate">{r.title}</span>
                  <span className="text-xs text-gray-500">
                    {r.cuisine ? `${r.cuisine} • ` : ''}by {byline}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }, [loading, rows, profilesMap]);

  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold mb-4">Community — Public Recipes</h1>
      {content}

      {/* Modal using your existing component */}
      <Modal
        open={open}
        onClose={closeModal}
        title={
          selectedId && detailRecipe
            ? (
              <span className="inline-flex items-center gap-2">
                <span>Recipe</span>
                <Link
                  href={`/recipes/${selectedId}`}
                  className="text-xs text-blue-600 hover:underline"
                  // This lets users open the full page (shareable) if they prefer
                >
                  Open full page →
                </Link>
              </span>
            )
            : 'Recipe'
        }
      >
        {detailLoading && <p className="text-sm text-gray-600">Loading…</p>}
        {!detailLoading && !detailRecipe && (
          <p className="text-sm text-gray-600">Recipe not found or not visible.</p>
        )}
        {!detailLoading && detailRecipe && (
          <div className="max-w-2xl">
            <RecipeCard
              id={detailRecipe.id}
              title={detailRecipe.title}
              cuisine={detailRecipe.cuisine}
              photo_url={detailRecipe.photo_url}
              instructions={detailRecipe.instructions}
              created_at={detailRecipe.created_at}
              author={
                detailAuthor
                  ? {
                      id: detailAuthor.id,
                      display_name: detailAuthor.display_name,
                      nickname: detailAuthor.nickname,
                      avatar_url: detailAuthor.avatar_url,
                    }
                  : null
              }
              currentUserId={currentUserId}
              initialHeartCount={initialHeartCount}
              initialDidHeart={initialDidHeart}
              initialDidSave={initialDidSave}
              initialBookmarkCountForOwner={initialBookmarkCountForOwner}
            />
          </div>
        )}
      </Modal>
    </main>
  );
}
