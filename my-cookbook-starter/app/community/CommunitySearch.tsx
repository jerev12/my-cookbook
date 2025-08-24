'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type TabKey = 'recipes' | 'users';

type Profile = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
};

type RecipeRow = {
  id: string;
  title: string;
  cuisine: string | null;
  visibility: 'public' | 'friends' | 'private' | string; // rpc returns text
  user_id: string; // author id
};

type RecipeUI = RecipeRow & {
  author: Pick<Profile, 'id' | 'display_name' | 'nickname' | 'avatar_url'> | null;
};

const PAGE_SIZE = 20;

export default function CommunitySearch() {
  const [tab, setTab] = useState<TabKey>('recipes');

  // search + filters
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 300);
  const [cuisineFilter, setCuisineFilter] = useState<string>('');

  // paging
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // data
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [recipes, setRecipes] = useState<RecipeUI[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // cancel in‑flight requests on rapid changes
  const abortRef = useRef<AbortController | null>(null);

  // reset page when inputs change
  useEffect(() => {
    setPage(0);
  }, [tab, debouncedQ, cuisineFilter]);

  // fetch when dependencies change
  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debouncedQ, page, cuisineFilter]);

  async function fetchData() {
    setLoading(true);
    setErrMsg(null);

    // cancel any in-flight call
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (tab === 'users') {
        // USERS
        const { data, error } = await supabase.rpc('search_users', {
          q: debouncedQ || null,
          limit_count: PAGE_SIZE,
          offset_count: page * PAGE_SIZE,
        });
        if (error) throw error;

        const rows = (data as Profile[]) ?? [];
        setUsers(rows);
        setHasMore(rows.length === PAGE_SIZE);
        setRecipes([]); // clear other tab
      } else {
        // RECIPES
        const { data, error } = await supabase.rpc('search_recipes', {
          q: debouncedQ || null,
          limit_count: PAGE_SIZE,
          offset_count: page * PAGE_SIZE,
          cuisine_filter: cuisineFilter || null,
        });
        if (error) throw error;

        const rows = (data as RecipeRow[]) ?? [];
        if (rows.length === 0) {
          setRecipes([]);
          setHasMore(false);
          setUsers([]);
          return;
        }

        // hydrate authors in one go
        const authorIds = Array.from(new Set(rows.map(r => r.user_id)));
        const { data: authors, error: aErr } = await supabase
          .from('profiles')
          .select('id, display_name, nickname, avatar_url')
          .in('id', authorIds);
        if (aErr) throw aErr;

        const byId = new Map<string, Profile>((authors ?? []).map(a => [a.id, a as Profile]));
        const cooked: RecipeUI[] = rows.map(r => ({
          ...r,
          author: byId.get(r.user_id) ?? null,
        }));

        setRecipes(cooked);
        setHasMore(cooked.length === PAGE_SIZE);
        setUsers([]); // clear other tab
      }
    } catch (err: any) {
      console.error(err);
      setErrMsg(err?.message ?? 'Something went wrong while searching.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-2xl font-semibold mb-4">Community</h1>

      {/* Tabs */}
      <div className="mb-3 flex gap-2">
        <button
          className={`px-3 py-1 rounded ${tab === 'recipes' ? 'bg-black text-white' : 'bg-gray-200'}`}
          onClick={() => setTab('recipes')}
        >
          Recipes
        </button>
        <button
          className={`px-3 py-1 rounded ${tab === 'users' ? 'bg-black text-white' : 'bg-gray-200'}`}
          onClick={() => setTab('users')}
        >
          Users
        </button>
      </div>

      {/* Search + filter */}
      <div className="mb-4 flex items-center gap-2">
        <input
          className="w-full rounded border px-3 py-2"
          placeholder={tab === 'users' ? 'Search people by name or nickname…' : 'Search recipes by title, cuisine, or instructions…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {tab === 'recipes' && (
          <select
            className="rounded border px-2 py-2 text-sm"
            value={cuisineFilter}
            onChange={(e) => setCuisineFilter(e.target.value)}
            aria-label="Filter by cuisine"
          >
            <option value="">All cuisines</option>
            {/* Optional: replace with dynamic list from your DB */}
            <option value="Italian">Italian</option>
            <option value="Mexican">Mexican</option>
            <option value="Indian">Indian</option>
            <option value="Chinese">Chinese</option>
          </select>
        )}
      </div>

      {/* Status/Error */}
      {loading && <div className="text-sm text-gray-500">Searching…</div>}
      {!loading && errMsg && <div className="text-sm text-red-600">{errMsg}</div>}

      {/* Users */}
      {!loading && !errMsg && tab === 'users' && (
        <div className="space-y-3">
          {users.length === 0 ? (
            <div className="text-sm text-gray-500">No users found.</div>
          ) : (
            users.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded border p-3">
                <Link href={`/profiles/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.avatar_url ?? '/avatar-placeholder.png'}
                    alt={p.display_name ?? 'user'}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <div className="truncate">
                    <div className="font-medium truncate">
                      {p.display_name ?? 'Unknown'}
                      {p.nickname ? <span className="ml-2 text-xs text-gray-500">({p.nickname})</span> : null}
                    </div>
                  </div>
                </Link>
                {/* Keep actions outside the link */}
                <button className="rounded border px-3 py-1 text-sm">Add Friend</button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Recipes */}
      {!loading && !errMsg && tab === 'recipes' && (
        <div className="space-y-3">
          {recipes.length === 0 ? (
            <div className="text-sm text-gray-500">No recipes found.</div>
          ) : (
            recipes.map((r) => (
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
                    {r.visibility !== 'public' && (
                      <span className="ml-2 rounded bg-gray-200 px-1 py-0.5 text-[10px] uppercase tracking-wide">
                        {r.visibility}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Pager */}
      <div className="mt-4 flex items-center justify-between">
        <button
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </button>
        <div className="text-xs text-gray-500">Page {page + 1}</div>
        <button
          className="rounded border px-3 py-1 text-sm disabled:opacity-50"
          disabled={!hasMore}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** Small debounce helper to avoid spamming the DB */
function useDebounce<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
