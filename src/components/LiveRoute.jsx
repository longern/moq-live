import { useEffect, useRef } from "react";
import { LivePage } from "./LivePage.jsx";
import { useChatController } from "../hooks/useChatController.js";
import { usePublisherController } from "../hooks/usePublisherController.js";
import { buildWatchLink, generateRoomId } from "../lib/routeState.js";
import { describePublishState } from "../lib/status.js";
import { getPublishBlockReason, isPublishBlocked } from "../lib/roomPolicy.js";
import { createAppError, getAppErrorMessage } from "../lib/appErrors.js";
import { normalizeStreamProtocol } from "../lib/streamProtocol.js";

const STREAM_SETTINGS_STORAGE_PREFIX = "moq-live:stream-settings";

function getStreamSettingsStorageKey(userId) {
  if (userId) {
    return `${STREAM_SETTINGS_STORAGE_PREFIX}:user:${userId}`;
  }
  return `${STREAM_SETTINGS_STORAGE_PREFIX}:local`;
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
      publishUrl: typeof parsed?.publishUrl === "string" ? parsed.publishUrl : "",
      playbackUrl: typeof parsed?.playbackUrl === "string" ? parsed.playbackUrl : "",
    };
  } catch {
    return null;
  }
}

function writeStoredStreamSettings(
  storageKey,
  { protocol = "", qualityId = "", publishUrl = "", playbackUrl = "" },
) {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  try {
    const nextProtocol = protocol ? normalizeStreamProtocol(protocol) : "";
    const nextQualityId = String(qualityId);
    const nextPublishUrl = String(publishUrl);
    const nextPlaybackUrl = String(playbackUrl);
    if (!nextProtocol && !nextQualityId && !nextPublishUrl && !nextPlaybackUrl) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify({
      protocol: nextProtocol,
      qualityId: nextQualityId,
      publishUrl: nextPublishUrl,
      playbackUrl: nextPlaybackUrl,
    }));
  } catch {
    // Ignore storage failures; the URLs remain usable for the current session.
  }
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
  liveRoom,
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
    if (!liveRoom) {
      announcedLiveStateRef.current = { room: "", isLive: null };
      return;
    }

    if (liveChat.connectionState !== "connected" || !liveChat.roomStateReady) {
      return;
    }

    if (liveChat.streamState.isLive === liveStreamActive) {
      announcedLiveStateRef.current = {
        room: liveRoom,
        isLive: liveStreamActive,
      };
      return;
    }

    const current = announcedLiveStateRef.current;
    if (current.room === liveRoom && current.isLive === liveStreamActive) {
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
        room: liveRoom,
        isLive: liveStreamActive,
      };
    }
  }, [
    liveChat.connectionState,
    liveChat.roomStateReady,
    liveChat.streamState.isLive,
    liveRoom,
    liveStreamActive,
    publishProtocol,
  ]);

  useEffect(() => {
    if (!liveRoom || liveChat.connectionState !== "connected" || !liveChat.roomStateReady) {
      return;
    }
    if (!canControlBroadcast) {
      return;
    }

    const nextStream = {
      relayUrl,
      namespace: liveRoom,
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
    liveRoom,
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
  selectPageWithGuard,
  authState,
  log,
  onRequireLogin,
  onReturnHome,
  syntheticSessionRef,
  onRouteReady,
}) {
  useEffect(() => {
    onRouteReady?.();
  }, [onRouteReady]);

  const liveChatEnabled = Boolean(authState.user?.id) && page === "live";
  const liveChat = useChatController({
    room: liveChatRoomId,
    enabled: liveChatEnabled && Boolean(liveChatRoomId),
    authKey: authState.user?.id ?? "anonymous",
    role: "broadcaster",
    log,
  });
  const webRtcPublishUrlRef = useRef("");
  const webRtcPlaybackUrlRef = useRef("");
  const appliedWebRtcDefaultsRef = useRef({ publishUrl: "", playbackUrl: "" });

  const publisher = usePublisherController({
    page,
    pageRef,
    relayUrlRef,
    roomRef: liveRoomRef,
    webRtcPublishUrlRef,
    webRtcPlaybackUrlRef,
    generateRoomId: () => setLiveRoomValue(generateRoomId()),
    assertCanPublish: async () => {
      const canControlBroadcast = await liveChat.requestBroadcastControl();
      if (!canControlBroadcast) {
        throw createAppError("broadcast_control_read_only");
      }
    },
    syntheticSessionRef,
    log,
  });
  const streamSettingsStorageKey = getStreamSettingsStorageKey(authState.user?.id);

  useEffect(() => {
    const nextPublishUrl = liveRoomDetails?.webRtcPublishUrl || "";
    const nextPlaybackUrl = liveRoomDetails?.webRtcPlaybackUrl || liveRoomDetails?.webRtcUrl || "";
    if (
      nextPublishUrl &&
      nextPublishUrl !== appliedWebRtcDefaultsRef.current.publishUrl &&
      !publisher.webRtcPublishUrl
    ) {
      appliedWebRtcDefaultsRef.current.publishUrl = nextPublishUrl;
      publisher.setWebRtcPublishUrl(nextPublishUrl);
    }
    if (
      nextPlaybackUrl &&
      nextPlaybackUrl !== appliedWebRtcDefaultsRef.current.playbackUrl &&
      !publisher.webRtcPlaybackUrl
    ) {
      appliedWebRtcDefaultsRef.current.playbackUrl = nextPlaybackUrl;
      publisher.setWebRtcPlaybackUrl(nextPlaybackUrl);
    }
  }, [
    liveRoomDetails?.webRtcPlaybackUrl,
    liveRoomDetails?.webRtcPublishUrl,
    liveRoomDetails?.webRtcUrl,
    publisher.webRtcPlaybackUrl,
    publisher.webRtcPublishUrl,
  ]);

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
    if (storedSettings.publishUrl && storedSettings.publishUrl !== publisher.webRtcPublishUrl) {
      publisher.setWebRtcPublishUrl(storedSettings.publishUrl);
    }
    if (storedSettings.playbackUrl && storedSettings.playbackUrl !== publisher.webRtcPlaybackUrl) {
      publisher.setWebRtcPlaybackUrl(storedSettings.playbackUrl);
    }
  }, [
    log,
    publisher.publishQualityId,
    publisher.publishProtocol,
    publisher.webRtcPlaybackUrl,
    publisher.webRtcPublishUrl,
    streamSettingsStorageKey,
  ]);

  const liveRoomLabel = authState.user?.displayName
    || authState.user?.email
    || liveRoom
    || "等待生成频道号";
  const liveRoomAvatarUrl = authState.user?.avatarUrl || "";
  const liveShareTarget = authState.user?.handle?.trim() || (liveRoom ? `ns:${liveRoom}` : "");
  const liveWatchLink = buildWatchLink(relayUrl, liveShareTarget);
  const publishBadge = describePublishState(publisher.publishStatusKind);
  const liveStreamActive = publisher.publisherIsPublishing || publisher.syntheticPublishing;
  const publishProtocol = normalizeStreamProtocol(publisher.publishProtocol);
  const webRtcPublishUrl = publisher.webRtcPublishUrl || "";
  const webRtcPlaybackUrl = publisher.webRtcPlaybackUrl || "";
  webRtcPublishUrlRef.current = webRtcPublishUrl.trim();
  webRtcPlaybackUrlRef.current = webRtcPlaybackUrl.trim();
  const webRtcUrl = webRtcPlaybackUrl.trim();
  const publishPolicyBlocked = isPublishBlocked(liveRoom);
  const publishControlBlocked =
    liveChatEnabled &&
    liveChat.connectionState === "connected" &&
    liveChat.roomStateReady &&
    !liveChat.canControlBroadcast;
  const publishBlocked = publishPolicyBlocked || publishControlBlocked;
  const publishBlockedReason = publishPolicyBlocked
    ? getPublishBlockReason(liveRoom)
    : "";
  const cameraMode = getCameraMode(
    publisher.cameraOptions,
    publisher.selectedCameraId,
    publisher.cameraEnabled,
  );

  useLiveRoomChatSync({
    liveRoom,
    liveRoomDetails,
    liveChat,
    liveStreamActive,
    canControlBroadcast: liveChat.canControlBroadcast,
    relayUrl,
    publishProtocol,
    webRtcUrl,
  });

  async function shareLiveRoom() {
    if (!liveWatchLink) {
      return;
    }

    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      throw createAppError("share_not_supported");
    }

    try {
      await navigator.share({
        title: `${liveRoomLabel}的直播间`,
        text: `${liveRoomLabel}正在直播`,
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

  async function changeCamera(cameraId) {
    if (publisher.publisherIsPublishing) {
      try {
        const switched = await publisher.switchPublishCamera(cameraId);
        if (switched) {
          publisher.setSelectedCameraId(cameraId);
          publisher.setCameraEnabled(true);
        }
      } catch (error) {
        const message = getAppErrorMessage(error);
        log(`camera switch failed: ${message}`);
      }
      return;
    }

    publisher.setSelectedCameraId(cameraId);
    publisher.setCameraEnabled(true);
  }

  function enableVideoMode() {
    const { front, rear } = splitCameraOptions(publisher.cameraOptions);
    const nextCamera = publisher.selectedCameraId
      ? publisher.cameraOptions.find((option) => option.value === publisher.selectedCameraId)
      : front ?? rear;

    if (!publisher.cameraEnabled && nextCamera) {
      void changeCamera(nextCamera.value);
      return;
    }

    publisher.setCameraEnabled(true);
  }

  function selectLiveMode(mode) {
    if (mode === "voice") {
      publisher.setCameraEnabled(false);
      return;
    }

    enableVideoMode();
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
      void changeCamera(rear.value);
      return;
    }

    if (publisher.publisherIsPublishing && currentMode === "rear" && front) {
      void changeCamera(front.value);
      return;
    }

    if (currentMode === "rear" && front) {
      void changeCamera(front.value);
    }
  }

  function changeWebRtcPublishUrl(nextUrl) {
    publisher.setWebRtcPublishUrl(nextUrl);
    writeStoredStreamSettings(streamSettingsStorageKey, {
      protocol: publisher.publishProtocol,
      qualityId: publisher.publishQualityId,
      publishUrl: nextUrl,
      playbackUrl: publisher.webRtcPlaybackUrl,
    });
  }

  function changeWebRtcPlaybackUrl(nextUrl) {
    publisher.setWebRtcPlaybackUrl(nextUrl);
    writeStoredStreamSettings(streamSettingsStorageKey, {
      protocol: publisher.publishProtocol,
      qualityId: publisher.publishQualityId,
      publishUrl: publisher.webRtcPublishUrl,
      playbackUrl: nextUrl,
    });
  }

  async function changePublishQuality(qualityId) {
    writeStoredStreamSettings(streamSettingsStorageKey, {
      protocol: publisher.publishProtocol,
      qualityId,
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
      publishUrl: publisher.webRtcPublishUrl,
      playbackUrl: publisher.webRtcPlaybackUrl,
    });
    await publisher.setPublishProtocol(nextProtocol);
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
      hidden={hidden}
      room={liveRoom}
      roomDetails={liveRoomDetails}
      roomLabel={liveRoomLabel}
      roomAvatarUrl={liveRoomAvatarUrl}
      shareTarget={liveShareTarget}
      watchLink={liveWatchLink}
      publishBlocked={publishBlocked}
      publishBlockedReason={publishBlockedReason}
      roomInfoBlockedReason={
        publishControlBlocked
          ? getAppErrorMessage({ code: "broadcast_control_read_only" })
          : ""
      }
      publishStatus={publisher.publishStatus}
      publishBadge={publishBadge}
      cameraOptions={publisher.cameraOptions}
      microphoneOptions={publisher.microphoneOptions}
      publishQualityOptions={publisher.publishQualityOptions}
      publishProtocolOptions={publisher.publishProtocolOptions}
      selectedCameraId={publisher.selectedCameraId}
      selectedMicrophoneId={publisher.selectedMicrophoneId}
      publishQualityId={publisher.publishQualityId}
      publishProtocol={publisher.publishProtocol}
      webRtcPublishUrl={publisher.webRtcPublishUrl}
      webRtcPlaybackUrl={publisher.webRtcPlaybackUrl}
      cameraEnabled={publisher.cameraEnabled}
      microphoneEnabled={publisher.microphoneEnabled}
      cameraMode={cameraMode}
      isPublishing={publisher.publisherIsPublishing}
      isStarting={publisher.publisherIsStarting}
      previewActive={publisher.previewActive}
      previewHasVideo={publisher.previewHasVideo}
      previewPending={publisher.previewPending}
      syntheticPublishing={publisher.syntheticPublishing}
      previewVideoRef={publisher.previewVideoRef}
      onCameraChange={(event) => {
        void changeCamera(event.currentTarget.value);
      }}
      onMicrophoneChange={(event) => {
        publisher.setSelectedMicrophoneId(event.currentTarget.value);
        publisher.setMicrophoneEnabled(true);
      }}
      onPublishQualityChange={(qualityId) => {
        void changePublishQuality(qualityId).catch((error) => {
          const message = getAppErrorMessage(error);
          log(`publish quality switch failed: ${message}`);
        });
      }}
      onPublishProtocolChange={(protocol) => {
        void changePublishProtocol(protocol).catch((error) => {
          const message = getAppErrorMessage(error);
          log(`publish protocol switch failed: ${message}`);
        });
      }}
      onWebRtcPublishUrlChange={changeWebRtcPublishUrl}
      onWebRtcPlaybackUrlChange={changeWebRtcPlaybackUrl}
      onCycleCamera={cycleCameraMode}
      onToggleMicrophone={() => {
        publisher.setMicrophoneEnabled(!publisher.microphoneEnabled);
      }}
      onTogglePublish={() => {
        if (publisher.publisherIsPublishing || publisher.publisherIsStarting) {
          void publisher.stopCameraPublish();
          return;
        }
        void publisher.startCameraPublish().catch((error) => {
          const message = getAppErrorMessage(error);
          log(`camera publish failed: ${message}`);
        });
      }}
      onStartPublish={() => {
        void publisher.startCameraPublish().catch((error) => {
          const message = getAppErrorMessage(error);
          log(`camera publish failed: ${message}`);
        });
      }}
      onStopPublish={() => {
        void publisher.stopCameraPublish();
      }}
      onShare={() => {
        void shareLiveRoom().catch((error) => {
          log(`share failed: ${getAppErrorMessage(error)}`);
        });
      }}
      onStartSynthetic={() => {
        selectPageWithGuard("live");
        void publisher.startSyntheticPublish().catch((error) => {
          const message = getAppErrorMessage(error);
          log(`synthetic publish failed: ${message}`);
        });
      }}
      onStopSynthetic={() => {
        selectPageWithGuard("live");
        void publisher.stopSyntheticPublish();
      }}
      onRequestClose={() => {
        void closeLivePage().catch((error) => {
          log(`live close cleanup failed: ${getAppErrorMessage(error)}`);
          liveChat.releaseBroadcastControl();
          onReturnHome?.();
        });
      }}
      onSelectLiveMode={selectLiveMode}
      screenShareSupported={publisher.screenShareSupported}
      screenShareActive={publisher.screenShareActive}
      previewSourceType={publisher.previewSourceType}
      onStartScreenShare={() => {
        void publisher.startScreenShare().catch((error) => {
          const message = getAppErrorMessage(error);
          log(`screen share failed: ${message}`);
        });
      }}
      onStopScreenShare={() => {
        void publisher.stopScreenShare().catch((error) => {
          const message = getAppErrorMessage(error);
          log(`screen share stop failed: ${message}`);
        });
      }}
      chatMessages={liveChat.messages}
      chatDraft={liveChat.draft}
      chatConnectionState={liveChatEnabled ? liveChat.connectionState : "closed"}
      chatOnlineCount={liveChat.onlineCount}
      chatLoggedInViewers={liveChat.loggedInViewers}
      chatReadOnly={liveChat.readOnly}
      chatError={liveChatEnabled ? liveChat.chatError : ""}
      authAvailable={authState.available}
      authLoading={authState.loading}
      authUser={authState.user}
      onChatDraftChange={(event) => {
        liveChat.setDraft(event.currentTarget.value);
      }}
      onChatSend={() => {
        liveChat.sendMessage();
      }}
      onChatRequireLogin={onRequireLogin}
      onRoomDetailsChange={setLiveRoomDetails}
    />
  );
}
