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

  // Friendship state
  const [isFriend, setIsFriend] = useState(false);
  const [requestedOut, setRequestedOut] = useState(false);
  const [incomingReq, setIncomingReq] = useState(false);

  // Stats
  const [friendCount, setFriendCount] = useState(0);
  const [totalAddedCount, setTotalAddedCount] = useState(0);
  const [recipesCookedCount] = useState(0);

  // Recipes
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(true);

  // Modals
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [open, setOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);

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

  // ===== Load viewed profile =====
  useEffect(() => {
    let cancelled = false;

    async function loadViewed() {
      setLoadingViewed(true);
      setLoadErr(null);

      const { data: byName, error: nameErr } = await supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url')
        .eq('display_name', handleParam)
        .limit(1);

      if (cancelled) return;

      let prof: Profile | null =
        (byName && byName.length > 0 ? (byName[0] as Profile) : null);

      if (!prof) {
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

  // ===== Load stats, friendship, recipes =====
  useEffect(() => {
    let cancelled = false;
    if (!viewed) return;

    const viewedId = viewed.id; // ✅ safe

    async function loadAll() {
      // Friend count
      const { data: fc, error: fcErr } = await supabase.rpc('friend_count', { uid: viewedId });
      if (!cancelled) {
        if (!fcErr && typeof fc === 'number') setFriendCount(fc as number);
        else setFriendCount(0);
      }

      // Recipes added (total)
      const { count, error } = await supabase
        .from('recipes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', viewedId);
      if (!cancelled) {
        if (!error && typeof count === 'number') setTotalAddedCount(count);
        else setTotalAddedCount(0);
      }

      // Friendship state
      if (viewerId && viewerId !== viewedId) {
        const { data: rows, error } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id, status')
          .or(
            `and(requester_id.eq.${viewerId},addressee_id.eq.${viewedId}),and(requester_id.eq.${viewedId},addressee_id.eq.${viewerId})`
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
        if (!cancelled) {
          setIsFriend(false);
          setRequestedOut(false);
          setIncomingReq(false);
        }
      }

      // Visible recipes
      setLoadingRecipes(true);
      const allowed: Array<'public' | 'friends'> =
        viewerId && (viewerId === viewedId || isFriend) ? ['public', 'friends'] : ['public'];

      const { data: rows, error: recErr } = await supabase
        .from('recipes')
        .select('id,user_id,title,cuisine,recipe_types,photo_url,source_url,created_at,recipe_visibility')
        .eq('user_id', viewedId)
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
    return () => { cancelled = true; };
  }, [viewed, viewerId, isFriend]);

  // ===== Helpers =====
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

  // --- UI styles ---
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
        {/* Friend button */}
        {/* ...FriendButton code would be here... */}
      </header>

      {/* PROFILE */}
      {viewed && (
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
            alt={viewed.display_name || 'User'}
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid #ddd',
            }}
          />
          <div style={{ display: 'grid' }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {viewed.display_name || viewed.nickname || 'User'}
            </div>
            <Link href={`/u/${encodeURIComponent(viewed.display_name || viewed.id)}`} style={{ fontSize: 12, color: '#2563eb' }}>
              View profile
            </Link>
          </div>
        </div>
      )}

      {/* STATS */}
      <div style={statWrap}>
        <button type="button" onClick={() => setFriendsOpen(true)} style={statCard}>
          <div style={statNumber}>{friendCount}</div>
          <div style={statLabel}>Friends</div>
        </button>
        <button type="button" onClick={scrollToGrid} style={statCard}>
          <div style={statNumber}>{totalAddedCount}</div>
          <div style={statLabel}>Recipes Added</div>
        </button>
        <button type="button" onClick={scrollToGrid} style={statCard}>
          <div style={statNumber}>{recipesCookedCount}</div>
          <div style={statLabel}>Recipes Cooked</div>
        </button>
      </div>

      {/* RECIPES GRID */}
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

      {/* MODALS */}
      <RecipeModal open={open} onClose={closeRecipe} recipe={selected} />
      {viewed && (
        <FriendsListModal
          open={friendsOpen}
          onClose={() => setFriendsOpen(false)}
          userId={viewed.id}
        />
      )}
    </div>
  );
}
