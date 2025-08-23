'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/friends',   label: 'Friends' },
  { href: '/community', label: 'Community' },
  { href: '/cookbook',  label: 'My Cookbook' },
];

export default function BottomTabs() {
  const pathname = usePathname();

  // Container: fixed to bottom, full width, safe-area aware
  const barStyle: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    display: 'flex',
    gap: 0,
    borderTop: '1px solid #e6e7ee',
    background: '#ffffff',
    boxShadow: '0 -1px 3px rgba(16,24,40,0.06)',
    paddingBottom: 'env(safe-area-inset-bottom)', // iOS notch support
  };

  // Each tab is a full‑bleed button; min height for touch targets
  const baseBtn: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    padding: '12px 8px',
    minHeight: 56,
    fontSize: 14,
    lineHeight: 1,
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    borderRight: '1px solid #f0f0f4',
    color: '#606375',
  };

  const activeBtn: React.CSSProperties = {
    color: '#1f2333',
    fontWeight: 600,
    background: '#f7f7fb',
  };

  return (
    <nav role="navigation" aria-label="Bottom navigation" style={barStyle}>
      {TABS.map((t, i) => {
        const isActive = pathname?.startsWith(t.href);
        const style: React.CSSProperties = {
          ...baseBtn,
          ...(isActive ? activeBtn : {}),
          // remove right border on the last tab for a clean edge
          ...(i === TABS.length - 1 ? { borderRight: 'none' } : {}),
        };

        return (
          <Link
            key={t.href}
            href={t.href}
            style={style}
            aria-current={isActive ? 'page' : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
