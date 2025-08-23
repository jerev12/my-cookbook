'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Recipe = {
  id: string;
  title: string;
  photo_url: string | null;
  cuisine: string | null;
  source_url: string | null;
  visibility: 'public' | 'friends' | 'private';
  created_at: string;
  user_id: string; // author id
};

export default function FriendsPage() {
  const [loading, setLoading] = useState(true);
  const [authMissing, setAuthMissing] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErrorMsg(null);

      // 1) Must be signed in to have a friends feed
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userRes?.user) {
        if (!active) return;
        setAuthMissing(true);
        setLoading(false);
        return;
      }
      const myId = userRes.user.id;

      // 2) Get my friend ids (public table, but we filter by me)
      const { data: friendRows, error: fErr } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', myId);

      if (fErr) {
        if (!active) return;
        setErrorMsg(fErr.message);
        setLoading(false);
        return;
      }

      const friendIds = (friendRows ?? []).map((r) => r.friend_id);
      if (friendIds.length === 0) {
        if (!active) return;
        setRecipes([]);
        setLoading(false);
        return;
      }

      // 3) Load recipes from those authors.
      // RLS already hides anything private (and allows public + friends for you).
      // We filter to public/friends purely for efficiency.
      const { data: recs, error: rErr } = await supabase
        .from('recipes')
        .select('id,title,photo_url,cuisine,source_url,visibility,created_at,user_id')
        .in('user_id', friendIds)
        .in('visibility', ['public', 'friends'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (rErr) {
        if (!active) return;
        setErrorMsg(rErr.message);
      } else {
        if (!active) return;
        setRecipes((recs as Recipe[]) ?? []);
      }

      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  if (authMissing) {
    return (
      <div style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Friends</h1>
        <p style={{ marginTop: 8, color: '#606375' }}>
          Please <Link href="/login">sign in</Link> to view your friends feed.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>Friends</h1>
      <p style={{ marginTop: 8, color: '#606375' }}>
        Recipes shared by your friends (public & friends‑only).
      </p>

      {loading ? (
        <div style={{ marginTop: 12 }}>Loading…</div>
      ) : errorMsg ? (
        <div style={{ marginTop: 12, color: '#b42318' }}>{errorMsg}</div>
      ) : recipes.length === 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            border: '1px solid #e6e7ee',
            borderRadius: 10,
            background: '#fff',
            color: '#606375',
          }}
        >
          <b>No posts yet.</b> Add some friends and you’ll see their recipes here.
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px,1fr))',
            gap: 16,
          }}
        >
          {recipes.map((r) => (
            <article
              key={r.id}
              style={{
                border: '1px solid #eee',
                borderRadius: 12,
                background: '#fff',
                padding: 12,
              }}
            >
              {r.photo_url ? (
                <img
                  src={r.photo_url}
                  alt={r.title}
                  style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8 }}
                />
              ) : null}
              <div style={{ fontWeight: 600, marginTop: 8 }}>{r.title}</div>
              <div style={{ color: '#666', fontSize: 13 }}>{r.cuisine || '—'}</div>
              <div style={{ color: '#7a7d8f', fontSize: 12, marginTop: 6 }}>
                {r.visibility} • {new Date(r.created_at).toLocaleString()}
              </div>
              {r.source_url ? (
                <a
                  href={r.source_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-block', marginTop: 8, fontSize: 13 }}
                >
                  Open Source
                </a>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
