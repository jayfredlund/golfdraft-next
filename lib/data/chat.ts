import { uniqBy } from 'lodash';
import { useCallback, useMemo } from 'react';
import { UseMutationResult, useMutation, useQuery, useQueryClient } from 'react-query';
import { useTourneyId } from '../ctx/AppStateCtx';
import { ChatMessage } from '../models';
import { SupabaseClient } from '../supabase';
import { createClient } from '../supabase/component';
import { useSharedSubscription } from './subscription';
import { useCurrentUser } from './users';

const CHAT_MESSAGES_TABLE = 'chat_message';

export function useChatMessages(tourneyIdOverride?: number) {
  const currentTourneyId = useTourneyId();
  const tourneyId = tourneyIdOverride ?? currentTourneyId;

  const queryClient = useQueryClient();
  const queryClientKey = useMemo(() => getChatMessagesQueryClientKey(tourneyId), [tourneyId]);
  const supabase = createClient();

  const result = useQuery<ChatMessage[]>(queryClientKey, async () => {
    return getChatMessages(tourneyId, supabase);
  }, {
    staleTime: 0,
    refetchInterval: 10_000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });

  useSharedSubscription<ChatMessage>(
    CHAT_MESSAGES_TABLE,
    `tourneyId=eq.${tourneyId}`,
    useCallback(
      (ev) => {
        if (ev.eventType === 'INSERT') {
          queryClient.setQueryData<ChatMessage[]>(queryClientKey, (curr) => {
            return uniqBy([...(curr || []), ev.new], (m) => m.id);
          });
        }
      },
      [queryClient, queryClientKey],
    ),
    { disabled: !result.isSuccess },
  );

  return result;
}

export function useChatMessageMutation(): UseMutationResult<unknown, unknown, string> {
  const tourneyId = useTourneyId();
  const supabase = createClient();
  const { data: user } = useCurrentUser();

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      const result = await supabase.from(CHAT_MESSAGES_TABLE).insert({ tourneyId, userId: user?.id ?? -1, message });
      if (result.error) {
        console.dir(result.error);
        throw new Error(`Failed to insert chat message`);
      }
    },
  });

  return mutation;
}

async function getChatMessages(tourneyId: number, supabase: SupabaseClient): Promise<ChatMessage[]> {
  const result = await supabase
    .from('chat_message')
    .select('*')
    .eq('tourneyId', tourneyId)
    .order('createdAt', { ascending: true });
  if (result.error) {
    console.dir(result.error);
    throw new Error(`Failed to get chat messages for tourneyId: ${tourneyId}`);
  }
  return result.data;
}

function getChatMessagesQueryClientKey(tourneyId: number) {
  return [CHAT_MESSAGES_TABLE, tourneyId];
}
