import { write, writeFileSync } from 'fs';
import { TourneyConfig } from '../../models';
import constants from '../common/constants';
import { Reader, ReaderResult, Score, Thru, UpdateGolfer } from './Types';
import { DataClass, PGATourLeaderboardJSONReaderNextData2, PurplePlayer } from './PgaTourLeaderboardJsonReaderNextData2';
import { writeFile } from 'fs/promises';

class PgaTourLeaderboardJsonReader implements Reader {
  async run(config: TourneyConfig, url: string): Promise<ReaderResult> {
    const data = await fetchJson(url);

    const tourneyId = grabTourneyId(data);
    const players = grabTourneyPlayers(tourneyId, data);

    const parsed = parse(players, config.par);
    return parsed;
  }
}

function grabTourneyId(data: PGATourLeaderboardJSONReaderNextData2): string {
  try {
    const tourneyId = data.props.pageProps.pageContext.queryArgs.tournamentId;
    if (tourneyId?.length) {
      return tourneyId;
    }
  } catch {
    // noop
  }

  try {
    const tourneyId = data.props.pageProps.pageContext.tournaments[0].id;
    if (tourneyId.length > 0) {
      return tourneyId;
    }
    throw new Error('Tourney ID not found in NEXT_DATA');
  } catch (error) {
    throw new Error('Tourney ID not found in NEXT_DATA');
  }
}

function grabTourneyPlayers(sourceTourneyId: string, data: PGATourLeaderboardJSONReaderNextData2): PurplePlayer[] {
  for (const query of data.props.pageProps.dehydratedState.queries) {
    if (
      query.state.data 
      && 'players' in query.state.data 
      && query.state.data.id?.startsWith(sourceTourneyId) 
      && Array.isArray(query.state.data.players) 
      && typeof query.state.data.players[0] === 'object') {
      return query.state.data.players as PurplePlayer[];
    }
  }
  throw new Error(`Players not found in NEXT_DATA (tourneyId: ${sourceTourneyId})`);
}

function grabNextData(html: string): PGATourLeaderboardJSONReaderNextData2 {
  const idx = html.indexOf('__NEXT_DATA__');
  if (idx < 0) {
    throw new Error('NEXT_DATA not found');
  }

  const startIdx = html.indexOf('>', idx) + 1;
  const endIdx = html.indexOf('</script>', startIdx);
  const jsonStr = html.substring(startIdx, endIdx);
  const json = JSON.parse(jsonStr) as PGATourLeaderboardJSONReaderNextData2;
  return json;
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  const html = await res.text();
  const data = grabNextData(html);
  return data;
}

function parse(players: PurplePlayer[], par: number): ReaderResult {
  const golfers: UpdateGolfer[] = [];

  for (const { player, scoringData } of players) {
    if (!player || !scoringData) {
      continue;
    }

    const name = player.displayName;
    if (name.length === 0) {
      continue;
    }

    const rawThru = scoringData.thru.replace('*', '');
    const rawRounds = scoringData.rounds;
    const positionStr = scoringData.position as string; // TODO update types to include all possible values
    const isWD = positionStr === 'WD';
    const isCut = positionStr === 'CUT';

    let scores = rawRounds.map(safeParseInt).map<Score>((n) => (n !== null ? n - par : null));
    let thru = parseThru(rawThru);

    const day = calcCurrentDay(scores, rawThru === 'F');

    if (rawThru !== 'F') {
      if (!isWD) {
        const currentRoundScore = parseRoundScore(scoringData.score);
        scores[day] = currentRoundScore;
      } else {
        scores[day] = constants.MISSED_CUT;
      }
    }

    if (isWD) {
      scores = scores.map((s) => (s === null ? constants.MISSED_CUT : s));
      thru = null;
    }

    if (isCut) {
      scores[3] = constants.MISSED_CUT;
      scores[2] = constants.MISSED_CUT;
    }

    const g: UpdateGolfer = { golfer: name, scores: scores.map((s) => s || 0), day: day + 1, thru };
    golfers.push(g);
  }

  return { par, golfers };
}

function calcCurrentDay(rounds: Score[], isFinished: boolean): number {
  let d = isFinished ? -1 : 0;
  for (let i = 0; i < rounds.length && rounds[i] !== null; i++) {
    d++;
  }
  return d;
}

function safeParseInt(str: string): number | null {
  return isNullStr(str) ? null : requireParseInt(str, 'failed to safe-parse int');
}

function isNullStr(str: string): boolean {
  return str === null || str === '-' || str.startsWith('--') || str === 'null' || str.trim().length === 0;
}

function parseThru(thruStr: string): Thru {
  thruStr = thruStr.replace('*', '').trim();
  if (isNullStr(thruStr) || thruStr.includes(' AM') || thruStr.includes(' PM')) {
    return null;
  }
  return thruStr === 'F' ? constants.NHOLES : requireParseInt(thruStr, 'failed to parse thruStr');
}

function parseRoundScore(str: string): number {
  if (isNullStr(str)) return 0;
  if (str === 'E') return 0;
  if (str.startsWith('+')) return requireParseInt(str.substr(1), 'failed to parse positive round score');
  if (str.startsWith('-')) return requireParseInt(str, 'failed to parse negative round score');
  throw new Error(`Unexpected round score: ${str}`);
}

function requireParseInt(intStr: string, errMsg: string): number {
  const n = parseInt(intStr, 10);
  if (isNaN(n)) {
    throw new Error(`Failed to parse int: '${intStr}' - ${errMsg}`);
  }
  return n;
}

const instance = new PgaTourLeaderboardJsonReader();

export default instance;
