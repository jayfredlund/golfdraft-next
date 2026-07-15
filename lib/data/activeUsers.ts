import { createClient } from '../supabase/component';
import { useEffect, useState } from 'react';
import { useTourneyId } from '../ctx/AppStateCtx';
import { useCurrentUser } from './users';

type ActiveUsersData = {
  active: boolean;
  userId: number;
};

type ActiveUserPresenceState = {
  [key: string]: ActiveUsersData[];
};

function readActiveUserIds(presenceByUserId: ActiveUserPresenceState, selfUserId: number): Set<number> {
  const fromPresence = Object.keys(presenceByUserId)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  return new Set<number>([...fromPresence, selfUserId]);
}

/**
 * Opens up presence channel for active users. Note: do not use directly. Use context instead.
 */
export const useActiveUsersData = () => {
  const [supabase] = useState(() => createClient());
  const tourneyId = useTourneyId();
  const { data: user } = useCurrentUser();
  const userId = user?.id;

  const [activeUsers, setActiveUsers] = useState(() => new Set<number>());

  useEffect(() => {
    if (!userId) {
      setActiveUsers(new Set());
      return;
    }

    const channel = supabase.channel(`active-users:${tourneyId}`, {
      config: {
        presence: { key: userId.toString() },
      },
    });

    const refreshActiveUsersFromPresence = () => {
      const presenceByUserId = channel.presenceState() as unknown as ActiveUserPresenceState;
      setActiveUsers(readActiveUserIds(presenceByUserId, userId));
    };

    channel
      .on('presence', { event: 'sync' }, () => {
        refreshActiveUsersFromPresence();
      })
      .on('presence', { event: 'join' }, () => {
        refreshActiveUsersFromPresence();
      })
      .on('presence', { event: 'leave' }, () => {
        refreshActiveUsersFromPresence();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Ensure current user is present without dropping peers already learned via join/sync.
          setActiveUsers((curr) => {
            const next = new Set(curr);
            next.add(userId);
            return next;
          });

          const myPresence: ActiveUsersData = { userId, active: true };
          channel.track(myPresence).catch((err) => {
            console.error('Failed to track active user presence', err);
          });

          // Pull the current server-side presence snapshot right after subscription.
          refreshActiveUsersFromPresence();
        }
      });

    return () => {
      channel.untrack().catch(() => {
        // noop
      });
      channel.unsubscribe();
      setActiveUsers(new Set());
    };
  }, [userId, supabase, tourneyId]);

  return activeUsers;
};
