'use client';

import { useEffect, useState, MouseEvent } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AvatarUpload from './AvatarUpload';

type Profile = {
  id: string;
  email?: string | null;
  display_name: string | null;
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  onSaved: (p: Profile) => void;
};

export default function ProfileEditModal({ open, onClose, profile, onSaved }: Props) {
  const [draft, setDraft] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // When profile prop changes, refresh local draft
  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  // ⛔ Lock background scroll while the modal is open (works on iOS)
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
      document.body.style.position = original.position;
      document.body.style.top = original.top;
      document.body.style.left = original.left;
      document.body.style.right = original.right;
      document.body.style.overflow = original.overflow;
      document.body.style.width = original.width;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // Close click handler: stop inner clicks from closing the modal
  function stop(e: MouseEvent<HTMLDivElement>) {
    e.stopPropagation();
  }

  // Save profile changes
  async function handleSave() {
    try {
      setSaving(true);
      const { error, data } = await supabase
        .from('profiles')
        .update({
          display_name: draft.display_name,
          nickname: draft.nickname,
          bio: draft.bio,
          avatar_url: draft.avatar_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id)
        .select('id, email, display_name, nickname, bio, avatar_url')
        .single();

      if (error) {
        console.error(error);
        alert('Save failed');
        return;
      }

      onSaved(data as Profile);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // Logout from inside the modal
  async function handleLogout() {
    try {
      setLoggingOut(true);
      await supabase.auth.signOut();
      window.location.href = '/login';
    } finally {
      setLoggingOut(false);
    }
  }

  // ✅ Avatar upload handler with cache-busting (forces image refresh immediately)
  function handleAvatarUploaded(url: string) {
    if (!url) return;
    const cacheBusted = url.includes('?') ? `${url}&v=${Date.now()}` : `${url}?v=${Date.now()}`;
    setDraft((d) => ({ ...d, avatar_url: cacheBusted }));
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        touchAction: 'none', // extra guard on mobile
      }}
      aria-modal="true"
      role="dialog"
      onClick={onClose}
    >
      {/* backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }} />

      {/* panel */}
      <div
        onClick={stop}
        style={{
          position: 'relative',
          zIndex: 201,
          width: 'min(92vw, 800px)',
          maxHeight: '90vh',             // 🔑 modal content scrolls, not background
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,.25)',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18 }}>Edit Profile</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: '1px solid #ddd',
              borderRadius: 6,
              padding: '4px 8px',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* body: scrollable interior */}
        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 96px)', paddingRight: 4 }}>
          {/* Stack vertically for small screens: avatar first, then fields */}
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Avatar block */}
            <div>
              <AvatarUpload
                userId={draft.id}
                currentUrl={draft.avatar_url ?? undefined}
                onUploaded={handleAvatarUploaded}
                layout="stack"
              />
            </div>

            {/* Fields BELOW avatar (mobile-friendly) */}
            <div style={{ display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Display name</span>
                <input
                  value={draft.display_name ?? ''}
                  onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Nickname</span>
                <input
                  value={draft.nickname ?? ''}
                  onChange={(e) => setDraft({ ...draft, nickname: e.target.value })}
                  placeholder="Optional"
                  style={{
                    padding: '8px 10px',
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Bio</span>
                <textarea
                  rows={4}
                  value={draft.bio ?? ''}
                  onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    resize: 'vertical',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* footer (sticky at bottom of panel) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
          }}
        >
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              padding: '8px 12px',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 12px',
                background: '#fff',
                border: '1px solid #ddd',
                borderRadius: 8,
                cursor: 'pointer',
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '8px 12px',
                background: '#111',
                color: '#fff',
                borderRadius: 8,
                border: '1px solid #111',
                cursor: 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
