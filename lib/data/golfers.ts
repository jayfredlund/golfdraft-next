import { createClient } from '../supabase/component';
import { keyBy, omit } from 'lodash';
import { useMemo } from 'react';
import { QueryClient, useQuery, UseQueryResult } from 'react-query';
import { useTourneyId } from '../ctx/AppStateCtx';
import { Golfer } from '../models';
import { adminSupabase, SupabaseClient } from '../supabase';

const GOLFERS_TABLE = 'golfer';

export const PENDING_GOLFER: Omit<Golfer, 'tourneyId'> = {
  id: -2,
  name: 'Pending...',
  invalid: false,
};

type GolferLookup = Readonly<{
  /** Lookup golfers by ID, including PENDING_GOLFER. Throws if not found. */
  getGolfer: (gid: number) => Golfer;
  /** Unordered list of all golfers */
  golfers: Golfer[];
}>;

export function useGolfers({ includeInvalid }: { includeInvalid?: boolean } = {}): UseQueryResult<GolferLookup> {
  const tourneyId = useTourneyId();
  const golfersResults = useGolfersQuery();

  const data = useMemo(() => {
    if (!golfersResults.data) {
      return undefined;
    }
    const map = keyBy([...golfersResults.data, { ...PENDING_GOLFER, tourneyId }], (g) => g.id);
    const lookup: GolferLookup = {
      golfers: includeInvalid ? golfersResults.data : golfersResults.data.filter((g) => !g.invalid),
      getGolfer: (gid: number) => {
        const g = map[gid];
        if (!g) {
          throw new Error(`Golfer not found: ${gid}`);
        }
        return g;
      },
    };
    return lookup;
  }, [includeInvalid, tourneyId, golfersResults.data]);

  return { ...golfersResults, data } as UseQueryResult<GolferLookup>;
}

function useGolfersQuery(): UseQueryResult<Golfer[]> {
  const tourneyId = useTourneyId();
  const supabase = createClient();
  return useQuery<Golfer[]>(GOLFERS_TABLE, async () => {
    return await getGolfers(tourneyId, supabase);
  });
}

export async function prefetchGolfers(
  tourneyId: number,
  queryClient: QueryClient,
  supabase: SupabaseClient,
): Promise<void> {
  return queryClient.prefetchQuery(GOLFERS_TABLE, async () => {
    return await getGolfers(tourneyId, supabase);
  });
}

export async function getGolfers(tourneyId: number, supabase: SupabaseClient): Promise<Golfer[]> {
  const result = await supabase.from(GOLFERS_TABLE).select('*').eq('tourneyId', tourneyId);
  if (result.error) {
    console.dir(result.error);
    throw new Error(`Failed to get golfers for tourneyId: ${tourneyId}`);
  }
  return result.data;
}

export async function upsertGolfers(golfers: Omit<Golfer, 'id'>[]): Promise<Golfer[]> {
  const withoutId = golfers.map((g) => omit(g, 'id'));
  const result = await adminSupabase()
    .from(GOLFERS_TABLE)
    .upsert(withoutId, { onConflict: 'tourneyId, name' })
    .select();
  if (result.error) {
    console.dir(result.error);
    throw new Error(`Failed to upsert golfers`);
  }
  return result.data;
}

export async function invalidateGolfers(tourneyId: number, golferIds: number[]): Promise<void> {
  const result = await adminSupabase()
    .from(GOLFERS_TABLE)
    .update({ invalid: true })
    .eq('tourneyId', tourneyId)
    .in('id', golferIds);
  if (result.error) {
    console.dir(result.error);
    throw new Error(`Failed to invalidate golfers`);
  }
}
