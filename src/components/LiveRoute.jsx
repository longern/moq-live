import { useEffect, useRef, useState } from "react";
import { LivePage } from "./LivePage.jsx";
import { useChatController } from "../hooks/useChatController.js";
import { useCohostPlayerControllers } from "../hooks/useCohostPlayerControllers.js";
import { useCommentSpeech } from "../hooks/useCommentSpeech.js";
import { usePublisherController } from "../hooks/usePublisherController.js";
import { buildWatchLink, generateRoomId } from "../lib/routeState.js";
import { describePublishState } from "../lib/status.js";
import { getPublishBlockReason, isPublishBlocked } from "../lib/roomPolicy.js";
import { createApiError, createAppError, getAppErrorMessage } from "../lib/appErrors.js";
import { useI18n } from "../i18n/I18nProvider.jsx";
import { normalizeStreamProtocol } from "../lib/streamProtocol.js";

const STREAM_SETTINGS_STORAGE_PREFIX = "moq-live:stream-settings";
const COMMENT_SPEECH_STORAGE_PREFIX = "moq-live:comment-speech";
const LOCATION_SHARING_STORAGE_PREFIX = "moq-live:location-sharing";
const LIVE_NOTIFICATION_STORAGE_PREFIX = "moq-live:live-start-notifications";
const COHOST_RECENTS_STORAGE_PREFIX = "moq-live:cohost-recents";
const MAX_COHOST_RECENTS = 6;
const AUDIENCE_CALL_SPEAKING_BROADCAST_INTERVAL_MS = 1000;

function getStreamSettingsStorageKey(userId) {
  if (userId) {
    return `${STREAM_SETTINGS_STORAGE_PREFIX}:user:${userId}`;
  }
  return `${STREAM_SETTINGS_STORAGE_PREFIX}:local`;
}

function getCommentSpeechStorageKey(userId) {
  if (userId) {
    return `${COMMENT_SPEECH_STORAGE_PREFIX}:user:${userId}`;
  }
  return `${COMMENT_SPEECH_STORAGE_PREFIX}:local`;
}

function getLocationSharingStorageKey(userId) {
  if (userId) {
    return `${LOCATION_SHARING_STORAGE_PREFIX}:user:${userId}`;
  }
  return `${LOCATION_SHARING_STORAGE_PREFIX}:local`;
}

function getLocalLocationSharingStorageKey() {
  return getLocationSharingStorageKey("");
}

function getLiveNotificationStorageKey(userId) {
  if (userId) {
    return `${LIVE_NOTIFICATION_STORAGE_PREFIX}:user:${userId}`;
  }
  return `${LIVE_NOTIFICATION_STORAGE_PREFIX}:local`;
}

function getCohostRecentsStorageKey(userId) {
  if (userId) {
    return `${COHOST_RECENTS_STORAGE_PREFIX}:user:${userId}`;
  }
  return `${COHOST_RECENTS_STORAGE_PREFIX}:local`;
}

function readStoredBoolean(storageKey, fallback = false) {
  if (typeof window === "undefined" || !storageKey) {
    return fallback;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (storedValue === null) {
      return fallback;
    }
    return storedValue === "1";
  } catch {
    return fallback;
  }
}

function hasStoredBoolean(storageKey) {
  if (typeof window === "undefined" || !storageKey) {
    return false;
  }

  try {
    return window.localStorage.getItem(storageKey) !== null;
  } catch {
    return false;
  }
}

function writeStoredBoolean(storageKey, value) {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, value ? "1" : "0");
  } catch {
    // Ignore storage failures; the setting remains active for the current session.
  }
}

function readStoredCohostRecents(storageKey) {
  if (typeof window === "undefined" || !storageKey) {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => ({
        handle: String(item?.handle ?? "").trim(),
        displayName: String(item?.displayName ?? "").trim(),
        avatarUrl: String(item?.avatarUrl ?? "").trim(),
      }))
      .filter((item) => item.handle)
      .slice(0, MAX_COHOST_RECENTS);
  } catch {
    return [];
  }
}

function writeStoredCohostRecents(storageKey, recents) {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(recents.slice(0, MAX_COHOST_RECENTS)));
  } catch {
    // Ignore storage failures; recent cohost shortcuts are not critical.
  }
}

function getCohostRequestErrorMessage(error, t) {
  if (error?.code === "room_not_found") {
    return t("live.cohostErrors.roomNotFound");
  }
  if (error?.code === "room_not_live") {
    return t("live.cohostErrors.roomNotLive");
  }
  if (error?.code === "cohost_invites_blocked") {
    return t("live.cohostErrors.invitesBlocked");
  }
  if (error?.code === "cohost_self") {
    return t("live.cohostErrors.self");
  }
  if (error?.code === "cohost_full") {
    return t("live.cohostErrors.full");
  }
  return getAppErrorMessage(error);
}

function getCurrentPosition() {
  if (
    typeof navigator === "undefined"
    || !navigator.geolocation
    || typeof navigator.geolocation.getCurrentPosition !== "function"
  ) {
    return Promise.reject(new Error("geolocation unavailable"));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, (error) => reject(new Error(error.message)), {
      enableHighAccuracy: false,
      maximumAge: 5 * 60 * 1000,
      timeout: 15_000,
    });
  });
}

function readStoredStreamSettings(storageKey) {
  if (typeof window === "undefined" || !storageKey) {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    if (!storedValue) {
      return null;
    }
    const parsed = JSON.parse(storedValue);
    return {
      protocol: typeof parsed?.protocol === "string" ? normalizeStreamProtocol(parsed.protocol) : "",
      qualityId: typeof parsed?.qualityId === "string" ? parsed.qualityId : "",
      cameraId: typeof parsed?.cameraId === "string" ? parsed.cameraId : "",
      publishUrl: typeof parsed?.publishUrl === "string" ? parsed.publishUrl : "",
      playbackUrl: typeof parsed?.playbackUrl === "string" ? parsed.playbackUrl : "",
    };
  } catch {
    return null;
  }
}

function writeStoredStreamSettings(
  storageKey,
  { protocol = "", qualityId = "", cameraId = "", publishUrl = "", playbackUrl = "" },
) {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  try {
    const nextProtocol = protocol ? normalizeStreamProtocol(protocol) : "";
    const nextQualityId = String(qualityId);
    const nextCameraId = String(cameraId);
    const nextPublishUrl = String(publishUrl);
    const nextPlaybackUrl = String(playbackUrl);
    if (!nextProtocol && !nextQualityId && !nextCameraId && !nextPublishUrl && !nextPlaybackUrl) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify({
      protocol: nextProtocol,
      qualityId: nextQualityId,
      cameraId: nextCameraId,
      publishUrl: nextPublishUrl,
      playbackUrl: nextPlaybackUrl,
    }));
  } catch {
    // Ignore storage failures; the URLs remain usable for the current session.
  }
}

function buildDefaultWebRtcPlaybackProxyUrl({ roomId }) {
  const normalizedRoomId = String(roomId || "").trim();
  if (!normalizedRoomId || typeof window === "undefined") {
    return "";
  }
  return new URL(
    `/api/rooms/${encodeURIComponent(normalizedRoomId)}/webrtc/whep`,
    window.location.href,
  ).toString();
}

function splitCameraOptions(cameraOptions) {
  const front = [];
  const rear = [];

  for (const option of cameraOptions) {
    const label = option.label.toLowerCase();
    if (/(back|rear|environment|world)/.test(label)) {
      rear.push(option);
      continue;
    }
    if (/(front|user|face|selfie)/.test(label)) {
      front.push(option);
      continue;
    }
    if (rear.length === 0) {
      front.push(option);
    } else {
      rear.push(option);
    }
  }

  return {
    front: front[0] ?? cameraOptions[0] ?? null,
    rear: rear[0] ?? cameraOptions.find((option) => option.value !== front[0]?.value) ?? null,
  };
}

function getCameraMode(cameraOptions, selectedCameraId, cameraEnabled) {
  if (!cameraEnabled) {
    return "off";
  }

  const { front, rear } = splitCameraOptions(cameraOptions);
  if (rear && selectedCameraId === rear.value) {
    return "rear";
  }

  if (front) {
    return "front";
  }

  return cameraOptions.length ? "front" : "off";
}

function useLiveRoomChatSync({
  liveNamespace,
  liveRoomDetails,
  liveChat,
  liveStreamActive,
  canControlBroadcast,
  relayUrl,
  publishProtocol,
  webRtcUrl,
}) {
  const announcedLiveStateRef = useRef({ room: "", isLive: null });
  const sendChatEventRef = useRef(liveChat.sendEvent);

  sendChatEventRef.current = liveChat.sendEvent;

  useEffect(() => {
    if (!liveNamespace) {
      announcedLiveStateRef.current = { room: "", isLive: null };
      return;
    }

    if (liveChat.connectionState !== "connected" || !liveChat.roomStateReady) {
      return;
    }

    if (liveChat.streamState.isLive === liveStreamActive) {
      announcedLiveStateRef.current = {
        room: liveNamespace,
        isLive: liveStreamActive,
      };
      return;
    }

    const current = announcedLiveStateRef.current;
    if (current.room === liveNamespace && current.isLive === liveStreamActive) {
      return;
    }

    const sent = sendChatEventRef.current?.({
      type: liveStreamActive ? "stream.started" : "stream.stopped",
      stream: liveStreamActive
        ? {
          startedAt: new Date().toISOString(),
          protocol: publishProtocol,
        }
        : undefined,
    });

    if (sent) {
      announcedLiveStateRef.current = {
        room: liveNamespace,
        isLive: liveStreamActive,
      };
    }
  }, [
    liveChat.connectionState,
    liveChat.roomStateReady,
    liveChat.streamState.isLive,
    liveNamespace,
    liveStreamActive,
    publishProtocol,
  ]);

  useEffect(() => {
    if (!liveNamespace || liveChat.connectionState !== "connected" || !liveChat.roomStateReady) {
      return;
    }
    if (!canControlBroadcast) {
      return;
    }

    const nextStream = {
      relayUrl,
      namespace: liveNamespace,
      protocol: publishProtocol,
      webRtcUrl,
    };
    const nextTitle = liveRoomDetails?.title || "";
    if (
      liveChat.roomMeta.title === nextTitle
      &&
      liveChat.roomMeta.stream.relayUrl === nextStream.relayUrl
      && liveChat.roomMeta.stream.namespace === nextStream.namespace
      && liveChat.roomMeta.stream.protocol === nextStream.protocol
      && liveChat.roomMeta.stream.webRtcUrl === nextStream.webRtcUrl
    ) {
      return;
    }

    sendChatEventRef.current?.({
      type: "room.updated",
      roomMeta: {
        title: nextTitle,
        stream: nextStream,
      },
    });
  }, [
    liveChat.connectionState,
    canControlBroadcast,
    liveChat.roomStateReady,
    liveChat.roomMeta.title,
    liveChat.roomMeta.stream.namespace,
    liveChat.roomMeta.stream.protocol,
    liveChat.roomMeta.stream.relayUrl,
    liveChat.roomMeta.stream.webRtcUrl,
    relayUrl,
    publishProtocol,
    webRtcUrl,
    liveNamespace,
    liveRoomDetails?.title,
  ]);
}

export function LiveRoute({
  hidden,
  page,
  pageRef,
  relayUrl,
  relayUrlRef,
  liveRoom,
  liveRoomRef,
  liveChatRoomId,
  liveRoomDetails,
  setLiveRoomDetails,
  setLiveRoomValue,
  setRelayUrlValue,
  authState,
  log,
  onRequireLogin,
  onReturnHome,
  siteIconUrl = "",
  siteTitle = "",
  onRouteReady,
}) {
  const { t } = useI18n();

  useEffect(() => {
    onRouteReady?.();
  }, [onRouteReady]);

  const liveChatEnabled = Boolean(authState.user?.id) && page === "live";
  const publisherControllerRef = useRef(null);
  const liveChat = useChatController({
    room: liveChatRoomId,
    enabled: liveChatEnabled && Boolean(liveChatRoomId),
    authKey: authState.user?.id ?? "anonymous",
    role: "broadcaster",
    onAudienceCallRemoteStream: (remoteId, remoteStream) => {
      publisherControllerRef.current?.setAudienceCallRemoteStream(remoteId, remoteStream);
    },
    log,
  });
  const webRtcPublishUrlRef = useRef("");
  const webRtcPlaybackUrlRef = useRef("");
  const webRtcPlaybackRoomIdRef = useRef("");
  const [liveMode, setLiveMode] = useState("video");
  const [audienceCallMutedUserIds, setAudienceCallMutedUserIds] = useState(() => new Set());
  webRtcPlaybackRoomIdRef.current = liveChatRoomId || "";

  useEffect(() => {
    const activeUserIds = new Set(
      (Array.isArray(liveChat.audienceCallActive) ? liveChat.audienceCallActive : [])
        .map((item) => String(item.user?.id || "").trim())
        .filter(Boolean),
    );
    setAudienceCallMutedUserIds((current) => {
      const next = new Set(
        Array.from(current).filter((userId) => activeUserIds.has(userId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [liveChat.audienceCallActive]);

  const publisher = usePublisherController({
    page,
    pageRef,
    relayUrlRef,
    roomRef: liveRoomRef,
    webRtcPublishUrlRef,
    webRtcPlaybackUrlRef,
    webRtcPlaybackRoomIdRef,
    generateRoomId: () => setLiveRoomValue(generateRoomId()),
    assertCanPublish: async () => {
      const canControlBroadcast = await liveChat.requestBroadcastControl();
      if (!canControlBroadcast) {
        throw createAppError("broadcast_control_read_only");
      }
    },
    log,
  });
  publisherControllerRef.current = publisher;
  const cohostPlayers = useCohostPlayerControllers({
    active: liveChat.cohostActive,
    enabled: page === "live" && liveChat.roomStateReady,
    layoutScopeKey: "live",
    setLogText: () => {},
    log,
  });
  const audienceCallSpeakingBroadcastRef = useRef({
    lastSentAt: 0,
    lastSentSignature: "",
    pendingIds: [],
    timer: null,
  });

  useEffect(() => () => {
    const current = audienceCallSpeakingBroadcastRef.current;
    if (current.timer) {
      window.clearTimeout(current.timer);
      current.timer = null;
    }
  }, []);

  useEffect(() => {
    const activeUserIds = new Set(
      (Array.isArray(liveChat.audienceCallActive) ? liveChat.audienceCallActive : [])
        .map((item) => String(item.user?.id || "").trim())
        .filter(Boolean),
    );
    const speakingIds = (Array.isArray(publisher.audienceCallSpeakingUserIds)
      ? publisher.audienceCallSpeakingUserIds
      : [])
      .map((userId) => String(userId || "").trim())
      .filter((userId, index, list) => (
        userId && activeUserIds.has(userId) && list.indexOf(userId) === index
      ))
      .sort();
    const signature = speakingIds.join("\n");
    const current = audienceCallSpeakingBroadcastRef.current;
    if (signature === current.lastSentSignature) {
      current.pendingIds = speakingIds;
      if (current.timer) {
        window.clearTimeout(current.timer);
        current.timer = null;
      }
      return;
    }

    function sendSpeakingUpdate(ids, nextSignature) {
      if (liveChat.updateAudienceCallSpeaking(ids)) {
        current.lastSentAt = Date.now();
        current.lastSentSignature = nextSignature;
      }
    }

    const now = Date.now();
    const elapsed = now - current.lastSentAt;
    current.pendingIds = speakingIds;
    if (elapsed >= AUDIENCE_CALL_SPEAKING_BROADCAST_INTERVAL_MS) {
      if (current.timer) {
        window.clearTimeout(current.timer);
        current.timer = null;
      }
      sendSpeakingUpdate(speakingIds, signature);
      return;
    }

    if (!current.timer) {
      current.timer = window.setTimeout(() => {
        current.timer = null;
        const pendingIds = current.pendingIds;
        sendSpeakingUpdate(pendingIds, pendingIds.join("\n"));
      }, AUDIENCE_CALL_SPEAKING_BROADCAST_INTERVAL_MS - elapsed);
    }
  }, [
    liveChat,
    liveChat.audienceCallActive,
    publisher.audienceCallSpeakingUserIds,
  ]);
  const streamSettingsStorageKey = getStreamSettingsStorageKey(authState.user?.id);
  const commentSpeechStorageKey = getCommentSpeechStorageKey(authState.user?.id);
  const locationSharingStorageKey = getLocationSharingStorageKey(authState.user?.id);
  const liveNotificationStorageKey = getLiveNotificationStorageKey(authState.user?.id);
  const cohostRecentsStorageKey = getCohostRecentsStorageKey(authState.user?.id);
  const [commentSpeechEnabled, setCommentSpeechEnabled] = useState(() => readStoredBoolean(commentSpeechStorageKey));
  const commentSpeechSupported =
    typeof window !== "undefined"
    && "speechSynthesis" in window
    && typeof window.SpeechSynthesisUtterance === "function";
  const [locationSharingEnabled, setLocationSharingEnabled] = useState(() => readStoredBoolean(locationSharingStorageKey));
  const [locationSharingPending, setLocationSharingPending] = useState(false);
  const [liveNotificationEnabled, setLiveNotificationEnabled] = useState(() => readStoredBoolean(liveNotificationStorageKey, true));
  const [cohostRecentHosts, setCohostRecentHosts] = useState(() => readStoredCohostRecents(cohostRecentsStorageKey));
  const locationUploadRequestRef = useRef(0);
  const liveLocationUploadKeyRef = useRef("");
  const liveNotificationSentKeyRef = useRef("");
  const locationSharingSupported =
    typeof navigator !== "undefined"
    && Boolean(navigator.geolocation)
    && typeof navigator.geolocation.getCurrentPosition === "function";

  useEffect(() => {
    setCommentSpeechEnabled(readStoredBoolean(commentSpeechStorageKey));
  }, [commentSpeechStorageKey]);

  useEffect(() => {
    if (
      authState.user?.id
      && !hasStoredBoolean(locationSharingStorageKey)
      && hasStoredBoolean(getLocalLocationSharingStorageKey())
    ) {
      const localValue = readStoredBoolean(getLocalLocationSharingStorageKey());
      writeStoredBoolean(locationSharingStorageKey, localValue);
      setLocationSharingEnabled(localValue);
      return;
    }

    setLocationSharingEnabled(readStoredBoolean(locationSharingStorageKey));
  }, [authState.user?.id, locationSharingStorageKey]);

  useEffect(() => {
    setLiveNotificationEnabled(readStoredBoolean(liveNotificationStorageKey, true));
  }, [liveNotificationStorageKey]);

  useEffect(() => {
    setCohostRecentHosts(readStoredCohostRecents(cohostRecentsStorageKey));
  }, [cohostRecentsStorageKey]);

  useEffect(() => {
    if (!liveChatEnabled || liveChat.connectionState !== "connected") {
      setLocationSharingPending(false);
    }
  }, [liveChat.connectionState, liveChatEnabled]);

  useCommentSpeech({
    enabled: liveChatEnabled && commentSpeechEnabled && commentSpeechSupported,
    messages: liveChat.messages,
    connectionState: liveChat.connectionState,
    log,
  });

  useEffect(() => {
    const storedSettings = readStoredStreamSettings(streamSettingsStorageKey);
    if (!storedSettings) {
      return;
    }
    if (storedSettings.protocol && storedSettings.protocol !== publisher.publishProtocol) {
      void publisher.setPublishProtocol(storedSettings.protocol).catch((error) => {
        const message = getAppErrorMessage(error);
        log(`publish protocol restore failed: ${message}`);
      });
    }
    if (storedSettings.qualityId && storedSettings.qualityId !== publisher.publishQualityId) {
      void publisher.setPublishQualityId(storedSettings.qualityId).catch((error) => {
        const message = getAppErrorMessage(error);
        log(`publish quality restore failed: ${message}`);
      });
    }
    if (
      storedSettings.cameraId &&
      storedSettings.cameraId !== publisher.selectedCameraId &&
      publisher.cameraOptions.some((option) => option.value === storedSettings.cameraId)
    ) {
      publisher.setSelectedCameraId(storedSettings.cameraId);
    }
    if (storedSettings.publishUrl && storedSettings.publishUrl !== publisher.webRtcPublishUrl) {
      publisher.setWebRtcPublishUrl(storedSettings.publishUrl);
    }
    if (storedSettings.playbackUrl && storedSettings.playbackUrl !== publisher.webRtcPlaybackUrl) {
      publisher.setWebRtcPlaybackUrl(storedSettings.playbackUrl);
    }
  }, [
    log,
    publisher.cameraOptions,
    publisher.publishQualityId,
    publisher.publishProtocol,
    publisher.selectedCameraId,
    publisher.webRtcPlaybackUrl,
    publisher.webRtcPublishUrl,
    streamSettingsStorageKey,
  ]);

  const liveRoomLabel = authState.user?.displayName
    || authState.user?.email
    || liveRoom
    || t("live.waitRoomId");
  const liveRoomAvatarUrl = authState.user?.avatarUrl || "";
  const liveShareTarget = authState.user?.handle?.trim() || (liveRoom ? `ns:${liveRoom}` : "");
  const liveWatchLink = buildWatchLink(relayUrl, liveShareTarget);
  const publishBadge = describePublishState(publisher.publishStatusKind, t);
  const liveStreamActive = publisher.publisherIsPublishing;
  const publishProtocol = normalizeStreamProtocol(publisher.publishProtocol);
  const webRtcPublishUrl = publisher.webRtcPublishUrl || "";
  const webRtcPlaybackUrl = publisher.webRtcPlaybackUrl || "";
  const liveNamespace = liveRoom;
  const liveRoomId = liveChatRoomId;
  const defaultWebRtcPlaybackUrl = buildDefaultWebRtcPlaybackProxyUrl({ roomId: liveRoomId });
  webRtcPublishUrlRef.current = webRtcPublishUrl.trim();
  webRtcPlaybackUrlRef.current = webRtcPlaybackUrl.trim() || defaultWebRtcPlaybackUrl;
  const webRtcUrl = webRtcPlaybackUrl.trim() || defaultWebRtcPlaybackUrl;
  const cohostActive = liveChat.cohostActive;
  const publishPolicyBlocked = isPublishBlocked(liveRoom);
  const publishControlBlocked =
    liveChatEnabled &&
    liveChat.connectionState === "connected" &&
    liveChat.roomStateReady &&
    !liveChat.canControlBroadcast;
  const publishBlocked = publishPolicyBlocked || publishControlBlocked;
  const publishControlBlockedReason = publishControlBlocked
    ? getAppErrorMessage({ code: "broadcast_control_read_only" })
    : "";
  const publishBlockedReason = publishPolicyBlocked
    ? getPublishBlockReason(liveRoom)
    : publishControlBlockedReason;
  const cameraMode = getCameraMode(
    publisher.cameraOptions,
    publisher.selectedCameraId,
    publisher.cameraEnabled,
  );

  useLiveRoomChatSync({
    liveNamespace,
    liveRoomDetails,
    liveChat,
    liveStreamActive,
    canControlBroadcast: liveChat.canControlBroadcast,
    relayUrl,
    publishProtocol,
    webRtcUrl,
  });

  useEffect(() => {
    if (!liveStreamActive || !liveRoom) {
      liveLocationUploadKeyRef.current = "";
      liveNotificationSentKeyRef.current = "";
    }
  }, [liveRoom, liveStreamActive]);

  useEffect(() => {
    const uploadKey = getLiveLocationUploadKey();
    if (
      !locationSharingEnabled
      || !locationSharingSupported
      || !liveStreamActive
      || !liveChat.streamState.isLive
      || !liveChat.canControlBroadcast
      || !uploadKey
    ) {
      return;
    }

    if (liveLocationUploadKeyRef.current === uploadKey) {
      return;
    }

    liveLocationUploadKeyRef.current = uploadKey;
    void uploadCurrentRoomLocation({ uploadKey });
  }, [
    liveChat.canControlBroadcast,
    liveChat.streamState.isLive,
    liveChat.streamState.startedAt,
    liveRoom,
    liveStreamActive,
    locationSharingEnabled,
    locationSharingSupported,
  ]);

  useEffect(() => {
    const liveKey = getLiveLocationUploadKey();
    if (
      !liveNotificationEnabled
      || !liveStreamActive
      || !liveChat.streamState.isLive
      || !liveChat.canControlBroadcast
      || !liveChatRoomId
      || !liveKey
    ) {
      return;
    }
    if (liveNotificationSentKeyRef.current === liveKey) {
      return;
    }

    liveNotificationSentKeyRef.current = liveKey;
    void fetch(`/api/rooms/${encodeURIComponent(liveChatRoomId)}/live-notifications`, {
      method: "POST",
      credentials: "same-origin"
    }).then(async (response) => {
      if (response.ok) {
        return;
      }
      const payload = await response.json().catch(() => ({}));
      log(`live notification failed: ${payload.code || response.status}`);
    }).catch((error) => {
      log(`live notification failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [
    liveChat.canControlBroadcast,
    liveChat.streamState.isLive,
    liveChat.streamState.startedAt,
    liveChatRoomId,
    liveNotificationEnabled,
    liveRoom,
    liveStreamActive,
    log,
  ]);

  async function shareLiveRoom() {
    if (!liveWatchLink) {
      return;
    }

    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      throw createAppError("share_not_supported");
    }

    try {
      await navigator.share({
        title: t("live.liveRoomTitle", { room: liveRoomLabel }),
        text: t("live.liveRoomShareText", { room: liveRoomLabel }),
        url: liveWatchLink,
      });
      log("live room shared");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      throw error;
    }
  }

  function persistCameraSelection(cameraId) {
    writeStoredStreamSettings(streamSettingsStorageKey, {
      protocol: publisher.publishProtocol,
      qualityId: publisher.publishQualityId,
      cameraId,
      publishUrl: publisher.webRtcPublishUrl,
      playbackUrl: publisher.webRtcPlaybackUrl,
    });
  }

  function selectCameraDevice(cameraId) {
    publisher.setSelectedCameraId(cameraId);
    persistCameraSelection(cameraId);
  }

  function getPreferredCameraOption() {
    const { front, rear } = splitCameraOptions(publisher.cameraOptions);
    return publisher.selectedCameraId
      ? publisher.cameraOptions.find((option) => option.value === publisher.selectedCameraId)
      : front ?? rear;
  }

  function enableCamera() {
    setLiveMode("video");
    const nextCamera = getPreferredCameraOption();

    if (nextCamera && nextCamera.value !== publisher.selectedCameraId) {
      selectCameraDevice(nextCamera.value);
    }

    publisher.setCameraEnabled(true);
  }

  async function changeCameraDevice(cameraId) {
    setLiveMode("video");

    if (publisher.publisherIsPublishing && publisher.cameraEnabled) {
      try {
        const switched = await publisher.switchPublishCamera(cameraId);
        if (switched) {
          selectCameraDevice(cameraId);
          publisher.setCameraEnabled(true);
        }
      } catch (error) {
        const message = getAppErrorMessage(error);
        log(`camera switch failed: ${message}`);
      }
      return;
    }

    selectCameraDevice(cameraId);
    publisher.setCameraEnabled(true);
  }

  function selectVideoMode() {
    setLiveMode("video");
    enableCamera();
  }

  function selectLiveMode(mode) {
    if (mode === "voice") {
      setLiveMode("voice");
      publisher.setCameraEnabled(false);
      return;
    }

    selectVideoMode();
  }

  function toggleCameraEnabled() {
    if (publisher.cameraEnabled) {
      publisher.setCameraEnabled(false, { blackout: true });
      return;
    }

    enableCamera();
  }

  function cycleCameraMode() {
    const { front, rear } = splitCameraOptions(publisher.cameraOptions);
    const currentMode = getCameraMode(
      publisher.cameraOptions,
      publisher.selectedCameraId,
      publisher.cameraEnabled,
    );

    if (currentMode === "off") {
      return;
    }

    if (currentMode === "front" && rear) {
      void changeCameraDevice(rear.value);
      return;
    }

    if (publisher.publisherIsPublishing && currentMode === "rear" && front) {
      void changeCameraDevice(front.value);
      return;
    }

    if (currentMode === "rear" && front) {
      void changeCameraDevice(front.value);
    }
  }

  function changeWebRtcPublishUrl(nextUrl) {
    publisher.setWebRtcPublishUrl(nextUrl);
    writeStoredStreamSettings(streamSettingsStorageKey, {
      protocol: publisher.publishProtocol,
      qualityId: publisher.publishQualityId,
      cameraId: publisher.selectedCameraId,
      publishUrl: nextUrl,
      playbackUrl: publisher.webRtcPlaybackUrl,
    });
  }

  function changeWebRtcPlaybackUrl(nextUrl) {
    publisher.setWebRtcPlaybackUrl(nextUrl);
    writeStoredStreamSettings(streamSettingsStorageKey, {
      protocol: publisher.publishProtocol,
      qualityId: publisher.publishQualityId,
      cameraId: publisher.selectedCameraId,
      publishUrl: publisher.webRtcPublishUrl,
      playbackUrl: nextUrl,
    });
  }

  function changeRelayUrl(nextUrl) {
    setRelayUrlValue?.(nextUrl);
  }

  async function changePublishQuality(qualityId) {
    writeStoredStreamSettings(streamSettingsStorageKey, {
      protocol: publisher.publishProtocol,
      qualityId,
      cameraId: publisher.selectedCameraId,
      publishUrl: publisher.webRtcPublishUrl,
      playbackUrl: publisher.webRtcPlaybackUrl,
    });
    await publisher.setPublishQualityId(qualityId);
  }

  async function changePublishProtocol(protocol) {
    const nextProtocol = normalizeStreamProtocol(protocol);
    writeStoredStreamSettings(streamSettingsStorageKey, {
      protocol: nextProtocol,
      qualityId: publisher.publishQualityId,
      cameraId: publisher.selectedCameraId,
      publishUrl: publisher.webRtcPublishUrl,
      playbackUrl: publisher.webRtcPlaybackUrl,
    });
    await publisher.setPublishProtocol(nextProtocol);
  }

  function changeCommentSpeechEnabled(nextEnabled) {
    const enabled = Boolean(nextEnabled) && commentSpeechSupported;
    setCommentSpeechEnabled(enabled);
    writeStoredBoolean(commentSpeechStorageKey, enabled);
  }

  function changeLiveNotificationEnabled(nextEnabled) {
    const enabled = Boolean(nextEnabled);
    setLiveNotificationEnabled(enabled);
    writeStoredBoolean(liveNotificationStorageKey, enabled);
  }

  function getLiveLocationUploadKey() {
    if (!liveRoom || !liveChat.streamState.isLive) {
      return "";
    }
    return `${liveRoom}:${liveChat.streamState.startedAt || "live"}`;
  }

  function sendRoomLocationDisabled() {
    const sent = liveChat.sendEvent({
      type: "room.location.updated",
      location: { enabled: false },
    });
    if (!sent) {
      log("room location disable skipped: chat channel unavailable");
    }
    return sent;
  }

  async function uploadCurrentRoomLocation({ uploadKey = "" } = {}) {
    if (!locationSharingSupported) {
      return false;
    }

    const requestId = locationUploadRequestRef.current + 1;
    locationUploadRequestRef.current = requestId;
    setLocationSharingPending(true);
    try {
      const position = await getCurrentPosition();
      if (locationUploadRequestRef.current !== requestId) {
        return false;
      }

      const sent = liveChat.sendEvent({
        type: "room.location.updated",
        location: {
          enabled: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          updatedAt: new Date(position.timestamp || Date.now()).toISOString(),
        },
      });
      if (!sent) {
        log("room location update skipped: chat channel unavailable");
        return false;
      }

      if (uploadKey) {
        liveLocationUploadKeyRef.current = uploadKey;
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`room location update failed: ${message}`);
      return false;
    } finally {
      if (locationUploadRequestRef.current === requestId) {
        setLocationSharingPending(false);
      }
    }
  }

  async function changeLocationSharingEnabled(nextEnabled) {
    const enabled = Boolean(nextEnabled);
    if (!locationSharingSupported) {
      setLocationSharingEnabled(false);
      writeStoredBoolean(locationSharingStorageKey, false);
      return;
    }

    if (!enabled) {
      locationUploadRequestRef.current += 1;
      liveLocationUploadKeyRef.current = "";
      setLocationSharingPending(false);
      setLocationSharingEnabled(false);
      writeStoredBoolean(locationSharingStorageKey, false);
      sendRoomLocationDisabled();
      return;
    }

    setLocationSharingEnabled(true);
    writeStoredBoolean(locationSharingStorageKey, true);
    const uploadKey = getLiveLocationUploadKey();
    if (liveStreamActive && liveChat.streamState.isLive && uploadKey) {
      liveLocationUploadKeyRef.current = uploadKey;
      await uploadCurrentRoomLocation({ uploadKey });
    }
  }

  function rememberCohostHost(room) {
    const host = room?.host;
    const handle = String(host?.handle || "").trim();
    if (!handle) {
      return;
    }

    const nextHost = {
      handle,
      displayName: String(host?.displayName || "").trim(),
      avatarUrl: String(host?.avatarUrl || "").trim(),
    };
    setCohostRecentHosts((current) => {
      const next = [
        nextHost,
        ...current.filter((item) => item.handle !== handle)
      ].slice(0, MAX_COHOST_RECENTS);
      writeStoredCohostRecents(cohostRecentsStorageKey, next);
      return next;
    });
  }

  async function requestCohostInvite(handle) {
    const response = await fetch("/api/cohost/request", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ handle }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = createApiError(payload, "cohost_request_failed", { status: response.status });
      error.message = getCohostRequestErrorMessage(error, t);
      throw error;
    }

    rememberCohostHost(payload.room);
    return payload;
  }

  async function respondToCohostInvite(invite, accepted) {
    if (!invite?.id || !invite.requesterRoomId || !invite.targetRoomId) {
      return null;
    }

    const response = await fetch("/api/cohost/respond", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        inviteId: invite.id,
        requesterRoomId: invite.requesterRoomId,
        targetRoomId: invite.targetRoomId,
        accepted,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw createApiError(payload, "cohost_response_failed", { status: response.status });
    }

    liveChat.dismissCohostInvite(invite.id);
    if (accepted) {
      rememberCohostHost({
        host: invite.requester
      });
    }
    return payload;
  }

  async function respondToAudienceCallRequest(request, accepted) {
    const requestId = String(request?.id || "").trim();
    if (!requestId) {
      return false;
    }

    let realtime = null;
    if (accepted) {
      const activeAudienceCalls = Array.isArray(liveChat.audienceCallActive)
        ? liveChat.audienceCallActive
        : [];
      if (
        activeAudienceCalls.length >= 5 &&
        !activeAudienceCalls.some((item) => item.user?.id === request.user?.id)
      ) {
        return false;
      }
      try {
        const audioTrack = liveChat.audienceCallRealtimeSession?.role === "host"
          ? null
          : await publisherControllerRef.current?.createAudienceCallHostAudioTrack?.();
        const hostRealtime = await liveChat.startAudienceCallHostSession({ audioTrack });
        const hostSession = hostRealtime.session;
        realtime = {
          hostSessionId: hostSession.sessionId,
          hostTrackPullToken: hostSession.trackPullToken,
          hostTrackName: hostRealtime.trackName,
          expiresAt: hostSession.expiresAt,
        };
      } catch (error) {
        log(`audience call host realtime failed: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    }

    return liveChat.respondAudienceCallRequest(requestId, accepted, realtime);
  }

  async function inviteAudienceCallViewer(viewer) {
    const userId = String(viewer?.id || "").trim();
    if (!userId) {
      return false;
    }
    const activeAudienceCalls = Array.isArray(liveChat.audienceCallActive)
      ? liveChat.audienceCallActive
      : [];
    if (
      activeAudienceCalls.length >= 5 &&
      !activeAudienceCalls.some((item) => item.user?.id === userId)
    ) {
      return false;
    }

    try {
      const audioTrack = liveChat.audienceCallRealtimeSession?.role === "host"
        ? null
        : await publisherControllerRef.current?.createAudienceCallHostAudioTrack?.();
      const hostRealtime = await liveChat.startAudienceCallHostSession({ audioTrack });
      const hostSession = hostRealtime.session;
      return liveChat.inviteAudienceCallViewer(userId, {
        hostSessionId: hostSession.sessionId,
        hostTrackPullToken: hostSession.trackPullToken,
        hostTrackName: hostRealtime.trackName,
        expiresAt: hostSession.expiresAt,
      });
    } catch (error) {
      log(`audience call host realtime failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  function setAudienceCallUserMuted(userId, muted) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      return;
    }
    setAudienceCallMutedUserIds((current) => {
      const next = new Set(current);
      if (muted) {
        next.add(normalizedUserId);
      } else {
        next.delete(normalizedUserId);
      }
      return next;
    });
    liveChat.setAudienceCallRemotePlaybackMuted(normalizedUserId, Boolean(muted));
    publisher.setAudienceCallRemoteMuted(normalizedUserId, Boolean(muted));
  }

  function removeAudienceCallUser(userId) {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      return false;
    }
    setAudienceCallUserMuted(normalizedUserId, false);
    return liveChat.removeAudienceCallActive(normalizedUserId);
  }

  async function closeLivePage() {
    await publisher.cleanupLiveResources();
    if (liveChat.canControlBroadcast) {
      liveChat.sendEvent({ type: "stream.stopped" });
    }
    liveChat.releaseBroadcastControl();
    onReturnHome?.();
  }

  return (
    <LivePage
      view={{ hidden }}
      room={{
        details: liveRoomDetails,
        label: liveRoomLabel,
        avatarUrl: liveRoomAvatarUrl,
        infoBlockedReason: publishControlBlockedReason,
        siteIconUrl,
        siteTitle,
      }}
      share={{
        target: liveShareTarget,
        watchLink: liveWatchLink,
      }}
      publish={{
        blocked: publishBlocked,
        blockedReason: publishBlockedReason,
        badge: publishBadge,
        isPublishing: publisher.publisherIsPublishing,
        isStarting: publisher.publisherIsStarting,
      }}
      media={{
        cameraOptions: publisher.cameraOptions,
        microphoneOptions: publisher.microphoneOptions,
        publishQualityOptions: publisher.publishQualityOptions,
        publishProtocolOptions: publisher.publishProtocolOptions,
        selectedCameraId: publisher.selectedCameraId,
        selectedMicrophoneId: publisher.selectedMicrophoneId,
        publishQualityId: publisher.publishQualityId,
        publishProtocol: publisher.publishProtocol,
        relayUrl,
        webRtcPublishUrl: publisher.webRtcPublishUrl,
        webRtcPlaybackUrl: publisher.webRtcPlaybackUrl,
        mediaMode: liveMode,
        cameraEnabled: publisher.cameraEnabled,
        microphoneEnabled: publisher.microphoneEnabled,
        cameraMode,
        previewActive: publisher.previewActive,
        previewHasVideo: publisher.previewHasVideo,
        previewPending: publisher.previewPending,
        previewSourceType: publisher.previewSourceType,
        screenShareSupported: publisher.screenShareSupported,
        screenShareActive: publisher.screenShareActive,
        previewVideoRef: publisher.previewVideoRef,
      }}
      settings={{
        commentSpeechEnabled: commentSpeechEnabled && commentSpeechSupported,
        commentSpeechSupported,
        liveNotificationEnabled,
        locationSharingEnabled: locationSharingEnabled && locationSharingSupported,
        locationSharingSupported,
        locationSharingPending,
      }}
      cohost={{
        invitesAllowed: liveChat.cohostInvitesAllowed,
        invite: liveChat.cohostInvite,
        inviteResponse: liveChat.cohostInviteResponse,
        active: cohostActive,
        players: cohostPlayers.map(({ active, player: cohostPlayer }) => ({
          active,
          playerSession: cohostPlayer.playerSession,
          playerMuted: cohostPlayer.playerMuted,
          playerRef: cohostPlayer.playerRef,
          playerStatus: cohostPlayer.playerStatus,
          playerStatusKind: cohostPlayer.playerStatusKind,
          playerMediaSize: cohostPlayer.playerMediaSize,
          playerOrientation: cohostPlayer.playerOrientation,
        })),
        recentHosts: cohostRecentHosts,
      }}
      audienceCall={{
        enabled: liveChat.audienceCallEnabled,
        requests: liveChat.audienceCallRequests,
        invites: liveChat.audienceCallInvites,
        active: liveChat.audienceCallActive,
        mutedUserIds: Array.from(audienceCallMutedUserIds),
        speakingUserIds: publisher.audienceCallSpeakingUserIds,
      }}
      chat={{
        messages: liveChat.messages,
        draft: liveChat.draft,
        connectionState: liveChatEnabled ? liveChat.connectionState : "closed",
        onlineCount: liveChat.onlineCount,
        loggedInViewers: liveChat.loggedInViewers,
        readOnly: liveChat.readOnly,
        error: liveChatEnabled ? liveChat.chatError : "",
        recovering: liveChatEnabled ? liveChat.recoveringFromPageLifecycle : false,
        canRetractMessages: liveChatEnabled && liveChat.canControlBroadcast,
        mutedUsers: liveChatEnabled && liveChat.canControlBroadcast ? liveChat.mutedUsers : [],
        moderationEvent: liveChat.chatModerationEvent,
      }}
      auth={{
        available: authState.available,
        loading: authState.loading,
        user: authState.user,
      }}
      actions={{
        onCameraChange: (event) => {
          void changeCameraDevice(event.currentTarget.value);
        },
        onMicrophoneChange: (event) => {
          publisher.setSelectedMicrophoneId(event.currentTarget.value);
          publisher.setMicrophoneEnabled(true);
        },
        onPublishQualityChange: (qualityId) => {
          void changePublishQuality(qualityId).catch((error) => {
            const message = getAppErrorMessage(error);
            log(`publish quality switch failed: ${message}`);
          });
        },
        onPublishProtocolChange: (protocol) => {
          void changePublishProtocol(protocol).catch((error) => {
            const message = getAppErrorMessage(error);
            log(`publish protocol switch failed: ${message}`);
          });
        },
        onRelayUrlChange: changeRelayUrl,
        onWebRtcPublishUrlChange: changeWebRtcPublishUrl,
        onWebRtcPlaybackUrlChange: changeWebRtcPlaybackUrl,
        onCycleCamera: cycleCameraMode,
        onToggleCamera: toggleCameraEnabled,
        onToggleMicrophone: () => {
          publisher.setMicrophoneEnabled(!publisher.microphoneEnabled);
        },
        onTogglePublish: () => {
          if (publisher.publisherIsPublishing || publisher.publisherIsStarting) {
            void publisher.stopCameraPublish();
            return;
          }
          void publisher.startCameraPublish().catch((error) => {
            const message = getAppErrorMessage(error);
            log(`camera publish failed: ${message}`);
          });
        },
        onShare: () => {
          void shareLiveRoom().catch((error) => {
            log(`share failed: ${getAppErrorMessage(error)}`);
          });
        },
        onRequestClose: () => {
          void closeLivePage().catch((error) => {
            log(`live close cleanup failed: ${getAppErrorMessage(error)}`);
            liveChat.releaseBroadcastControl();
            onReturnHome?.();
          });
        },
        onSelectLiveMode: selectLiveMode,
        onStartScreenShare: () => {
          void publisher.startScreenShare().catch((error) => {
            const message = getAppErrorMessage(error);
            log(`screen share failed: ${message}`);
          });
        },
        onStopScreenShare: () => {
          void publisher.stopScreenShare().catch((error) => {
            const message = getAppErrorMessage(error);
            log(`screen share stop failed: ${message}`);
          });
        },
        onCommentSpeechEnabledChange: changeCommentSpeechEnabled,
        onLiveNotificationEnabledChange: changeLiveNotificationEnabled,
        onLocationSharingEnabledChange: (nextEnabled) => {
          void changeLocationSharingEnabled(nextEnabled);
        },
        onCohostInvitesAllowedChange: (nextAllowed) => {
          liveChat.setCohostInviteAllowed(nextAllowed);
        },
        onCohostDisconnect: () => {
          liveChat.clearCohostActive();
        },
        onCohostInviteRequest: requestCohostInvite,
        onCohostInviteRespond: (invite, accepted) => respondToCohostInvite(invite, accepted),
        onAudienceCallEnabledChange: (nextEnabled) => {
          liveChat.setAudienceCallEnabled(nextEnabled);
        },
        onAudienceCallRequestRespond: (request, accepted) => respondToAudienceCallRequest(request, accepted),
        onAudienceCallInviteViewer: inviteAudienceCallViewer,
        onAudienceCallUserMuteChange: setAudienceCallUserMuted,
        onAudienceCallUserDisconnect: removeAudienceCallUser,
        onChatDraftChange: (event) => {
          liveChat.setDraft(event.currentTarget.value);
        },
        onChatSend: () => {
          liveChat.sendMessage();
        },
        onChatMessageMute: (messageId, options) => {
          liveChat.muteMessage(messageId, options);
        },
        onChatMessageRetract: (messageId) => {
          liveChat.retractMessage(messageId);
        },
        onChatUserUnmute: (userId) => {
          liveChat.unmuteUser(userId);
        },
        onChatRequireLogin: onRequireLogin,
        onRoomDetailsChange: setLiveRoomDetails,
      }}
    />
  );
}
