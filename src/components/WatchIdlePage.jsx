import { useEffect, useState } from "preact/hooks";
import { UserAvatar } from "./UserAvatar.jsx";

function RoomCoverPlaceholder() {
  return (
    <div class="watch-room-cover-placeholder" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="4" y="6" width="16" height="12" rx="2.5" />
        <path d="m8 15 2.8-3.2a1 1 0 0 1 1.54.06L14 14l1.2-1.4a1 1 0 0 1 1.52-.04L19 15" />
        <circle cx="9" cy="10" r="1.3" />
      </svg>
      <span>暂无封面</span>
    </div>
  );
}

function getRoomTitle(room) {
  if (room.title) {
    return room.title;
  }

  const hostName = room.host.displayName || room.host.handle || room.host.email || "匿名主播";
  return `${hostName}的直播间`;
}

function getRoomSubtitle(room) {
  return room.host.displayName || room.host.handle || room.host.email || "匿名主播";
}

function getRoomOpenTarget(room) {
  return room.host.handle || room.id;
}

function WatchRoomCard({ room, onOpenRoom }) {
  const [coverBroken, setCoverBroken] = useState(false);
  const roomTitle = getRoomTitle(room);
  const roomSubtitle = getRoomSubtitle(room);
  const hasCover = Boolean(room.coverUrl) && !coverBroken;

  return (
    <button
      type="button"
      class={`watch-room-row${hasCover ? "" : " is-no-cover"}`}
      onClick={() => {
        onOpenRoom?.(getRoomOpenTarget(room));
      }}
    >
      <div class={`watch-room-cover${hasCover ? "" : " is-placeholder"}`}>
        {hasCover ? (
          <img
            src={room.coverUrl}
            alt={`${roomTitle}封面`}
            onError={() => {
              setCoverBroken(true);
            }}
          />
        ) : (
          <RoomCoverPlaceholder />
        )}
      </div>
      <div class="watch-room-row-body">
        <div class="watch-room-row-main">
          <strong>{roomTitle}</strong>
        </div>
        <div class="watch-room-row-host">
          <UserAvatar
            avatarUrl={room.host.avatarUrl}
            displayName={room.host.displayName}
            email={room.host.email}
            className="watch-room-host-avatar"
            imgAlt={roomSubtitle}
            monogramClassName="is-monogram"
            placeholderClassName="is-placeholder"
          />
          <span>{roomSubtitle}</span>
        </div>
      </div>
    </button>
  );
}

function JoinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h12" />
      <path d="m13 7 5 5-5 5" />
    </svg>
  );
}

export function WatchIdlePage({
  hidden,
  room,
  onRoomInput,
  onStart,
  onOpenRoom
}) {
  const [roomsState, setRoomsState] = useState({
    loading: true,
    error: "",
    items: []
  });

  useEffect(() => {
    let cancelled = false;

    async function loadRooms() {
      try {
        const response = await fetch("/api/rooms", {
          credentials: "same-origin"
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || `rooms endpoint returned ${response.status}`);
        }

        if (cancelled) {
          return;
        }

        setRoomsState({
          loading: false,
          error: "",
          items: Array.isArray(payload.rooms) ? payload.rooms : []
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setRoomsState({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
          items: []
        });
      }
    }

    void loadRooms();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section class="page page-immersive watch-idle-page" data-page="watch" data-joined="false" hidden={hidden}>
      <div class="watch-idle-shell">
        <div class="watch-idle-panel">
          <div class="watch-idle-form">
            <input
              id="namespace"
              value={room}
              placeholder="输入主播 handle"
              aria-label="主播 handle"
              onInput={onRoomInput}
            />
            <button type="button" id="start" aria-label="加入直播间" onClick={onStart} disabled={!room.trim()}>
              <JoinIcon />
            </button>
          </div>
          <section class={`watch-room-section${roomsState.items.length ? "" : " is-empty"}`}>
            {roomsState.loading ? (
              <div class="watch-room-state">正在加载直播间…</div>
            ) : roomsState.error ? (
              <div class="watch-room-state is-error">直播间列表加载失败：{roomsState.error}</div>
            ) : roomsState.items.length ? (
              <div class="watch-room-grid">
                {roomsState.items.map((item) => (
                  <WatchRoomCard key={item.id} room={item} onOpenRoom={onOpenRoom} />
                ))}
              </div>
            ) : (
              <div class="watch-room-state">暂时还没有直播间</div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
