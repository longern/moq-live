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
  writeRoute
} from "./lib/routeState.js";
import { describePlayerState, describePublishState } from "./lib/status.js";

export function App() {
  const initial = useRef(getInitialViewState()).current;

  const [page, setPage] = useState(initial.page);
  const [relayUrl, setRelayUrl] = useState(initial.relayUrl);
  const [room, setRoom] = useState(initial.room);
  const [logText, setLogText] = useState("");

  const logRef = useRef(null);
  const autorunRef = useRef(initial.autorun);
  const pageRef = useRef(initial.page);
  const relayUrlRef = useRef(initial.relayUrl);
  const roomRef = useRef(initial.room);

  pageRef.current = page;
  relayUrlRef.current = relayUrl;
  roomRef.current = room;

  function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setLogText((current) => `${current}${line}\n`);
  }

  function setRoomValue(nextRoom) {
    roomRef.current = nextRoom;
    setRoom(nextRoom);
    return nextRoom;
  }

  function setRelayUrlValue(nextRelayUrl) {
    relayUrlRef.current = nextRelayUrl;
    setRelayUrl(nextRelayUrl);
    return nextRelayUrl;
  }

  function selectPage(nextPage, { updateAutorun = true } = {}) {
    pageRef.current = nextPage;
    if (nextPage === "live" && !roomRef.current) {
      setRoomValue(generateRoomId());
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
    roomRef,
    generateRoomId: () => setRoomValue(generateRoomId()),
    log
  });

  const player = usePlayerController({
    initialAutorun: initial.autorun,
    relayUrlRef,
    roomRef,
    setLogText,
    log,
    syntheticSessionRef: publisher.syntheticSessionRef
  });

  const roomLabel = room || "等待生成或输入房间 ID";
  const watchLink = buildWatchLink(relayUrl, room);
  const relayHost = getRelayHostValue(relayUrl);
  const playerBadge = describePlayerState(player.playerStatus);
  const publishBadge = describePublishState(publisher.publishStatus);
  const buildLabel = `Build ${__BUILD_HASH__}`;
  const mobileWatchJoinedClass = page === "watch" && Boolean(player.playerSession) ? " app-container-watch-joined" : "";

  async function copyWatchLink() {
    if (!watchLink || watchLink === "等待生成观看链接") {
      return;
    }

    await navigator.clipboard.writeText(watchLink);
    log("watch link copied");
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logText]);

  useEffect(() => {
    writeRoute({ page, room, relayUrl, autorun: autorunRef.current });
  }, [page, room, relayUrl]);

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
        namespace: roomRef.current
      }),
      getSyntheticSignatures: publisher.getSyntheticSignatures,
      compareScreenshotSignature: async (dataUrl) => player.compareSyntheticPlaybackFromDataUrl(dataUrl)
    };

    return () => {
      delete window.__moqTest;
    };
  }, [player.playerStatus, publisher.publishStatus, room]);

  return (
    <>
      <div class={`app-container${mobileWatchJoinedClass}`}>
        <header class="topbar">
          <div class="brand">
            <h1>MoQ Live Deck</h1>
          </div>

          <div class="topbar-right">
            <DesktopNavigation currentPage={page} onSelect={(nextPage) => selectPage(nextPage)} />
          </div>
        </header>

        <main class="page-shell">
          <WatchPage
            hidden={page !== "watch"}
            roomLabel={roomLabel}
            watchLink={watchLink}
            playerStatus={player.playerStatus}
            playerBadge={playerBadge}
            fullscreenActive={player.fullscreenActive}
            playerPaused={player.playerPaused}
            playerMuted={player.playerMuted}
            playerOrientation={player.playerOrientation}
            room={room}
            onRoomInput={(event) => {
              setRoomValue(event.currentTarget.value);
            }}
            onStart={() => {
              autorunRef.current = true;
              selectPage("watch", { updateAutorun: false });
              void player.startPlayer();
            }}
            onStop={() => {
              autorunRef.current = false;
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
            room={room}
            roomLabel={roomLabel}
            watchLink={watchLink}
            publishStatus={publisher.publishStatus}
            publishBadge={publishBadge}
            cameraOptions={publisher.cameraOptions}
            microphoneOptions={publisher.microphoneOptions}
            selectedCameraId={publisher.selectedCameraId}
            selectedMicrophoneId={publisher.selectedMicrophoneId}
            isPublishing={publisher.publisherIsPublishing}
            previewActive={publisher.previewActive}
            previewVideoRef={publisher.previewVideoRef}
            onCameraChange={(event) => {
              publisher.setSelectedCameraId(event.currentTarget.value);
            }}
            onMicrophoneChange={(event) => {
              publisher.setSelectedMicrophoneId(event.currentTarget.value);
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
            onRegenerateRoom={() => {
              autorunRef.current = false;
              setRoomValue(generateRoomId());
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
