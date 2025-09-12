'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import { RecipeTile } from '../components/RecipeBadges';
import RecipeModal from '../components/RecipeModal';

type Profile = {
  id: string;
  handle: string;
  display_name: string | null;
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
};

type Recipe = {
  id: string;
  user_id: string;
  title: string;
  cuisine: string | null;
  recipe_types: string[] | null;
  photo_url: string | null;
  source_url: string | null;
  created_at: string | null;
  visibility?: 'public' | 'friends' | 'private' | null;
};

type FriendshipStatus = 'none' | 'pending' | 'accepted' | 'blocked';

export default function OtherUserCookbookByHandlePage() {
  const { handle } = useParams<{ handle: string }>();
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [viewedProfile, setViewedProfile] = useState<Profile | null>(null);

  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>('none');
  const [pendingRequesterId, setPendingRequesterId] = useState<string | null>(null); // who initiated pending

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState<boolean>(true);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [pageCursor, setPageCursor] = useState<string | null>(null);

  const [recipesAddedCount, setRecipesAddedCount] = useState<number>(0);
  const [recipesCookedCount, setRecipesCookedCount] = useState<number>(0);
  const [friendsOfViewedUser, setFriendsOfViewedUser] = useState<Profile[]>([]);
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);

  const PAGE_SIZE = 24;

  // --- bootstrap current user ---
  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!on) return;
      setCurrentUserId(data.user?.id ?? null);
    })();
    return () => { on = false; };
  }, []);

  // --- load viewed profile by handle ---
  useEffect(() => {
    if (!handle) return;
    let on = true;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, handle, display_name, nickname, bio, avatar_url')
        .ilike('handle', String(handle)) // case-insensitive; switch to .eq if you enforce lowercasing
        .maybeSingle();

      if (!on) return;

      if (error) {
        console.error('Load profile error', error);
        return;
      }
      if (!data) {
        router.push('/404');
        return;
      }
      setViewedProfile(data as Profile);
    })();
    return () => { on = false; };
  }, [handle, router]);

  const viewedUserId = viewedProfile?.id ?? null;
  const isSelf = currentUserId && viewedUserId && currentUserId === viewedUserId;

  // --- friendship status between current user and viewed user ---
  useEffect(() => {
    if (!currentUserId || !viewedUserId || isSelf) {
      if (isSelf) {
        setFriendshipStatus('accepted');
        setPendingRequesterId(null);
      }
      return;
    }
    let on = true;

    (async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .or(
          `and(requester_id.eq.${currentUserId},addressee_id.eq.${viewedUserId}),and(requester_id.eq.${viewedUserId},addressee_id.eq.${currentUserId})`
        )
        .limit(1);

      if (!on) return;

      if (error) {
        console.error('Friendship fetch error', error);
        setFriendshipStatus('none');
        setPendingRequesterId(null);
        return;
      }

      const row = data?.[0];
      if (!row) {
        setFriendshipStatus('none');
        setPendingRequesterId(null);
      } else {
        setFriendshipStatus((row.status as FriendshipStatus) ?? 'none');
        setPendingRequesterId(row.requester_id ?? null);
      }
    })();

    return () => { on = false; };
  }, [currentUserId, viewedUserId, isSelf]);

  // --- counts (all recipes; cooked optional) ---
  useEffect(() => {
    if (!viewedUserId) return;
    let on = true;

    (async () => {
      const { count: addedCount, error: countErr } = await supabase
        .from('recipes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', viewedUserId);

      if (on) {
        if (countErr) console.error('Recipes Added count error', countErr);
        setRecipesAddedCount(addedCount ?? 0);
      }

      const { count: cookedCount, error: cookedErr } = await supabase
        .from('recipe_cooks')
        .select('*', { count: 'exact', head: true })
        .eq('cook_user_id', viewedUserId);

      if (on) {
        if (cookedErr) {
          console.warn('Recipes Cooked count skipped/failed', cookedErr.message);
          setRecipesCookedCount(0);
        } else {
          setRecipesCookedCount(cookedCount ?? 0);
        }
      }
    })();

    return () => { on = false; };
  }, [viewedUserId]);

  // --- friends list for the viewed user (accepted only) ---
  useEffect(() => {
    if (!viewedUserId) return;
    let on = true;

    (async () => {
      const { data: frows, error: ferr } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${viewedUserId},addressee_id.eq.${viewedUserId}`)
        .limit(200);

      if (!on) return;
      if (ferr) {
        console.error('Friends-of-viewed fetch error', ferr);
        setFriendsOfViewedUser([]);
        return;
      }

      const otherIds = (frows ?? []).map((r) =>
        r.requester_id === viewedUserId ? r.addressee_id : r.requester_id
      );
      if (otherIds.length === 0) {
        setFriendsOfViewedUser([]);
        return;
      }

      const { data: profs, error: perr } = await supabase
        .from('profiles')
        .select('id, display_name, nickname, avatar_url')
        .in('id', otherIds.slice(0, 50));

      if (perr) {
        console.error('Friend profiles fetch error', perr);
        setFriendsOfViewedUser([]);
      } else {
        setFriendsOfViewedUser(profs ?? []);
      }
    })();

    return () => { on = false; };
  }, [viewedUserId]);

  // --- visibility & recipes list (only what *I* can see) ---
  const isFriends = isSelf || friendshipStatus === 'accepted';

  const loadRecipes = useCallback(
    async (initial = false) => {
      if (!viewedUserId) return;
      setRecipesLoading(true);

      // Base query: recipes by viewed user
      let query = supabase
        .from('recipes')
        .select(
          'id, user_id, title, cuisine, recipe_types, photo_url, source_url, created_at, visibility',
          { count: 'exact' }
        )
        .eq('user_id', viewedUserId)
        .order('created_at', { ascending: false });

      // Apply visibility filter
      if (isFriends) {
        query = query.or('visibility.eq.public,visibility.eq.friends');
      } else {
        query = query.eq('visibility', 'public');
      }

      // Simple cursor
      if (!initial && pageCursor) {
        query = query.lt('created_at', pageCursor);
      }
      query = query.limit(PAGE_SIZE);

      const { data, error } = await query;
      if (error) {
        console.error('Recipes fetch error', error);
        setRecipesLoading(false);
        return;
      }

      const rows = data ?? [];
      setRecipes((prev) => (initial ? rows : [...prev, ...rows]));
      if (rows.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
        setPageCursor(rows[rows.length - 1]?.created_at ?? null);
      }
      setRecipesLoading(false);
    },
    [PAGE_SIZE, isFriends, pageCursor, viewedUserId]
  );

  // Reset & initial load when profile or friendship changes
  useEffect(() => {
    setRecipes([]);
    setPageCursor(null);
    setHasMore(true);
    if (viewedUserId) {
      loadRecipes(true);
    }
  }, [viewedUserId, isFriends, loadRecipes]);

  // --- inline friend button actions ---
  const canCancelPending =
    friendshipStatus === 'pending' && pendingRequesterId === currentUserId;

  const handleAddFriend = useCallback(async () => {
    if (!currentUserId || !viewedUserId || isSelf) return;
    const { error } = await supabase.from('friendships').insert([
      {
        requester_id: currentUserId,
        addressee_id: viewedUserId,
        status: 'pending',
      },
    ]);
    if (error) {
      console.error('Add friend error', error);
      return;
    }
    setFriendshipStatus('pending');
    setPendingRequesterId(currentUserId);
  }, [currentUserId, viewedUserId, isSelf]);

  const handleCancelRequest = useCallback(async () => {
    if (!currentUserId || !viewedUserId) return;
    const { error } = await supabase
      .from('friendships')
      .delete()
      .match({ requester_id: currentUserId, addressee_id: viewedUserId, status: 'pending' });
    if (error) {
      console.error('Cancel request error', error);
      return;
    }
    setFriendshipStatus('none');
    setPendingRequesterId(null);
  }, [currentUserId, viewedUserId]);

  const displayTitle = useMemo(() => {
    if (!viewedProfile) return 'Profile';
    return viewedProfile.display_name || viewedProfile.nickname || `@${viewedProfile.handle}`;
  }, [viewedProfile]);

  // --- stat tile handlers ---
  const handleClickFriends = useCallback(() => {
    router.push(`/users/${viewedUserId}/friends`); // adjust if you have a handle-based friends route instead
  }, [router, viewedUserId]);

  const handleClickRecipesAdded = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleClickRecipesCooked = useCallback(() => {
    router.push(`/users/${viewedUserId}/cooked`);
  }, [router, viewedUserId]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-gray-200">
          {viewedProfile?.avatar_url ? (
            <Image
              src={viewedProfile.avatar_url}
              alt={displayTitle}
              fill
              sizes="80px"
              style={{ objectFit: 'cover' }}
            />
          ) : null}
        </div>

        {/* Title + Bio */}
        <div className="flex-1">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{displayTitle}</h1>
              <p className="text-sm text-gray-600">@{viewedProfile?.handle}</p>
            </div>

            {/* Inline Friend Button (replaces Edit Profile) */}
            {viewedUserId && !isSelf ? (
              friendshipStatus === 'none' ? (
                <button
                  onClick={handleAddFriend}
                  className="rounded-md bg-black px-4 py-2 text-white hover:opacity-90"
                >
                  Add Friend
                </button>
              ) : friendshipStatus === 'pending' ? (
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md bg-gray-200 px-4 py-2 text-gray-800 cursor-default"
                    disabled
                  >
                    Requested
                  </button>
                  {canCancelPending ? (
                    <button
                      onClick={handleCancelRequest}
                      className="rounded-md border px-3 py-2 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              ) : friendshipStatus === 'accepted' ? (
                <button
                  className="rounded-md bg-green-600 px-4 py-2 text-white cursor-default"
                  disabled
                >
                  Friend
                </button>
              ) : (
                <button
                  className="rounded-md bg-gray-300 px-4 py-2 text-white cursor-default"
                  disabled
                >
                  {friendshipStatus}
                </button>
              )
            ) : null}
          </div>

          {viewedProfile?.bio ? (
            <p className="mt-2 whitespace-pre-line text-sm text-gray-800">
              {viewedProfile.bio}
            </p>
          ) : null}
        </div>
      </div>

      {/* Stats row: Friends | Recipes Added | Recipes Cooked */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <button
          onClick={handleClickFriends}
          className="rounded-lg border bg-white p-3 text-left shadow-sm hover:bg-gray-50"
        >
          <div className="text-xs uppercase text-gray-500">Friends</div>
          <div className="mt-1 text-2xl font-semibold">
            {friendsOfViewedUser.length}
          </div>
          <div className="mt-1 line-clamp-1 text-xs text-gray-600">
            {friendsOfViewedUser
              .map((p) => p.display_name || p.nickname || 'Friend')
              .slice(0, 3)
              .join(', ')}
            {friendsOfViewedUser.length > 3 ? '…' : ''}
          </div>
        </button>

        <button
          onClick={handleClickRecipesAdded}
          className="rounded-lg border bg-white p-3 text-left shadow-sm hover:bg-gray-50"
        >
          <div className="text-xs uppercase text-gray-500">Recipes Added</div>
          <div className="mt-1 text-2xl font-semibold">{recipesAddedCount}</div>
          <div className="mt-1 text-xs text-gray-600">All-time</div>
        </button>

        <button
          onClick={handleClickRecipesCooked}
          className="rounded-lg border bg-white p-3 text-left shadow-sm hover:bg-gray-50"
        >
          <div className="text-xs uppercase text-gray-500">Recipes Cooked</div>
          <div className="mt-1 text-2xl font-semibold">{recipesCookedCount}</div>
          <div className="mt-1 text-xs text-gray-600">All-time</div>
        </button>
      </div>

      {/* Recipes grid */}
      <div className="mt-6">
        {recipes.length === 0 && !recipesLoading ? (
          <div className="rounded-md border bg-white p-6 text-center text-gray-600">
            No visible recipes yet.
          </div>
        ) : null}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 8,
          }}
        >
          {recipes.map((r) => (
            <RecipeTile
              key={r.id}
              id={r.id}
              title={r.title}
              imgUrl={r.photo_url || undefined}
              aspect="1/1"
              onClick={() => setOpenRecipeId(r.id)}
            />
          ))}
        </div>

        {/* Load more */}
        {hasMore ? (
          <div className="mt-6 flex justify-center">
            <button
              className="rounded-md bg-black px-4 py-2 text-white hover:opacity-90 disabled:opacity-50"
              onClick={() => loadRecipes(false)}
              disabled={recipesLoading}
            >
              {recipesLoading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        ) : null}
      </div>

      {/* Modal */}
      {openRecipeId ? (
        <RecipeModal recipeId={openRecipeId} onClose={() => setOpenRecipeId(null)} />
      ) : null}
    </div>
  );
}
