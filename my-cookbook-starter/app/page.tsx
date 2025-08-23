'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/cookbook');
      } else {
        router.replace('/login');
      }
    })();
  }, [router]);

  // Tiny splash while we decide where to go
  return <main style={{ padding: 16 }}>Loading…</main>;
}
