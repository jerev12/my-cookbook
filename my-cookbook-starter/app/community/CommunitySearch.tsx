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
  visibility: 'public' | 'friends' | 'private' | string;
  user_id: string;
  photo_url: string | null;
};

type FriendRelation = 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';

const PAGE_SIZE = 20;

export default function CommunitySearch() {
  const [tab, setTab] = useState<TabKey>('recipes');

  // search + filters
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 300);
  const queryActive = debouncedQ.trim().length > 0; // 👈 only search after typing
  const [cuisineFilter, setCuisineFilter] = useState<string>('');

  // paging
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // data
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // me
  const [myId, setMyId] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<Record<string, FriendRelation>>({});

  const abortRef = useRef<AbortController | null>(null);

  // get current user id
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMyId(data.user?.id ?? null);
    })();
  }, []);

  // reset page when inputs change
  useEffect(() => {
    setPage(0);
  }, [tab, debouncedQ, cuisineFilter]);

  // fetch when deps change, but only after user typed something
  useEffect(() => {
    if (!queryActive) {
      // clear lists when there is no query
      setUsers([]);
      setRecipes([]);
      setHasMore(false);
      setErrMsg(null);
      setLoading(false);
      return;
    }
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debouncedQ, page, cuisineFilter, myId, queryActive]);

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

        // batch fetch friendship statuses
        if (rows.length > 0) {
          const ids = rows.map(u => u.id);
          const { data: statuses, error: sErr } = await supabase.rpc('get_friend_statuses', {
            target_ids: ids,
          } as any);
          if (sErr) throw sErr;

          const map: Record<string, FriendRelation> = {};
          (statuses ?? []).forEach((r: { target_id: string; relation: FriendRelation }) => {
            map[r.target_id] = r.relation;
          });
          setFriendStatus(map);
        } else {
          setFriendStatus({});
        }

        setRecipes([]);
      } else {
        // RECIPES (includes your own; RLS controls visibility)
        const { data, error } = await supabase.rpc('search_recipes', {
          q: debouncedQ || null,
          limit_count: PAGE_SIZE,
          offset_count: page * PAGE_SIZE,
          cuisine_filter: cuisineFilter || null,
        });
        if (error) throw error;

        const rows = (data as RecipeRow[]) ?? [];
        setRecipes(rows);
        setHasMore(rows.length === PAGE_SIZE);
        setUsers([]);
        setFriendStatus({});
      }
    } catch (err: any) {
      console.error(err);
      setErrMsg(err?.message ?? 'Something went wrong while searching.');
    } finally {
      setLoading(false);
    }
  }

  // --- Friend actions ---
  async function handleToggleRequest(targetId: string, relation: FriendRelation) {
    try {
      if (relation === 'none') {
        const { error } = await supabase.rpc('request_friend', { target_id: targetId });
        if (error) throw error;
      } else if (relation === 'pending_outgoing') {
        // cancel outgoing request
        const { error } = await supabase.rpc('unfriend', { target_id: targetId });
        if (error) throw error;
      } else {
        return; // pending_incoming/friends handled elsewhere
      }
      await refreshStatus([targetId]);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleUnfriend(targetId: string) {
    try {
      const { error } = await supabase.rpc('unfriend', { target_id: targetId });
      if (error) throw error;
      await refreshStatus([targetId]);
    } catch (e) {
      console.error(e);
    }
  }

  async function refreshStatus(ids: string[]) {
    const { data: statuses, error } = await supabase.rpc('get_friend_statuses', { target_ids: ids } as any);
    if (error) return;
    setFriendStatus(prev => {
      const copy = { ...prev };
      (statuses ?? []).forEach((r: { target_id: string; relation: FriendRelation }) => {
        copy[r.target_id] = r.relation;
      });
      return copy;
    });
  }

  return (
    /* Full-width container with mobile padding so input spans the screen nicely */
    <div className="w-full px-4 sm:px-6 py-4 max-w-screen-sm mx-auto">
      <h1 className="text-2xl font-semibold mb-3">Community</h1>

      {/* Segmented tabs above search (compact bottom-tabs look) */}
      <div
        role="tablist"
        aria-label="Search type"
        className="mb-2 inline-flex rounded-full border bg-white p-1 text-sm"
      >
        <button
          role="tab"
          aria-selected={tab === 'recipes'}
          className={`px-3 py-1.5 rounded-full transition-colors ${
            tab === 'recipes' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setTab('recipes')}
        >
          Recipes
        </button>
        <button
          role="tab"
          aria-selected={tab === 'users'}
          className={`px-3 py-1.5 rounded-full transition-colors ${
            tab === 'users' ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
          onClick={() => setTab('users')}
        >
          Users
        </button>
      </div>

      {/* Search + (optional) cuisine filter */}
      <div className="mb-4 flex items-center gap-2">
        <input
          className="block w-full rounded-lg border px-3 py-2"
          placeholder={tab === 'users' ? 'Search people by name or nickname…' : 'Search recipes by title, cuisine, or instructions…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {tab === 'recipes' && (
          <select
            className="rounded-lg border px-2 py-2 text-sm"
            value={cuisineFilter}
            onChange={(e) => setCuisineFilter(e.target.value)}
            aria-label="Filter by cuisine"
            disabled={!queryActive} // filter only active when searching
          >
            <option value="">All cuisines</option>
            <option value="Italian">Italian</option>
            <option value="Mexican">Mexican</option>
            <option value="Indian">Indian</option>
            <option value="Chinese">Chinese</option>
          </select>
        )}
      </div>

      {/* If no query yet, show a gentle prompt and stop here */}
      {!queryActive ? (
        <div className="text-sm text-gray-500">
          Start typing above to search {tab === 'users' ? 'for people' : 'for recipes'}.
        </div>
      ) : (
        <>
          {/* Status/Error */}
          {loading && <div className="text-sm text-gray-500">Searching…</div>}
          {!loading && errMsg && <div className="text-sm text-red-600">{errMsg}</div>}

          {/* Users — compact friend-list style */}
          {!loading && !errMsg && tab === 'users' && (
            <div className="space-y-2">
              {users.length === 0 ? (
                <div className="text-sm text-gray-500">No users found.</div>
              ) : (
                users.map((p) => {
                  const relation = friendStatus[p.id] ?? 'none';
                  const isMe = myId === p.id;

                  let actionEl: JSX.Element = <span className="text-xs text-gray-500">You</span>;
                  if (!isMe) {
                    if (relation === 'none' || relation === 'pending_outgoing') {
                      actionEl = (
                        <button
                          className={`rounded border px-2 py-1 text-xs ${
                            relation === 'pending_outgoing' ? 'bg-gray-900 text-white' : ''
                          }`}
                          onClick={() => handleToggleRequest(p.id, relation)}
                          aria-pressed={relation === 'pending_outgoing'}
                          title={relation === 'pending_outgoing' ? 'Tap to cancel request' : 'Add Friend'}
                        >
                          {relation === 'pending_outgoing' ? 'Requested' : 'Add Friend'}
                        </button>
                      );
                    } else if (relation === 'pending_incoming') {
                      // requested YOU — show as Requested (read-only on search page)
                      actionEl = (
                        <button className="rounded border px-2 py-1 text-xs opacity-60 cursor-default" disabled>
                          Requested
                        </button>
                      );
                    } else {
                      // friends → tap to unfriend
                      actionEl = (
                        <button
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => handleUnfriend(p.id)}
                          title="Unfriend"
                        >
                          Friend
                        </button>
                      );
                    }
                  }

                  return (
                    <div key={p.id} className="flex items-center justify-between rounded border p-2">
                      <Link href={`/profiles/${p.id}`} className="flex items-center gap-2 min-w-0">
                        {/* tiny avatar 24x24 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.avatar_url ?? '/avatar-placeholder.png'}
                          alt={p.display_name ?? 'user'}
                          className="h-6 w-6 rounded-full object-cover"
                        />
                        <div className="truncate text-sm">
                          <span className="truncate">{p.display_name ?? 'Unknown'}</span>
                          {p.nickname ? <span className="ml-1 text-gray-500">({p.nickname})</span> : null}
                        </div>
                      </Link>
                      {actionEl}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Recipes — card grid */}
          {!loading && !errMsg && tab === 'recipes' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {recipes.length === 0 ? (
                <div className="text-sm text-gray-500">No recipes found.</div>
              ) : (
                recipes.map((r) => (
                  <Link
                    key={r.id}
                    href={`/recipes/${r.id}`}
                    className="block rounded border overflow-hidden hover:shadow"
                  >
                    {r.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photo_url} alt={r.title} className="h-36 w-full object-cover" />
                    ) : (
                      <div className="h-36 w-full bg-gray-100" />
                    )}
                    <div className="p-3">
                      <div className="font-medium">{r.title}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {r.cuisine ?? '—'}
                        {r.visibility !== 'public' && (
                          <span className="ml-2 rounded bg-gray-200 px-1 py-0.5 text-[10px] uppercase tracking-wide">
                            {r.visibility}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}

          {/* Pager */}
          {!loading && (users.length > 0 || recipes.length > 0) && (
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
          )}
        </>
      )}
    </div>
  );
}

/** debounce helper */
function useDebounce<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
