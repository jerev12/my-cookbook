'use client';

import Image from 'next/image';
import { useMemo } from 'react';

// Props that match your recipes table + a flexible ingredients source
type RecipeAuthor = {
  display_name?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
};

type RecipeCardProps = {
  id: string;
  title: string;
  cuisine?: string | null;
  photo_url?: string | null;
  instructions?: string | null;      // from recipes.instructions
  created_at?: string | null;        // from recipes.created_at
  author?: RecipeAuthor | null;      // profiles.* (optional for later)
  // TEMP until we know your actual ingredients schema:
  ingredients?: string[];            // preferred if you have it
  ingredients_text?: string | null;  // fallback: comma or newline separated string
};

function formatDate(d?: string | null) {
  if (!d) return '—';
  // show as Month Day, Year (local)
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return d;
  }
}

// Split ingredients_text by newline or comma into clean list
function parseIngredients(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n|,/g)
    .map(s => s.trim())
    .filter(Boolean);
}

// Split instructions into numbered steps: split on newlines or “. ” patterns
function parseInstructions(text?: string | null): string[] {
  if (!text) return [];
  // prefer newlines; if none, fall back to sentence-ish split
  const byLine = text.includes('\n') ? text.split(/\r?\n/g) : text.split(/(?<=\.)\s+/g);
  return byLine.map(s => s.trim()).filter(Boolean);
}

export default function RecipeCard({
  id,
  title,
  cuisine,
  photo_url,
  ingredients,
  ingredients_text,
  instructions,
  created_at,
}: RecipeCardProps) {

  const ingredientList = useMemo(() => {
    return (ingredients && ingredients.length ? ingredients : parseIngredients(ingredients_text)).slice(0, 20);
  }, [ingredients, ingredients_text]);

  const steps = useMemo(() => {
    return parseInstructions(instructions ?? '').slice(0, 20);
  }, [instructions]);

  return (
    <article className="rounded-lg border border-gray-200 overflow-hidden bg-white shadow-sm">
      {/* Image */}
      <div className="relative aspect-[4/3] bg-gray-100">
        {photo_url ? (
          <Image
            src={photo_url}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-gray-400 text-sm">
            No image
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="text-base font-semibold leading-snug">{title}</h3>

        {/* Cuisine */}
        <p className="mt-1 text-sm text-gray-600">{cuisine || '—'}</p>

        {/* Ingredients */}
        <div className="mt-4">
          <h4 className="text-sm font-semibold">Ingredients</h4>
          {ingredientList.length ? (
            <ul className="mt-2 list-disc list-outside pl-5 text-sm text-gray-800 space-y-1">
              {ingredientList.map((ing, idx) => (
                <li key={idx}>{ing}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No ingredients listed.</p>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-4">
          <h4 className="text-sm font-semibold">Instructions</h4>
          {steps.length ? (
            <ol className="mt-2 list-decimal list-outside pl-5 text-sm text-gray-800 space-y-1">
              {steps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No instructions provided.</p>
          )}
        </div>

        {/* Added on */}
        <div className="mt-5 text-xs text-gray-500 border-t pt-3">
          Added on {formatDate(created_at)}
        </div>
      </div>
    </article>
  );
}
