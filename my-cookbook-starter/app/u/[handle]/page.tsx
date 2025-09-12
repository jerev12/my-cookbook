'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RecipeModal from '@/app/components/RecipeModal';
import FriendsListModal from '@/app/components/FriendsListModal';
import { RecipeTile, recipeGridStyle } from '@/app/components/RecipeBadges';
import Link from 'next/link';

// ===== Types =====
type Recipe = {
  id: string;
  user_id: string;
  title: string;
  cuisine: string | null;
  recipe_types: string[] | null;
  photo_url: string | null;
  source_url: string | null;
  created_at: string | null;
  recipe_visibility: 'public' | 'friends' | 'private' | null;
};

type Profile = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
};

// ===== Page =====
export default function OtherCookbookPage({
  params,
}: {
  params: { handle: string };
}) {
  const handleParam = decodeURIComponent(params.handle || '').trim();

  // Viewer + viewed user
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewed, setViewed] = useState<Profile | null>(null);
  const [loadingViewed, setLoadingViewed] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Friendship state (viewer ↔ viewed)
  const [isFriend, setIsFriend] = useState(false);
  const [requestedOut, setRequestedOut] = useState(false); // viewer -> viewed pending
  const [incomingReq, setIncomingReq] = useState(false);   // viewed -> viewer pending

  // Stats
  const [friendCount, setFriendCount] = useState(0);
  const [totalAddedCount, setTotalAddedCount] = useState(0);
  const [recipesCookedCount] = useState(0); // placeholder

  // Recipes
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);

  // Recipe detail modal
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [open, setOpen] = useState(false);

  // Friends modal for the viewed user
  const [friendsOpen, setFriendsOpen] = useState(false);

  // Scroll ref for grid
  const gridRef = useRef<HTMLDivElement | null>(null);

  // ===== Load viewer (auth) =====
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

  // ===== Load viewed profile by handle (display_name) OR fallback to id =====
  useEffect(() => {
    let cancelled = false;

    async function loadViewed() {
      setLoadingViewed(true);
      setLoadErr(null);

      // First try display_name match
      const { data: byName, error: nameErr } = await supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url')
        .eq('display_name', handleParam)
        .limit(1);

      if (cancelled) return;

      if (nameErr) {
        setLoadErr(nameErr.message);
        setViewed(null);
        setLoadingViewed(false);
        return;
      }

      let prof: Profile | null =
        (byName && byName.length > 0 ? (byName[0] as Profile) : null);

      if (!prof) {
        // Fallback: treat handle as literal profile id (UUID)
        const { data: byId, error: idErr } = await supabase
          .from('profiles')
          .select('id, display_name, nickname, avatar_url')
          .eq('id', handleParam)
          .limit(1);

        if (cancelled) return;

        if (idErr) {
          setLoadErr(idErr.message);
          setViewed(null);
          setLoadingViewed(false);
          return;
        }
        prof = (byId && byId.length > 0 ? (byId[0] as Profile) : null);
      }

      setViewed(prof);
      setLoadingViewed(false);
    }

    loadViewed();
    return () => { cancelled = true; };
  }, [handleParam]);

  // ===== Load friendship state + stats + recipes when we know viewed (and maybe viewer) =====
  useEffect(() => {
    let cancelled = false;
    if (!viewed) return;

    async function loadAll() {
      // --- Friend count via RPC ---
      const { data: fc, error: fcErr } = await supabase.rpc('friend_count', { uid: viewed.id });
      if (!cancelled) {
        if (!fcErr && typeof fc === 'number') setFriendCount(fc as number);
        else setFriendCount(0);
      }

      // --- Total added recipes (unfiltered) ---
      {
        const { count, error } = await supabase
          .from('recipes')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', viewed.id);
        if (!cancelled) {
          if (!error && typeof count === 'number') setTotalAddedCount(count);
          else setTotalAddedCount(0);
        }
      }

      // --- Friendship state (viewer ↔ viewed) ---
      if (viewerId && viewerId !== viewed.id) {
        const { data: rows, error } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id, status')
          .or(
            `and(requester_id.eq.${viewerId},addressee_id.eq.${viewed.id}),and(requester_id.eq.${viewed.id},addressee_id.eq.${viewerId})`
          )
          .limit(1);

        if (!cancelled) {
          if (error || !rows || rows.length === 0) {
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
      const allowed: Array<'public' | 'friends'> =
        viewerId && (viewerId === viewed.id || isFriend) ? ['public', 'friends'] : ['public'];

      const { data: rows, error: recErr } = await supabase
        .from('recipes')
        .select('id,user_id,title,cuisine,recipe_types,photo_url,source_url,created_at,recipe_visibility')
        .eq('user_id', viewed.id)
        .in('recipe_visibility', allowed)
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
    // reload when friendship toggles could change visibility
  }, [viewed, viewerId, isFriend]);

  // ===== Actions: friend button in header =====
  const [busyFriend, setBusyFriend] = useState(false);

  async function onAddFriend() {
    if (!viewerId || !viewed || viewerId === viewed.id || busyFriend) return;
    setBusyFriend(true);
    try {
      const { error } = await supabase
        .from('friendships')
        .insert({
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

  // Accept/Decline (only needed if you want to handle incoming right on header)
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

  const headerTitle =
    viewed?.display_name ? `${viewed.display_name}'s Cookbook` : 'Cookbook';

  // Friend button UI (in place of “Edit Profile”)
  function FriendButton() {
    if (!viewed) return null;
    if (!viewerId || viewerId === viewed.id) return null; // no friend button when not logged in or viewing self

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

  // Compact profile header (to mirror ProfileSection look & placement)
  function ViewedProfileHeader() {
    if (!viewed) return null;
    const name = viewed.display_name || viewed.nickname || 'User';
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          background: '#fff',
          border: '1px solid #eee',
          borderRadius: 12,
          marginBottom: 8,
        }}
      >
        <img
          src={viewed.avatar_url || '/avatar-placeholder.png'}
          alt={name}
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            objectFit: 'cover',
            border: '1px solid #ddd',
          }}
        />
        <div style={{ display: 'grid' }}>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.15 }}>{name}</div>
          {/* optional: link to full profile page if you have one */}
          <Link href={`/u/${encodeURIComponent(name)}`} style={{ fontSize: 12, color: '#2563eb' }}>
            View profile
          </Link>
        </div>
      </div>
    );
  }

  // --- styles (copied from My Cookbook) ---
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

  const canSeeFriendsButton = useMemo(
    () => !!viewed, // everyone can open the list; contents are constrained by RLS
    [viewed]
  );

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      {/* HEADER */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22 }}>{headerTitle}</h1>

        {/* ⛔ No Add Recipe button here; Friend button goes in this right side */}
        <FriendButton />
      </header>

      {/* PROFILE (compact, read-only) */}
      <section>
        <ViewedProfileHeader />
      </section>

      {/* STATS ROW */}
      <div style={statWrap}>
        {/* Friends → opens modal for viewed user */}
        <button
          type="button"
          onClick={() => canSeeFriendsButton && setFriendsOpen(true)}
          style={statCard}
          aria-label="Open friends list"
        >
          <div style={statNumber}>{friendCount}</div>
          <div style={statLabel}>Friends</div>
        </button>

        {/* Recipes Added → full total for viewed user */}
        <button
          type="button"
          onClick={scrollToGrid}
          style={statCard}
          aria-label="Scroll to recipes"
        >
          <div style={statNumber}>{totalAddedCount}</div>
          <div style={statLabel}>Recipes Added</div>
        </button>

        {/* Recipes Cooked (placeholder) */}
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

      {/* RECIPES GRID — mirrors My Cookbook */}
      <div ref={gridRef}>
        {loadingViewed ? (
          <div>Loading user…</div>
        ) : !viewed ? (
          <div style={{ color: '#b42318' }}>User not found.</div>
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

      {/* Shared recipe modal */}
      <RecipeModal open={open} onClose={closeRecipe} recipe={selected} />

      {/* Friends modal for the viewed user */}
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
