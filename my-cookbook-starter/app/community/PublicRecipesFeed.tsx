'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import RecipeModal from '@/app/components/RecipeModal';

type Recipe = {
  id: string;
  user_id: string;
  title: string;
  cuisine: string | null;
  photo_url: string | null;
  source_url: string | null;
  created_at: string | null;
  visibility?: string | null;
};

export default function PublicRecipesFeed() {
  const [rows, setRows] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // modal state
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setMsg(null);

      const { data, error } = await supabase
        .from('recipes')
        .select('id,user_id,title,cuisine,photo_url,source_url,created_at,visibility')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false });

      if (!mounted) return;

      if (error) {
        setMsg(error.message);
        setRows([]);
      } else {
        setRows((data as Recipe[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function openRecipe(r: Recipe) {
    setSelected(r);
    setOpen(true);
  }
  function closeRecipe() {
    setOpen(false);
    setSelected(null);
  }

  return (
    <main style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22, marginBottom: 12 }}>
        Community — Public Recipes
      </h1>

      {loading ? (
        <div>Loading public recipes…</div>
      ) : msg ? (
        <div style={{ color: '#b42318' }}>{msg}</div>
      ) : !rows.length ? (
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))',
            gap: 12,
          }}
        >
          {rows.map((r) => (
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
                    aspectRatio: '4/3',
                    objectFit: 'cover',
                    borderRadius: 8,
                  }}
                />
              ) : null}
              <div style={{ fontWeight: 600, marginTop: 6, fontSize: 14 }}>
                {r.title}
              </div>
              <div style={{ color: '#666', fontSize: 12 }}>
                {r.cuisine || '—'}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Shared modal */}
      <RecipeModal open={open} onClose={closeRecipe} recipe={selected} />
    </main>
  );
}
