import moment from 'moment';
import React, { useEffect, useState } from 'react';
import { isPendingDraftPick, useDraftPicks } from '../../../data/draft';
import Assets from '../constants/Assets';

const WARNING_TIME = 1000 * 60 * 2;
const OVERTIME = 1000 * 60 * 3;
const FINAL_COUNTDOWN_THRESHOLD = 1000 * 15;
const WARNING_SOUND_INTERVAL_SECONDS = 10;

let pickWarningSound: HTMLAudioElement | undefined = undefined;
try {
  if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
    pickWarningSound = new Audio(Assets.PICK_WARNING_SOUND);
  }
} catch (e) {
  console.warn(`Could not load PICK_WARNING_SOUND: ${Assets.PICK_WARNING_SOUND}`);
}

const DraftClock: React.FC<{
  isMyPick: boolean;
  disableClock?: boolean;
}> = ({ isMyPick, disableClock = false }) => {
  const [totalMillis, setTotalMillis] = useState<number | undefined>(undefined);
  const totalSeconds = (totalMillis ?? 0) / 1000;

  const { data: draftPicks } = useDraftPicks();
  const prevPickIndex = (draftPicks?.findIndex(isPendingDraftPick) ?? -1) - 1;
  const prevPickEpochMillis = draftPicks?.[prevPickIndex]?.timestampEpochMillis;

  useEffect(() => {
    if (!prevPickEpochMillis) {
      return;
    }

    const id = setInterval(() => {
      const timeElapsed = Date.now() - prevPickEpochMillis;
      setTotalMillis(timeElapsed);
    }, 1_000);

    return () => {
      clearInterval(id);
    };
  }, [prevPickEpochMillis]);

  const isInFinalCountdownThreshold = (totalMillis ?? 0) > FINAL_COUNTDOWN_THRESHOLD;
  useEffect(() => {
    if (!isMyPick || !isInFinalCountdownThreshold) {
      return;
    }

    const id = setInterval(() => {
      try {
        pickWarningSound?.play();
      } catch (e) {
        // noop
      }
    }, WARNING_SOUND_INTERVAL_SECONDS * 1000);

    return () => {
      clearInterval(id);
    };
  }, [isMyPick, isInFinalCountdownThreshold]);

  if (disableClock) {
    return (
      <p className="draft-clock">
        <b>{'NA'}</b>
      </p>
    );
  }

  let className = '';
  if (totalMillis && totalMillis > OVERTIME) {
    className = 'text-danger';
  } else if (totalMillis && totalMillis > WARNING_TIME) {
    className = 'text-warning';
  }

  const format = totalMillis === undefined ? '...' : moment.utc(totalMillis).format('mm:ss');
  return (
    <p className="draft-clock">
      <b className={className}>{format}</b>
    </p>
  );
};

export default DraftClock;
