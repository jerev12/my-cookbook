'use client';
import React from 'react';

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  radius?: number;
  objectFit?: React.CSSProperties['objectFit'];
};

export default function RecipeImage({
  src,
  alt,
  className,
  style,
  radius = 0,
  objectFit = 'cover',
}: Props) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={className}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit,
          borderRadius: radius,
          ...style,
        }}
      />
    );
  }

  // Placeholder: pot with upward steam, scaled larger
  return (
    <div
      className={className}
      aria-hidden
      style={{
        display: 'grid',
        placeItems: 'center',
        width: '100%',
        height: '100%',
        background: '#f3f4f6',
        borderRadius: radius,
        ...style,
      }}
    >
      <svg
        viewBox="0 0 120 120"
        width="72"
        height="72"
        role="img"
        aria-label="Cooking pot"
      >
        {/* Steam wisps (simpler curves, rising straight up) */}
        <path
          d="M60 20c-4 6-4 12 0 18M72 20c-4 6-4 12 0 18M48 20c-4 6-4 12 0 18"
          stroke="#9ca3af"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />

        {/* Pot lid */}
        <rect
          x="30"
          y="50"
          width="60"
          height="8"
          rx="4"
          fill="#cbd5e1"
        />
        <rect
          x="55"
          y="44"
          width="10"
          height="6"
          rx="3"
          fill="#94a3b8"
        />

        {/* Pot body */}
        <rect
          x="28"
          y="58"
          width="64"
          height="36"
          rx="6"
          fill="#d1d5db"
          stroke="#9ca3af"
          strokeWidth="2"
        />

        {/* Handles */}
        <rect x="18" y="64" width="10" height="12" rx="4" fill="#9ca3af" />
        <rect x="92" y="64" width="10" height="12" rx="4" fill="#9ca3af" />
      </svg>
    </div>
  );
}
