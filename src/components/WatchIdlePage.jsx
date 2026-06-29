import { useEffect, useState } from "react";
import { ArrowRight, Image } from "lucide-react";
import { LoadingSpinner } from "./primitives/LoadingSpinner.jsx";
import { UserAvatar } from "./primitives/UserAvatar.jsx";
import { createApiError, getAppErrorMessage } from "../lib/appErrors.js";
import { buildWatchLink } from "../lib/routeState.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

function RoomCoverPlaceholder() {
  const { t } = useI18n();

  return (
    <div className="watch-room-cover-placeholder" aria-hidden="true">
      <Image />
      <span>{t("watch.noCover")}</span>
    </div>
  );
}

function getRoomTitle(room, t) {
  if (room.title) {
    return room.title;
  }

  const hostName = room.host.displayName || room.host.handle || room.host.email || t("watch.anonymousHost");
  return t("watch.roomOf", { room: hostName });
}

function getRoomSubtitle(room, t) {
  return room.host.displayName || room.host.handle || room.host.email || t("watch.anonymousHost");
}

function getRoomOpenTarget(room) {
  return room.host.handle || room.id;
}

function getRoomHref(room) {
  const target = getRoomOpenTarget(room);
  return buildWatchLink("", target) || "?";
}

function getRoomWatchFallback(room, roomTitle) {
  const host = room.host || {};
  return {
    hostUserId: host.id || "",
    hostHandle: host.handle || "",
    hostDisplayName: host.displayName || "",
    hostAvatarUrl: host.avatarUrl || "",
    title: room.title || roomTitle || "",
  };
}

function WatchRoomCard({ room, onOpenRoom }) {
  const { t } = useI18n();
  const [coverBroken, setCoverBroken] = useState(false);
  const roomTitle = getRoomTitle(room, t);
  const roomSubtitle = getRoomSubtitle(room, t);
  const hasCover = Boolean(room.coverUrl) && !coverBroken;
  const openTarget = getRoomOpenTarget(room);

  return (
    <a
      href={getRoomHref(room)}
      className={`watch-room-row${hasCover ? "" : " is-no-cover"}`}
      onClick={(event) => {
        event.preventDefault();
        onOpenRoom?.(openTarget, getRoomWatchFallback(room, roomTitle));
      }}
    >
      <div className={`watch-room-cover${hasCover ? "" : " is-placeholder"}`}>
        {hasCover ? (
          <img
            src={room.coverUrl}
            alt={t("watch.coverAlt", { title: roomTitle })}
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
  const { t } = useI18n();
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
              placeholder={t("watch.inputHostHandle")}
              aria-label={t("accountPanel.handle")}
              enterKeyHint="go"
              autoCapitalize="off"
              autoCorrect="off"
              onInput={onRoomInput}
            />
            <button type="submit" id="start" aria-label={t("watch.joinRoom")} disabled={!room.trim()}>
              <JoinIcon />
            </button>
          </form>
          <section className={`watch-room-section${roomsState.items.length ? "" : " is-empty"}`}>
            {roomsState.loading ? (
              <div className="watch-room-state is-loading">
                <LoadingSpinner className="watch-room-loading-spinner" label={t("watch.loadingRooms")} />
              </div>
            ) : roomsState.error ? (
              <div className="watch-room-state is-error">{t("watch.roomListFailed", { error: roomsState.error })}</div>
            ) : roomsState.items.length ? (
              <div className="watch-room-grid">
                {roomsState.items.map((item) => (
                  <WatchRoomCard key={item.id} room={item} onOpenRoom={onOpenRoom} />
                ))}
              </div>
            ) : (
              <div className="watch-room-state">{t("watch.noRooms")}</div>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
