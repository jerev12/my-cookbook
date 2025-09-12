'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

// Accept optional userId: when provided (and not me), we show *that* user's friends via RPC
export default function FriendsList({ userId }: { userId?: string }) {
  const [me, setMe] = useState<string | null>(null);

  // Requests (only relevant when viewing *my* list)
  const [requests, setRequests] = useState<Profile[]>([]);
  const [loadingReq, setLoadingReq] = useState(true);

  // Friends shown in the list (either my friends, or other user's friends via RPC)
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);

  // Relationship state from *my* perspective (used for button logic)
  // - myAcceptedIds: who is currently "accepted" with *me*
  // - requestedOut: who *I* have sent a pending request to
  const [myAcceptedIds, setMyAcceptedIds] = useState<Set<string>>(new Set());
  const [requestedOut, setRequestedOut] = useState<Set<string>>(new Set());

  useEffect(() => {
    let ignore = false;

    async function loadAll() {
      // Who am I?
      const { data: { user } } = await supabase.auth.getUser();
      const meId = user?.id ?? null;
      if (ignore) return;
      setMe(meId);

      // Always compute my outgoing pending so we can show "Requested" state
      if (meId) {
        const { data: outPendRows } = await supabase
          .from('friendships')
          .select('addressee_id')
          .eq('requester_id', meId)
          .eq('status', 'pending');
        if (ignore) return;
        setRequestedOut(new Set((outPendRows ?? []).map(r => r.addressee_id as string)));
      } else {
        setRequestedOut(new Set());
      }

      // Always compute my accepted set so we can show "Friend" vs "Add Friend"
      if (meId) {
        const { data: accRows, error: accErr } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .eq('status', 'accepted')
          .or(`requester_id.eq.${meId},addressee_id.eq.${meId}`);
        if (!ignore) {
          if (accErr) {
            console.error(accErr);
            setMyAcceptedIds(new Set());
          } else {
            const otherIds = (accRows ?? []).map(r => {
              const req = r.requester_id as string;
              const add = r.addressee_id as string;
              return req === meId ? add : req;
            });
            setMyAcceptedIds(new Set(otherIds));
          }
        }
      } else {
        setMyAcceptedIds(new Set());
      }

      // If viewing SOMEONE ELSE’S list → fetch via RPC (bypasses RLS safely)
      if (userId && meId !== userId) {
        // Hide requests area in this mode
        setRequests([]);
        setLoadingReq(false);

        setLoadingFriends(true);
        const { data: list, error: fErr } = await supabase.rpc('friends_of_user', { target_user: userId });
        if (ignore) return;

        if (fErr) {
          console.error(fErr);
          setFriends([]);
        } else {
          const sorted = ((list ?? []) as Profile[]).slice().sort((a, b) => {
            const an = (a.display_name ?? '').toLowerCase();
            const bn = (b.display_name ?? '').toLowerCase();
            if (an < bn) return -1;
            if (an > bn) return 1;
            return a.id < b.id ? -1 : 1;
          });
          setFriends(sorted);
        }
        setLoadingFriends(false);
        return; // done for other-user mode
      }

      // ====== MY OWN LIST MODE (no userId, or userId === me) ======

      // Incoming requests (pending where addressee = me)
      if (!meId) {
        setRequests([]);
        setLoadingReq(false);
      } else {
        setLoadingReq(true);
        const { data: reqRows, error: reqErr } = await supabase
          .from('friendships')
          .select('requester_id')
          .eq('addressee_id', meId)
          .eq('status', 'pending');
        if (ignore) return;

        if (reqErr) {
          console.error(reqErr);
          setRequests([]);
        } else {
          const requesterIds: string[] = (reqRows ?? []).map(r => r.requester_id as string);
          if (requesterIds.length === 0) {
            setRequests([]);
          } else {
            const { data: reqProfiles, error: rpErr } = await supabase
              .from('profiles')
              .select('id, display_name, avatar_url')
              .in('id', requesterIds);
            if (rpErr) {
              console.error(rpErr);
              setRequests([]);
            } else {
              const sorted = [...(reqProfiles ?? [])].sort((a: Profile, b: Profile) => {
                const an = (a.display_name ?? '').toLowerCase();
                const bn = (b.display_name ?? '').toLowerCase();
                if (an < bn) return -1;
                if (an > bn) return 1;
                return a.id < b.id ? -1 : 1;
              });
              setRequests(sorted);
            }
          }
        }
        setLoadingReq(false);
      }

      // Friends (ALL accepted involving me)
      setLoadingFriends(true);
      if (!meId) {
        setFriends([]);
        setLoadingFriends(false);
      } else {
        const { data: accRows2, error: accErr2 } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .eq('status', 'accepted')
          .or(`requester_id.eq.${meId},addressee_id.eq.${meId}`);

        if (accErr2) {
          console.error(accErr2);
          setFriends([]);
          setLoadingFriends(false);
        } else {
          const otherIds = (accRows2 ?? []).map(r => {
            const req = r.requester_id as string;
            const add = r.addressee_id as string;
            return req === meId ? add : req;
          });

          const unique = Array.from(new Set(otherIds));
          if (unique.length === 0) {
            setFriends([]);
            setLoadingFriends(false);
          } else {
            const { data: fProfiles, error: fpErr } = await supabase
              .from('profiles')
              .select('id, display_name, avatar_url')
              .in('id', unique);
            if (fpErr) {
              console.error(fpErr);
              setFriends([]);
              setLoadingFriends(false);
            } else {
              const sorted = [...(fProfiles ?? [])].sort((a: Profile, b: Profile) => {
                const an = (a.display_name ?? '').toLowerCase();
                const bn = (b.display_name ?? '').toLowerCase();
                if (an < bn) return -1;
                if (an > bn) return 1;
                return a.id < b.id ? -1 : 1;
              });
              setFriends(sorted as Profile[]);
              setLoadingFriends(false);
            }
          }
        }
      }
    }

    loadAll();
    return () => { ignore = true; };
  }, [userId]);

  // ----- Actions for Requests (only for my own list) -----
  async function acceptRequest(requesterId: string) {
    if (!me) return;
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .match({ requester_id: requesterId, addressee_id: me, status: 'pending' });
    if (error) { console.error(error); alert('Could not accept request.'); return; }

    setRequests(prev => prev.filter(p => p.id !== requesterId));
    setMyAcceptedIds(prev => new Set(prev).add(requesterId));
    const exists = friends.some(f => f.id === requesterId);
    if (!exists) {
      const { data: pf } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .eq('id', requesterId)
        .maybeSingle();
      if (pf) {
        setFriends(prev => [...prev, pf as Profile].sort((a, b) => {
          const an = (a.display_name ?? '').toLowerCase();
          const bn = (b.display_name ?? '').toLowerCase();
          if (an < bn) return -1;
          if (an > bn) return 1;
          return a.id < b.id ? -1 : 1;
        }));
      }
    }
    setRequestedOut(prev => {
      const next = new Set(prev);
      next.delete(requesterId);
      return next;
    });
  }

  async function declineRequest(requesterId: string) {
    if (!me) return;
    const { error } = await supabase
      .from('friendships')
      .delete()
      .match({ requester_id: requesterId, addressee_id: me, status: 'pending' });
    if (error) { console.error(error); alert('Could not decline request.'); return; }
    setRequests(prev => prev.filter(p => p.id !== requesterId));
  }

  // ----- Actions for Friends (from *my* perspective) -----
  async function unfriend(otherId: string) {
    if (!me) return;
    const ok = window.confirm('Remove this friend?');
    if (!ok) return;

    const { error } = await supabase
      .from('friendships')
      .delete()
      .or(`and(requester_id.eq.${me},addressee_id.eq.${otherId},status.eq.accepted),and(requester_id.eq.${otherId},addressee_id.eq.${me},status.eq.accepted)`);
    if (error) { console.error(error); alert('Could not remove friend.'); return; }

    setMyAcceptedIds(prev => {
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
    if (error) { console.error(error); return; }
    setRequestedOut(prev => new Set(prev).add(otherId));
  }

  const content = useMemo(() => {
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

    const viewingOthers = !!(userId && me && userId !== me);

    return (
      <div>
        {/* ===== Requests section (hide when viewing someone else's list) ===== */}
        {viewingOthers ? null : loadingReq ? (
          <p>Loading requests…</p>
        ) : requests.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, margin: '0 0 8px 2px' }}>Requests</div>
            <ul style={listWrap}>
              {requests.map((p) => {
                const handle = p.display_name ? encodeURIComponent(p.display_name) : p.id;
                const href = `/u/${handle}`;
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

        {/* ===== Friends section (list may be mine or the viewed user's) ===== */}
        {loadingFriends ? (
          <p>Loading friends…</p>
        ) : friends.length === 0 ? (
          <p>No friends yet.</p>
        ) : (
          <>
            <div style={{ fontWeight: 700, margin: '0 0 8px 2px' }}>Friends</div>
            <ul style={listWrap}>
              {friends.map((f) => {
                const isSelf = me != null && f.id === me;
                const amFriends = myAcceptedIds.has(f.id);          // my relationship with them
                const iRequested = requestedOut.has(f.id);           // I sent a pending request

                const handle = f.display_name ? encodeURIComponent(f.display_name) : f.id;
                const href = `/u/${handle}`;

                return (
                  <li
                    key={f.id}
                    style={rowStyle}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLLIElement).style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLLIElement).style.transform = 'translateY(0)'; }}
                  >
                    {/* Left: open their My Cookbook */}
                    <Link href={href} style={linkStyle}>
                      <img
                        src={f.avatar_url || '/avatar-placeholder.png'}
                        alt=""
                        style={{ height: 40, width: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid #ddd' }}
                      />
                      <div style={nameStyle}>{isSelf ? 'You' : (f.display_name || f.id)}</div>
                    </Link>

                    {/* Right: status button (no button when it's me) */}
                    {isSelf || !me ? (
                      <div />  {/* no action for self or when not logged in */}
                    ) : amFriends ? (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); unfriend(f.id); }}
                        style={btnGreen}
                        aria-label="Remove friend"
                        title="Remove friend"
                      >
                        Friend
                      </button>
                    ) : iRequested ? (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        style={btnDarkGray}
                        aria-label="Request sent"
                        title="Request sent"
                        disabled
                      >
                        Requested
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); addFriend(f.id); }}
                        style={btnGray}
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
          </>
        )}
      </div>
    );
  }, [userId, me, requests, loadingReq, friends, loadingFriends, myAcceptedIds, requestedOut]);

  return content;
}
