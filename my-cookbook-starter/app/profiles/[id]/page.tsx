// app/profiles/[id]/page.tsx
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(url, anon);

type Profile = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
};

export default async function ProfilePage({ params }: { params: { id: string } }) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, display_name, nickname, avatar_url')
    .eq('id', params.id)
    .single();

  if (error || !profile) return notFound();

  return (
    <div className="mx-auto max-w-2xl p-4">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={profile.avatar_url ?? '/avatar-placeholder.png'}
          alt={profile.display_name ?? 'user'}
          className="h-16 w-16 rounded-full object-cover"
        />
        <div>
          <h1 className="text-2xl font-semibold">{profile.display_name ?? 'Unknown'}</h1>
          {profile.nickname ? <p className="text-gray-600">({profile.nickname})</p> : null}
        </div>
      </div>

      {/* Add anything else you want here: follow/friend, their public recipes, etc. */}
      <div className="mt-6 text-sm text-gray-500">
        This is a minimal profile page. We can list their recipes next.
      </div>
    </div>
  );
}
