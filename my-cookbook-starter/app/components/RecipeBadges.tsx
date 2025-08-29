'use client';

type Props = {
  types?: string[] | null;   // recipe.recipe_types from DB
  max?: number;              // how many badges to show before collapsing into +N
};

export default function RecipeBadges({ types, max = 2 }: Props) {
  if (!types || types.length === 0) return null;

  const shown = types.slice(0, max);
  const extra = types.length - shown.length;

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {shown.map((t) => (
        <span
          key={t}
          style={{
            fontSize: 12,
            padding: '4px 8px',
            borderRadius: 999,
            background: '#f1f5f9',
            border: '1px solid #e5e7eb',
            lineHeight: 1.2,
          }}
        >
          {t}
        </span>
      ))}
      {extra > 0 && (
        <span
          style={{
            fontSize: 12,
            padding: '4px 8px',
            borderRadius: 999,
            background: '#f1f5f9',
            border: '1px solid #e5e7eb',
            lineHeight: 1.2,
          }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
