'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AuthGuard from '../components/AuthGuard';
import FriendsListModal from '../components/FriendsListModal';
import ProfileSection from '../components/ProfileSection';

type Recipe = {
  id: string;
  title: string;
  cuisine: string | null;
  photo_url: string | null;
  source_url: string | null;
};

type Step = { step_number: number; body: string };
type Ingredient = {
  item_name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
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
  // If/when you add a cook logs table, set this from DB.
  const [recipesCookedCount] = useState<number>(0);

  // Recipe detail modal
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

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

      // Load my recipes
      const { data, error } = await supabase
        .from('recipes')
        .select('id,title,cuisine,photo_url,source_url')
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

  async function openRecipe(r: Recipe) {
    setSelected(r);
    setDetailLoading(true);
    const [{ data: stepData }, { data: ingData }] = await Promise.all([
      supabase
        .from('recipe_steps')
        .select('step_number,body')
        .eq('recipe_id', r.id)
        .order('step_number'),
      supabase
        .from('recipe_ingredients')
        .select('item_name,quantity,unit,note')
        .eq('recipe_id', r.id),
    ]);
    setSteps((stepData as Step[]) || []);
    setIngs((ingData as Ingredient[]) || []);
    setDetailLoading(false);
  }

  function scrollToGrid() {
    if (gridRef.current) {
      gridRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // --- tiny mobile-first styles for the stat row ---
  const statWrap: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)', // always 3 across (your req)
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
    fontSize: 20,          // compact for small screens; bump if you want larger
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
        {/* HEADER (kept), removed Logout from here */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12, // tighter for mobile
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

        {/* ==== TOP: My Profile (read-only with Edit modal inside component) ==== */}
        <section>
          <ProfileSection />
        </section>

        {/* ==== STATS ROW (right under profile) ==== */}
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

          {/* Recipes Cooked → scroll to grid (placeholder number) */}
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

        {/* ==== YOUR RECIPES GRID ==== */}
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
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', // smaller cards for mobile
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
                >
                  {r.photo_url ? (
                    <img
                      src={r.photo_url}
                      alt={r.title}
                      style={{
                        width: '100%',
                        aspectRatio: '4/3',   // a bit taller for mobile
                        objectFit: 'cover',
                        borderRadius: 8,
                      }}
                    />
                  ) : null}
                  <div style={{ fontWeight: 600, marginTop: 6, fontSize: 14 }}>{r.title}</div>
                  <div style={{ color: '#666', fontSize: 12 }}>{r.cuisine || '—'}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ==== RECIPE DETAIL MODAL (unchanged) ==== */}
        {selected && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
              zIndex: 50,
            }}
            onClick={() => setSelected(null)}
          >
            <div
              style={{
                width: 'min(800px, 94vw)',
                background: '#fff',
                borderRadius: 12,
                padding: 16,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>
                    {selected.title}
                  </div>
                  <div style={{ color: '#666' }}>{selected.cuisine || ''}</div>
                </div>
                <button onClick={() => setSelected(null)} aria-label="Close">
                  ✕
                </button>
              </div>

              <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
                <section>
                  <h3 style={{ margin: '8px 0' }}>Ingredients</h3>
                  {detailLoading ? (
                    <div>Loading…</div>
                  ) : (
                    <ul style={{ paddingLeft: 16 }}>
                      {ings.length ? (
                        ings.map((i, idx) => {
                          const qty = i.quantity ?? '';
                          const parts = [qty, i.unit, i.item_name]
                            .filter(Boolean)
                            .join(' ');
                          return (
                            <li key={idx}>
                              {parts}
                              {i.note ? ` (${i.note})` : ''}
                            </li>
                          );
                        })
                      ) : (
                        <li>No ingredients yet.</li>
                      )}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 style={{ margin: '8px 0' }}>Instructions</h3>
                  {detailLoading ? (
                    <div>Loading…</div>
                  ) : (
                    <ol style={{ paddingLeft: 18 }}>
                      {steps.length ? (
                        steps.map((s, idx) => <li key={idx}>{s.body}</li>)
                      ) : (
                        <li>This recipe has no steps yet.</li>
                      )}
                    </ol>
                  )}
                </section>

                {selected.source_url ? (
                  <a
                    href={selected.source_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#0b5' }}
                  >
                    Open Source
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* ==== FRIENDS LIST MODAL ==== */}
        <FriendsListModal open={friendsOpen} onClose={() => setFriendsOpen(false)} />
      </div>
    </AuthGuard>
  );
}
