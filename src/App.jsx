import { useEffect, useRef, useState } from "preact/hooks";
import { DesktopNavigation, MobileNavigation } from "./components/Navigation.jsx";
import { LivePage } from "./components/LivePage.jsx";
import { SettingsPage } from "./components/SettingsPage.jsx";
import { WatchPage } from "./components/WatchPage.jsx";
import { usePlayerController } from "./hooks/usePlayerController.js";
import { usePublisherController } from "./hooks/usePublisherController.js";
import {
  buildWatchLink,
  generateRoomId,
  getInitialViewState,
  getRelayHostValue,
  persistLiveRoom,
  writeRoute
} from "./lib/routeState.js";
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
  const initial = useRef(getInitialViewState()).current;

  const [page, setPage] = useState(initial.page);
  const [relayUrl, setRelayUrl] = useState(initial.relayUrl);
  const [watchRoom, setWatchRoom] = useState(initial.watchRoom);
  const [liveRoom, setLiveRoom] = useState(initial.liveRoom);
  const [logText, setLogText] = useState("");
  const [authState, setAuthState] = useState({
    loading: true,
    available: true,
    user: null
  });

  const logRef = useRef(null);
  const autorunRef = useRef(initial.autorun);
  const pageRef = useRef(initial.page);
  const relayUrlRef = useRef(initial.relayUrl);
  const watchRoomRef = useRef(initial.watchRoom);
  const liveRoomRef = useRef(initial.liveRoom);

  pageRef.current = page;
  relayUrlRef.current = relayUrl;
  watchRoomRef.current = watchRoom;
  liveRoomRef.current = liveRoom;

  function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setLogText((current) => `${current}${line}\n`);
  }

  async function refreshAuthState() {
    try {
      const response = await fetch("/api/me", {
        credentials: "same-origin"
      });
      if (!response.ok) {
        throw new Error(`auth endpoint returned ${response.status}`);
      }
      const payload = await response.json();
      setAuthState({
        loading: false,
        available: true,
        user: payload.user ?? null
      });
    } catch (error) {
      setAuthState({
        loading: false,
        available: false,
        user: null
      });
      log(`auth unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function startMicrosoftLogin() {
    const redirectTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/auth/microsoft/start?redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
      if (!response.ok) {
        throw new Error(`logout failed with ${response.status}`);
      }
      setAuthState((current) => ({
        ...current,
        user: null,
        available: true
      }));
      log("signed out");
    } catch (error) {
      log(`logout failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function setWatchRoomValue(nextRoom) {
    watchRoomRef.current = nextRoom;
    setWatchRoom(nextRoom);
    return nextRoom;
  }

  function setLiveRoomValue(nextRoom) {
    const persistedRoom = persistLiveRoom(nextRoom);
    liveRoomRef.current = persistedRoom;
    setLiveRoom(persistedRoom);
    return persistedRoom;
  }

  function setRelayUrlValue(nextRelayUrl) {
    relayUrlRef.current = nextRelayUrl;
    setRelayUrl(nextRelayUrl);
    return nextRelayUrl;
  }

  function selectPage(nextPage, { updateAutorun = true } = {}) {
    pageRef.current = nextPage;
    if (nextPage === "live" && !liveRoomRef.current) {
      setLiveRoomValue(generateRoomId());
    }

    if (updateAutorun) {
      autorunRef.current = false;
    }

    setPage(nextPage);
  }

  const publisher = usePublisherController({
    page,
    pageRef,
    relayUrlRef,
    roomRef: liveRoomRef,
    generateRoomId: () => setLiveRoomValue(generateRoomId()),
    log
  });

  const player = usePlayerController({
    initialAutorun: initial.autorun,
    relayUrlRef,
    roomRef: watchRoomRef,
    setLogText,
    log,
    syntheticSessionRef: publisher.syntheticSessionRef
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
    const url = new URL(window.location.href);
    const authError = url.searchParams.get("auth_error");
    if (authError) {
      log(`auth failed: ${authError}`);
      url.searchParams.delete("auth_error");
      history.replaceState({}, "", url);
    }

    void refreshAuthState();
  }, []);

  useEffect(() => {
    writeRoute({ page, watchRoom, liveRoom });
  }, [page, watchRoom, liveRoom]);

  useEffect(() => {
    if (!initial.autorun) {
      return;
    }

    autorunRef.current = true;
    selectPage("watch", { updateAutorun: false });
  }, []);

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

  return (
    <>
      <div class={`app-container${mobileWatchJoinedClass}`}>
        <header class="topbar">
          <div class="brand">
            <h1>MoQ Live Deck</h1>
          </div>

          <div class="topbar-right">
            <DesktopNavigation currentPage={page} onSelect={(nextPage) => selectPage(nextPage)} />
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
              selectPage("watch", { updateAutorun: false });
              void player.startPlayer();
            }}
            onStop={() => {
              autorunRef.current = false;
              setWatchRoomValue("");
              selectPage("watch", { updateAutorun: false });
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
              selectPage("live");
              void publisher.startSyntheticPublish().catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                log(`synthetic publish failed: ${message}`);
              });
            }}
            onStopSynthetic={() => {
              selectPage("live");
              void publisher.stopSyntheticPublish();
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
            onRelayUrlInput={(event) => {
              autorunRef.current = false;
              setRelayUrlValue(event.currentTarget.value);
            }}
            logText={logText}
            logRef={logRef}
          />
        </main>
      </div>

      <MobileNavigation currentPage={page} onSelect={(nextPage) => selectPage(nextPage)} />
    </>
  );
}
