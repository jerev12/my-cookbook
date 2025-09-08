'use client';

import { MouseEvent, useEffect } from 'react';
import FriendsList from './FriendsList';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FriendsListModal({ open, onClose }: Props) {
  // ⛔ Lock background scroll while modal is open (iOS-friendly)
  useEffect(() => {
    if (!open) return;

    const scrollY = window.scrollY;
    const original = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      overflow: document.body.style.overflow,
      width: document.body.style.width,
    };

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100%';

    return () => {
      // restore body styles
      document.body.style.position = original.position;
      document.body.style.top = original.top;
      document.body.style.left = original.left;
      document.body.style.right = original.right;
      document.body.style.overflow = original.overflow;
      document.body.style.width = original.width;
      // scroll back to previous position
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (!open) return null;

  function stop(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        zIndex: 60, // above the recipe modal
        touchAction: 'none', // extra safety on mobile to prevent background scroll
      }}
      aria-modal="true"
      role="dialog"
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(800px, 94vw)',
          maxHeight: '90vh',
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          position: 'relative',
          overflow: 'hidden', // guard: content scrolls, backdrop stays put
          boxSizing: 'border-box',
        }}
        onClick={stop}
      >
        {/* Close button only (no title) */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: '4px 8px',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>

        {/* Body: make inner content scroll, not the page */}
        <div style={{ marginTop: 8, overflowY: 'auto', maxHeight: 'calc(90vh - 48px)' }}>
          <FriendsList />
        </div>
      </div>
    </div>
  );
}
