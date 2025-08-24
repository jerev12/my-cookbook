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

export default function ProfileSection() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      // Fetch profile
      const { data: p, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, bio, avatar_url')
        .eq('id', user.id)
        .single();

      // If somehow missing (older users created before your trigger), create a minimal row
      if (error && (error as any).code === 'PGRST116') {
        const fallback = {
          id: user.id,
          email: user.email ?? null,
          display_name: user.email ?? '',
          bio: null,
          avatar_url: null,
        };
        const { data: inserted, error: insErr } = await supabase
          .from('profiles')
          .insert({
            id: fallback.id,
            email: fallback.email,
            display_name: fallback.display_name,
          })
          .select('id, email, display_name, bio, avatar_url')
          .single();
        if (!ignore && !insErr) setProfile(inserted as Profile);
      } else if (!ignore) {
        setProfile(p as Profile);
      }

      if (!ignore) setLoading(false);
    }

    load();
    return () => { ignore = true; };
  }, []);

  async function save() {
    if (!userId || !profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: profile.display_name,
        bio: profile.bio,
        avatar_url: profile.avatar_url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    setSaving(false);
    if (error) alert('Save failed'); else alert('Saved!');
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login'; // adjust to your auth route
  }

  if (loading) return null;
  if (!profile) return null;

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 text-lg font-semibold">My Profile</h2>

      <div className="mb-4">
        <AvatarUpload
          userId={profile.id}
          currentUrl={profile.avatar_url ?? undefined}
          onUploaded={(url) => setProfile({ ...profile, avatar_url: url })}
        />
      </div>

      <div className="mb-3">
        <label className="block text-sm font-medium mb-1">Display name</label>
        <input
          className="w-full rounded border px-3 py-2"
          value={profile.display_name ?? ''}
          onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Bio</label>
        <textarea
          className="w-full rounded border px-3 py-2"
          rows={3}
          value={profile.bio ?? ''}
          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={logout}
          className="rounded border px-3 py-2"
        >
          Logout
        </button>
      </div>
    </section>
  );
}
