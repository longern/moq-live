import { useEffect, useRef, useState } from "react";
import { LivePage } from "./LivePage.jsx";
import { useChatController } from "../hooks/useChatController.js";
import { usePublisherController } from "../hooks/usePublisherController.js";
import { buildWatchLink, generateRoomId } from "../lib/routeState.js";
import { describePublishState } from "../lib/status.js";
import { getPublishBlockReason, isPublishBlocked } from "../lib/roomPolicy.js";

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

function LiveActivationGate({
  title,
  message,
  error,
  busy,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}) {
  return (
    <div className="live-activation-panel">
      <div className="live-activation-copy">
        <span>直播功能</span>
        <h2>{title}</h2>
        <p>{message}</p>
        {error ? <p className="live-activation-error">{error}</p> : null}
      </div>
      <div className="live-activation-actions">
        {primaryLabel ? (
          <button type="button" className="primary" onClick={onPrimary} disabled={busy}>
            {busy ? "处理中" : primaryLabel}
          </button>
        ) : null}
        {secondaryLabel ? (
          <button type="button" className="live-activation-secondary" onClick={onSecondary} disabled={busy}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LiveActivationBlank() {
  return (
    <span className="live-circular-progress" role="progressbar" aria-label="正在检查直播功能" />
  );
}

function getDefaultLiveChatRoomResolution() {
  return {
    loading: false,
    error: "",
    roomId: "",
  };
}

function getDefaultLiveActivation() {
  return {
    checked: false,
    missing: false,
    loading: false,
    creating: false,
    error: "",
  };
}

function useLiveRoomActivation({ page, userId, log }) {
  const [liveChatRoomResolution, setLiveChatRoomResolution] = useState(
    getDefaultLiveChatRoomResolution,
  );
  const [liveRoomDetails, setLiveRoomDetails] = useState(null);
  const [liveActivation, setLiveActivation] = useState(getDefaultLiveActivation);
  const [liveRoomRefreshKey, setLiveRoomRefreshKey] = useState(0);
  const lastUserIdRef = useRef("");
  const logRef = useRef(log);

  logRef.current = log;

  useEffect(() => {
    if (lastUserIdRef.current === userId) {
      return;
    }

    lastUserIdRef.current = userId || "";
    setLiveChatRoomResolution(getDefaultLiveChatRoomResolution());
    setLiveRoomDetails(null);
    setLiveActivation(getDefaultLiveActivation());
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLiveChatRoomResolution(getDefaultLiveChatRoomResolution());
      setLiveRoomDetails(null);
      setLiveActivation(getDefaultLiveActivation());
      return;
    }

    if (page !== "live") {
      return;
    }

    if (liveActivation.checked) {
      return;
    }

    let cancelled = false;

    async function resolveLiveChatRoom() {
      setLiveChatRoomResolution({
        loading: true,
        error: "",
        roomId: "",
      });
      setLiveActivation((current) => ({
        ...current,
        checked: false,
        missing: false,
        loading: true,
        error: "",
      }));

      try {
        const response = await fetch("/api/me/room", {
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (response.status === 404 && payload.code === "room_not_found") {
            if (cancelled) {
              return;
            }

            setLiveChatRoomResolution({
              loading: false,
              error: "",
              roomId: "",
            });
            setLiveRoomDetails(null);
            setLiveActivation({
              checked: true,
              missing: true,
              loading: false,
              creating: false,
              error: "",
            });
            return;
          }
          throw new Error(payload.error || `my room endpoint returned ${response.status}`);
        }

        if (cancelled) {
          return;
        }

        setLiveChatRoomResolution({
          loading: false,
          error: "",
          roomId: payload.room?.id || "",
        });
        setLiveRoomDetails(payload.room || null);
        setLiveActivation({
          checked: true,
          missing: false,
          loading: false,
          creating: false,
          error: "",
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setLiveChatRoomResolution({
          loading: false,
          error: message,
          roomId: "",
        });
        setLiveRoomDetails(null);
        setLiveActivation({
          checked: true,
          missing: false,
          loading: false,
          creating: false,
          error: message,
        });
        logRef.current?.(`live room resolve failed: ${message}`);
      }
    }

    void resolveLiveChatRoom();

    return () => {
      cancelled = true;
    };
  }, [userId, liveActivation.checked, liveRoomRefreshKey, page]);

  async function activateLiveRoom() {
    setLiveActivation((current) => ({
      ...current,
      creating: true,
      error: "",
    }));

    try {
      const response = await fetch("/api/me/room", {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || `room creation returned ${response.status}`);
      }

      setLiveChatRoomResolution({
        loading: false,
        error: "",
        roomId: payload.room?.id || "",
      });
      setLiveRoomDetails(payload.room || null);
      setLiveActivation({
        checked: true,
        missing: false,
        loading: false,
        creating: false,
        error: "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLiveActivation((current) => ({
        ...current,
        creating: false,
        error: message,
      }));
      logRef.current?.(`live room activation failed: ${message}`);
    }
  }

  function retryLiveRoomActivation() {
    setLiveActivation(getDefaultLiveActivation());
    setLiveRoomRefreshKey((current) => current + 1);
  }

  return {
    liveActivation,
    liveChatRoomId: userId ? liveChatRoomResolution.roomId : "",
    liveRoomDetails,
    setLiveRoomDetails,
    activateLiveRoom,
    retryLiveRoomActivation,
  };
}

function useLiveRoomChatSync({
  liveRoom,
  liveChat,
  liveStreamActive,
  relayUrl,
  user,
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
        ? { startedAt: new Date().toISOString() }
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
  ]);

  useEffect(() => {
    if (!liveRoom || liveChat.connectionState !== "connected" || !liveChat.roomStateReady) {
      return;
    }

    const nextStream = {
      relayUrl,
      namespace: liveRoom,
    };
    const nextHost = {
      id: user?.id || "",
      displayName: user?.displayName || user?.email || "",
      avatarUrl: user?.avatarUrl || "",
    };
    if (
      liveChat.roomMeta.stream.relayUrl === nextStream.relayUrl
      && liveChat.roomMeta.stream.namespace === nextStream.namespace
      && liveChat.roomMeta.host.id === nextHost.id
      && liveChat.roomMeta.host.displayName === nextHost.displayName
      && liveChat.roomMeta.host.avatarUrl === nextHost.avatarUrl
    ) {
      return;
    }

    sendChatEventRef.current?.({
      type: "room.updated",
      roomMeta: {
        stream: nextStream,
        host: nextHost,
      },
    });
  }, [
    liveChat.connectionState,
    liveChat.roomStateReady,
    liveChat.roomMeta.stream.namespace,
    liveChat.roomMeta.stream.relayUrl,
    liveChat.roomMeta.host.avatarUrl,
    liveChat.roomMeta.host.displayName,
    liveChat.roomMeta.host.id,
    relayUrl,
    liveRoom,
    user?.avatarUrl,
    user?.displayName,
    user?.email,
    user?.id,
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
  setLiveRoomValue,
  selectPageWithGuard,
  authState,
  log,
  onRequireLogin,
  onReturnHome,
  syntheticSessionRef,
}) {
  const {
    liveActivation,
    liveChatRoomId,
    liveRoomDetails,
    setLiveRoomDetails,
    activateLiveRoom,
    retryLiveRoomActivation,
  } = useLiveRoomActivation({
    page,
    userId: authState.user?.id || "",
    log,
  });
  const liveGateActive = page === "live" && (
    authState.loading
    || (Boolean(authState.user?.id) && (
      liveActivation.loading
      || !liveActivation.checked
      || liveActivation.missing
      || Boolean(liveActivation.error)
    ))
  );
  const publisherPage = liveGateActive ? "watch" : page;

  const publisher = usePublisherController({
    page: publisherPage,
    pageRef,
    relayUrlRef,
    roomRef: liveRoomRef,
    generateRoomId: () => setLiveRoomValue(generateRoomId()),
    syntheticSessionRef,
    log,
  });

  const liveChatEnabled = Boolean(authState.user?.id) && page === "live" && !liveGateActive;
  const liveChat = useChatController({
    room: liveChatRoomId,
    enabled: liveChatEnabled && Boolean(liveChatRoomId),
    authKey: authState.user?.id ?? "anonymous",
    role: "broadcaster",
    log,
  });

  const liveRoomLabel = liveChat.roomMeta.host.displayName
    || authState.user?.displayName
    || authState.user?.email
    || liveRoom
    || "等待生成频道号";
  const liveRoomAvatarUrl = liveChat.roomMeta.host.avatarUrl
    || authState.user?.avatarUrl
    || "";
  const liveShareTarget = authState.user?.handle?.trim() || (liveRoom ? `ns:${liveRoom}` : "");
  const liveWatchLink = buildWatchLink(relayUrl, liveShareTarget);
  const publishBadge = describePublishState(publisher.publishStatusKind);
  const liveStreamActive = publisher.publisherIsPublishing || publisher.syntheticPublishing;
  const publishBlocked = isPublishBlocked(liveRoom);
  const publishBlockedReason = getPublishBlockReason(liveRoom);
  const cameraMode = getCameraMode(
    publisher.cameraOptions,
    publisher.selectedCameraId,
    publisher.cameraEnabled,
  );

  useLiveRoomChatSync({
    liveRoom,
    liveChat,
    liveStreamActive,
    relayUrl,
    user: authState.user,
  });

  function returnToWatch() {
    selectPageWithGuard("watch", { updateAutorun: false });
  }

  async function shareLiveRoom() {
    if (!liveWatchLink) {
      return;
    }

    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      throw new Error("当前浏览器不支持系统分享");
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

  let activationContent = null;

  if (page === "live" && authState.loading) {
    activationContent = <LiveActivationBlank />;
  }

  if (!activationContent && page === "live" && authState.user?.id) {
    if (liveActivation.loading || !liveActivation.checked) {
      activationContent = <LiveActivationBlank />;
    } else if (liveActivation.missing) {
      activationContent = (
        <LiveActivationGate
          title="开通直播功能"
          message="开通后会为你的账号创建直播间，并用于主播分享、封面和聊天室管理。"
          error={liveActivation.error}
          busy={liveActivation.creating}
          primaryLabel="开通"
          secondaryLabel="暂不开通"
          onPrimary={() => {
            void activateLiveRoom();
          }}
          onSecondary={returnToWatch}
        />
      );
    } else if (liveActivation.error) {
      activationContent = (
        <LiveActivationGate
          title="暂时无法检查直播功能"
          message="请重试，或先返回收看页。"
          error={liveActivation.error}
          busy={liveActivation.creating}
          primaryLabel="重试"
          secondaryLabel="返回收看"
          onPrimary={retryLiveRoomActivation}
          onSecondary={returnToWatch}
        />
      );
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
        const message = error instanceof Error ? error.message : String(error);
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

  return (
    <LivePage
      hidden={hidden}
      activationContent={activationContent}
      room={liveRoom}
      roomDetails={liveRoomDetails}
      roomLabel={liveRoomLabel}
      roomAvatarUrl={liveRoomAvatarUrl}
      shareTarget={liveShareTarget}
      watchLink={liveWatchLink}
      publishBlocked={publishBlocked}
      publishBlockedReason={publishBlockedReason}
      publishStatus={publisher.publishStatus}
      publishBadge={publishBadge}
      cameraOptions={publisher.cameraOptions}
      microphoneOptions={publisher.microphoneOptions}
      selectedCameraId={publisher.selectedCameraId}
      selectedMicrophoneId={publisher.selectedMicrophoneId}
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
          const message = error instanceof Error ? error.message : String(error);
          log(`camera publish failed: ${message}`);
        });
      }}
      onStartPublish={() => {
        void publisher.startCameraPublish().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          log(`camera publish failed: ${message}`);
        });
      }}
      onStopPublish={() => {
        void publisher.stopCameraPublish();
      }}
      onShare={() => {
        void shareLiveRoom().catch((error) => {
          log(`share failed: ${error instanceof Error ? error.message : String(error)}`);
        });
      }}
      onStartSynthetic={() => {
        selectPageWithGuard("live");
        void publisher.startSyntheticPublish().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          log(`synthetic publish failed: ${message}`);
        });
      }}
      onStopSynthetic={() => {
        selectPageWithGuard("live");
        void publisher.stopSyntheticPublish();
      }}
      onRequestClose={() => {
        onReturnHome?.();
      }}
      onSelectLiveMode={selectLiveMode}
      screenShareSupported={publisher.screenShareSupported}
      screenShareActive={publisher.screenShareActive}
      previewSourceType={publisher.previewSourceType}
      onStartScreenShare={() => {
        void publisher.startScreenShare().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          log(`screen share failed: ${message}`);
        });
      }}
      onStopScreenShare={() => {
        void publisher.stopScreenShare().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
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
