'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type Props = {
  userId: string;
  onOpen?: () => void; // if provided, we’ll call this instead of navigating
};

export default function FriendCount({ userId, onOpen }: Props) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.rpc('friend_count', { uid: userId });
      if (!ignore) {
        if (error) {
          console.error(error);
          setCount(0);
        } else {
          setCount((data as number) ?? 0);
        }
        setLoading(false);
      }
    }
    if (userId) load();
    return () => { ignore = true; };
  }, [userId]);

  const inner = (
    <>
      <span className="font-medium">Friends</span>
      <span className="rounded bg-gray-200 px-2 py-0.5 text-sm">
        {loading ? '…' : count ?? 0}
      </span>
    </>
  );

  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-gray-50"
      >
        {inner}
      </button>
    );
  }

  // fallback: behave like a link if no onOpen provided
  return (
    <Link
      href="/friends"
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-gray-50"
    >
      {inner}
    </Link>
  );
}
