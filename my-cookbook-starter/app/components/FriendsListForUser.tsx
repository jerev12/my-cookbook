'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

export default function FriendsListForUser({ userId }: { userId: string }) {
  const [me, setMe] = useState<string | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Relationship sets relative to me (viewer)
  const [acceptedWithMe, setAcceptedWithMe] = useState<Set<string>>(new Set());
  const [requestedOut, setRequestedOut] = useState<Set<string>>(new Set());
  const [incomingToMe, setIncomingToMe] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // who am I
      const { data: { user } } = await supabase.auth.getUser();
      if (!cancelled) setMe(user?.id ?? null);

      // ===== Fetch the viewed user's accepted friends via RPC =====
      setLoading(true);
      const { data: list, error: rpcErr } = await supabase.rpc('friends_of_user', { target_user: userId });
      if (rpcErr) {
        console.error(rpcErr);
        if (!cancelled) {
          setFriends([]);
          setAcceptedWithMe(new Set());
          setRequestedOut(new Set());
          setIncomingToMe(new Set());
          setLoading(false);
        }
        return;
      }

      const sorted: Profile[] = (list ?? []).slice().sort((a: any, b: any) => {
        const an = (a.display_name ?? '').toLowerCase();
        const bn = (b.display_name ?? '').toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return a.id < b.id ? -1 : 1;
      });
      if (!cancelled) setFriends(sorted);

      // If not signed in, stop here
      if (!user?.id) {
        if (!cancelled) {
          setAcceptedWithMe(new Set());
          setRequestedOut(new Set());
          setIncomingToMe(new Set());
          setLoading(false);
        }
        return;
      }

      // ===== Compute my relationships with these users =====
      const friendIds = sorted.map(p => p.id);
      if (friendIds.length === 0) {
        if (!cancelled) {
          setAcceptedWithMe(new Set());
          setRequestedOut(new Set());
          setIncomingToMe(new Set());
          setLoading(false);
        }
        return;
      }

      // Outgoing pending (me -> them)
      const { data: outPendRows } = await supabase
        .from('friendships')
        .select('addressee_id')
        .eq('requester_id', user.id)
        .eq('status', 'pending');
      const outSet = new Set<string>((outPendRows ?? []).map(r => String(r.addressee_id)));

      // All relations where I am involved and the other side is in friendIds
      const { data: relRows, error: relErr } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .or(
          `and(requester_id.eq.${user.id},addressee_id.in.(${friendIds.join(
            ','
          )})),and(requester_id.in.(${friendIds.join(',')}),addressee_id.eq.${user.id})`
        );

      if (relErr) {
        console.error(relErr);
        if (!cancelled) {
          setAcceptedWithMe(new Set());
          setRequestedOut(outSet);
          setIncomingToMe(new Set());
          setLoading(false);
        }
        return;
      }

      const accSet = new Set<string>();
      const inSet = new Set<string>();

      (relRows ?? []).forEach((row: any) => {
        const req = String(row.requester_id);
        const add = String(row.addressee_id);
        const st  = String(row.status);
        const other = req === user.id ? add : add === user.id ? req : null;
        if (!other) return;

        if (st === 'accepted') accSet.add(other);
        else if (st === 'pending') {
          if (req !== user.id && add === user.id) inSet.add(req); // incoming to me
        }
      });

      if (!cancelled) {
        setAcceptedWithMe(accSet);
        setRequestedOut(outSet);
        setIncomingToMe(inSet);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  // actions
  async function addFriend(otherId: string) {
    if (!me) return;
    const { error } = await supabase.from('friendships').insert({
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
      .or(`and(requester_id.eq.${me},addressee_id.eq.${otherId},status.eq.accepted),and(requester_id.eq.${otherId},addressee_id.eq.${me},status.eq.accepted)`);
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
      .match({ requester_id: requesterId, addressee_id: me, status: 'pending' });
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
  }

  async function declineRequest(requesterId: string) {
    if (!me) return;
    const { error } = await supabase
      .from('friendships')
      .delete()
      .match({ requester_id: requesterId, addressee_id: me, status: 'pending' });
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
  }

  // styles
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

  const friendsSection = useMemo(() => {
    if (loading) return <p>Loading friends…</p>;
    if (friends.length === 0) return <p>No friends yet.</p>;

    return (
      <>
        <div style={{ fontWeight: 700, margin: '0 0 8px 2px' }}>Friends</div>
        <ul style={listWrap}>
          {friends.map((f) => {
            const handle = f.display_name ? encodeURIComponent(f.display_name) : f.id;
            const href = `/u/${handle}`;
            const isAccepted = acceptedWithMe.has(f.id);
            const isRequestedOut = requestedOut.has(f.id);
            const isIncoming = incomingToMe.has(f.id);
            const isSelf = me != null && f.id === me;

            return (
              <li
                key={f.id}
                style={rowStyle}
                onMouseEnter={(e) => { (e.currentTarget as HTMLLIElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLLIElement).style.transform = 'translateY(0)'; }}
              >
                <Link href={href} style={linkStyle}>
                  <img
                    src={f.avatar_url || '/avatar-placeholder.png'}
                    alt=""
                    style={{ height: 40, width: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid #ddd' }}
                  />
                  <div style={nameStyle}>{isSelf ? 'You' : (f.display_name || f.id)}</div>
                </Link>

                {isSelf ? (
                  <div />  {/* no button for yourself */}
                ) : !me ? (
                  <button style={btnDarkGray} disabled aria-label="Sign in to add">Add Friend</button>
                ) : isAccepted ? (
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); unfriend(f.id); }} style={btnGreen} aria-label="Remove friend">Friend</button>
                ) : isRequestedOut ? (
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} style={btnDarkGray} disabled aria-label="Request sent">Requested</button>
                ) : isIncoming ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); acceptRequest(f.id); }} style={btnGreen} aria-label="Accept">Accept</button>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); declineRequest(f.id); }} style={btnGray} aria-label="Decline">Decline</button>
                  </div>
                ) : (
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); addFriend(f.id); }} style={btnGray} aria-label="Add friend">Add Friend</button>
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
  }, [friends, loading, acceptedWithMe, requestedOut, incomingToMe, me]);

  return <div>{friendsSection}</div>;
}
