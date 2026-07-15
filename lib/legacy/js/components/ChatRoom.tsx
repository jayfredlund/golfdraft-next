import { countBy } from 'lodash';
import moment from 'moment';
import React, { useEffect, useRef, useState } from 'react';
import Loading from '../../../Loading';
import { useActiveUsers } from '../../../ctx/ActiveUsersCtx';
import { useChatMessageMutation, useChatMessages } from '../../../data/chat';
import { useAllUsers } from '../../../data/users';
import { GDUser } from '../../../models';
import Assets from '../constants/Assets';

const BOT_NAME = 'DraftBot';
const CHAT_NOTIFICATION_SOUNDS_ENABLED_KEY = 'gd:chatNotificationSoundsEnabled';
let newChatMessageSound: HTMLAudioElement | undefined = undefined;
try {
  newChatMessageSound = new Audio(Assets.NEW_CHAT_MESSAGE_SOUND);
  newChatMessageSound.volume = 0.5;
} catch {
  // noop
}

const ChatRoom = ({ disabled = false }: { disabled?: boolean }): React.ReactElement | null => {
  const { data: messages } = useChatMessages();
  const { activeUsers } = useActiveUsers();
  const { data: allUsers } = useAllUsers();
  const [chatNotificationSoundsEnabled, setChatNotificationSoundsEnabled] = useChatNotificationSoundsEnabled();

  useNewChatMessageSoundFx(messages, chatNotificationSoundsEnabled);

  const [scrollPaneRef, setScrollPaneRef] = useState<HTMLDivElement | null>(null);

  const ready = useInitialScrollToBottom(scrollPaneRef);
  useScrollAfterNewMessage({ scrollPaneRef, enabled: ready, messages });

  if (!allUsers) {
    return <Loading />;
  }

  if (disabled) {
    return (
      <div className="row">
        <div className="col-md-12">
          <div
            className="panel panel-default chat-panel"
            style={{ visibility: !ready ? 'hidden' : undefined }}
            ref={setScrollPaneRef}
          >
            <div className="panel-body">
              <ChatRoomBody messages={messages} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeUserShortNames = asShortNames([...activeUsers].map((uid) => allUsers[uid]).filter((u): u is GDUser => !!u));

  return (
    <div className="chat-room-container">
      <div className="col-md-9">
        <div
          className="panel panel-default chat-panel"
          style={{ visibility: !ready ? 'hidden' : undefined }}
          ref={setScrollPaneRef}
        >
          <div className="panel-body">
            <ChatRoomBody messages={messages} />
          </div>
        </div>
        {!messages ? null : <ChatRoomInput />}
        <ChatNotificationSoundToggle
          enabled={chatNotificationSoundsEnabled}
          onToggle={setChatNotificationSoundsEnabled}
        />
      </div>
      <div className="col-md-3">
        <div className="panel panel-default">
          <div className="panel-body">
            <b>Online:</b>
            <ul className="list-unstyled">
              {activeUserShortNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Returns a list of names using firstName, adding last initial if duplicates are found, and then adding the full last name if duplicates still exist */
const asShortNames = (users: GDUser[]): string[] => {
  const firstLast = users.map((u) => {
    return u.name.split(' ');
  });

  const byFirstLastInitial = countBy(firstLast, ([first, last]) => `${first} ${last[0]}`);

  const shortNames = firstLast.map(([first, last]) => {
    const firstLastInitial = `${first} ${last[0]}`;
    if (byFirstLastInitial[firstLastInitial] < 2) {
      return firstLastInitial;
    }

    return `${first} ${last}`;
  });

  return shortNames.sort();
};

const ChatRoomBody = ({ messages }: { messages: ReturnType<typeof useChatMessages>['data'] }): React.ReactElement => {
  const { data: users } = useAllUsers();

  if (!messages || !users) {
    return <Loading />;
  }

  if (messages.length === 0) {
    return <span>No messages. Be the first!</span>;
  }

  return (
    <div>
      <dl className="chat-list dl-horizontal">
        {messages.map((message, i) => {
          const displayName = !message.userId ? BOT_NAME : users[message.userId]?.name || `User ${message.userId}`;
          const className = !message.userId ? 'bot-message' : '';
          return (
            <React.Fragment key={message.id}>
              <dt className={className}>
                {displayName}
                <span className="message-date"> ({moment(message.createdAt).format('LT')})</span>:
              </dt>
              <dd className={className}>{message.message}</dd>
            </React.Fragment>
          );
        })}
      </dl>
    </div>
  );
};

const ChatRoomInput = (): React.ReactElement => {
  const [text, setText] = useState('');
  const trimmedText = text.trim();
  const chatMessageMutation = useChatMessageMutation();
  return (
    <div>
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (trimmedText.length === 0) {
            return;
          }
          try {
            await chatMessageMutation.mutateAsync(trimmedText);
            setText('');
          } catch (e) {
            // TODO failed message
          }
        }}
      >
        <div className="form-group chat-input-form">
          <span>
            <input type="text" className="form-control" value={text} onChange={(ev) => setText(ev.target.value)} />
          </span>
          <span>
            <button
              type="submit"
              className="btn btn-default"
              disabled={trimmedText.length === 0 && !chatMessageMutation.isLoading}
            >
              Send
            </button>
          </span>
        </div>
      </form>
    </div>
  );
};

const ChatNotificationSoundToggle = ({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}): React.ReactElement => {
  return (
    <div className="checkbox" style={{ paddingLeft: '20px' }}>
      <label>
        <input type="checkbox" checked={!enabled} onChange={(ev) => onToggle(!ev.target.checked)} /> Turn off chat
        notification sounds
      </label>
    </div>
  );
};

const useInitialScrollToBottom = (scrollPaneRef: HTMLDivElement | null) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!scrollPaneRef || ready) {
      return;
    }

    setTimeout(() => {
      if (!scrollPaneRef || ready) {
        return;
      }

      scrollPaneRef.scrollTo(0, scrollPaneRef.scrollHeight);
      setReady(true);
    }, 500);
  }, [ready, scrollPaneRef]);

  return ready;
};

const useScrollAfterNewMessage = ({
  scrollPaneRef,
  enabled,
  messages,
}: {
  scrollPaneRef: HTMLDivElement | null;
  enabled: boolean;
  messages?: ReturnType<typeof useChatMessages>['data'];
}) => {
  const messageCount = messages?.length ?? 0;

  const lastMessageCountRef = useRef(messageCount);
  useEffect(() => {
    lastMessageCountRef.current = messageCount;
  }, [messageCount]);

  const lastMessageCount = lastMessageCountRef.current ?? 0;

  useEffect(() => {
    if (!enabled || !scrollPaneRef || lastMessageCount >= messageCount) {
      return;
    }

    const position = scrollPaneRef.scrollTop + scrollPaneRef.offsetHeight;
    const isAtBottom = position >= scrollPaneRef.scrollHeight - 100;

    if (isAtBottom) {
      scrollPaneRef.scrollTo(0, scrollPaneRef.scrollHeight);
    }
  }, [enabled, lastMessageCount, messageCount, scrollPaneRef]);
};

const useNewChatMessageSoundFx = (
  messages: ReturnType<typeof useChatMessages>['data'],
  enabled: boolean,
) => {
  const initializedRef = useRef(false);
  const seenMessageIdsRef = useRef(new Set<number>());

  useEffect(() => {
    if (!messages) {
      return;
    }

    const seen = seenMessageIdsRef.current;

    if (!initializedRef.current) {
      messages.forEach((m) => seen.add(m.id));
      initializedRef.current = true;
      return;
    }

    let hasNewUserMessage = false;
    for (const m of messages) {
      if (seen.has(m.id)) {
        continue;
      }

      seen.add(m.id);
      if (m.userId) {
        hasNewUserMessage = true;
      }
    }

    if (enabled && hasNewUserMessage) {
      try {
        void newChatMessageSound?.play();
      } catch {
        // noop
      }
    }
  }, [enabled, messages]);
};

const useChatNotificationSoundsEnabled = (): [boolean, (enabled: boolean) => void] => {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedValue = window.localStorage.getItem(CHAT_NOTIFICATION_SOUNDS_ENABLED_KEY);
    if (storedValue === null) {
      return;
    }

    setEnabled(storedValue === 'true');
  }, []);

  const updateEnabled = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHAT_NOTIFICATION_SOUNDS_ENABLED_KEY, String(nextEnabled));
    }
  };

  return [enabled, updateEnabled];
};

export default ChatRoom;
