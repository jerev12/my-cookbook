'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

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
  recipe_types?: string[] | null; // array column
};

type FriendRelation = 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';

const PAGE_SIZE = 20;

// Known type pills you use on Add Recipe.
// We’ll map typed text like "din" -> include recipe_types.cs.{Dinner} in the OR.
const KNOWN_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];

export default function CommunitySearch() {
  const [tab, setTab] = useState<TabKey>('recipes');

  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q, 300);
  const queryActive = debouncedQ.trim().length > 0;

  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const [myId, setMyId] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<Record<string, FriendRelation>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [modalRecipe, setModalRecipe] = useState<any>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMyId(data.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [tab, debouncedQ]);

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
        // RECIPES: search by title/cuisine (ILIKE) + recipe_types (array contains)
        const safeQ = escapeLike(debouncedQ);
        const like = `%${safeQ}%`;

        // Match user text to one or more known type tokens (case-insensitive, substring ok).
        const qLower = debouncedQ.toLowerCase();
        const matchedTypes = KNOWN_TYPES.filter(t => t.toLowerCase().includes(qLower));

        // Build the OR list:
        // - title.ilike.%q%
        // - cuisine.ilike.%q%
        // - (optionally) recipe_types.cs.{Dinner}, recipe_types.cs.{Lunch}, ...
        const orParts = [
          `title.ilike.${like}`,
          `cuisine.ilike.${like}`,
          // DO NOT put .ilike on recipe_types (it's an array); use cs with a brace-wrapped element.
          ...matchedTypes.map(t => `recipe_types.cs.{${t}}`),
        ];

        const { data, error } = await supabase
          .from('recipes')
          .select('id,user_id,title,cuisine,photo_url,source_url,created_at,recipe_types')
          .or(orParts.join(','))
          .order('created_at', { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

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

  async function openRecipe(rid: string) {
    try {
      setModalOpen(true);
      setModalRecipe(null);

      const { data, error } = await supabase
        .from('recipes')
        .select('id,user_id,title,cuisine,photo_url,source_url,created_at,recipe_types')
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

  async function handleToggleRequest(targetId: string, relation: FriendRelation) {
    try {
      setFriendStatus(prev => ({
        ...prev,
        [targetId]: relation === 'none' ? 'pending_outgoing' : 'none',
      }));

      if (relation === 'none') {
        const { error } = await supabase.rpc('request_friend', { target_id: targetId });
        if (error) throw error;
      } else if (relation === 'pending_outgoing') {
        const { error } = await supabase.rpc('unfriend', { target_id: targetId });
        if (error) throw error;
      } else {
        return;
      }

      await refreshStatus([targetId]);
    } catch (e: any) {
      console.error(e);
      setFriendStatus(prev => ({ ...prev, [targetId]: relation }));
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

  // Escape % and _ so they don't act as wildcards from user input
  function escapeLike(s: string) {
    return s.replace(/[%_]/g, m => '\\' + m);
  }

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
      background: '#f3f4f6',
    } as CSSProperties,
    rTitle: { fontWeight: 600, marginTop: 6, fontSize: 14 } as CSSProperties,
    rCuisine: { color: '#666', fontSize: 12 } as CSSProperties,

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
      textDecoration: 'none',
      color: '#111827',
    } as CSSProperties,
    avatar: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' as const } as CSSProperties,
    name: {
      fontSize: 14,
      fontWeight: 600,
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
    btnGreen: {
      border: '1px solid #4CAF50',
      background: '#4CAF50',
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

      <div style={S.row}>
        <input
          style={S.input}
          placeholder={tab === 'users' ? 'Search people by name…' : 'Search recipes by title, cuisine, or type…'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {!queryActive ? (
        <div style={S.hint}>
          Start typing above to search {tab === 'users' ? 'for people' : 'for recipes'}.
        </div>
      ) : (
        <>
          {loading && <div style={S.hint}>Searching…</div>}
          {!loading && errMsg && <div style={S.error}>{errMsg}</div>}

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
                      actionEl = (
                        <button style={{ ...S.btn, ...S.btnDisabled }} disabled>
                          Requested
                        </button>
                      );
                    } else {
                      actionEl = (
                        <button
                          style={{ ...S.btn, ...S.btnGreen, cursor: 'pointer' }}
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
