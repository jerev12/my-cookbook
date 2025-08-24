// app/recipes/[id]/page.tsx
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, anon);

type Recipe = {
  id: string;
  title: string;
  cuisine: string | null;
  user_id: string;
  visibility: 'public' | 'friends' | 'private' | string;
  photo_url: string | null;
  instructions: string;
};

type Profile = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
};

export default async function RecipePage({ params }: { params: { id: string } }) {
  // RLS will enforce visibility here
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('id, title, cuisine, user_id, visibility, photo_url, instructions')
    .eq('id', params.id)
    .single();

  if (error || !recipe) return notFound();

  const { data: author } = await supabase
    .from('profiles')
    .select('id, display_name, nickname, avatar_url')
    .eq('id', recipe.user_id)
    .single();

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">{recipe.title}</h1>
        <div className="mt-2 text-sm text-gray-600 flex items-center gap-2">
          {author ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={author.avatar_url ?? '/avatar-placeholder.png'}
                alt={author.display_name ?? 'author'}
                className="h-6 w-6 rounded-full object-cover"
              />
              <span>
                by {author.display_name ?? 'Unknown'}
                {author.nickname ? <span className="ml-1 text-gray-500">({author.nickname})</span> : null}
              </span>
            </>
          ) : (
            <span>by Unknown</span>
          )}
          {recipe.cuisine ? <span>• {recipe.cuisine}</span> : null}
          {recipe.visibility !== 'public' ? (
            <span className="ml-2 rounded bg-gray-200 px-1 py-0.5 text-[10px] uppercase tracking-wide">
              {recipe.visibility}
            </span>
          ) : null}
        </div>
      </div>

      {recipe.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={recipe.photo_url}
          alt={recipe.title}
          className="mb-4 w-full rounded border object-cover"
        />
      ) : null}

      <h2 className="mt-4 mb-2 text-lg font-medium">Instructions</h2>
      <pre className="whitespace-pre-wrap rounded border bg-gray-50 p-3 text-sm">
        {recipe.instructions}
      </pre>
    </div>
  );
}
