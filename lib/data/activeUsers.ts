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

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceByUserId = channel.presenceState() as unknown as ActiveUserPresenceState;
        setActiveUsers(readActiveUserIds(presenceByUserId, userId));
      })
      .on('presence', { event: 'join' }, () => {
        const presenceByUserId = channel.presenceState() as unknown as ActiveUserPresenceState;
        setActiveUsers(readActiveUserIds(presenceByUserId, userId));
      })
      .on('presence', { event: 'leave' }, () => {
        const presenceByUserId = channel.presenceState() as unknown as ActiveUserPresenceState;
        setActiveUsers(readActiveUserIds(presenceByUserId, userId));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Show the current user immediately even before sync propagates.
          setActiveUsers(new Set([userId]));

          const myPresence: ActiveUsersData = { userId, active: true };
          channel.track(myPresence).catch((err) => {
            console.error('Failed to track active user presence', err);
          });
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
