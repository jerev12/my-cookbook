'use client';

import { MouseEvent } from 'react';
import FriendsList from './FriendsList';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FriendsListModal({ open, onClose }: Props) {
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
        zIndex: 60, // above the recipe modal (which used 50)
      }}
      aria-modal="true"
      role="dialog"
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(800px, 94vw)',
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          position: 'relative',
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

        {/* Body */}
        <div style={{ marginTop: 8 }}>
          <FriendsList />
        </div>
      </div>
    </div>
  );
}
