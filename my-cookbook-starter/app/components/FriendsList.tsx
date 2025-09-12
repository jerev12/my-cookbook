'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle?: string | null; // for /u/[handle] links
};

type Props = {
  /** When provided, render the accepted friends of this userId (the viewed user's network).
   *  When omitted, render the signed-in user's Requests + Friends (original behavior).
   */
  userId?: string;
};

// Status values with case tolerance
const ACCEPTED = ['accepted', 'Accepted'];
const PENDING  = ['pending', 'Pending'];

export default function FriendsList({ userId }: Props) {
  const [me, setMe] = useState<string | null>(null);

  // Requests (only in "my list" mode)
  const [requests, setRequests] = useState<Profile[]>([]);
  const [loadingReq, setLoadingReq] = useState<boolean>(!userId);

  // Friends list to display (both modes)
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState<boolean>(true);

  // Relationship sets relative to "me" (for button states on rows)
  const [acceptedWithMe, setAcceptedWithMe] = useState<Set<string>>(new Set()); // accepted
  const [requestedOut, setRequestedOut] = useState<Set<string>>(new Set());     // me -> them pending
  const [incomingToMe, setIncomingToMe] = useState<Set<string>>(new Set());     // them -> me pending

  // ---------- Helpers ----------

  function sortProfiles(a: Profile, b: Profile) {
    const an = (a.display_name ?? '').toLowerCase();
    const bn = (b.display_name ?? '').toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return a.id < b.id ? -1 : 1;
  }

  async function fetchProfiles(ids: string[]) {
    if (ids.length === 0) return [] as Profile[];
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, handle')
      .in('id', Array.from(new Set(ids)));
    if (error) {
      console.error('profiles fetch error', error);
      return [] as Profile[];
    }
    return (data as Profile[]).sort(sortProfiles);
  }

  // Robust accepted-friends fetch for a given user (handles OR + split fallback)
  async function fetchAcceptedFriendIdsFor(userId: string): Promise<string[]> {
    // Try single OR query first
    const { data, error } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .in('status', ACCEPTED)
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (error) {
      console.error('accepted OR fetch error', error);
      return [];
    }

    let rows = data ?? [];
    if (rows.length === 0) {
      // Fallback: split queries + union (can help with RLS/OR nuances)
      const [{ data: r1, error: e1 }, { data: r2, error: e2 }] = await Promise.all([
        supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .in('status', ACCEPTED)
          .eq('requester_id', userId),
        supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .in('status', ACCEPTED)
          .eq('addressee_id', userId),
      ]);
      if (e1) console.error('accepted split R fetch error', e1);
      if (e2) console.error('accepted split A fetch error', e2);
      rows = [...(r1 ?? []), ...(r2 ?? [])];
    }

    const otherIds = rows.map((r: any) => {
      const req = r.requester_id as string;
      const add = r.addressee_id as string;
      return req === userId ? add : req;
    });

    return Array.from(new Set(otherIds));
  }

  // For a set of friendIds, compute my relationship to each
  async function computeMyRelationsTo(friendIds: string[], myId: string | null) {
    if (!myId || friendIds.length === 0) {
      return {
        accepted: new Set<string>(),
        out: new Set<string>(),
        incoming: new Set<string>(),
      };
    }

    // Try single OR query
    let relRows: any[] = [];
    {
      const { data, error } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .or(
          `and(requester_id.eq.${myId},addressee_id.in.(${friendIds.join(
            ','
          )})),and(requester_id.in.(${friendIds.join(',')}),addressee_id.eq.${myId})`
        );
      if (error) {
        console.error('relations OR fetch error', error);
      }
      relRows = data ?? [];
    }

    // Fallback: split queries if OR returned nothing
    if (relRows.length === 0) {
      const [{ data: r1, error: e1 }, { data: r2, error: e2 }] = await Promise.all([
        supabase
          .from('friendships')
          .select('requester_id, addressee_id, status')
          .in('addressee_id', friendIds)
          .eq('requester_id', myId),
        supabase
          .from('friendships')
          .select('requester_id, addressee_id, status')
          .in('requester_id', friendIds)
          .eq('addressee_id', myId),
      ]);
      if (e1) console.error('relations split R fetch error', e1);
      if (e2) console.error('relations split A fetch error', e2);
      relRows = [...(r1 ?? []), ...(r2 ?? [])];
    }

    const acc = new Set<string>();
    const out = new Set<string>();
    const incoming = new Set<string>();

    for (const row of relRows) {
      const req = String(row.requester_id);
      const add = String(row.addressee_id);
      const st  = String(row.status);
      const other = req === myId ? add : add === myId ? req : null;

      if (!other) continue;

      if (ACCEPTED.includes(st)) {
        acc.add(other);
      } else if (PENDING.includes(st)) {
        if (req === myId) out.add(add);       // me -> them
        else if (add === myId) incoming.add(req); // them -> me
      }
    }

    return { accepted: acc, out, incoming };
  }

  // ---------- Auth: set `me` and subscribe to changes ----------
  useEffect(() => {
    let ignore = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!ignore) setMe(user?.id ?? null);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setMe(session?.user?.id ?? null);
    });

    return () => {
      subscription.unsubscribe();
      ignore = true;
    };
  }, []);

  // ---------- Data loads whenever `userId` (viewed) or `me` changes ----------
  useEffect(() => {
    let cancelled = false;

    async function loadMyMode(myId: string | null) {
      // If auth not ready yet, keep spinner instead of writing "No friends"
      if (myId === null) {
        setLoadingReq(true);
        setLoadingFriends(true);
        return;
      }

      // Requests for me
      setLoadingReq(true);
      const { data: reqRows, error: reqErr } = await supabase
        .from('friendships')
        .select('requester_id')
        .eq('addressee_id', myId)
        .in('status', PENDING);

      if (cancelled) return;

      if (reqErr) {
        console.error(reqErr);
        setRequests([]);
        setLoadingReq(false);
      } else {
        const requesterIds: string[] = (reqRows ?? []).map(r => r.requester_id as string);
        const reqProfiles = await fetchProfiles(requesterIds);
        if (cancelled) return;
        setRequests(reqProfiles);
        setLoadingReq(false);
      }

      // Outgoing pending (me -> others)
      const { data: outPendRows, error: outPendErr } = await supabase
        .from('friendships')
        .select('addressee_id')
        .eq('requester_id', myId)
        .in('status', PENDING);

      if (cancelled) return;

      if (outPendErr) {
        console.error(outPendErr);
        setRequestedOut(new Set());
      } else {
        setRequestedOut(new Set((outPendRows ?? []).map(r => String(r.addressee_id))));
      }

      // Accepted friendships involving me (with robust fallback)
      setLoadingFriends(true);
      const myFriendIds = await fetchAcceptedFriendIdsFor(myId);
      if (cancelled) return;

      const fProfiles = await fetchProfiles(myFriendIds);
      if (cancelled) return;

      setFriends(fProfiles);

      // Compute relations (accepted/pending) relative to me for the action buttons
      const rel = await computeMyRelationsTo(myFriendIds, myId);
      if (cancelled) return;

      setAcceptedWithMe(rel.accepted);
      setRequestedOut(rel.out);
      setIncomingToMe(rel.incoming);
      setLoadingFriends(false);
    }

    async function loadViewedMode(viewedId: string, myId: string | null) {
      // No Requests in viewed mode
      setLoadingReq(false);

      // Accepted friendships involving the viewed user
      setLoadingFriends(true);
      const friendIds = await fetchAcceptedFriendIdsFor(viewedId);
      if (cancelled) return;

      const vProfiles = await fetchProfiles(friendIds);
      if (cancelled) return;

      setFriends(vProfiles);

      // If I’m not signed in, render disabled buttons (no relations to compute)
      if (!myId) {
        setAcceptedWithMe(new Set());
        setRequestedOut(new Set());
        setIncomingToMe(new Set());
        setLoadingFriends(false);
        return;
      }

      // Compute my relations to those users
      const rel = await computeMyRelationsTo(friendIds, myId);
      if (cancelled) return;

      setAcceptedWithMe(rel.accepted);
      setRequestedOut(rel.out);
      setIncomingToMe(rel.incoming);
      setLoadingFriends(false);
    }

    if (userId) {
      loadViewedMode(userId, me);
    } else {
      loadMyMode(me);
    }

    return () => { cancelled = true; };
  }, [userId, me]);

  // ----- Actions (shared) -----
  async function addFriend(otherId: string) {
    if (!me) return;
    const { error } = await supabase
      .from('friendships')
      .insert({
        requester_id: me,
        addressee_id: otherId,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    if (error) {
      console.error(error);
      return;
    }
    setRequestedOut(prev => new Set(prev).add(otherId));
  }

  async function unfriend(otherId: string) {
    if (!me) return;
    const ok = window.confirm('Remove this friend?');
    if (!ok) return;

    const { error } = await supabase
      .from('friendships')
      .delete()
      .or(`and(requester_id.eq.${me},addressee_id.eq.${otherId},status.in.(${ACCEPTED.join(
        ','
      )})),and(requester_id.eq.${otherId},addressee_id.eq.${me},status.in.(${ACCEPTED.join(',')}))`);

    if (error) {
      console.error(error);
      alert('Could not remove friend.');
      return;
    }

    setAcceptedWithMe(prev => {
      const next = new Set(prev);
      next.delete(otherId);
      return next;
    });
    setRequestedOut(prev => {
      const next = new Set(prev);
      next.delete(otherId);
      return next;
    });
  }

  async function acceptRequest(requesterId: string) {
    if (!me) return;
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .match({ requester_id: requesterId, addressee_id: me })
      .in('status', PENDING);

    if (error) {
      console.error(error);
      alert('Could not accept request.');
      return;
    }

    setIncomingToMe(prev => {
      const next = new Set(prev);
      next.delete(requesterId);
      return next;
    });
    setAcceptedWithMe(prev => {
      const next = new Set(prev);
      next.add(requesterId);
      return next;
    });
    setRequests(prev => prev.filter(p => p.id !== requesterId));
  }

  async function declineRequest(requesterId: string) {
    if (!me) return;
    const { error } = await supabase
      .from('friendships')
      .delete()
      .match({ requester_id: requesterId, addressee_id: me })
      .in('status', PENDING);

    if (error) {
      console.error(error);
      alert('Could not decline request.');
      return;
    }
    setIncomingToMe(prev => {
      const next = new Set(prev);
      next.delete(requesterId);
      return next;
    });
    setRequests(prev => prev.filter(p => p.id !== requesterId));
  }

  // ---------- Styles (kept) ----------
  const baseBtn: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };
  const btnGreen: React.CSSProperties = {
    ...baseBtn,
    background: '#4CAF50',
    borderColor: '#4CAF50',
    color: '#fff',
  };
  const btnGray: React.CSSProperties = {
    ...baseBtn,
    background: '#eee',
    color: '#111',
  };
  const btnDarkGray: React.CSSProperties = {
    ...baseBtn,
    background: '#ddd',
    color: '#333',
    cursor: 'default',
  };

  const listWrap: React.CSSProperties = {
    maxHeight: '65vh',
    overflowY: 'auto',
    overflowX: 'hidden',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    maxWidth: '100%',
    boxSizing: 'border-box',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: '100%',
    borderBottom: '1px solid #eee',
    padding: '12px 8px',
    background: '#fff',
    boxSizing: 'border-box',
  };

  const linkStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    textDecoration: 'none',
    color: 'inherit',
    flex: 1,
    minWidth: 0,
  };

  const nameStyle: React.CSSProperties = {
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  // ---------- Render helpers ----------
  const renderFriendRowAction = (f: Profile) => {
    const isAccepted = acceptedWithMe.has(f.id);
    const isRequestedOut = requestedOut.has(f.id);
    const isIncoming = incomingToMe.has(f.id);

    if (!me) {
      // Not signed in: show disabled Add (or nothing)
      return (
        <button style={btnDarkGray} disabled aria-label="Sign in to add">
          Add Friend
        </button>
      );
    }

    if (isAccepted) {
      return (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); unfriend(f.id); }}
          style={btnGreen}
          aria-label="Remove friend"
          title="Remove friend"
        >
          Friend
        </button>
      );
    }

    if (isRequestedOut) {
      return (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={btnDarkGray}
          aria-label="Request sent"
          title="Request sent"
          disabled
        >
          Requested
        </button>
      );
    }

    if (isIncoming) {
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); acceptRequest(f.id); }}
            style={btnGreen}
            aria-label="Accept request"
          >
            Accept
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); declineRequest(f.id); }}
            style={btnGray}
            aria-label="Decline request"
          >
            Decline
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); addFriend(f.id); }}
        style={btnGray}
        aria-label="Add friend"
        title="Add friend"
      >
        Add Friend
      </button>
    );
  };

  const friendsSection = useMemo(() => {
    if (loadingFriends) return <p>Loading friends…</p>;
    if (friends.length === 0) return <p>No friends yet.</p>;

    return (
      <>
        <div style={{ fontWeight: 700, margin: '0 0 8px 2px' }}>Friends</div>
        <ul style={listWrap}>
          {friends.map((f) => {
            const href =
              f.handle && f.handle.trim().length > 0
                ? `/u/${encodeURIComponent(f.handle)}`
                : `/u/${f.id}`;

            return (
              <li
                key={f.id}
                style={rowStyle}
                onMouseEnter={(e) => { (e.currentTarget as HTMLLIElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLLIElement).style.transform = 'translateY(0)'; }}
              >
                {/* Left: open their profile */}
                <Link href={href} style={linkStyle}>
                  <img
                    src={f.avatar_url || '/avatar-placeholder.png'}
                    alt=""
                    style={{ height: 40, width: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid #ddd' }}
                  />
                  <div style={nameStyle}>{f.display_name || f.id}</div>
                </Link>

                {/* Right: action based on my relationship to them */}
                {renderFriendRowAction(f)}
              </li>
            );
          })}
        </ul>
      </>
    );
  }, [friends, loadingFriends, acceptedWithMe, requestedOut, incomingToMe]);

  // ---------- Final render ----------
  if (userId) {
    // Viewing someone else's friends
    return <div>{friendsSection}</div>;
  }

  // My mode: Requests + Friends
  return (
    <div>
      {/* Requests */}
      {loadingReq ? (
        <p>Loading requests…</p>
      ) : requests.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, margin: '0 0 8px 2px' }}>Requests</div>
          <ul style={listWrap}>
            {requests.map((p) => {
              const href =
                p.handle && p.handle.trim().length > 0
                  ? `/u/${encodeURIComponent(p.handle)}`
                  : `/u/${p.id}`;
              return (
                <li
                  key={p.id}
                  style={rowStyle}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLLIElement).style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLLIElement).style.transform = 'translateY(0)'; }}
                >
                  <Link href={href} style={linkStyle}>
                    <img
                      src={p.avatar_url || '/avatar-placeholder.png'}
                      alt=""
                      style={{ height: 40, width: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid #ddd' }}
                    />
                    <div style={nameStyle}>{p.display_name || p.id}</div>
                  </Link>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => acceptRequest(p.id)} style={btnGreen} aria-label="Accept request">Accept</button>
                    <button onClick={() => declineRequest(p.id)} style={btnGray} aria-label="Decline request">Decline</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Friends */}
      {friendsSection}
    </div>
  );
}
