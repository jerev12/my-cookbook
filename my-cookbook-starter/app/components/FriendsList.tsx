'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

export default function FriendsList() {
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFriends([]); setLoading(false); return; }

      // Get friend ids via RPC we added earlier
      const { data: ids, error: idsErr } = await supabase.rpc('get_friend_ids', { uid: user.id });
      if (idsErr) {
        console.error(idsErr);
        setFriends([]);
        setLoading(false);
        return;
      }
      const friendIds: string[] = (ids as string[]) ?? [];
      if (friendIds.length === 0) {
        setFriends([]);
        setLoading(false);
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

  if (loading) return <p>Loading…</p>;
  if (friends.length === 0) return <p>No friends yet.</p>;

  return (
    <ul className="max-h-[65vh] space-y-3 overflow-auto pr-1">
      {friends.map(f => (
        <li key={f.id} className="flex items-center gap-3 rounded border p-3">
          <img
            src={f.avatar_url || '/avatar-placeholder.png'}
            className="h-10 w-10 rounded-full border object-cover"
            alt=""
          />
          <span className="font-medium">{f.display_name || f.id}</span>
        </li>
      ))}
    </ul>
  );
}
