'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle?: string | null; // fetched for building /u/[handle] links
};

type Props = {
  /** When provided, render the accepted friends of this userId (the viewed user's network).
   *  When omitted, render the signed-in user's Requests + Friends (original behavior).
   */
  userId?: string;
};

export default function FriendsList({ userId }: Props) {
  const [me, setMe] = useState<string | null>(null);

  // ---------- Signed-in user's incoming requests (only when userId is NOT provided) ----------
  const [requests, setRequests] = useState<Profile[]>([]);
  const [loadingReq, setLoadingReq] = useState<boolean>(!userId);

  // ---------- Friends list to display ----------
  const [friends, setFriends] = useState<Profile[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);

  // ---------- Relationship sets relative to "me" (for button states on rows) ----------
  const [acceptedWithMe, setAcceptedWithMe] = useState<Set<string>>(new Set());
  const [requestedOut, setRequestedOut] = useState<Set<string>>(new Set()); // me -> them, pending
  const [incomingToMe, setIncomingToMe] = useState<Set<string>>(new Set());  // them -> me, pending

  useEffect(() => {
    let ignore = false;

    async function loadAll() {
      // Who am I?
      const { data: { user } } = await supabase.auth.getUser();
      const myId = user?.id ?? null;
      if (!ignore) setMe(myId);

      // ----------------------------------------------------------------
      // Case A: No userId → original view (my Requests + my Friends)
      // ----------------------------------------------------------------
      if (!userId) {
        // Requests for me
        setLoadingReq(true);
        if (!myId) {
          if (!ignore) {
            setRequests([]);
            setLoadingReq(false);
          }
        } else {
          const { data: reqRows, error: reqErr } = await supabase
            .from('friendships')
            .select('requester_id')
            .eq('addressee_id', myId)
            .eq('status', 'pending');

          if (reqErr) {
            console.error(reqErr);
            if (!ignore) {
              setRequests([]);
              setLoadingReq(false);
            }
          } else {
            const requesterIds: string[] = (reqRows ?? []).map(r => r.requester_id as string);
            if (requesterIds.length === 0) {
              if (!ignore) {
                setRequests([]);
                setLoadingReq(false);
              }
            } else {
              const { data: reqProfiles, error: rpErr } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url, handle')
                .in('id', requesterIds);
              if (rpErr) {
                console.error(rpErr);
                if (!ignore) setRequests([]);
              } else {
                const sorted = [...(reqProfiles ?? [])].sort((a: Profile, b: Profile) => {
                  const an = (a.display_name ?? '').toLowerCase();
                  const bn = (b.display_name ?? '').toLowerCase();
                  if (an < bn) return -1;
                  if (an > bn) return 1;
                  return a.id < b.id ? -1 : 1;
                });
                if (!ignore) setRequests(sorted as Profile[]);
              }
              if (!ignore) setLoadingReq(false);
            }
          }
        }

        // Outgoing pending requests (me -> others)
        if (myId) {
          const { data: outPendRows, error: outPendErr } = await supabase
            .from('friendships')
            .select('addressee_id')
            .eq('requester_id', myId)
            .eq('status', 'pending');
          if (outPendErr) {
            console.error(outPendErr);
            if (!ignore) setRequestedOut(new Set());
          } else {
            const outSet = new Set<string>((outPendRows ?? []).map(r => r.addressee_id as string));
            if (!ignore) setRequestedOut(outSet);
          }
        } else {
          if (!ignore) setRequestedOut(new Set());
        }

        // Accepted friendships involving me
        setLoadingFriends(true);
        if (!myId) {
          if (!ignore) {
            setFriends([]); setAcceptedWithMe(new Set()); setLoadingFriends(false);
          }
        } else {
          const { data: accRows, error: accErr } = await supabase
            .from('friendships')
            .select('requester_id, addressee_id')
            .eq('status', 'accepted')
            .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);

          if (accErr) {
            console.error(accErr);
            if (!ignore) {
              setFriends([]);
              setAcceptedWithMe(new Set());
              setLoadingFriends(false);
            }
          } else {
            const otherIds = (accRows ?? []).map(r => {
              const req = r.requester_id as string;
              const add = r.addressee_id as string;
              return req === myId ? add : req;
            });
            const uniqueOtherIds = Array.from(new Set(otherIds));
            const acceptedSet = new Set<string>(uniqueOtherIds);

            if (uniqueOtherIds.length === 0) {
              if (!ignore) {
                setFriends([]); setAcceptedWithMe(acceptedSet); setLoadingFriends(false);
              }
            } else {
              const { data: fProfiles, error: fpErr } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url, handle')
                .in('id', uniqueOtherIds);
              if (fpErr) {
                console.error(fpErr);
                if (!ignore) {
                  setFriends([]); setAcceptedWithMe(acceptedSet); setLoadingFriends(false);
                }
              } else {
                const sorted = [...(fProfiles ?? [])].sort((a: Profile, b: Profile) => {
                  const an = (a.display_name ?? '').toLowerCase();
                  const bn = (b.display_name ?? '').toLowerCase();
                  if (an < bn) return -1;
                  if (an > bn) return 1;
                  return a.id < b.id ? -1 : 1;
                });
                if (!ignore) {
                  setFriends(sorted as Profile[]);
                  setAcceptedWithMe(acceptedSet);
                  setLoadingFriends(false);
                }
              }
            }
          }
        }

        // Incoming-to-me pending (others -> me) for friend rows (rare, but for completeness)
        if (myId) {
          const { data: inPendRows, error: inPendErr } = await supabase
            .from('friendships')
            .select('requester_id')
            .eq('addressee_id', myId)
            .eq('status', 'pending');
          if (inPendErr) {
            console.error(inPendErr);
            if (!ignore) setIncomingToMe(new Set());
          } else {
            const inSet = new Set<string>((inPendRows ?? []).map(r => r.requester_id as string));
            if (!ignore) setIncomingToMe(inSet);
          }
        } else {
          if (!ignore) setIncomingToMe(new Set());
        }

        return; // end Case A
      }

      // ----------------------------------------------------------------
      // Case B: userId provided → viewed user's accepted friends
      // ----------------------------------------------------------------
      setLoadingReq(false);  // no Requests section in this mode

      // 1) Load accepted friendships involving viewed userId
      setLoadingFriends(true);
      const { data: accRows2, error: accErr2 } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

      if (accErr2) {
        console.error(accErr2);
        if (!ignore) {
          setFriends([]);
          setLoadingFriends(false);
        }
        return;
      }

      const otherIds2 = (accRows2 ?? []).map(r => {
        const req = r.requester_id as string;
        const add = r.addressee_id as string;
        return req === userId ? add : req;
      });
      const uniqueOtherIds2 = Array.from(new Set(otherIds2));

      if (uniqueOtherIds2.length === 0) {
        if (!ignore) {
          setFriends([]); setLoadingFriends(false);
          setAcceptedWithMe(new Set());
          setRequestedOut(new Set());
          setIncomingToMe(new Set());
        }
        return;
      }

      // 2) Fetch those friend profiles (with handle for links)
      const { data: vProfiles, error: vpErr } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, handle')
        .in('id', uniqueOtherIds2);
      if (vpErr) {
        console.error(vpErr);
        if (!ignore) {
          setFriends([]); setLoadingFriends(false);
          setAcceptedWithMe(new Set());
          setRequestedOut(new Set());
          setIncomingToMe(new Set());
        }
        return;
      }

      const sorted2 = [...(vProfiles ?? [])].sort((a: Profile, b: Profile) => {
        const an = (a.display_name ?? '').toLowerCase();
        const bn = (b.display_name ?? '').toLowerCase();
        if (an < bn) return -1;
        if (an > bn) return 1;
        return a.id < b.id ? -1 : 1;
      });

      if (!ignore) setFriends(sorted2 as Profile[]);
      if (!me) {
        // Not signed in: no relationship sets to compute
        if (!ignore) {
          setAcceptedWithMe(new Set());
          setRequestedOut(new Set());
          setIncomingToMe(new Set());
          setLoadingFriends(false);
        }
        return;
      }

      // 3) Compute my relationship to each of those people in one go
      //    Fetch ANY friendship rows between me and any friendId
      const friendIds = uniqueOtherIds2;
      const { data: myRelRows, error: myRelErr } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id, status')
        .or(
          `and(requester_id.eq.${me},addressee_id.in.(${friendIds.join(
            ','
          )})),and(requester_id.in.(${friendIds.join(',')}),addressee_id.eq.${me})`
        );

      if (myRelErr) {
        console.error(myRelErr);
        if (!ignore) {
          setAcceptedWithMe(new Set());
          setRequestedOut(new Set());
          setIncomingToMe(new Set());
        }
      } else {
        const accSet = new Set<string>();
        const outSet = new Set<string>();
        const inSet = new Set<string>();

        (myRelRows ?? []).forEach((row) => {
          const req = row.requester_id as string;
          const add = row.addressee_id as string;
          const st = String(row.status);
          // Accepted between me and f
          if (st === 'accepted') {
            const other = req === me ? add : add === me ? req : null;
            if (other) accSet.add(other);
            return;
          }
          if (st === 'pending') {
            if (req === me) {
              outSet.add(add); // me -> them pending
            } else if (add === me) {
              inSet.add(req);  // them -> me pending
            }
          }
        });

        if (!ignore) {
          setAcceptedWithMe(accSet);
          setRequestedOut(outSet);
          setIncomingToMe(inSet);
        }
      }

      if (!ignore) setLoadingFriends(false);
    }

    loadAll();
    return () => { ignore = true; };
  }, [userId]);

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

    // Update local sets
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

    // If this was visible in Requests list (only when !userId), move it
    setRequests(prev => prev.filter(p => p.id !== requesterId));
    // If we’re in !userId mode and that person isn’t in the friends list, we could fetch & add — optional
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
    setRequests(prev => prev.filter(p => p.id !== requesterId));
  }

  // ---------- Styles (kept from your version) ----------
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
    const isIncomingToMe = incomingToMe.has(f.id);

    if (!me) {
      // Not signed in: just show disabled Add Friend (or nothing)
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

    if (isIncomingToMe) {
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
  // When viewing someone else's friends (userId present), hide the Requests section.
  if (userId) {
    return <div>{friendsSection}</div>;
  }

  // Original behavior: my Requests + my Friends
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

      {/* ===== Friends section ===== */}
      {friendsSection}
    </div>
  );
}
