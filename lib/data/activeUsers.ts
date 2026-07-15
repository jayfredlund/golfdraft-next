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

type ActiveUserPresenceDiff = {
  [key: string]: { metas: ActiveUsersData[] };
};

function readActiveUserIds(presenceByUserId: ActiveUserPresenceState, selfUserId: number): Set<number> {
  const fromPresence = Object.keys(presenceByUserId)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  return new Set<number>([...fromPresence, selfUserId]);
}

function readDiffUserIds(diff: ActiveUserPresenceDiff): number[] {
  return Object.keys(diff)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
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
      .on('presence', { event: 'join' }, ({ key, newPresences }: { key: string; newPresences: ActiveUsersData[] }) => {
        const joinedIds = [Number(key), ...newPresences.map((presence) => presence.userId)].filter((n) => Number.isFinite(n));
        setActiveUsers((curr) => {
          const next = new Set(curr);
          joinedIds.forEach((id) => next.add(id));
          next.add(userId);
          return next;
        });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }: { key: string; leftPresences: ActiveUsersData[] }) => {
        const leftIds = [Number(key), ...leftPresences.map((presence) => presence.userId)].filter((n) => Number.isFinite(n));
        setActiveUsers((curr) => {
          const next = new Set(curr);
          leftIds.forEach((id) => {
            if (id !== userId) {
              next.delete(id);
            }
          });
          next.add(userId);
          return next;
        });
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
