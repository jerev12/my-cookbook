'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AuthGuard from '../components/AuthGuard';
import FriendsListModal from '../components/FriendsListModal';
import ProfileSection from '../components/ProfileSection';
import RecipeModal from '../components/RecipeModal';
import RecipeBadges from '../components/RecipeBadges';

type Recipe = {
  id: string;
  user_id: string;                // for modal ownership/bookmarks
  title: string;
  cuisine: string | null;         // still in DB but not displayed
  recipe_types: string[] | null;  // <-- NEW: what we display
  photo_url: string | null;
  source_url: string | null;
  created_at: string | null;      // for “Added on …”
};

export default function CookbookPage() {
  const router = useRouter();

  // User + data
  const [userId, setUserId] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Friend count
  const [friendCount, setFriendCount] = useState<number>(0);

  // “Recipes cooked” — placeholder for now (0).
  const [recipesCookedCount] = useState<number>(0);

  // Recipe detail modal (shared RecipeModal)
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [open, setOpen] = useState(false);

  // Friends modal
  const [friendsOpen, setFriendsOpen] = useState(false);

  // Ref to scroll to the grid
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id || null;
      setUserId(uid);
      if (!uid) {
        setErrorMsg('Unable to determine current user.');
        setLoading(false);
        return;
      }

      // Load my recipes (include user_id & created_at for modal)
      const { data, error } = await supabase
        .from('recipes')
        .select('id,user_id,title,cuisine,recipe_types,photo_url,source_url,created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setRecipes((data as Recipe[]) ?? []);
      }

      // Load friend count via RPC
      const { data: fc, error: fcErr } = await supabase.rpc('friend_count', { uid });
      if (!fcErr && typeof fc === 'number') setFriendCount(fc as number);

      setLoading(false);
    })();
  }, []);

  function openRecipe(r: Recipe) {
    setSelected(r);
    setOpen(true);
  }

  function closeRecipe() {
    setOpen(false);
    setSelected(null);
  }

  function scrollToGrid() {
    if (gridRef.current) {
      gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // --- tiny mobile-first styles for the stat row (unchanged) ---
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
    <AuthGuard>
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
          <h1 style={{ margin: 0, fontSize: 22 }}>My Cookbook</h1>
          <a
            href="/add-recipe"
            style={{
              padding: '8px 12px',
              background: '#4CAF50',
              color: '#fff',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            + Add Recipe
          </a>
        </header>

        {/* PROFILE */}
        <section>
          <ProfileSection />
        </section>

        {/* STATS ROW */}
        <div style={statWrap}>
          {/* Friends → opens modal */}
          <button
            type="button"
            onClick={() => setFriendsOpen(true)}
            style={statCard}
            aria-label="Open friends list"
          >
            <div style={statNumber}>{friendCount}</div>
            <div style={statLabel}>Friends</div>
          </button>

          {/* My Recipes → scroll to grid */}
          <button
            type="button"
            onClick={scrollToGrid}
            style={statCard}
            aria-label="Scroll to my recipes"
          >
            <div style={statNumber}>{recipes.length}</div>
            <div style={statLabel}>My Recipes</div>
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

        {/* YOUR RECIPES GRID */}
        <div ref={gridRef}>
          {loading ? (
            <div>Loading your recipes…</div>
          ) : errorMsg ? (
            <div style={{ color: '#b42318' }}>{errorMsg}</div>
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
              You haven’t added any recipes yet. Tap “+ Add Recipe” to create your first one.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))',
                gap: 12,
              }}
            >
              {recipes.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openRecipe(r)}
                  style={{
                    border: '1px solid #eee',
                    borderRadius: 12,
                    padding: 10,
                    background: '#fff',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  aria-label={`Open ${r.title}`}
                >
                  {r.photo_url ? (
                    <img
                      src={r.photo_url}
                      alt={r.title}
                      style={{
                        width: '100%',
                        aspectRatio: '4/3',
                        objectFit: 'cover',
                        borderRadius: 8,
                      }}
                    />
                  ) : null}
                  <div style={{ fontWeight: 600, marginTop: 6, fontSize: 14 }}>
                    {r.title}
                  </div>
                  {/* Recipe Type badges (no cuisine fallback) */}
                  <div style={{ marginTop: 4 }}>
                    <RecipeBadges types={r.recipe_types ?? []} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RECIPE DETAIL MODAL — shared component */}
        <RecipeModal open={open} onClose={closeRecipe} recipe={selected} />

        {/* FRIENDS LIST MODAL */}
        <FriendsListModal open={friendsOpen} onClose={() => setFriendsOpen(false)} />
      </div>
    </AuthGuard>
  );
}
