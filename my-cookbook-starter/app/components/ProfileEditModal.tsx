'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import AvatarUpload from './AvatarUpload';

type Profile = {
  id: string;
  email?: string | null;
  display_name: string | null;
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
  const [loggingOut, setLoggingOut] = useState(false); // NEW

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  async function handleSave() {
    try {
      setSaving(true);
      const { error, data } = await supabase
        .from('profiles')
        .update({
          display_name: draft.display_name,
          bio: draft.bio,
          avatar_url: draft.avatar_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', draft.id)
        .select('id, email, display_name, bio, avatar_url')
        .single();

      if (error) {
        alert('Save failed');
        return;
      }

      onSaved(data as Profile);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // NEW: Logout inside modal
  async function handleLogout() {
    try {
      setLoggingOut(true);
      await supabase.auth.signOut();
      // Redirect to login (adjust path if your login route differs)
      window.location.href = '/login';
    } finally {
      setLoggingOut(false);
    }
  }

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      aria-modal="true" role="dialog"
      onClick={onClose}
    >
      {/* backdrop */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }} />

      {/* panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 201, width: 'min(92vw, 800px)',
          background: '#fff', borderRadius: 12, padding: 16,
          boxShadow: '0 10px 30px rgba(0,0,0,.25)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Edit Profile</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: '1px solid #ddd', borderRadius: 6, padding: '4px 8px', background: '#fff' }}
          >
            ✕
          </button>
        </div>

        {/* Grid: avatar left, fields right.
            NOTE: We pass layout="stack" so the file picker appears BELOW the image (no overlap). */}
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>
          <div>
            <AvatarUpload
              userId={draft.id}
              currentUrl={draft.avatar_url ?? undefined}
              onUploaded={(url) => setDraft({ ...draft, avatar_url: url })}
              layout="stack"  // NEW: stack controls under the image
            />
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Display name</span>
              <input
                value={draft.display_name ?? ''}
                onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Bio</span>
              <textarea
                rows={4}
                value={draft.bio ?? ''}
                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, resize: 'vertical' }}
              />
            </label>
          </div>
        </div>

        {/* Footer: Cancel / Save on the right, Logout on the left */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{ padding: '8px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 8 }}
          >
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ padding: '8px 12px', background: '#fff', border: '1px solid #ddd', borderRadius: 8 }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '8px 12px', background: '#111', color: '#fff', borderRadius: 8, border: '1px solid #111' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
