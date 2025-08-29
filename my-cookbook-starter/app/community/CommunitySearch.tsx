'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

// ⬇️ Update this path if your modal sits elsewhere
const RecipeModal = dynamic(() => import('../components/RecipeModal'), { ssr: false });

type TabKey = 'recipes' | 'users';

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
  source_url: string | null;
  created_at: string | null;
  visibility?: 'public' | 'friends' | 'private' | string;
};

type FriendRelation = 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';

const PAGE_SIZE = 20;

export default function CommunitySearch() {
  const [tab, setTab] = useState<TabKey>('recipes');

  // search + filters
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 300);
  const queryActive = debouncedQ.trim().length > 0; // only search after typing

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

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRecipe, setModalRecipe] = useState<any>(null);

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
  }, [tab, debouncedQ]);

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
  }, [tab, debouncedQ, page, myId, queryActive]);

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
          cuisine_filter: null, // removed cuisine dropdown per request
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

  // open modal with a fetched recipe object
  async function openRecipe(rid: string) {
    try {
      setModalOpen(true);
      setModalRecipe(null);

      const { data, error } = await supabase
        .from('recipes')
        .select('id,user_id,title,cuisine,photo_url,source_url,created_at')
        .eq('id', rid)
        .single();

      if (error) throw error;
      setModalRecipe(data as any);
    } catch (e: any) {
      console.error(e);
      setErrMsg(e?.message ?? 'Failed to load recipe.');
      setModalOpen(false);
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
    hint: { color: '#6b7280', fontSize: 13 } as CSSProperties,

    // My Cookbook card match
    cardList: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))',
      gap: 12,
    } as CSSProperties,
    cardButton: {
      border: '1px solid #eee',
      borderRadius: 12,
      padding: 10,
      background: '#fff',
      textAlign: 'left' as const,
      cursor: 'pointer',
      width: '100%',
    } as CSSProperties,
    image: {
      width: '100%',
      aspectRatio: '4 / 3',
      objectFit: 'cover',
      borderRadius: 8,
      display: 'block',
      background: '#f3f4f6',
    } as CSSProperties,
    placeholder: {
      width: '100%',
      aspectRatio: '4 / 3',
      borderRadius: 8,
      background:
        'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 37%, #f3f4f6 63%)',
      backgroundSize: '400% 100%',
      animation: 'shimmer 1.4s ease infinite',
    } as CSSProperties,
    rTitle: { fontWeight: 600, marginTop: 6, fontSize: 14 } as CSSProperties,
    rCuisine: { color: '#666', fontSize: 12 } as CSSProperties,

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
    userLeftLink: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
      textDecoration: 'none',     // <-- remove link look
      color: '#111827',           // <-- neutral dark
    } as CSSProperties,
    avatar: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' as const } as CSSProperties,
    name: {
      fontSize: 14,
      fontWeight: 600,            // <-- more “official”
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
        {/* Cuisine dropdown removed as requested */}
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
                      <Link href={`/profiles/${p.id}`} style={S.userLeftLink}>
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

          {/* Recipes grid — matches My Cookbook */}
          {!loading && !errMsg && tab === 'recipes' && (
            <div style={S.cardList}>
              {recipes.length === 0 ? (
                <div style={S.hint}>No recipes found.</div>
              ) : (
                recipes.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => openRecipe(r.id)}
                    style={S.cardButton}
                    aria-label={`Open ${r.title}`}
                  >
                    {/* Photo / placeholder to guarantee layout */}
                    {r.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.photo_url} alt={r.title} style={S.image} />
                    ) : (
                      <div style={S.placeholder} />
                    )}
                    <div style={S.rTitle}>{r.title}</div>
                    <div style={S.rCuisine}>{r.cuisine || '—'}</div>
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
      {modalOpen && (
        <RecipeModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          recipe={modalRecipe}
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
