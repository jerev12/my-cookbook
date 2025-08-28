'use client';

import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
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

  // Load details whenever a (new) recipe opens
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
    return () => { mounted = false; };
  }, [open, recipe]);

  return (
    <Modal open={open} onClose={onClose} title="Recipe">
      {!recipe ? (
        <p className="text-sm text-gray-600">No recipe selected.</p>
      ) : (
        <div>
          {/* Header (matches your My Cookbook layout) */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-bold">{recipe.title}</div>
              <div className="text-gray-600">{recipe.cuisine || ''}</div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="grid gap-3 mt-3">
            <section>
              <h3 className="font-semibold my-2">Ingredients</h3>
              {loading ? (
                <div>Loading…</div>
              ) : (
                <ul className="list-disc pl-5">
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
              <h3 className="font-semibold my-2">Instructions</h3>
              {loading ? (
                <div>Loading…</div>
              ) : (
                <ol className="list-decimal pl-5">
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
                className="text-emerald-600"
              >
                Open Source
              </a>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
