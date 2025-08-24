'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Profile = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
};

type Recipe = {
  id: string;
  title: string;
  cuisine: string | null;
  visibility: string;
  user_id: string;
  photo_url: string | null;
  instructions: string;
};

export default function PublicRecipesFeed() {
  const [recipes, setRecipes] = useState<(Recipe & { author: Profile | null })[]>([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetchPublicRecipes();
  }, []);

  async function fetchPublicRecipes() {
    setLoading(true);
    setErrMsg(null);
    try {
      const { data: recipes, error } = await supabase
        .from('recipes')
        .select('id, title, cuisine, visibility, user_id, photo_url, instructions')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const authorIds = Array.from(new Set((recipes ?? []).map(r => r.user_id)));
      const { data: authors, error: aErr } = await supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url')
        .in('id', authorIds);

      if (aErr) throw aErr;

      const byId = new Map<string, Profile>((authors ?? []).map(a => [a.id, a as Profile]));
      const merged = (recipes ?? []).map(r => ({ ...r, author: byId.get(r.user_id) ?? null }));
      setRecipes(merged);
    } catch (err: any) {
      setErrMsg(err.message ?? 'Error loading recipes.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-lg font-semibold mb-3">Latest Public Recipes</h2>

      {loading && <div className="text-sm text-gray-500">Loading…</div>}
      {errMsg && <div className="text-sm text-red-600">{errMsg}</div>}

      {!loading && !errMsg && recipes.length === 0 && (
        <div className="text-sm text-gray-500">No public recipes yet.</div>
      )}

      <div className="space-y-3">
        {recipes.map(r => (
          <div key={r.id} className="rounded border p-3">
            <div className="flex items-center justify-between gap-3">
              <Link href={`/recipes/${r.id}`} className="font-medium hover:underline">
                {r.title}
              </Link>
              <span className="text-xs rounded bg-gray-100 px-2 py-0.5">{r.cuisine ?? '—'}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.author?.avatar_url ?? '/avatar-placeholder.png'}
                alt={r.author?.display_name ?? 'author'}
                className="h-6 w-6 rounded-full object-cover"
              />
              <div className="text-xs text-gray-600">
                by {r.author?.display_name ?? 'Unknown'}
                {r.author?.nickname ? <span className="ml-1 text-[11px] text-gray-500">({r.author.nickname})</span> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
