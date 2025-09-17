'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import ProfileEditModal from './ProfileEditModal';

type Profile = {
  id: string;
  email?: string | null;
  display_name: string | null;
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export default function ProfileSection() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [openEdit, setOpenEdit] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: p } = await supabase
        .from('profiles')
        .select('id, email, display_name, nickname, bio, avatar_url')
        .eq('id', user.id)
        .single();

      if (!ignore) {
        if (p) {
          setProfile(p as Profile);
        } else {
          const { data: inserted } = await supabase
            .from('profiles')
            .insert({ id: user.id, email: user.email, display_name: user.email, nickname: null })
            .select('id, email, display_name, nickname, bio, avatar_url')
            .single();
          setProfile(inserted as Profile);
        }
        setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, []);

  if (loading || !profile) return null;

  return (
    <section>
      {/* Layout: avatar left, text right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '110px 1fr', // tuned for 100px avatar + ~10px breathing room
          gap: 12,
          alignItems: 'start',
        }}
      >
        {/* Avatar */}
        <div>
          <img
            src={profile.avatar_url || '/avatar-placeholder.png'}
            alt="avatar"
            style={{
              width: 100,
              height: 100,
              borderRadius: '50%',
              objectFit: 'cover',
              border: '1px solid #ddd',
              background: '#f5f5f5',
            }}
          />
        </div>

        {/* Text details */}
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            {profile.display_name || '—'}
          </div>
          <div style={{ fontSize: 13, color: '#666' }}>
            {profile.nickname || ' '}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', color: '#222', marginTop: 4 }}>
            {profile.bio || ''}
          </div>
          <div style={{ marginTop: 8 }}>
            <button
              onClick={() => setOpenEdit(true)}
              style={{
                padding: '8px 12px',
                background: '#111',
                color: '#fff',
                borderRadius: 8,
                border: '1px solid #111',
              }}
            >
              Edit Profile
            </button>
          </div>
        </div>
      </div>

      {/* Edit modal */}
      <ProfileEditModal
        open={openEdit}
        onClose={() => setOpenEdit(false)}
        profile={profile}
        onSaved={(p) => setProfile(p)}
      />
    </section>
  );
}
