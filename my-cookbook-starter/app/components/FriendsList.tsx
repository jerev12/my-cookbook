'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

export default function FriendsList() {
  const [me, setMe] = useState<string | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Track MY outgoing edges so we can flip Friend/Add Friend without reloading
  const [myOutEdges, setMyOutEdges] = useState<Set<string>>(new Set());

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMe(null); setFriends([]); setLoading(false); return; }
      setMe(user.id);

      // 1) Start with MUTUAL friends only (clean initial list)
      const { data: ids, error: idsErr } = await supabase.rpc('get_mutual_friend_ids', { uid: user.id });
      if (idsErr) {
        console.error(idsErr);
        setFriends([]);
        setLoading(false);
        return;
      }
      const friendIds: string[] = (ids as string[]) ?? [];

      // 2) Load MY outgoing edges (to decide button state)
      const { data: outRows, error: outErr } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', user.id);
      if (outErr) console.error(outErr);
      const outSet = new Set<string>((outRows ?? []).map(r => r.friend_id as string));
      if (!ignore) setMyOutEdges(outSet);

      // 3) Fetch profile details for rows
      if (friendIds.length === 0) {
        if (!ignore) { setFriends([]); setLoading(false); }
        return;
      }
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', friendIds);

      if (!ignore) {
        if (profErr) {
          console.error(profErr);
          setFriends([]);
        } else {
          const sorted = [...(profiles ?? [])].sort((a: Profile, b: Profile) => {
            const an = (a.display_name ?? '').toLowerCase();
            const bn = (b.display_name ?? '').toLowerCase();
            if (an < bn) return -1;
            if (an > bn) return 1;
            return a.id < b.id ? -1 : 1;
          });
          setFriends(sorted);
        }
        setLoading(false);
      }
    }

    load();
    return () => { ignore = true; };
  }, []);

  async function addFriend(friendId: string) {
    if (!me) return;
    const { error } = await supabase
      .from('friends')
      .insert({ user_id: me, friend_id: friendId });

    if (error) {
      console.error(error);
      alert('Could not add friend.');
      return;
    }
    setMyOutEdges(prev => new Set(prev).add(friendId));
  }

  async function unfriend(friendId: string) {
    if (!me) return;
    const ok = window.confirm('Remove this friend?');
    if (!ok) return;

    const { error } = await supabase
      .from('friends')
      .delete()
      .match({ user_id: me, friend_id: friendId });

    if (error) {
      console.error(error);
      alert('Could not remove friend.');
      return;
    }

    // Keep the row visible until modal closes; just flip the button state
    setMyOutEdges(prev => {
      const next = new Set(prev);
      next.delete(friendId);
      return next;
    });
  }

  const content = useMemo(() => {
    if (loading) return <p>Loading…</p>;
    if (friends.length === 0) return <p>No friends yet.</p>;

    return (
      <ul style={{ maxHeight: '65vh', overflow: 'auto', paddingRight: 4, margin: 0, listStyle: 'none' }}>
        {friends.map((f) => {
          const iFollow = myOutEdges.has(f.id); // my current edge exists?
          const baseBtn: React.CSSProperties = {
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid #ddd',
            fontSize: 14,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          };
          const btnFriend: React.CSSProperties = {
            ...baseBtn,
            background: '#4CAF50',
            borderColor: '#4CAF50',
            color: '#fff',
          };
          const btnAdd: React.CSSProperties = {
            ...baseBtn,
            background: '#eee',
            color: '#111',
          };

          // Use display_name as handle (URL-encode). Fallback to id if missing.
          const handle = f.display_name ? encodeURIComponent(f.display_name) : f.id;
          const href = `/u/${handle}`;

          return (
            <li
              key={f.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                border: '1px solid #eee',
                borderRadius: 12,
                padding: 10,
                marginBottom: 8,
              }}
            >
              {/* Left: open their public My Cookbook */}
              <Link
                href={href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  textDecoration: 'none',
                  color: 'inherit',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <img
                  src={f.avatar_url || '/avatar-placeholder.png'}
                  alt=""
                  style={{
                    height: 40, width: 40, borderRadius: '50%',
                    objectFit: 'cover', border: '1px solid #ddd'
                  }}
                />
                <div style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.display_name || f.id}
                </div>
              </Link>

              {/* Right: status button (prevent link navigation) */}
              {iFollow ? (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); unfriend(f.id); }}
                  style={btnFriend}
                  aria-label="Remove friend"
                  title="Remove friend"
                >
                  Friend
                </button>
              ) : (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); addFriend(f.id); }}
                  style={btnAdd}
                  aria-label="Add friend"
                  title="Add friend"
                >
                  Add Friend
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }, [friends, loading, myOutEdges]);

  return content;
}
