import { useEffect, useState } from "react";
import { ArrowRight, Image } from "lucide-react";
import { LoadingSpinner } from "./LoadingSpinner.jsx";
import { UserAvatar } from "./UserAvatar.jsx";
import { createApiError, getAppErrorMessage } from "../lib/appErrors.js";

function RoomCoverPlaceholder() {
  return (
    <div className="watch-room-cover-placeholder" aria-hidden="true">
      <Image />
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

function getRoomHref(room) {
  const target = getRoomOpenTarget(room);
  return target ? `?r=${encodeURIComponent(target)}` : "?";
}

function WatchRoomCard({ room, onOpenRoom }) {
  const [coverBroken, setCoverBroken] = useState(false);
  const roomTitle = getRoomTitle(room);
  const roomSubtitle = getRoomSubtitle(room);
  const hasCover = Boolean(room.coverUrl) && !coverBroken;
  const openTarget = getRoomOpenTarget(room);

  return (
    <a
      href={getRoomHref(room)}
      className={`watch-room-row${hasCover ? "" : " is-no-cover"}`}
      onClick={(event) => {
        event.preventDefault();
        onOpenRoom?.(openTarget);
      }}
    >
      <div className={`watch-room-cover${hasCover ? "" : " is-placeholder"}`}>
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
      <div className="watch-room-row-body">
        <div className="watch-room-row-main">
          <strong>{roomTitle}</strong>
        </div>
        <div className="watch-room-row-host">
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
    </a>
  );
}

function JoinIcon() {
  return <ArrowRight aria-hidden="true" />;
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
          throw createApiError(payload, "room_list_failed", { status: response.status });
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
          error: getAppErrorMessage(error),
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
    <section className="page page-immersive watch-idle-page" data-page="watch" data-joined="false" hidden={hidden}>
      <div className="watch-idle-shell">
        <div className="watch-idle-panel">
          <form
            className="watch-idle-form"
            onSubmit={(event) => {
              event.preventDefault();
              onStart();
            }}
          >
            <input
              id="namespace"
              value={room}
              placeholder="输入主播号"
              aria-label="主播号"
              enterKeyHint="go"
              autoCapitalize="off"
              autoCorrect="off"
              onInput={onRoomInput}
            />
            <button type="submit" id="start" aria-label="加入直播间" disabled={!room.trim()}>
              <JoinIcon />
            </button>
          </form>
          <section className={`watch-room-section${roomsState.items.length ? "" : " is-empty"}`}>
            {roomsState.loading ? (
              <div className="watch-room-state is-loading">
                <LoadingSpinner className="watch-room-loading-spinner" label="正在加载直播间" />
              </div>
            ) : roomsState.error ? (
              <div className="watch-room-state is-error">直播间列表加载失败：{roomsState.error}</div>
            ) : roomsState.items.length ? (
              <div className="watch-room-grid">
                {roomsState.items.map((item) => (
                  <WatchRoomCard key={item.id} room={item} onOpenRoom={onOpenRoom} />
                ))}
              </div>
            ) : (
              <div className="watch-room-state">暂时还没有直播间</div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
