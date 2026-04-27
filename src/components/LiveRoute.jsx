import { useEffect, useRef, useState } from "preact/hooks";
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
  hidden,
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
    <section class="page page-immersive live-activation-page" data-page="live" hidden={hidden}>
      <div class="live-activation-shell">
        <div class="live-activation-panel">
          <div class="live-activation-copy">
            <span>直播功能</span>
            <h2>{title}</h2>
            <p>{message}</p>
            {error ? <p class="live-activation-error">{error}</p> : null}
          </div>
          <div class="live-activation-actions">
            {primaryLabel ? (
              <button type="button" onClick={onPrimary} disabled={busy}>
                {busy ? "处理中" : primaryLabel}
              </button>
            ) : null}
            {secondaryLabel ? (
              <button type="button" class="live-activation-secondary" onClick={onSecondary} disabled={busy}>
                {secondaryLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveActivationBlank({ hidden }) {
  return (
    <section class="page page-immersive live-activation-page" data-page="live" hidden={hidden} aria-busy="true">
      <div class="live-activation-shell">
        <span class="live-circular-progress" role="progressbar" aria-label="正在检查直播功能" />
      </div>
    </section>
  );
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
  syntheticSessionRef,
}) {
  const [liveChatRoomResolution, setLiveChatRoomResolution] = useState({
    loading: false,
    error: "",
    roomId: "",
  });
  const [liveRoomDetails, setLiveRoomDetails] = useState(null);
  const [liveActivation, setLiveActivation] = useState({
    checked: false,
    missing: false,
    loading: false,
    creating: false,
    error: "",
  });
  const [liveRoomRefreshKey, setLiveRoomRefreshKey] = useState(0);
  const announcedLiveStateRef = useRef({ room: "", isLive: null });
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
  const liveChatRoomId = authState.user?.id
    ? liveChatRoomResolution.roomId
    : "";
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

  useEffect(() => {
    if (page !== "live" || !authState.user?.id) {
      setLiveChatRoomResolution({
        loading: false,
        error: "",
        roomId: "",
      });
      setLiveRoomDetails(null);
      setLiveActivation({
        checked: false,
        missing: false,
        loading: false,
        creating: false,
        error: "",
      });
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
        log(`live room resolve failed: ${message}`);
      }
    }

    void resolveLiveChatRoom();

    return () => {
      cancelled = true;
    };
  }, [authState.user?.id, liveRoomRefreshKey, page]);

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
      log(`live room activation failed: ${message}`);
    }
  }

  function returnToWatch() {
    selectPageWithGuard("watch", { updateAutorun: false });
  }

  useEffect(() => {
    if (!liveRoom) {
      announcedLiveStateRef.current = { room: "", isLive: null };
      return;
    }

    if (liveChat.connectionState !== "connected") {
      return;
    }

    const current = announcedLiveStateRef.current;
    if (current.room === liveRoom && current.isLive === liveStreamActive) {
      return;
    }

    const sent = liveChat.sendEvent({
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
  }, [liveChat, liveChat.connectionState, liveRoom, liveStreamActive]);

  useEffect(() => {
    if (!liveRoom || liveChat.connectionState !== "connected") {
      return;
    }

    const nextStream = {
      relayUrl,
      namespace: liveRoom,
    };
    const nextHost = {
      id: authState.user?.id || "",
      displayName: authState.user?.displayName || authState.user?.email || "",
      avatarUrl: authState.user?.avatarUrl || "",
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

    liveChat.sendEvent({
      type: "room.updated",
      roomMeta: {
        stream: nextStream,
        host: nextHost,
      },
    });
  }, [
    authState.user?.avatarUrl,
    authState.user?.displayName,
    authState.user?.email,
    authState.user?.id,
    liveChat,
    liveChat.connectionState,
    liveChat.roomMeta.stream.namespace,
    liveChat.roomMeta.stream.relayUrl,
    liveChat.roomMeta.host.avatarUrl,
    liveChat.roomMeta.host.displayName,
    liveChat.roomMeta.host.id,
    relayUrl,
    liveRoom,
  ]);

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

  if (page === "live" && authState.loading) {
    return <LiveActivationBlank hidden={hidden} />;
  }

  if (page === "live" && authState.user?.id) {
    if (liveActivation.loading || !liveActivation.checked) {
      return <LiveActivationBlank hidden={hidden} />;
    }

    if (liveActivation.missing) {
      return (
        <LiveActivationGate
          hidden={hidden}
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
    }

    if (liveActivation.error) {
      return (
        <LiveActivationGate
          hidden={hidden}
          title="暂时无法检查直播功能"
          message="请重试，或先返回收看页。"
          error={liveActivation.error}
          busy={liveActivation.creating}
          primaryLabel="重试"
          secondaryLabel="返回收看"
          onPrimary={() => {
            setLiveActivation({
              checked: false,
              missing: false,
              loading: false,
              creating: false,
              error: "",
            });
            setLiveRoomRefreshKey((current) => current + 1);
          }}
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

  function cycleCameraMode() {
    const { front, rear } = splitCameraOptions(publisher.cameraOptions);
    const currentMode = getCameraMode(
      publisher.cameraOptions,
      publisher.selectedCameraId,
      publisher.cameraEnabled,
    );

    if (currentMode === "off") {
      const nextCamera = front ?? rear;
      if (nextCamera) {
        void changeCamera(nextCamera.value);
      }
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

    publisher.setCameraEnabled(false);
  }

  return (
    <LivePage
      hidden={hidden}
      room={liveRoom}
      roomDetails={liveRoomDetails}
      roomLabel={liveRoomLabel}
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
      previewActive={publisher.previewActive}
      previewHasVideo={publisher.previewHasVideo}
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
        if (publisher.publisherIsPublishing) {
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
