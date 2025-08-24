'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';

type Profile = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
};

type Recipe = {
  id: string;
  title: string;
  cuisine: string | null;
  photo_url: string | null;
  source_url: string | null;
  user_id: string;
};

export default function PublicCookbookPage() {
  const { handle } = useParams<{ handle: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [friendCount, setFriendCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      setErr(null);

      // 1) Look up the user by their display_name (handle)
      const { data: prof, error: pErr } = await supabase
        .from('profiles')
        .select('id, display_name, nickname, bio, avatar_url')
        .eq('display_name', decodeURIComponent(handle))
        .single();

      if (pErr || !prof) {
        if (!ignore) {
          setErr('User not found');
          setLoading(false);
        }
        return;
      }

      const target = prof as Profile;
      if (!ignore) setProfile(target);

      // 2) Friend count (mutuals) for this person
      const { data: fc } = await supabase.rpc('friend_count', { uid: target.id });
      if (!ignore && typeof fc === 'number') setFriendCount(fc as number);

      // 3) Recipes visible to the CURRENT viewer:
      //    - If viewer is anon: only public recipes (policy allows anon reads for public).
      //    - If viewer is logged in and is a friend: public + friends.
      //    - If viewer = owner: public + friends + private.
      //    Your existing RLS policy enforces all of that automatically.
      const { data: recs, error: rErr } = await supabase
        .from('recipes')
        .select('id,title,cuisine,photo_url,source_url,user_id')
        .eq('user_id', target.id)
        .order('created_at', { ascending: false });

      if (!ignore) {
        if (rErr) {
          setErr(rErr.message);
        } else {
          setRecipes((recs as Recipe[]) ?? []);
        }
        setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [handle]);

  const recipesCount = recipes.length;

  if (loading) return <div style={{ padding: 16 }}>Loading…</div>;
  if (err) return <div style={{ padding: 16, color: '#b42318' }}>{err}</div>;
  if (!profile) return null;

  // --- simple mobile-first styles reused from your main page ---
  const statWrap: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  };
  const statCard: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: 10,
    padding: 10,
    textAlign: 'center',
    userSelect: 'none',
  };
  const statNumber: React.CSSProperties = {
    fontWeight: 800,
    fontSize: 20,
    lineHeight: 1.1,
  };
  const statLabel: React.CSSProperties = {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  };

  return (
    <div style={{ maxWidth: 1100, margin: '24px auto', padding: 16 }}>
      {/* Simple header with back */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          style={{ border: '1px solid #eee', borderRadius: 8, padding: '6px 10px', background: '#fff' }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 20 }}>{profile.display_name}</h1>
      </header>

      {/* Public profile block (no box, like yours) */}
      <section>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            gap: 12,
            alignItems: 'start',
          }}
        >
          <img
            src={profile.avatar_url || '/avatar-placeholder.png'}
            alt=""
            style={{
              width: 120, height: 120, borderRadius: '50%',
              objectFit: 'cover', border: '1px solid #ddd', background: '#f5f5f5',
            }}
          />
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{profile.display_name}</div>
            {profile.nickname ? (
              <div style={{ fontSize: 13, color: '#666' }}>{profile.nickname}</div>
            ) : null}
            {profile.bio ? (
              <div style={{ whiteSpace: 'pre-wrap', color: '#222', marginTop: 4 }}>{profile.bio}</div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Stats row: Friends / Recipes / Recipes Cooked (placeholder 0) */}
      <div style={statWrap}>
        <div style={statCard}>
          <div style={statNumber}>{friendCount}</div>
          <div style={statLabel}>Friends</div>
        </div>
        <div style={statCard}>
          <div style={statNumber}>{recipesCount}</div>
          <div style={statLabel}>Recipes</div>
        </div>
        <div style={statCard}>
          <div style={statNumber}>0</div>
          <div style={statLabel}>Recipes Cooked</div>
        </div>
      </div>

      {/* Recipes grid (RLS already filtered by viewer permissions) */}
      {recipes.length === 0 ? (
        <div
          style={{
            background: '#fff',
            border: '1px solid #eee',
            borderRadius: 12,
            padding: 16,
            color: '#606375',
          }}
        >
          No recipes to show.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))',
            gap: 12,
          }}
        >
          {recipes.map((r) => (
            <a
              key={r.id}
              href={r.source_url || '#'}
              target={r.source_url ? '_blank' : undefined}
              rel={r.source_url ? 'noreferrer' : undefined}
              style={{
                border: '1px solid #eee',
                borderRadius: 12,
                padding: 10,
                background: '#fff',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              {r.photo_url ? (
                <img
                  src={r.photo_url}
                  alt={r.title}
                  style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8 }}
                />
              ) : null}
              <div style={{ fontWeight: 600, marginTop: 6, fontSize: 14 }}>{r.title}</div>
              <div style={{ color: '#666', fontSize: 12 }}>{r.cuisine || '—'}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
