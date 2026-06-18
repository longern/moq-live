import { useEffect } from "react";
import { usePlayerAutoplayPrompt } from "./player/usePlayerAutoplayPrompt.js";
import { usePlayerLayout } from "./player/usePlayerLayout.js";
import { isPlayerAudioSupported } from "./player/playerControllerUtils.js";
import { usePlayerSession } from "./player/usePlayerSession.js";

export function usePlayerController({
  initialAutorun,
  relayUrlRef,
  roomRef,
  streamProtocolRef,
  webRtcUrlRef,
  setLogText,
  log,
  layoutScopeKey = "",
}) {
  const audioPlaybackSupported = isPlayerAudioSupported();

  const session = usePlayerSession({
    relayUrlRef,
    roomRef,
    streamProtocolRef,
    webRtcUrlRef,
    setLogText,
    log,
    audioPlaybackSupported,
  });

  const layout = usePlayerLayout({
    playerRef: session.playerRef,
    playerSession: session.playerSession,
    playerStatusKind: session.playerStatusKind,
    layoutScopeKey,
    audioPlaybackSupported,
  });

  const autoplayPrompt = usePlayerAutoplayPrompt({
    audioPlaybackSupported,
    playerSession: session.playerSession,
    playbackStartToken: session.playbackStartToken,
    setPlayerMute: session.setPlayerMute,
    requestAudiblePlayback: async () => {
      if (session.playerSession) {
        if (session.playerPaused) {
          await session.resumePlayer();
        }
        await session.requestAudiblePlayback();
        return;
      }

      await session.startPlayer();
    },
    log,
  });

  async function startPlayer(options = {}) {
    autoplayPrompt.noteStartIntent(Boolean(options.initiatedByUser));
    await session.startPlayer({
      ...options,
      layoutScopeKey,
    });
  }

  async function stopPlayer(options = {}) {
    autoplayPrompt.noteStartIntent(false);
    await session.stopPlayer(options);
  }

  async function togglePlayerPlayback() {
    if (session.playerPaused) {
      autoplayPrompt.noteUserInteraction();
      await session.resumePlayer();
      return;
    }

    await session.pausePlayer();
  }

  async function togglePlayerMute() {
    if (autoplayPrompt.showTapToUnmute) {
      await dismissTapToUnmute();
      return;
    }
    autoplayPrompt.noteUserInteraction();
    await session.togglePlayerMute();
  }

  async function dismissTapToUnmute() {
    await autoplayPrompt.dismissTapToUnmute();
  }

  useEffect(() => {
    if (!initialAutorun) {
      return;
    }

    void startPlayer();
  }, []);

  return {
    playerStatus: session.playerStatus,
    playerStatusKind: session.playerStatusKind,
    fullscreenActive: session.fullscreenActive,
    fullscreenRotate: session.fullscreenRotate,
    playerPaused: session.playerPaused,
    playerMuted: session.playerMuted,
    showTapToUnmute: autoplayPrompt.showTapToUnmute,
    playerMediaSize: layout.playerMediaSize,
    playerOrientation: layout.playerOrientation,
    playerSession: session.playerSession,
    playerStarted: session.playerStarted,
    playerFreezeFrameUrl: session.playerFreezeFrameUrl,
    playerRef: session.playerRef,
    watchStageRef: session.watchStageRef,
    startPlayer,
    stopPlayer,
    togglePlayerPlayback,
    togglePlayerMute,
    dismissTapToUnmute,
    fullscreenPlayer: session.fullscreenPlayer,
  };
}
