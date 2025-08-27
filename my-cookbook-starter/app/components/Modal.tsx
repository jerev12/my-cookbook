'use client';

import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string; // keep as plain string (Option A)
  children: ReactNode;
};

export default function Modal({ open, onClose, title, children }: ModalProps) {
  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock background scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [open]);

  if (!open) return null;
  if (typeof window === 'undefined') return null; // SSR guard

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Panel */}
      <div className="relative z-[1001] w-[90vw] max-w-xl rounded-lg bg-white shadow-lg">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <h2 className="text-lg font-semibold">{title ?? ''}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
