'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Profile = { id: string; display_name: string | null; avatar_url: string | null };

export default function FriendsList() {
  const [me, setMe] = useState<string | null>(null);

  // Incoming requests (people who requested me)
  const [requests, setRequests] = useState<Profile[]>([]);
  const [loadingReq, setLoadingReq] = useState(true);

  // Accepted friendships involving me (ALL accepted, not just mutuals)
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);

  // Local state for button logic in Friends section
  // - acceptedIds: who is currently "accepted" with me
  // - requestedOut: who I have sent a new pending request to (for "Requested" state)
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [requestedOut, setRequestedOut] = useState<Set<string>>(new Set());

  useEffect(() => {
    let ignore = false;

    async function loadAll() {
      // Who am I?
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setMe(null);
        setRequests([]); setFriends([]);
        setAcceptedIds(new Set()); setRequestedOut(new Set());
        setLoadingReq(false); setLoadingFriends(false);
        return;
      }
      setMe(user.id);

      // ---------- Incoming Requests (status=pending where addressee_id = me) ----------
      setLoadingReq(true);
      const { data: reqRows, error: reqErr } = await supabase
        .from('friendships')
        .select('requester_id')
        .eq('addressee_id', user.id)
        .eq('status', 'pending');

      if (reqErr) {
        console.error(reqErr);
        if (!ignore) { setRequests([]); setLoadingReq(false); }
      } else {
        const requesterIds: string[] = (reqRows ?? []).map(r => r.requester_id as string);
        if (requesterIds.length === 0) {
          if (!ignore) { setRequests([]); setLoadingReq(false); }
        } else {
          const { data: reqProfiles, error: rpErr } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', requesterIds);
          if (rpErr) {
            console.error(rpErr);
            if (!ignore) { setRequests([]); }
          } else {
            const sorted = [...(reqProfiles ?? [])].sort((a: Profile, b: Profile) => {
              const an = (a.display_name ?? '').toLowerCase();
              const bn = (b.display_name ?? '').toLowerCase();
              if (an < bn) return -1;
              if (an > bn) return 1;
              return a.id < b.id ? -1 : 1;
            });
            if (!ignore) setRequests(sorted);
          }
          if (!ignore) setLoadingReq(false);
        }
      }

      // ---------- Outgoing pending requests (for "Requested" state on friends rows) ----------
      const { data: outPendRows, error: outPendErr } = await supabase
        .from('friendships')
        .select('addressee_id')
        .eq('requester_id', user.id)
        .eq('status', 'pending');
      if (outPendErr) {
        console.error(outPendErr);
        if (!ignore) setRequestedOut(new Set());
      } else {
        const outSet = new Set<string>((outPendRows ?? []).map(r => r.addressee_id as string));
        if (!ignore) setRequestedOut(outSet);
      }

      // ---------- Friends (ALL accepted involving me) ----------
      setLoadingFriends(true);
      const { data: accRows, error: accErr } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

      if (accErr) {
        console.error(accErr);
        if (!ignore) { setFriends([]); setAcceptedIds(new Set()); setLoadingFriends(false); }
      } else {
        const otherIds = (accRows ?? []).map(r => {
          const req = r.requester_id as string;
          const add = r.addressee_id as string;
          return req === user.id ? add : req;
        });

        const uniqueOtherIds = Array.from(new Set(otherIds));
        const acceptedSet = new Set<string>(uniqueOtherIds);

        if (uniqueOtherIds.length === 0) {
          if (!ignore) {
            setFriends([]); setAcceptedIds(acceptedSet); setLoadingFriends(false);
          }
        } else {
          const { data: fProfiles, error: fpErr } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', uniqueOtherIds);
          if (fpErr) {
            console.error(fpErr);
            if (!ignore) { setFriends([]); setAcceptedIds(acceptedSet); setLoadingFriends(false); }
          } else {
            const sorted = [...(fProfiles ?? [])].sort((a: Profile, b: Profile) => {
              const an = (a.display_name ?? '').toLowerCase();
              const bn = (b.display_name ?? '').toLowerCase();
              if (an < bn) return -1;
              if (an > bn) return 1;
              return a.id < b.id ? -1 : 1;
            });
            if (!ignore) {
              setFriends(sorted);
              setAcceptedIds(acceptedSet);
              setLoadingFriends(false);
            }
          }
        }
      }
    }

    loadAll();
    return () => { ignore = true; };
  }, []);

  // ----- Actions for Requests -----
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

    // Move from Requests -> Friends (UI)
    setRequests(prev => prev.filter(p => p.id !== requesterId));
    // add to acceptedIds and maybe to friends list (if not present)
    setAcceptedIds(prev => new Set(prev).add(requesterId));
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
    // If I had previously requested them, clear "Requested" state
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

    if (error) {
      console.error(error);
      alert('Could not decline request.');
      return;
    }
    setRequests(prev => prev.filter(p => p.id !== requesterId));
  }

  // ----- Actions for Friends -----
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

    // Keep row visible until modal closes; flip to "Add Friend"
    setAcceptedIds(prev => {
      const next = new Set(prev);
      next.delete(otherId);
      return next;
    });
    // also clear any "Requested" local flag (fresh state)
    setRequestedOut(prev => {
      const next = new Set(prev);
      next.delete(otherId);
      return next;
    });
  }

  async function addFriend(otherId: string) {
    if (!me) return;
    // Create a NEW pending request from me -> other
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
      // Ignore duplicate if there is already a pending row
      // Postgres unique constraint might not exist, so we just surface the error if it's something else
      console.error(error);
      // Optional: alert user
      // alert('Could not send request.');
      return;
    }

    // Reflect "Requested" state locally
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
  overflow: 'auto',
  margin: 0,
  padding: 0,
  listStyle: 'none'
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',              // 🔑 spans full modal width
  borderBottom: '1px solid #eee',
  padding: '12px 8px',
  background: '#fff',
};
    const nameStyle: React.CSSProperties = { fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' };
    const linkStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 };

    return (
      <div>
        {/* ===== Requests section ===== */}
        {loadingReq ? (
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

        {/* ===== Friends section (ALL accepted rows involving me) ===== */}
        {loadingFriends ? (
          <p>Loading friends…</p>
        ) : friends.length === 0 ? (
          <p>No friends yet.</p>
        ) : (
          <>
            <div style={{ fontWeight: 700, margin: '0 0 8px 2px' }}>Friends</div>
            <ul style={listWrap}>
              {friends.map((f) => {
                const isAccepted = acceptedIds.has(f.id);
                const isRequestedOut = requestedOut.has(f.id);

                const handle = f.display_name ? encodeURIComponent(f.display_name) : f.id;
                const href = `/u/${handle}`;

                return (
                  <li
                    key={f.id}
                    style={rowStyle}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLLIElement).style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLLIElement).style.transform = 'translateY(0)'; }}
                  >
                    {/* Left: open their public My Cookbook */}
                    <Link href={href} style={linkStyle}>
                      <img
                        src={f.avatar_url || '/avatar-placeholder.png'}
                        alt=""
                        style={{ height: 40, width: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid #ddd' }}
                      />
                      <div style={nameStyle}>{f.display_name || f.id}</div>
                    </Link>

                    {/* Right: status button (prevent link navigation) */}
                    {isAccepted ? (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); unfriend(f.id); }}
                        style={btnGreen}
                        aria-label="Remove friend"
                        title="Remove friend"
                      >
                        Friend
                      </button>
                    ) : isRequestedOut ? (
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
  }, [requests, loadingReq, friends, loadingFriends, acceptedIds, requestedOut]);

  return content;
}
