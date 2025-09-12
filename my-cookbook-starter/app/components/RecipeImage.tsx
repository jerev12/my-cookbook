'use client';
import React from 'react';

type Props = {
  /** Public image URL. If null/empty, we show the pot-with-steam placeholder. */
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  /** Optional: round the corners of the rendered image/placeholder. */
  radius?: number;
  /** Optional: objectFit for the real image (default 'cover') */
  objectFit?: React.CSSProperties['objectFit'];
};

/**
 * RecipeImage
 * - Renders the recipe photo when `src` is provided
 * - Otherwise renders a friendly pot-with-steam placeholder
 * - Designed to fill whatever container size/aspect you give it
 */
export default function RecipeImage({
  src,
  alt,
  className,
  style,
  radius = 0,
  objectFit = 'cover',
}: Props) {
  if (src) {
    // Real image
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

  // Placeholder (pot + cloud-like steam)
  return (
    <div
      className={className}
      aria-hidden
      style={{
        display: 'grid',
        placeItems: 'center',
        width: '100%',
        height: '100%',
        background: '#f3f4f6',       // light gray background
        borderRadius: radius,
        ...style,
      }}
    >
      <svg
        viewBox="0 0 160 160"
        width="64"
        height="64"
        role="img"
        aria-label=""
      >
        {/* subtle backdrop circle to feel centered */}
        <circle cx="80" cy="80" r="58" fill="#f8fafc" />

        {/* === STEAM (puffy cloud style) === */}
        {/* A small cluster of overlapping circles that sits just above the lid, 
            with a tiny connector so it looks like it’s coming out of the pot. */}
        <g transform="translate(0, 4)">
          {/* cloud cluster */}
          <g fill="#e5e7eb" stroke="#d1d5db" strokeWidth="1">
            <circle cx="78" cy="56" r="10" />
            <circle cx="90" cy="60" r="8" />
            <circle cx="66" cy="61" r="8" />
            <circle cx="80" cy="64" r="9" />
          </g>
          {/* little connector plume that meets the lid */}
          <path
            d="M78 72c3 0 6-1 8-3 0 0-2 6-8 6s-8-6-8-6c2 2 5 3 8 3z"
            fill="#e5e7eb"
            stroke="#d1d5db"
            strokeWidth="1"
          />
        </g>

        {/* === LID === */}
        <g>
          {/* knob */}
          <rect x="76" y="74" width="8" height="6" rx="3" fill="#cbd5e1" />
          {/* lid bar */}
          <rect x="48" y="80" width="64" height="8" rx="4" fill="#cbd5e1" />
        </g>

        {/* === POT BODY === */}
        <g>
          {/* left handle */}
          <rect x="36" y="92" width="12" height="10" rx="5" fill="#d1d5db" />
          {/* right handle */}
          <rect x="112" y="92" width="12" height="10" rx="5" fill="#d1d5db" />
          {/* body */}
          <rect
            x="46"
            y="88"
            width="68"
            height="40"
            rx="8"
            fill="#d1d5db"
            stroke="#cbd5e1"
            strokeWidth="1"
          />
          {/* lip highlight */}
          <rect x="48" y="88" width="64" height="3" rx="1.5" fill="#e5e7eb" />
        </g>
      </svg>
    </div>
  );
}
