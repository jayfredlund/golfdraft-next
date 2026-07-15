import { createClient } from '../supabase/component';
import { useEffect, useState } from 'react';
import { useTourneyId } from '../ctx/AppStateCtx';
import { useCurrentUser } from './users';

type ActiveUsersData = {
  active: boolean;
  userId: number;
};

type ActiveUserPresenceState = {
  [key: number]: ActiveUsersData[];
};

/**
 * Opens up presence channel for active users. Note: do not use directly. Use context instead.
 */
export const useActiveUsersData = () => {
  const [supabase] = useState(() => createClient());
  const tourneyId = useTourneyId();
  const { data: user } = useCurrentUser();

  const [activeUsers, setActiveUsers] = useState(() => new Set<number>());

  useEffect(() => {
    if (!user) {
      setActiveUsers(new Set());
      return;
    }

    const channel = supabase.channel(`active-users:${tourneyId}`, {
      config: {
        presence: { key: user.id.toString() },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const presenceByUserId = channel.presenceState() as unknown as ActiveUserPresenceState;
        const newActiveUsers = new Set<number>([...Object.keys(presenceByUserId).map((s) => +s), user.id]);
        setActiveUsers(newActiveUsers);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const myPresence: ActiveUsersData = { userId: user.id, active: true };
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
    };
  }, [user, supabase, tourneyId]);

  return activeUsers;
};
