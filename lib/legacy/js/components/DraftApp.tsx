import { formatDistanceStrict } from 'date-fns';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInterval } from 'usehooks-ts';
import Loading from '../../../Loading';
import { isCompletedDraftPick, useAutoPickUsers, useAutoPickUsersMutation, useCurrentPick, useDraftPicks } from '../../../data/draft';
import { useDraftSettings, useHasDraftStarted } from '../../../data/draftSettings';
import { useCurrentTourney } from '../../../data/tourney';
import { useCurrentUser } from '../../../data/users';
import { DraftPick } from '../../../models';
import Assets from '../constants/Assets';
import AppPausedStatus from './AppPausedStatus';
import ChatRoom from './ChatRoom';
import DraftChooser from './DraftChooser';
import DraftClock from './DraftClock';
import DraftHistory from './DraftHistory';
import DraftPickOrderView from './DraftPickOrderView';
import DraftStatus from './DraftStatus';
import { GolfDraftPanel } from './GolfDraftPanel';
import { PickListEditor } from './PickListEditor';

let myTurnSound: HTMLAudioElement | undefined = undefined;
let pickMadeSound: HTMLAudioElement | undefined = undefined;
try {
  myTurnSound = new Audio(Assets.MY_TURN_SOUND);
  pickMadeSound = new Audio(Assets.PICK_MADE_SOUND);
} catch (e) {
  console.warn('Could not load my turn sounds');
}

const DraftApp: React.FC = () => {
  const { data: draftSettings } = useDraftSettings();
  const { data: hasDraftStarted } = useHasDraftStarted();

  const { data: currentUser } = useCurrentUser();

  const { data: draftPicks } = useDraftPicks();
  const currentPick = useCurrentPick();

  const [pickingForUsers, setPickingForUsers] = useState(new Set<number>());
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>();

  const isMyDraftPick =
    currentUser && currentPick && currentPick !== 'none'
      ? currentPick.userId === currentUser.id || pickingForUsers.has(currentPick.userId)
      : undefined;

  useMyTurnSoundFx(isMyDraftPick);
  usePickMadeSoundFx(draftPicks);

  if (!draftSettings || !draftPicks || !currentPick || !currentUser) {
    return <Loading />;
  }

  if (!hasDraftStarted) {
    return <PreDraft />;
  }

  if (currentPick === 'none') {
    return <PostDraft />;
  }

  return (
    <>
      <AutoPickOverlay />
      <section className={'draft ' + (draftSettings.isDraftPaused ? 'draft-paused' : 'draft-active')}>
        {draftSettings.isDraftPaused ? (
          <section className="app-paused-section">
            <AppPausedStatus />
          </section>
        ) : (
          <>
            <section className="chooser-section">
              {!isMyDraftPick ? (
                <GolfDraftPanel heading="Draft Status">
                  <DraftStatus
                    currentPick={currentPick}
                    onDraftForUser={() => {
                      setPickingForUsers((curr) => new Set(curr).add(currentPick.userId));
                    }}
                  />
                </GolfDraftPanel>
              ) : (
                <DraftChooser
                  currentPick={currentPick}
                  onStopDraftingForUser={() => {
                    setPickingForUsers((curr) => new Set([...curr].filter((uid) => uid !== currentPick.userId)));
                  }}
                />
              )}
            </section>

            <section className="draft-clock-section">
              <GolfDraftPanel heading={'Draft Clock'}>
                <DraftClock isMyPick={!!isMyDraftPick} disableClock={!draftSettings.allowClock} />
              </GolfDraftPanel>
            </section>
          </>
        )}

        <section className="draft-order-section">
          <GolfDraftPanel heading="Draft Order">
            <DraftPickOrderView pickingForUsers={pickingForUsers} onUserSelected={(pid) => setSelectedUserId(pid)} />
          </GolfDraftPanel>
        </section>

        <section className="pick-list-section">
          <GolfDraftPanel heading="Pick List">
            <PickListEditor height="29em" />
          </GolfDraftPanel>
        </section>

        <section className="chatroom-section">
          <GolfDraftPanel heading="Chat Room">
            <ChatRoom />
          </GolfDraftPanel>
        </section>

        <section className="draft-history-section">
          <DraftHistory onSelectionChange={(uid) => setSelectedUserId(uid)} selectedUserId={selectedUserId} />
        </section>
      </section>
    </>
  );
};

const useMyTurnSoundFx = (isMyDraftPick: boolean | undefined) => {
  const lastIsMyDraftPick = usePreviousValue(isMyDraftPick);
  useEffect(() => {
    if (isMyDraftPick !== undefined && lastIsMyDraftPick !== undefined && isMyDraftPick && !lastIsMyDraftPick) {
      try {
        myTurnSound?.play();
      } catch (e) {
        // noop
      }
    }
  }, [isMyDraftPick, lastIsMyDraftPick]);
};

const usePickMadeSoundFx = (draftPicks: DraftPick[] | undefined) => {
  const draftPickCount = draftPicks?.filter(isCompletedDraftPick).length;
  const lastDraftPickCount = usePreviousValue(draftPickCount);
  useEffect(() => {
    if (draftPickCount !== undefined && lastDraftPickCount !== undefined && draftPickCount > lastDraftPickCount) {
      try {
        pickMadeSound?.play();
      } catch (e) {
        // noop
      }
    }
  }, [draftPickCount, lastDraftPickCount]);
};

const usePreviousValue = <T,>(v: T): T | undefined => {
  const ref = useRef<T | undefined>();
  useEffect(() => {
    ref.current = v;
  });
  return ref.current;
};

const PostDraft: React.FC = () => {
  const { data: tourney } = useCurrentTourney();

  if (!tourney) {
    return <Loading />;
  }

  return (
    <section>
      <div className="jumbotron">
        <h1>The draft is over!</h1>
        <p>
          <Link href={`/tourney/${tourney.id}`}>Check out the live leaderboard</Link>
        </p>
      </div>

      <section>
        <GolfDraftPanel heading="Chat Room">
          <ChatRoom />
        </GolfDraftPanel>
      </section>

      <section>
        <DraftHistory />
      </section>
    </section>
  );
};

const PreDraft: React.FC = () => {
  const { data: draftSettings } = useDraftSettings();

  const draftStart = useMemo(() => {
    if (!draftSettings?.draftStart) {
      return undefined;
    }
    return new Date(draftSettings.draftStart);
  }, [draftSettings?.draftStart]);

  const [now, setNow] = useState(new Date());
  useInterval(() => {
    setNow(new Date());
  }, 1000);

  return (
    <section>
      <div className="jumbotron">
        <h1>Draft not started.</h1>
        <h2>Starting in {draftStart ? formatDistanceStrict(draftStart, now) : '...'}</h2>
      </div>

      <section>
        <a id="InlinePickListEditor" />
        <GolfDraftPanel heading="Pick List Editor">
          <PickListEditor height="29em" preDraftMode={true} />
        </GolfDraftPanel>
      </section>

      <section>
        <GolfDraftPanel heading="Chat Room">
          <ChatRoom />
        </GolfDraftPanel>
      </section>
    </section>
  );
};

const useIsAutoPicking = (): boolean => {
  const { data: autoPickUsers } = useAutoPickUsers();
  const { data: currentUser } = useCurrentUser();
  return !!currentUser && !!autoPickUsers?.has(currentUser.id);
};

function AutoPickOverlay() {
  const isAutoPicking = useIsAutoPicking();
  const mutation = useAutoPickUsersMutation();
  const { data: currentUser } = useCurrentUser();

  const handleClick = useCallback(() => {
    if (!currentUser) {
      return;
    }
    mutation.mutate({ userId: currentUser.id, autoPick: false });
  }, [currentUser, mutation]);

  if (!isAutoPicking) {
    return null;
  }

  return (
    <div className="auto-pick-overlay">
      <div className="jumbotron">
        <h1>You are set to auto pick</h1>
        <h2>
          <button type="button" className="btn btn-primary" onClick={handleClick} disabled={mutation.isLoading}>
            Disable auto picking
          </button>
        </h2>
      </div>
    </div>
  )
}

export default DraftApp;
