'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Recipe = {
  id: string;
  title: string;
  cuisine: string | null;
  photo_url: string | null;
  source_url: string | null;
};

type Step = { step_number: number; body: string };
type Ingredient = { item_name: string; quantity: number | null; unit: string | null; note: string | null };

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('id,title,cuisine,photo_url,source_url')
        .order('title');
      if (!error && data) setRecipes(data as any);
    })();
  }, []);

  async function openRecipe(r: Recipe) {
    setSelected(r);
    const [{ data: stepData }, { data: ingData }] = await Promise.all([
      supabase.from('recipe_steps').select('step_number,body').eq('recipe_id', r.id).order('step_number'),
      supabase.from('recipe_ingredients').select('item_name,quantity,unit,note').eq('recipe_id', r.id)
    ]);
    setSteps((stepData as any) || []);
    setIngs((ingData as any) || []);
  }

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1>Cookbook - clean</h1>
        <a href="/add-recipe">+ Add Recipe</a>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))', gap: 16 }}>
        {recipes.map(r => (
          <div
            key={r.id}
            onClick={() => openRecipe(r)}
            style={{
              border: '1px solid #eee',
              borderRadius: 12,
              padding: 12,
              cursor: 'pointer',
              background: '#fff'
            }}
          >
            {r.photo_url ? (
              <img
                src={r.photo_url}
                alt={r.title}
                style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8 }}
              />
            ) : null}
            <div style={{ fontWeight: 600, marginTop: 8 }}>{r.title}</div>
            <div style={{ color: '#666' }}>{r.cuisine || '—'}</div>
          </div>
        ))}
      </div>

      {selected && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{ width: 'min(800px, 94vw)', background: '#fff', borderRadius: 12, padding: 16 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{selected.title}</div>
                <div style={{ color: '#666' }}>{selected.cuisine || ''}</div>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close">✕</button>
            </div>

            <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
              <section>
                <h3>Ingredients</h3>
                <ul>
                  {ings.length ? (
                    ings.map((i, idx) => (
                      <li key={idx}>
                        {[i.quantity, i.unit, i.item_name].filter(Boolean).join(' ')}
                        {i.note ? ` (${i.note})` : ''}
                      </li>
                    ))
                  ) : (
                    <li>No ingredients yet.</li>
                  )}
                </ul>
              </section>

              <section>
                <h3>Instructions</h3>
                <ol>
                  {steps.length ? (
                    steps.map((s, idx) => <li key={idx}>{s.body}</li>)
                  ) : (
                    <li>This recipe has no steps yet.</li>
                  )}
                </ol>
              </section>

              {selected.source_url ? (
                <a href={selected.source_url} target="_blank" rel="noreferrer">
                  Open Source
                </a>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
