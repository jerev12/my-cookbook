'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RecipeModal from '../components/RecipeModal';

type Recipe = {
  id: string;
  title: string;
  cuisine: string | null;
  photo_url: string | null;
  source_url: string | null;
};

export default function PublicRecipesFeed() {
  // list state
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // modal state (shared RecipeModal)
  const [selected, setSelected] = useState<Recipe | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase
        .from('recipes')
        .select('id, title, cuisine, photo_url, source_url')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false });

      if (error) {
        setErrorMsg(error.message);
        setRecipes([]);
      } else {
        setRecipes((data as Recipe[]) ?? []);
      }

      setLoading(false);
    })();
  }, []);

  function openRecipe(r: Recipe) {
    setSelected(r); // RecipeModal will load steps/ingredients internally
  }

  return (
    <main style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22, marginBottom: 12 }}>
        Community — Public Recipes
      </h1>

      {/* LIST */}
      {loading ? (
        <div>Loading public recipes…</div>
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
          No public recipes yet.
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            background: '#fff',
            border: '1px solid #eee',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {recipes.map((r) => (
            <li key={r.id} style={{ borderTop: '1px solid #eee' }}>
              <button
                type="button"
                onClick={() => openRecipe(r)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 12,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                aria-label={`Open ${r.title}`}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</div>
                <div style={{ color: '#666', fontSize: 12 }}>
                  {r.cuisine || '—'}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Shared Recipe Modal (closes on backdrop, X, or onClose) */}
      <RecipeModal
        open={!!selected}
        onClose={() => setSelected(null)}
        recipe={selected}
      />
    </main>
  );
}
