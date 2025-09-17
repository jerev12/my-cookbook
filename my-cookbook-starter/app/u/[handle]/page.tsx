'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RecipeModal from '@/app/components/RecipeModal';
import FriendsListModal from '@/app/components/FriendsListModal';
import { RecipeTile, recipeGridStyle } from '@/app/components/RecipeBadges';

type RecipeVisibility = 'public' | 'friends' | 'private' | null;

type Recipe = {
  id: string;
  user_id: string;
  title: string;
  cuisine: string | null;
  recipe_types: string[] | null;
  photo_url: string | null;
  source_url: string | null;
  created_at: string | null;
  recipe_visibility: RecipeVisibility;
};

type Profile = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  bio?: string | null;
};

const AVATAR_SIZE = 64;

export default function OtherCookbookPage({ params }: { params: { handle: string } }) {
  const handleParam = decodeURIComponent(params.handle || '').trim();

  // Viewer + viewed user
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewed, setViewed] = useState<Profile | null>(null);
  const [loadingViewed, setLoadingViewed] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Friendship state
  const [isFriend, setIsFriend] = useState(false);
  const [requestedOut, setRequestedOut] = useState(false);
  const [incomingReq, setIncomingReq] = useState(false);
  const [busyFriend, setBusyFriend] = useState(false);

  // Stats
  const [friendCount, setFriendCount] = useState(0);
  const [totalAddedCount, setTotalAddedCount] = useState(0);
  const [recipesCookedCount] = useState(0);

  // Recipes (NOW fetched with server-side visibility in the query)
  const [visibleRecipes, setVisibleRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);

  // Modals
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [open, setOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);

  const gridRef = useRef<HTMLDivElement | null>(null);

  // --- Auth
  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!ignore) setViewerId(user?.id ?? null);
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setViewerId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // --- Load viewed profile (by display_name first, then id)
  useEffect(() => {
    let cancelled = false;
    async function loadViewed() {
      setLoadingViewed(true);
      setLoadErr(null);

      const { data: byName, error: nameErr } = await supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url, bio')
        .eq('display_name', handleParam)
        .limit(1);

      if (cancelled) return;
      if (nameErr) {
        setLoadErr(nameErr.message);
        setViewed(null);
        setLoadingViewed(false);
        return;
      }

      let prof: Profile | null = (byName?.[0] as Profile) ?? null;

      if (!prof) {
        const { data: byId, error: idErr } = await supabase
          .from('profiles')
          .select('id, display_name, nickname, avatar_url, bio')
          .eq('id', handleParam)
          .limit(1);
        if (cancelled) return;
        if (idErr) {
          setLoadErr(idErr.message);
          setViewed(null);
          setLoadingViewed(false);
          return;
        }
        prof = (byId?.[0] as Profile) ?? null;
      }

      setViewed(prof);
      setLoadingViewed(false);
    }
    loadViewed();
    return () => { cancelled = true; };
  }, [handleParam]);

  // --- Load stats + friendship
  useEffect(() => {
    let cancelled = false;
    if (!viewed) return;
    const viewedId = viewed.id;

    (async () => {
      const { data: fc, error: fcErr } = await supabase.rpc('friend_count', { uid: viewedId });
      if (!cancelled) setFriendCount(!fcErr && typeof fc === 'number' ? (fc as number) : 0);

      const { count, error: cntErr } = await supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', viewedId);
      if (!cancelled) setTotalAddedCount(!cntErr && typeof count === 'number' ? count : 0);

      // friendship
      if (viewerId && viewerId !== viewedId) {
        const { data: rows, error } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id, status')
          .or(
            `and(requester_id.eq.${viewerId},addressee_id.eq.${viewedId}),and(requester_id.eq.${viewedId},addressee_id.eq.${viewerId})`
          )
          .limit(1);

        if (!cancelled) {
          if (error || !rows?.length) {
            setIsFriend(false); setRequestedOut(false); setIncomingReq(false);
          } else {
            const r = rows[0] as { requester_id: string; addressee_id: string; status: string };
            if (r.status === 'accepted') {
              setIsFriend(true); setRequestedOut(false); setIncomingReq(false);
            } else if (r.status === 'pending') {
              setIsFriend(false);
              setRequestedOut(r.requester_id === viewerId);
              setIncomingReq(r.addressee_id === viewerId);
            } else {
              setIsFriend(false); setRequestedOut(false); setIncomingReq(false);
            }
          }
        }
      } else {
        if (!cancelled) { setIsFriend(false); setRequestedOut(false); setIncomingReq(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [viewed, viewerId]);

  // --- Load recipes with server-side visibility filtering (Option A)
  useEffect(() => {
    let cancelled = false;
    async function loadVisibleRecipes() {
      if (!viewed) return;
      const viewedId = viewed.id;

      setLoadingRecipes(true);
      try {
        const qb = supabase
          .from('recipes')
          .select(
            'id,user_id,title,cuisine,recipe_types,photo_url,source_url,created_at,recipe_visibility'
          )
          .eq('user_id', viewedId)
          .order('created_at', { ascending: false });

        if (viewerId === viewedId) {
          // Owner — no extra filter; see everything.
        } else if (isFriend) {
          // Friend — anything except private.
          qb.neq('recipe_visibility', 'private');
        } else {
          // Stranger — public only.
          qb.eq('recipe_visibility', 'public');
        }

        const { data, error } = await qb;
        if (error) throw error;
        if (!cancelled) setVisibleRecipes((data as Recipe[]) ?? []);
      } catch (e) {
        if (!cancelled) setVisibleRecipes([]);
      } finally {
        if (!cancelled) setLoadingRecipes(false);
      }
    }

    // run whenever we know enough to decide the filter
    loadVisibleRecipes();
    return () => { cancelled = true; };
  }, [viewed, viewerId, isFriend]);

  // --- Friend actions
  async function onAddFriend() {
    if (!viewerId || !viewed || viewerId === viewed.id || busyFriend) return;
    setBusyFriend(true);
    try {
      const { error } = await supabase.from('friendships').insert({
        requester_id: viewerId,
        addressee_id: viewed.id,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setRequestedOut(true);
      setIncomingReq(false);
    } finally { setBusyFriend(false); }
  }
  async function onUnfriend() {
    if (!viewerId || !viewed || busyFriend) return;
    setBusyFriend(true);
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .or(
          `and(requester_id.eq.${viewerId},addressee_id.eq.${viewed.id},status.eq.accepted),and(requester_id.eq.${viewed.id},addressee_id.eq.${viewerId},status.eq.accepted)`
        );
      if (error) throw error;
      setIsFriend(false); setRequestedOut(false); setIncomingReq(false);
    } finally { setBusyFriend(false); }
  }
  async function onAccept() {
    if (!viewerId || !viewed || busyFriend) return;
    setBusyFriend(true);
    try {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .match({ requester_id: viewed.id, addressee_id: viewerId, status: 'pending' });
      if (error) throw error;
      setIsFriend(true); setRequestedOut(false); setIncomingReq(false);
    } finally { setBusyFriend(false); }
  }
  async function onDecline() {
    if (!viewerId || !viewed || busyFriend) return;
    setBusyFriend(true);
    try {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .match({ requester_id: viewed.id, addressee_id: viewerId, status: 'pending' });
      if (error) throw error;
      setIsFriend(false); setRequestedOut(false); setIncomingReq(false);
    } finally { setBusyFriend(false); }
  }

  // --- UI helpers
  function openRecipe(r: Recipe) { setSelected(r); setOpen(true); }
  function closeRecipe() { setOpen(false); setSelected(null); }
  function scrollToGrid() { gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  // --- styles
  const statWrap: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  };
  const statCard: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: 10,
    padding: 10,
    textAlign: 'center',
    cursor: 'pointer',
    userSelect: 'none',
  };
  const statNumber: React.CSSProperties = { fontWeight: 800, fontSize: 20, lineHeight: 1.1 };
  const statLabel: React.CSSProperties = { fontSize: 12, color: '#666', marginTop: 2 };

  const Header = useMemo(
    () => (
      <header
        style={{
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <button
          onClick={() => window.history.back()}
          aria-label="Go back"
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #ddd',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ← Back
        </button>
      </header>
    ),
    []
  );

  function ProfileBlock() {
    if (!viewed) return null;
    const name = viewed.display_name || viewed.nickname || 'User';

    const friendButton =
      !viewerId || viewerId === viewed.id ? null
      : isFriend ? (
          <button
            onClick={onUnfriend}
            disabled={busyFriend}
            title="Remove friend"
            style={{
              width: '100%',
              padding: '10px 14px',
              background: '#4CAF50',
              color: '#fff',
              borderRadius: 10,
              border: 'none',
              cursor: busyFriend ? 'not-allowed' : 'pointer',
              fontSize: 16,
            }}
          >
            Friend
          </button>
        ) : requestedOut ? (
          <button
            disabled
            title="Request sent"
            style={{
              width: '100%',
              padding: '10px 14px',
              background: '#ddd',
              color: '#333',
              borderRadius: 10,
              border: 'none',
              fontSize: 16,
              cursor: 'default',
            }}
          >
            Requested
          </button>
        ) : incomingReq ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <button
              onClick={onAccept}
              disabled={busyFriend}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: '#4CAF50',
                color: '#fff',
                borderRadius: 10,
                border: 'none',
                cursor: busyFriend ? 'not-allowed' : 'pointer',
                fontSize: 16,
              }}
            >
              Accept
            </button>
            <button
              onClick={onDecline}
              disabled={busyFriend}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: '#eee',
                color: '#111',
                borderRadius: 10,
                border: '1px solid #ddd',
                cursor: busyFriend ? 'not-allowed' : 'pointer',
                fontSize: 16,
              }}
            >
              Decline
            </button>
          </div>
        ) : (
          <button
            onClick={onAddFriend}
            disabled={busyFriend}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: '#eee',
              color: '#111',
              borderRadius: 10,
              border: '1px solid #ddd',
              cursor: busyFriend ? 'not-allowed' : 'pointer',
              fontSize: 16,
            }}
          >
            Add Friend
          </button>
        );

    return (
      <section style={{ marginBottom: 8 }}>
        {/* Avatar + text (no box) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <img
            src={viewed.avatar_url || '/avatar-placeholder.png'}
            alt={name}
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid #ddd',
            }}
          />
          <div style={{ display: 'grid' }}>
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.15 }}>{name}</div>
            {viewed.bio ? (
              <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{viewed.bio}</div>
            ) : null}
          </div>
        </div>

        {/* Full-width friend button BELOW bio */}
        {friendButton}
      </section>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      {Header}

      {/* Profile + full-width friend button */}
      <ProfileBlock />

      {/* Stats row */}
      <div style={statWrap}>
        <button type="button" onClick={() => setFriendsOpen(true)} style={statCard} aria-label="Open friends list">
          <div style={statNumber}>{friendCount}</div>
          <div style={statLabel}>Friends</div>
        </button>
        <button type="button" onClick={scrollToGrid} style={statCard} aria-label="Scroll to recipes">
          <div style={statNumber}>{totalAddedCount}</div>
          <div style={statLabel}>Recipes Added</div>
        </button>
        <button type="button" onClick={scrollToGrid} style={statCard} aria-label="Scroll to recipes cooked">
          <div style={statNumber}>{recipesCookedCount}</div>
          <div style={statLabel}>Recipes Cooked</div>
        </button>
      </div>

      {/* Recipes grid */}
      <div ref={gridRef}>
        {loadingViewed ? (
          <div>Loading user…</div>
        ) : !viewed ? (
          <div style={{ color: '#b42318' }}>{loadErr || 'User not found.'}</div>
        ) : loadingRecipes ? (
          <div>Loading recipes…</div>
        ) : visibleRecipes.length === 0 ? (
          <div
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 12,
              padding: 16,
              color: '#606375',
            }}
          >
            No recipes available to you yet.
          </div>
        ) : (
          <div style={recipeGridStyle}>
            {visibleRecipes.map((r) => (
              <RecipeTile
                key={r.id}
                title={r.title}
                types={r.recipe_types ?? []}
                photoUrl={r.photo_url}
                onClick={() => openRecipe(r)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <RecipeModal open={open} onClose={closeRecipe} recipe={selected} />
      {viewed ? (
        <FriendsListModal
          open={friendsOpen}
          onClose={() => setFriendsOpen(false)}
          userId={viewed.id}
        />
      ) : null}
    </div>
  );
}
