'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient'; // if this fails, switch to a relative path: '../../lib/supabaseClient'

type Props = { children: React.ReactNode; redirectTo?: string };

export default function AuthGuard({ children, redirectTo = '/login' }: Props) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session) {
        router.replace(redirectTo);
      } else {
        setChecking(false);
      }

      const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
        if (!newSession) {
          router.replace(redirectTo);
        } else {
          setChecking(false);
        }
      });

      return () => {
        listener.subscription.unsubscribe();
      };
    })();

    return () => {
      mounted = false;
    };
  }, [router, redirectTo]);

  if (checking) {
    return <p style={{ padding: 16 }}>Loading…</p>;
  }

  return <>{children}</>;
}
