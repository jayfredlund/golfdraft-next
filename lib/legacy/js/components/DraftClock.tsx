import moment from 'moment';
import React, { useEffect, useRef, useState } from 'react';
import { isPendingDraftPick, useDraftPicks } from '../../../data/draft';
import Assets from '../constants/Assets';

const WARNING_TIME = 1000 * 60 * 2;
const OVERTIME = 1000 * 60 * 3;
const WARNING_SOUND_INTERVAL_MILLIS = 1000 * 30;

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
  const lastWarningSoundBucketRef = useRef<number | undefined>(undefined);

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

  useEffect(() => {
    if (!isMyPick) {
      lastWarningSoundBucketRef.current = undefined;
      return;
    }

    if ((totalMillis ?? 0) < WARNING_TIME) {
      return;
    }

    const warningElapsedMillis = (totalMillis ?? 0) - WARNING_TIME;
    const warningBucket = Math.floor(warningElapsedMillis / WARNING_SOUND_INTERVAL_MILLIS);

    if (lastWarningSoundBucketRef.current === warningBucket) {
      return;
    }

    lastWarningSoundBucketRef.current = warningBucket;

    try {
      pickWarningSound?.play();
    } catch (e) {
      // noop
    }
  }, [isMyPick, totalMillis]);

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
