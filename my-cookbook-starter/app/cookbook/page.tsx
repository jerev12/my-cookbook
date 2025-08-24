'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AuthGuard from '../components/AuthGuard'; // adjust import path if needed

// NEW: home hub components
import FriendCount from '../components/FriendCount';
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

// Tiny logout button component (kept from your code)
function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        padding: '6px 12px',
        background: '#eee',
        border: '1px solid #ccc',
        borderRadius: 6,
        cursor: 'pointer',
      }}
    >
      Log out
    </button>
  );
}

export default function CookbookPage() {
  const [userId, setUserId] = useState<string | null>(null); // NEW: needed for FriendCount/Profile
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selected, setSelected] = useState<Recipe | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // NEW: friends modal state
  const [friendsOpen, setFriendsOpen] = useState(false);

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

  return (
    <AuthGuard>
      <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
        {/* HEADER */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h1 style={{ margin: 0 }}>My Cookbook</h1>
          <div style={{ display: 'flex', gap: 12 }}>
            <a
              href="/add-recipe"
              style={{
                padding: '6px 12px',
                background: '#4CAF50',
                color: '#fff',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              + Add Recipe
            </a>
            <LogoutButton />
          </div>
        </header>

        {/* ===== HOME HUB ROW ===== */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}
        >
          {/* Community card */}
          <section
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Community</div>
            {userId ? (
              <button
                onClick={() => setFriendsOpen(true)}
                style={{
                  display: 'inline-flex',
                  gap: 8,
                  alignItems: 'center',
                  padding: '6px 10px',
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  background: '#f9f9f9',
                  cursor: 'pointer',
                }}
              >
                {/* FriendCount will render the number; onClick opens modal */}
                <span>Friends</span>
                <span
                  style={{
                    background: '#e9e9e9',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 12,
                  }}
                >
                  {/* Reuse FriendCount for the numeric badge (no nav) */}
                  <FriendCount userId={userId} />
                </span>
              </button>
            ) : (
              <div>Loading…</div>
            )}

            <div style={{ marginTop: 8 }}>
              <a href="/friends/find" style={{ fontSize: 13, textDecoration: 'underline' }}>
                Find friends
              </a>
            </div>
          </section>

          {/* My Recipes quick actions */}
          <section
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>My Recipes</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a
                href="/add-recipe"
                style={{
                  padding: '6px 12px',
                  background: '#4CAF50',
                  color: '#fff',
                  borderRadius: 6,
                  textDecoration: 'none',
                }}
              >
                New recipe
              </a>
              <a
                href="/recipes"
                style={{
                  padding: '6px 12px',
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: '#111',
                }}
              >
                View all
              </a>
            </div>
          </section>

          {/* Feed entry (stub) */}
          <section
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Feed</div>
            <p style={{ margin: 0, color: '#606375', fontSize: 13 }}>
              See public & friends‑only recipes from friends.
            </p>
            <div style={{ marginTop: 8 }}>
              <a
                href="/feed"
                style={{
                  padding: '6px 12px',
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: 6,
                  textDecoration: 'none',
                  color: '#111',
                }}
              >
                Open feed
              </a>
            </div>
          </section>
        </div>

        {/* ===== PROFILE EDITOR ===== */}
        <section
          style={{
            background: '#fff',
            border: '1px solid #eee',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <ProfileSection />
        </section>

        {/* ===== YOUR RECIPES GRID (unchanged) ===== */}
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
            You haven’t added any recipes yet. Click “+ Add Recipe” to create your first one.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))',
              gap: 16,
            }}
          >
            {recipes.map((r) => (
              <button
                key={r.id}
                onClick={() => openRecipe(r)}
                style={{
                  border: '1px solid #eee',
                  borderRadius: 12,
                  padding: 12,
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
                      aspectRatio: '16/9',
                      objectFit: 'cover',
                      borderRadius: 8,
                    }}
                  />
                ) : null}
                <div style={{ fontWeight: 600, marginTop: 8 }}>{r.title}</div>
                <div style={{ color: '#666' }}>{r.cuisine || '—'}</div>
              </button>
            ))}
          </div>
        )}

        {/* ===== RECIPE DETAIL MODAL (unchanged) ===== */}
        {selected && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
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

              <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
                <section>
                  <h3 style={{ margin: '8px 0' }}>Ingredients</h3>
                  {detailLoading ? (
                    <div>Loading…</div>
                  ) : (
                    <ul>
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
                    <ol>
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
                  >
                    Open Source
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {/* ===== FRIENDS LIST MODAL (NEW) ===== */}
        <FriendsListModal open={friendsOpen} onClose={() => setFriendsOpen(false)} />
      </div>
    </AuthGuard>
  );
}
