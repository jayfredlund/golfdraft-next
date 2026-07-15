import { RealtimeChannel, RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { createClient } from '../supabase/component';

type SubscriptionCallback<T extends { [key: string]: unknown }> = (ev: RealtimePostgresChangesPayload<T>) => void;

type SharedSubscription = {
  channel: RealtimeChannel;
  callbacks: Set<SubscriptionCallback<any>>;
};

const sharedSubscriptions = new Map<string, SharedSubscription>();

function buildSubscriptionKey(table: string, filter: string): string {
  return `${table}:${filter}`;
}

function getOrCreateSharedSubscription<T extends { [key: string]: unknown }>(
  table: string,
  filter: string,
  supabase: SupabaseClient,
): SharedSubscription {
  const key = buildSubscriptionKey(table, filter);
  const existing = sharedSubscriptions.get(key);
  if (existing) {
    return existing;
  }

  const callbacks = new Set<SubscriptionCallback<T>>();
  const channel = supabase
    .channel(`postgres_changes:${table}:${filter}`)
    .on<T>(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: filter.length ? filter : undefined,
      },
      (payload) => {
        callbacks.forEach((cb) => cb(payload));
      },
    )
    .subscribe();

  const sharedSub: SharedSubscription = { channel, callbacks: callbacks as Set<SubscriptionCallback<any>> };
  sharedSubscriptions.set(key, sharedSub);
  return sharedSub;
}

const openSharedSubscription = <T extends { [key: string]: unknown }>(
  table: string,
  filter: string,
  cb: SubscriptionCallback<T>,
  supabase: SupabaseClient,
): { unsubscribe: () => void } => {
  const key = buildSubscriptionKey(table, filter);
  const sharedSub = getOrCreateSharedSubscription<T>(table, filter, supabase);
  sharedSub.callbacks.add(cb);

  return {
    unsubscribe: () => {
      const sub = sharedSubscriptions.get(key);
      if (!sub) {
        return;
      }

      sub.callbacks.delete(cb);
      if (sub.callbacks.size === 0) {
        sub.channel.unsubscribe();
        sharedSubscriptions.delete(key);
      }
    },
  };
};

/**
 * Opens a supabase subscription and shares it among all consumers. Handles closing and opening as needed.
 */
export const useSharedSubscription = <T extends { [key: string]: unknown }>(
  table: string,
  filter: string,
  cb: SubscriptionCallback<T>,
  { disabled = false }: { disabled?: boolean } = {},
) => {
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    if (disabled) {
      return;
    }

    const sub = openSharedSubscription(table, filter, cb, supabase);
    return () => {
      sub.unsubscribe();
    };
  }, [table, filter, cb, supabase, disabled]);
};
