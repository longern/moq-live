import { useEffect, useRef, useState } from "preact/hooks";
import { LoginPromptModal } from "./components/LoginPromptModal.jsx";
import { DesktopNavigation, MobileNavigation } from "./components/Navigation.jsx";
import { LivePage } from "./components/LivePage.jsx";
import { SettingsPage } from "./components/SettingsPage.jsx";
import { WatchPage } from "./components/WatchPage.jsx";
import { useAuthController } from "./hooks/useAuthController.js";
import { useChatController } from "./hooks/useChatController.js";
import { usePlayerController } from "./hooks/usePlayerController.js";
import { usePublisherController } from "./hooks/usePublisherController.js";
import { useRouteController } from "./hooks/useRouteController.js";
import { buildWatchLink, generateRoomId, getRelayHostValue } from "./lib/routeState.js";
import { clearWatchHistory, persistWatchHistoryEntry, readWatchHistory } from "./lib/watchHistory.js";
import { describePlayerState, describePublishState } from "./lib/status.js";
import { getPublishBlockReason, isPublishBlocked } from "./lib/roomPolicy.js";

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
    rear: rear[0] ?? cameraOptions.find((option) => option.value !== front[0]?.value) ?? null
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

export function App() {
  const [logText, setLogText] = useState("");
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [settingsLoginPanelRequestKey, setSettingsLoginPanelRequestKey] = useState(0);
  const [watchHistoryItems, setWatchHistoryItems] = useState(() => readWatchHistory());
  const logRef = useRef(null);
  const pendingProtectedPageRef = useRef(null);

  function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setLogText((current) => `${current}${line}\n`);
  }

  const {
    initialAutorun,
    page,
    relayUrl,
    watchRoom,
    liveRoom,
    autorunRef,
    pageRef,
    relayUrlRef,
    watchRoomRef,
    liveRoomRef,
    setWatchRoomValue,
    setLiveRoomValue,
    setRelayUrlValue,
    selectPage
  } = useRouteController();

  const {
    authState,
    startMicrosoftLogin,
    logout,
    updateDisplayName
  } = useAuthController({
    log,
    onAuthenticated: () => {
      setLoginPromptOpen(false);
    }
  });

  const publisher = usePublisherController({
    page,
    pageRef,
    relayUrlRef,
    roomRef: liveRoomRef,
    generateRoomId: () => setLiveRoomValue(generateRoomId()),
    log
  });

  const player = usePlayerController({
    initialAutorun,
    relayUrlRef,
    roomRef: watchRoomRef,
    setLogText,
    log,
    syntheticSessionRef: publisher.syntheticSessionRef
  });

  const chat = useChatController({
    room: player.playerSession?.namespace ?? "",
    enabled: page === "watch" && Boolean(player.playerSession),
    authKey: authState.user?.id ?? "anonymous",
    log
  });
  const liveChat = useChatController({
    room: liveRoom,
    enabled: page === "live" && Boolean(liveRoom),
    authKey: authState.user?.id ?? "anonymous",
    log
  });

  const watchRoomLabel = watchRoom || "等待输入房间 ID";
  const liveRoomLabel = liveRoom || "等待生成频道号";
  const watchPageLink = buildWatchLink(relayUrl, watchRoom);
  const liveWatchLink = buildWatchLink(relayUrl, liveRoom);
  const relayHost = getRelayHostValue(relayUrl);
  const playerBadge = describePlayerState(player.playerStatus);
  const publishBadge = describePublishState(publisher.publishStatus);
  const publishBlocked = isPublishBlocked(liveRoom);
  const publishBlockedReason = getPublishBlockReason(liveRoom);
  const cameraMode = getCameraMode(
    publisher.cameraOptions,
    publisher.selectedCameraId,
    publisher.cameraEnabled
  );
  const buildLabel = `Build ${__BUILD_HASH__}`;
  const mobileWatchJoinedClass = page === "watch" && Boolean(player.playerSession) ? " app-container-watch-joined" : "";
  const requireLoginForLive = import.meta.env.PROD;

  function openSettingsLogin(options) {
    pendingProtectedPageRef.current = null;
    selectPage("settings", options);
    setSettingsLoginPanelRequestKey((current) => current + 1);
  }

  function selectPageWithGuard(nextPage, options) {
    if (!requireLoginForLive || nextPage !== "live") {
      pendingProtectedPageRef.current = null;
      selectPage(nextPage, options);
      return;
    }

    if (authState.loading) {
      pendingProtectedPageRef.current = { nextPage, options };
      return;
    }

    if (!authState.user) {
      openSettingsLogin(options);
      return;
    }

    pendingProtectedPageRef.current = null;
    selectPage(nextPage, options);
  }

  async function copyWatchLink() {
    if (!liveWatchLink || liveWatchLink === "等待生成观看链接") {
      return;
    }

    await navigator.clipboard.writeText(liveWatchLink);
    log("watch link copied");
  }

  function cycleCameraMode() {
    if (publisher.publisherIsPublishing) {
      publisher.setCameraEnabled(!publisher.cameraEnabled);
      return;
    }

    const { front, rear } = splitCameraOptions(publisher.cameraOptions);
    const currentMode = getCameraMode(
      publisher.cameraOptions,
      publisher.selectedCameraId,
      publisher.cameraEnabled
    );

    if (currentMode === "off") {
      const nextCamera = front ?? rear;
      if (nextCamera) {
        publisher.setSelectedCameraId(nextCamera.value);
        publisher.setCameraEnabled(true);
      }
      return;
    }

    if (currentMode === "front" && rear) {
      publisher.setSelectedCameraId(rear.value);
      publisher.setCameraEnabled(true);
      return;
    }

    publisher.setCameraEnabled(false);
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logText]);

  useEffect(() => {
    if (!initialAutorun) {
      return;
    }

    autorunRef.current = true;
    selectPage("watch", { updateAutorun: false });
  }, []);

  useEffect(() => {
    if (!requireLoginForLive || authState.loading || !pendingProtectedPageRef.current) {
      return;
    }

    const pendingPage = pendingProtectedPageRef.current;
    pendingProtectedPageRef.current = null;
    selectPageWithGuard(pendingPage.nextPage, pendingPage.options);
  }, [authState.loading, authState.user, requireLoginForLive]);

  useEffect(() => {
    if (!requireLoginForLive || authState.loading || authState.user || page !== "live") {
      return;
    }

    openSettingsLogin({ updateAutorun: false });
  }, [authState.loading, authState.user, page, requireLoginForLive]);

  useEffect(() => {
    window.__moqTest = {
      startPlayer: async () => {
        await player.startPlayer();
      },
      stopPlayer: async () => {
        await player.stopPlayer();
      },
      startSyntheticPublish: publisher.startSyntheticPublish,
      stopSyntheticPublish: publisher.stopSyntheticPublish,
      getState: () => ({
        playerStatus: player.playerStatus,
        publishStatus: publisher.publishStatus,
        namespace: pageRef.current === "live" ? liveRoomRef.current : watchRoomRef.current,
        watchNamespace: watchRoomRef.current,
        liveNamespace: liveRoomRef.current
      }),
      getSyntheticSignatures: publisher.getSyntheticSignatures,
      compareScreenshotSignature: async (dataUrl) => player.compareSyntheticPlaybackFromDataUrl(dataUrl)
    };

    return () => {
      delete window.__moqTest;
    };
  }, [player.playerStatus, publisher.publishStatus, watchRoom, liveRoom]);

  useEffect(() => {
    const room = player.playerSession?.namespace?.trim();
    if (!room) {
      return;
    }

    setWatchHistoryItems(persistWatchHistoryEntry({
      room,
      relayUrl,
      relayHost
    }));
  }, [player.playerSession?.key, relayUrl, relayHost]);

  function openWatchHistoryItem(item) {
    autorunRef.current = true;
    setRelayUrlValue(item.relayUrl || relayUrl);
    setWatchRoomValue(item.room);
    selectPage("watch", { updateAutorun: false });
    void player.startPlayer();
  }

  return (
    <>
      <div class={`app-container${mobileWatchJoinedClass}`}>
        <header class="topbar">
          <div class="brand">
            <h1>MoQ Live Deck</h1>
          </div>

          <div class="topbar-right">
            <DesktopNavigation currentPage={page} onSelect={(nextPage) => selectPageWithGuard(nextPage)} />
            <div class="auth-toolbar">
              {authState.available ? (
                authState.user ? (
                  <>
                    <span class="auth-toolbar-user" title={authState.user.email || authState.user.displayName}>
                      {authState.user.displayName || authState.user.email || "已登录"}
                    </span>
                    <button type="button" class="secondary auth-toolbar-button" onClick={() => {
                      void logout();
                    }}
                    >
                      退出
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    class="secondary auth-toolbar-button"
                    onClick={startMicrosoftLogin}
                    disabled={authState.loading}
                  >
                    {authState.loading ? "鉴权检查中" : "登录"}
                  </button>
                )
              ) : (
                <span class="auth-toolbar-note">Auth API 未连接</span>
              )}
            </div>
          </div>
        </header>

        <main class="page-shell">
          <WatchPage
            hidden={page !== "watch"}
            roomLabel={watchRoomLabel}
            watchLink={watchPageLink}
            playerStatus={player.playerStatus}
            playerBadge={playerBadge}
            fullscreenActive={player.fullscreenActive}
            playerPaused={player.playerPaused}
            playerMuted={player.playerMuted}
            playerOrientation={player.playerOrientation}
            room={watchRoom}
            onRoomInput={(event) => {
              setWatchRoomValue(event.currentTarget.value);
            }}
            onStart={() => {
              autorunRef.current = true;
              selectPageWithGuard("watch", { updateAutorun: false });
              void player.startPlayer();
            }}
            onStop={() => {
              autorunRef.current = false;
              setWatchRoomValue("");
              selectPageWithGuard("watch", { updateAutorun: false });
              void player.stopPlayer();
            }}
            onTogglePlayback={() => {
              void player.togglePlayerPlayback().catch((error) => {
                log(`toggle playback failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            onToggleMute={() => {
              void player.togglePlayerMute().catch((error) => {
                log(`toggle mute failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            onFullscreen={() => {
              void player.fullscreenPlayer().catch((error) => {
                log(`fullscreen failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            stageRef={player.watchStageRef}
            playerSession={player.playerSession}
            playerRef={player.playerRef}
            authAvailable={authState.available}
            authLoading={authState.loading}
            authUser={authState.user}
            chatMessages={chat.messages}
            chatDraft={chat.draft}
            chatConnectionState={chat.connectionState}
            chatOnlineCount={chat.onlineCount}
            chatReadOnly={chat.readOnly}
            chatError={chat.chatError}
            onChatDraftChange={(event) => {
              chat.setDraft(event.currentTarget.value);
            }}
            onChatSend={() => {
              chat.sendMessage();
            }}
            onChatRequireLogin={() => {
              setLoginPromptOpen(true);
            }}
          />

          <LivePage
            hidden={page !== "live"}
            room={liveRoom}
            roomLabel={liveRoomLabel}
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
              publisher.setSelectedCameraId(event.currentTarget.value);
              publisher.setCameraEnabled(true);
            }}
            onMicrophoneChange={(event) => {
              publisher.setSelectedMicrophoneId(event.currentTarget.value);
              publisher.setMicrophoneEnabled(true);
            }}
            onCycleCamera={() => {
              cycleCameraMode();
            }}
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
              void copyWatchLink().catch((error) => {
                log(`copy failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            onRegenerateRoom={() => {
              autorunRef.current = false;
              setLiveRoomValue(generateRoomId());
            }}
            onCopyWatchLink={() => {
              void copyWatchLink().catch((error) => {
                log(`copy failed: ${error instanceof Error ? error.message : String(error)}`);
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
            chatConnectionState={liveChat.connectionState}
            chatOnlineCount={liveChat.onlineCount}
            chatReadOnly={liveChat.readOnly}
            chatError={liveChat.chatError}
            authAvailable={authState.available}
            authLoading={authState.loading}
            authUser={authState.user}
            onChatDraftChange={(event) => {
              liveChat.setDraft(event.currentTarget.value);
            }}
            onChatSend={() => {
              liveChat.sendMessage();
            }}
            onChatRequireLogin={() => {
              setLoginPromptOpen(true);
            }}
          />

          <SettingsPage
            hidden={page !== "settings"}
            relayUrl={relayUrl}
            relayHost={relayHost}
            buildLabel={buildLabel}
            authAvailable={authState.available}
            authLoading={authState.loading}
            authUser={authState.user}
            onMicrosoftLogin={startMicrosoftLogin}
            onLogout={() => {
              void logout();
            }}
            onUpdateDisplayName={(displayName) => updateDisplayName(displayName)}
            onRelayUrlInput={(event) => {
              autorunRef.current = false;
              setRelayUrlValue(event.currentTarget.value);
            }}
            watchHistoryItems={watchHistoryItems}
            onOpenWatchHistoryItem={openWatchHistoryItem}
            onClearWatchHistory={() => {
              setWatchHistoryItems(clearWatchHistory());
            }}
            loginPanelRequestKey={settingsLoginPanelRequestKey}
            logText={logText}
            logRef={logRef}
          />
        </main>
      </div>

      <MobileNavigation currentPage={page} onSelect={(nextPage) => selectPageWithGuard(nextPage)} />
      <LoginPromptModal
        open={loginPromptOpen}
        authAvailable={authState.available}
        authLoading={authState.loading}
        onClose={() => {
          setLoginPromptOpen(false);
        }}
        onLogin={startMicrosoftLogin}
      />
    </>
  );
}
