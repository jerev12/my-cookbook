// app/test-recipe-card/page.tsx
import RecipeCard from '@/components/RecipeCard';

export default function TestRecipeCardPage() {
  const sample = {
    id: 'demo-1',
    title: 'Grandma’s Sunday Sauce',
    cuisine: 'Italian',
    photo_url: null,
    ingredients: ['2 lb tomatoes', '3 cloves garlic', 'Olive oil', 'Salt', 'Pepper', 'Basil'],
    instructions:
      'Heat oil in a large pot.\nSauté garlic until fragrant.\nAdd tomatoes and simmer 45 minutes.\nSeason and stir in basil.\nServe over pasta.',
    created_at: '2025-08-20T12:00:00Z',
  };

  return (
    <main className="p-4">
      <h1 className="text-lg font-semibold mb-4">Recipe Card Preview</h1>
      <RecipeCard {...sample} />
    </main>
  );
}
