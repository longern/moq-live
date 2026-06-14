import { RETAINED_PLAYER_LAYOUT_STATES } from "./status.js";
import {
  STREAM_PROTOCOL_MOQ,
  STREAM_PROTOCOL_WEBRTC,
} from "./streamProtocol.js";

export function getAvatarLabel(authState, t) {
  if (!authState.user) {
    return t("common.anonymous");
  }

  return authState.user.displayName || authState.user.email || t("common.user");
}

export function isNamespaceWatchTarget(value) {
  return value.trim().toLowerCase().startsWith("ns:");
}

export function getNamespaceWatchValue(value) {
  if (!isNamespaceWatchTarget(value)) {
    return "";
  }

  return value.trim().slice(3).trim();
}

export function getHandleWatchValue(value) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function getWatchPlayerLayoutScopeKey({
  normalizedWatchInput,
  watchTestChannel,
  watchingNamespace,
  directWatchNamespace,
  watchHandle,
}) {
  if (!normalizedWatchInput) {
    return "";
  }

  if (watchTestChannel) {
    return `test:${watchTestChannel.id}`;
  }

  if (watchingNamespace) {
    return `namespace:${directWatchNamespace || normalizedWatchInput.toLowerCase()}`;
  }

  return `room:${watchHandle || normalizedWatchInput.toLowerCase()}`;
}

export function shouldUseWatchPlayerShell({
  page,
  watchJoined,
  playerSession,
  playerStatusKind,
  playerOrientation,
}) {
  if (page !== "watch" || !watchJoined) {
    return false;
  }

  if (playerSession) {
    return true;
  }

  return (
    playerOrientation === "portrait" &&
    RETAINED_PLAYER_LAYOUT_STATES.has(playerStatusKind)
  );
}

export function getDesiredWatchPlaybackTarget({
  page,
  watchRouteCommitted,
  watchingNamespace,
  directWatchNamespace,
  resolvedWatchRoomId,
  roomStateReady,
  isLive,
  playbackReady,
  protocol,
  relayUrl,
  namespace,
  webRtcUrl,
  startedAt,
}) {
  if (page !== "watch" || !watchRouteCommitted) {
    return null;
  }

  if (watchingNamespace) {
    if (!directWatchNamespace) {
      return null;
    }
    const roomId = `namespace:${directWatchNamespace.toLowerCase()}`;
    return {
      roomId,
      startedAt: "__namespace__",
      protocol: STREAM_PROTOCOL_MOQ,
      relayUrl,
      namespace,
      webRtcUrl: "",
    };
  }

  if (!resolvedWatchRoomId || !roomStateReady || !isLive || !playbackReady) {
    return null;
  }

  const targetStartedAt = startedAt || "__live__";
  return {
    roomId: resolvedWatchRoomId,
    startedAt: targetStartedAt,
    protocol,
    relayUrl,
    namespace,
    webRtcUrl,
  };
}

export function playerSessionMatchesWatchTarget(playerSession, target) {
  if (!playerSession || !target || playerSession.protocol !== target.protocol) {
    return false;
  }

  if (target.protocol === STREAM_PROTOCOL_WEBRTC) {
    return (
      playerSession.webRtcUrl === target.webRtcUrl &&
      playerSession.namespace === target.namespace
    );
  }

  return (
    playerSession.relayUrl === target.relayUrl &&
    playerSession.namespace === target.namespace
  );
}

export function watchPlaybackRecordMatches(record, target) {
  return (
    record.roomId === target.roomId &&
    record.startedAt === target.startedAt &&
    record.protocol === target.protocol
  );
}


export function createInitialWatchRoomResolution() {
  return {
    loading: false,
    error: "",
    roomId: "",
    hostUserId: "",
    hostHandle: "",
    hostDisplayName: "",
    hostAvatarUrl: "",
    hostGender: "",
    hostBirthDate: "",
    hostBio: "",
    lastLocationProvince: "",
    lastLocationUpdatedAt: "",
    hostFollowerCount: 0,
    hostFollowingCount: 0,
    title: "",
    welcomeMessage: "",
    coverUrl: "",
  };
}

export function createInitialWatchFollowState() {
  return {
    hostUserId: "",
    following: false,
    notifyLiveStarted: false,
    followerCount: 0,
    followingCount: 0,
    loading: false,
    busy: false,
    notifyBusy: false,
    error: "",
  };
}
