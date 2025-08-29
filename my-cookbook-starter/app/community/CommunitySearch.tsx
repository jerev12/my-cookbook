'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

// 👉 Update this path if your modal is somewhere else:
const RecipeModal = dynamic(() => import('@/components/RecipeModal'), { ssr: false });

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
  const queryActive = debouncedQ.trim().length > 0; // only search after typing
  const [cuisineFilter, setCuisineFilter] = useState<string>('');

  // paging
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // data
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // me / friendships
  const [myId, setMyId] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<Record<string, FriendRelation>>({});

  // recipe modal
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // current user id
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

  // fetch when deps change (but only after user typed something)
  useEffect(() => {
    if (!queryActive) {
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

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (tab === 'users') {
        const { data, error } = await supabase.rpc('search_users', {
          q: debouncedQ || null,
          limit_count: PAGE_SIZE,
          offset_count: page * PAGE_SIZE,
        });
        if (error) throw error;

        const rows = (data as Profile[]) ?? [];
        setUsers(rows);
        setHasMore(rows.length === PAGE_SIZE);

        // friendship statuses
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

  // friend actions
  async function handleToggleRequest(targetId: string, relation: FriendRelation) {
    try {
      // Optimistic UI first
      setFriendStatus(prev => ({
        ...prev,
        [targetId]: relation === 'none' ? 'pending_outgoing' : 'none',
      }));

      if (relation === 'none') {
        const { error } = await supabase.rpc('request_friend', { target_id: targetId });
        if (error) throw error;
      } else if (relation === 'pending_outgoing') {
        const { error } = await supabase.rpc('unfriend', { target_id: targetId }); // cancel
        if (error) throw error;
      } else {
        return;
      }

      await refreshStatus([targetId]);
    } catch (e: any) {
      console.error(e);
      setFriendStatus(prev => ({ ...prev, [targetId]: relation })); // revert
      alert(e?.message ?? 'Failed to update friend request.');
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

  // ------- STYLES (inline, typed with CSSProperties) -------
  const S = {
    container: {
      width: '100%',
      maxWidth: 640,
      margin: '0 auto',
      padding: '16px',
      boxSizing: 'border-box' as const,
    },
    h1: { fontSize: 22, fontWeight: 600, margin: '0 0 12px 0' } as CSSProperties,
    pillsWrap: {
      display: 'inline-flex',
      gap: 4,
      padding: 4,
      border: '1px solid #e5e7eb',
      borderRadius: 9999,
      background: '#fff',
      marginBottom: 8,
    } as CSSProperties,
    pill: (active: boolean): CSSProperties => ({
      padding: '6px 12px',
      borderRadius: 9999,
      border: 'none',
      background: active ? '#111827' : 'transparent',
      color: active ? '#fff' : '#374151',
      fontSize: 14,
      cursor: 'pointer',
    }),
    row: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 } as CSSProperties,
    input: {
      display: 'block',
      width: '100%',
      padding: '10px 12px',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      boxSizing: 'border-box',
      fontSize: 14,
      minWidth: 0,
    } as CSSProperties,
    select: {
      padding: '10px 10px',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      fontSize: 12,
      background: '#fff',
    } as CSSProperties,
    hint: { color: '#6b7280', fontSize: 13 } as CSSProperties,

    // Cookbook-like cards
    cardList: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: 12,
    } as CSSProperties,
    // Button-like clickable card (for modal)
    cardButton: {
      display: 'block',
      width: '100%',
      textAlign: 'left' as const,
      padding: 0,
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      background: '#fff',
      overflow: 'hidden',
      cursor: 'pointer',
    } as CSSProperties,
    image: {
      width: '100%',
      height: 168,
      objectFit: 'cover',
      background: '#f3f4f6',
      display: 'block',
    } as CSSProperties,
    cardBody: { padding: 12 } as CSSProperties,
    title: {
      fontWeight: 600,
      fontSize: 15,
      lineHeight: 1.25,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    } as CSSProperties,
    metaRow: {
      marginTop: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    } as CSSProperties,
    chip: {
      display: 'inline-block',
      fontSize: 11,
      lineHeight: 1,
      padding: '6px 8px',
      borderRadius: 9999,
      background: '#f3f4f6',
      color: '#374151',
    } as CSSProperties,
    badge: {
      display: 'inline-block',
      fontSize: 10,
      lineHeight: 1,
      padding: '5px 8px',
      borderRadius: 6,
      background: '#eef2ff',
      color: '#3730a3',
      textTransform: 'uppercase' as const,
      letterSpacing: 0.4,
    } as CSSProperties,

    // Users list
    userRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      border: '1px solid #e5e7eb',
      borderRadius: 8,
      padding: 8,
      gap: 8,
    } as CSSProperties,
    userLeft: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 } as CSSProperties,
    avatar: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' as const } as CSSProperties,
    name: {
      fontSize: 14,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    } as CSSProperties,
    btn: {
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      padding: '6px 8px',
      background: '#fff',
      fontSize: 12,
      cursor: 'pointer',
    } as CSSProperties,
    btnDark: {
      border: '1px solid #111827',
      background: '#111827',
      color: '#fff',
    } as CSSProperties,
    btnDisabled: {
      opacity: 0.6,
      cursor: 'default',
    } as CSSProperties,

    pager: { marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } as CSSProperties,
    pagerBtn: {
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      padding: '6px 10px',
      fontSize: 12,
      cursor: 'pointer',
    } as CSSProperties,
    pagerBtnDisabled: { opacity: 0.5, cursor: 'default' } as CSSProperties,
    pageText: { fontSize: 12, color: '#6b7280' } as CSSProperties,
    error: { color: '#dc2626', fontSize: 13 } as CSSProperties,
  };

  return (
    <div style={S.container}>
      <h1 style={S.h1}>Community</h1>

      {/* Segmented tabs above search */}
      <div role="tablist" aria-label="Search type" style={S.pillsWrap}>
        <button
          role="tab"
          aria-selected={tab === 'recipes'}
          style={S.pill(tab === 'recipes')}
          onClick={() => setTab('recipes')}
        >
        {/* order chosen for your default */}
          Recipes
        </button>
        <button
          role="tab"
          aria-selected={tab === 'users'}
          style={S.pill(tab === 'users')}
          onClick={() => setTab('users')}
        >
          Users
        </button>
      </div>

      {/* Search row */}
      <div style={S.row}>
        <input
          style={S.input}
          placeholder={tab === 'users' ? 'Search people by name…' : 'Search recipes by title, cuisine, or instructions…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {tab === 'recipes' && (
          <select
            style={{ ...S.select, opacity: queryActive ? 1 : 0.6 }}
            value={cuisineFilter}
            onChange={(e) => setCuisineFilter(e.target.value)}
            aria-label="Filter by cuisine"
            disabled={!queryActive}
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
        <div style={S.hint}>
          Start typing above to search {tab === 'users' ? 'for people' : 'for recipes'}.
        </div>
      ) : (
        <>
          {loading && <div style={S.hint}>Searching…</div>}
          {!loading && errMsg && <div style={S.error}>{errMsg}</div>}

          {/* Users list */}
          {!loading && !errMsg && tab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.length === 0 ? (
                <div style={S.hint}>No users found.</div>
              ) : (
                users.map((p) => {
                  const relation = friendStatus[p.id] ?? 'none';
                  const isMe = myId === p.id;

                  let actionEl: JSX.Element = <span style={S.hint}>You</span>;
                  if (!isMe) {
                    if (relation === 'none' || relation === 'pending_outgoing') {
                      // toggle: add / cancel
                      actionEl = (
                        <button
                          style={{
                            ...S.btn,
                            ...(relation === 'pending_outgoing' ? S.btnDark : {}),
                            cursor: 'pointer',
                          }}
                          onClick={() => handleToggleRequest(p.id, relation)}
                          aria-pressed={relation === 'pending_outgoing'}
                          title={relation === 'pending_outgoing' ? 'Tap to cancel request' : 'Add Friend'}
                        >
                          {relation === 'pending_outgoing' ? 'Requested' : 'Add Friend'}
                        </button>
                      );
                    } else if (relation === 'pending_incoming') {
                      // read-only here
                      actionEl = (
                        <button style={{ ...S.btn, ...S.btnDisabled }} disabled>
                          Requested
                        </button>
                      );
                    } else {
                      // friends → unfriend
                      actionEl = (
                        <button
                          style={{ ...S.btn, cursor: 'pointer' }}
                          onClick={() => handleUnfriend(p.id)}
                          title="Unfriend"
                        >
                          Friend
                        </button>
                      );
                    }
                  }

                  return (
                    <div key={p.id} style={S.userRow}>
                      <Link href={`/profiles/${p.id}`} style={S.userLeft}>
                        {/* avatar */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.avatar_url ?? '/avatar-placeholder.png'}
                          alt={p.display_name ?? 'user'}
                          style={S.avatar}
                        />
                        <div style={{ minWidth: 0 }}>
                          <span style={S.name}>{p.display_name ?? 'Unknown'}</span>
                        </div>
                      </Link>
                      {actionEl}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Recipes grid (Cookbook-like) */}
          {!loading && !errMsg && tab === 'recipes' && (
            <div style={S.cardList}>
              {recipes.length === 0 ? (
                <div style={S.hint}>No recipes found.</div>
              ) : (
                recipes.map((r) => (
                  <button
                    key={r.id}
                    style={S.cardButton}
                    onClick={() => setOpenRecipeId(r.id)}
                    aria-label={`Open ${r.title}`}
                  >
                    {/* Photo */}
                    {r.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photo_url} alt={r.title} style={S.image} />
                    ) : (
                      <div style={S.image} />
                    )}

                    {/* Body */}
                    <div style={S.cardBody}>
                      <div style={S.title} title={r.title}>
                        {r.title}
                      </div>
                      <div style={S.metaRow}>
                        <span style={S.chip}>{r.cuisine || 'Unknown cuisine'}</span>
                        {r.visibility !== 'public' && (
                          <span style={S.badge}>{String(r.visibility).toUpperCase()}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Pager */}
          {!loading && (users.length > 0 || recipes.length > 0) && (
            <div style={S.pager}>
              <button
                style={{ ...S.pagerBtn, ...(page === 0 ? S.pagerBtnDisabled : {}) }}
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <div style={S.pageText}>Page {page + 1}</div>
              <button
                style={{ ...S.pagerBtn, ...(!hasMore ? S.pagerBtnDisabled : {}) }}
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Recipe Modal */}
      {openRecipeId && (
        <RecipeModal
          recipeId={openRecipeId}
          onClose={() => setOpenRecipeId(null)}
        />
      )}
    </div>
  );
}

function useDebounce<T>(value: T, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
