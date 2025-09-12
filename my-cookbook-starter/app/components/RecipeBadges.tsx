'use client';
import React from 'react';
import RecipeImage from '@/app/components/RecipeImage';

/** ===============================
 *  Public API: things you can tweak here and pages will update everywhere
 *  =============================== */
export const recipeGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 1,                         // hairline separators
  background: '#e5e7eb',          // separator color
  borderRadius: 8,
  overflow: 'hidden',
};

// Tile “theme” (edit here to change look globally)
const TILE = {
  aspectRatio: '1 / 1' as const,  // '1 / 1' (square), '4 / 5' (portrait), '3 / 2' (landscape)
  overlayGradient: 'linear-gradient(0deg, rgba(17,24,39,0.70), rgba(17,24,39,0.30))',
  titleSize: 13,
  titleWeight: 700,
  textColor: 'rgba(255,255,255,0.92)',
};

/** ===============================
 *  Badges component (chips or compact inline text)
 *  =============================== */
type RecipeBadgesProps = {
  types?: string[] | null;
  max?: number;                 // only used for 'chips'
  variant?: 'chips' | 'overlay';
};

export default function RecipeBadges({ types, max = 2, variant = 'chips' }: RecipeBadgesProps) {
  if (!types || types.length === 0) return null;

  if (variant === 'overlay') {
    return (
      <span
        style={{
          color: TILE.textColor,
          fontSize: 12,
          lineHeight: 1.2,
          display: 'block',
          wordBreak: 'break-word',
        }}
      >
        {types.join(', ')}
      </span>
    );
  }

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

/** ===============================
 *  RecipeTile: full Instagram-style tile w/ image + bottom overlay
 *  =============================== */
export type RecipeTileProps = {
  title: string;
  types?: string[] | null;
  photoUrl?: string | null;
  onClick?: () => void;
  ariaLabel?: string;
};

export function RecipeTile({ title, types, photoUrl, onClick, ariaLabel }: RecipeTileProps) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel || `Open ${title}`}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        padding: 0,
        background: '#fff',
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {/* Image or fallback (pot + steam) */}
      <div style={{ width: '100%', aspectRatio: TILE.aspectRatio }}>
        <RecipeImage
          src={photoUrl || null}
          alt={title}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: 0, // tiles are square-cropped edges
          }}
        />
      </div>

      {/* Bottom overlay */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '8px 10px',
          background: TILE.overlayGradient,
          color: TILE.textColor,
        }}
      >
        <div
          style={{
            fontWeight: TILE.titleWeight,
            fontSize: TILE.titleSize,
            lineHeight: 1.2,
            marginBottom: types && types.length ? 2 : 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={title}
        >
          {title}
        </div>
        <RecipeBadges types={types} variant="overlay" />
      </div>
    </button>
  );
}
