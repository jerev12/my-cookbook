'use client';

import React from 'react';

type Props = {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * RecipeImage shows either the real recipe photo (if provided)
 * or a fallback placeholder (pot with steam).
 */
export default function RecipeImage({ src, alt = 'Recipe photo', className, style }: Props) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          borderRadius: 8,
          background: '#f8fafc',
          ...style,
        }}
      />
    );
  }

  // Fallback: pot with steam icon
  return (
    <div
      className={className}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        background: '#f8fafc',
        color: '#9ca3af',
        ...style,
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 10h18" />
        <path d="M19 10v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8" />
        <path d="M8 6a2 2 0 1 1 4 0c0 1-1 1.5-1 2" />
        <path d="M12 6a2 2 0 1 1 4 0c0 1-1 1.5-1 2" />
      </svg>
    </div>
  );
}
