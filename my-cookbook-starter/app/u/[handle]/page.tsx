'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
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

export default function OtherCookbookPage({ params }: { params: { handle: string } }) {
  const handleParam = decodeURIComponent(params.handle || '').trim();

  // Viewer + Viewed user
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewed, setViewed] = useState<Profile | null>(null);
  const [loadingViewed, setLoadingViewed] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Friendship state (viewer ↔ viewed)
  const [isFriend, setIsFriend] = useState(false);
  const [requestedOut, setRequestedOut] = useState(false);
  const [incomingReq, setIncomingReq] = useState(false);
  const [busyFriend, setBusyFriend] = useState(false);

  // Stats
  const [friendCount, setFriendCount] = useState(0);
  const [totalAddedCount, setTotalAddedCount] = useState(0);
  const [recipesCookedCount] = useState(0); // placeholder

  // Recipes visible to viewer
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);

  // Modals
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [open, setOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);

  // Scroll ref
  const gridRef = useRef<HTMLDivElement | null>(null);

  // ===== Auth: who is the viewer?
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

  // ===== Load the viewed profile by display_name or fallback to id
  useEffect(() => {
    let cancelled = false;

    async function loadViewed() {
      setLoadingViewed(true);
      setLoadErr(null);

      // Try display_name first (your app tends to link by display_name)
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

      let prof: Profile | null = byName?.[0] as Profile | undefined ?? null;

      // Fallback to treat handle as literal profile id (UUID)
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
        prof = byId?.[0] as Profile | undefined ?? null;
      }

      setViewed(prof);
      setLoadingViewed(false);
    }

    loadViewed();
    return () => { cancelled = true; };
  }, [handleParam]);

  // ===== Load stats, friendship, and recipes once we know viewed (and possibly viewer)
  useEffect(() => {
    let cancelled = false;
    if (!viewed) return;

    const viewedId = viewed.id; // helps TS know it's non-null

    async function loadAll() {
      // --- Friend count (RPC you already have) ---
      const { data: fc, error: fcErr } = await supabase.rpc('friend_count', { uid: viewedId });
      if (!cancelled) {
        setFriendCount(!fcErr && typeof fc === 'number' ? (fc as number) : 0);
      }

      // --- Total recipes added by viewed user (unfiltered) ---
      {
        const { count, error } = await supabase
          .from('recipes')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', viewedId);
        if (!cancelled) {
          setTotalAddedCount(!error && typeof count === 'number' ? count : 0);
        }
      }

      // --- Friendship state (viewer ↔ viewed) ---
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
            setIsFriend(false);
            setRequestedOut(false);
            setIncomingReq(false);
          } else {
            const r = rows[0] as { requester_id: string; addressee_id: string; status: string };
            if (r.status === 'accepted') {
              setIsFriend(true);
              setRequestedOut(false);
              setIncomingReq(false);
            } else if (r.status === 'pending') {
              setIsFriend(false);
              setRequestedOut(r.requester_id === viewerId);
              setIncomingReq(r.addressee_id === viewerId);
            } else {
              setIsFriend(false);
              setRequestedOut(false);
              setIncomingReq(false);
            }
          }
        }
      } else {
        // viewing self or not signed in
        if (!cancelled) {
          setIsFriend(false);
          setRequestedOut(false);
          setIncomingReq(false);
        }
      }

      // --- Visible recipes for viewer ---
      setLoadingRecipes(true);

      // Treat NULL as "public" (for old rows)
      // Allowed visibilities:
      const canSeeFriends = !!viewerId && (viewerId === viewedId || isFriend);
      const allowed = canSeeFriends ? ['public', 'friends'] as const : ['public'] as const;

      // Build an OR filter that includes null as public
      // Example OR: "and(user_id.eq.<id>,recipe_visibility.in.(public,friends)),and(user_id.eq.<id>,recipe_visibility.is.null)"
      const visList = allowed.join(',');
      const orClause = canSeeFriends
        ? `and(user_id.eq.${viewedId},recipe_visibility.in.(${visList})),and(user_id.eq.${viewedId},recipe_visibility.is.null)`
        : `and(user_id.eq.${viewedId},recipe_visibility.eq.public),and(user_id.eq.${viewedId},recipe_visibility.is.null)`;

      const { data: rows, error: recErr } = await supabase
        .from('recipes')
        .select('id,user_id,title,cuisine,recipe_types,photo_url,source_url,created_at,recipe_visibility')
        .or(orClause)
        .order('created_at', { ascending: false });

      if (!cancelled) {
        if (recErr) {
          console.error(recErr);
          setRecipes([]);
        } else {
          setRecipes((rows as Recipe[]) ?? []);
        }
        setLoadingRecipes(false);
      }
    }

    loadAll();
    // re-run when these change; friendship affects visibility
  }, [viewed, viewerId, isFriend]);

  // ===== Friend button actions =====
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
    } catch (e) {
      console.error(e);
    } finally {
      setBusyFriend(false);
    }
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
      setIsFriend(false);
      setRequestedOut(false);
      setIncomingReq(false);
    } catch (e) {
      console.error(e);
    } finally {
      setBusyFriend(false);
    }
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
      setIsFriend(true);
      setRequestedOut(false);
      setIncomingReq(false);
    } catch (e) {
      console.error(e);
    } finally {
      setBusyFriend(false);
    }
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
      setIsFriend(false);
      setRequestedOut(false);
      setIncomingReq(false);
    } catch (e) {
      console.error(e);
    } finally {
      setBusyFriend(false);
    }
  }

  // ===== UI helpers =====
  function openRecipe(r: Recipe) {
    setSelected(r);
    setOpen(true);
  }
  function closeRecipe() {
    setOpen(false);
    setSelected(null);
  }
  function scrollToGrid() {
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Styles reused from My Cookbook ----
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
  const statNumber: React.CSSProperties = {
    fontWeight: 800,
    fontSize: 20,
    lineHeight: 1.1,
  };
  const statLabel: React.CSSProperties = {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  };

  // Friend Button (occupies the same header spot where Edit Profile is on My Cookbook)
  function FriendButton() {
    if (!viewed) return null;
    if (!viewerId || viewerId === viewed.id) return null; // no friend button when logged out or viewing self

    if (isFriend) {
      return (
        <button
          onClick={onUnfriend}
          disabled={busyFriend}
          title="Remove friend"
          style={{
            padding: '8px 12px',
            background: '#4CAF50',
            color: '#fff',
            borderRadius: 8,
            border: 'none',
            cursor: busyFriend ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          Friend
        </button>
      );
    }
    if (requestedOut) {
      return (
        <button
          disabled
          title="Request sent"
          style={{
            padding: '8px 12px',
            background: '#ddd',
            color: '#333',
            borderRadius: 8,
            border: 'none',
            fontSize: 14,
            cursor: 'default',
          }}
        >
          Requested
        </button>
      );
    }
    if (incomingReq) {
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onAccept}
            disabled={busyFriend}
            style={{
              padding: '8px 12px',
              background: '#4CAF50',
              color: '#fff',
              borderRadius: 8,
              border: 'none',
              cursor: busyFriend ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
          >
            Accept
          </button>
          <button
            onClick={onDecline}
            disabled={busyFriend}
            style={{
              padding: '8px 12px',
              background: '#eee',
              color: '#111',
              borderRadius: 8,
              border: '1px solid #ddd',
              cursor: busyFriend ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
          >
            Decline
          </button>
        </div>
      );
    }
    return (
      <button
        onClick={onAddFriend}
        disabled={busyFriend}
        style={{
          padding: '8px 12px',
          background: '#eee',
          color: '#111',
          borderRadius: 8,
          border: '1px solid #ddd',
          cursor: busyFriend ? 'not-allowed' : 'pointer',
          fontSize: 14,
        }}
      >
        Add Friend
      </button>
    );
  }

  // Profile strip (no box; avatar same sizing as your My Cookbook header area)
  function ProfileStrip() {
    if (!viewed) return null;
    const name = viewed.display_name || viewed.nickname || 'User';
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 8,
          // no background/border to match My Cookbook
        }}
      >
        <img
          src={viewed.avatar_url || '/avatar-placeholder.png'}
          alt={name}
          style={{
            width: 64,               // match your My Cookbook avatar size
            height: 64,
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
    );
  }

  const headerLeft = useMemo(
    () => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        {/* no page title to match your request */}
      </div>
    ),
    []
  );

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      {/* HEADER (Back on left, Friend button on right) */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        {headerLeft}
        <FriendButton />
      </header>

      {/* PROFILE STRIP (no box) */}
      <section>
        <ProfileStrip />
      </section>

      {/* STATS ROW (Friends → modal for viewed user; Recipes Added shows total from viewed user) */}
      <div style={statWrap}>
        <button
          type="button"
          onClick={() => setFriendsOpen(true)}
          style={statCard}
          aria-label="Open friends list"
        >
          <div style={statNumber}>{friendCount}</div>
          <div style={statLabel}>Friends</div>
        </button>

        <button
          type="button"
          onClick={scrollToGrid}
          style={statCard}
          aria-label="Scroll to recipes"
        >
          <div style={statNumber}>{totalAddedCount}</div>
          <div style={statLabel}>Recipes Added</div>
        </button>

        <button
          type="button"
          onClick={scrollToGrid}
          style={statCard}
          aria-label="Scroll to recipes cooked"
        >
          <div style={statNumber}>{recipesCookedCount}</div>
          <div style={statLabel}>Recipes Cooked</div>
        </button>
      </div>

      {/* RECIPES GRID (mirrors My Cookbook) */}
      <div ref={gridRef}>
        {loadingViewed ? (
          <div>Loading user…</div>
        ) : !viewed ? (
          <div style={{ color: '#b42318' }}>{loadErr || 'User not found.'}</div>
        ) : loadingRecipes ? (
          <div>Loading recipes…</div>
        ) : recipes.length === 0 ? (
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
            {recipes.map((r) => (
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

      {/* MODALS */}
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
