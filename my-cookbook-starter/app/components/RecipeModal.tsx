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
type Ingredient = {
  item_name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
};

export default function RecipeModal({
  open,
  onClose,
  recipe,
}: {
  open: boolean;
  onClose: () => void;
  recipe: Recipe | null;
}) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(false);

  // Load details when opened with a recipe
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!open || !recipe) return;
      setLoading(true);
      const [{ data: stepData }, { data: ingData }] = await Promise.all([
        supabase
          .from('recipe_steps')
          .select('step_number,body')
          .eq('recipe_id', recipe.id)
          .order('step_number'),
        supabase
          .from('recipe_ingredients')
          .select('item_name,quantity,unit,note')
          .eq('recipe_id', recipe.id),
      ]);
      if (!mounted) return;
      setSteps((stepData as Step[]) || []);
      setIngs((ingData as Ingredient[]) || []);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [open, recipe]);

  if (!open || !recipe) return null;

  return (
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
      onClick={onClose}
      aria-modal="true"
      role="dialog"
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
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{recipe.title}</div>
            <div style={{ color: '#666' }}>{recipe.cuisine || ''}</div>
          </div>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          <section>
            <h3 style={{ margin: '8px 0' }}>Ingredients</h3>
            {loading ? (
              <div>Loading…</div>
            ) : (
              <ul style={{ paddingLeft: 16 }}>
                {ings.length ? (
                  ings.map((i, idx) => {
                    const qty = i.quantity ?? '';
                    const parts = [qty, i.unit, i.item_name].filter(Boolean).join(' ');
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
            {loading ? (
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

          {recipe.source_url ? (
            <a
              href={recipe.source_url}
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
  );
}
