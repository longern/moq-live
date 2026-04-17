import { useEffect } from "preact/hooks";
import {
  compareSignatures,
  sampleCanvasMarkerSignature,
  sampleImageMarkerSignature,
} from "../lib/syntheticMedia.js";
import { usePlayerAutoplayPrompt } from "./player/usePlayerAutoplayPrompt.js";
import { usePlayerLayout } from "./player/usePlayerLayout.js";
import { isPlayerAudioSupported } from "./player/playerControllerUtils.js";
import { usePlayerSession } from "./player/usePlayerSession.js";

export function usePlayerController({
  initialAutorun,
  relayUrlRef,
  roomRef,
  setLogText,
  log,
  syntheticSessionRef,
}) {
  const audioPlaybackSupported = isPlayerAudioSupported();

  const session = usePlayerSession({
    relayUrlRef,
    roomRef,
    setLogText,
    log,
    audioPlaybackSupported,
  });

  const layout = usePlayerLayout({
    playerRef: session.playerRef,
    playerSession: session.playerSession,
    audioPlaybackSupported,
  });

  const autoplayPrompt = usePlayerAutoplayPrompt({
    audioPlaybackSupported,
    playerSession: session.playerSession,
    playbackStartToken: session.playbackStartToken,
    setPlayerMutedStateOnly: session.setPlayerMutedStateOnly,
    requestAudiblePlayback: async () => {
      if (session.playerSession) {
        if (session.playerPaused) {
          await session.resumePlayer();
        }
        await session.setPlayerMute(false);
        return;
      }

      await session.startPlayer();
    },
    log,
  });

  async function startPlayer(options = {}) {
    autoplayPrompt.noteStartIntent(Boolean(options.initiatedByUser));
    await session.startPlayer();
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

  async function compareSyntheticPlaybackFromDataUrl(dataUrl) {
    const source = sampleCanvasMarkerSignature(
      syntheticSessionRef.current?.syntheticMedia?.canvas ?? null,
    );
    const player = await sampleImageMarkerSignature(dataUrl);
    return compareSignatures(source, player);
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
    playerOrientation: layout.playerOrientation,
    playerSession: session.playerSession,
    playerRef: session.playerRef,
    watchStageRef: session.watchStageRef,
    startPlayer,
    stopPlayer,
    togglePlayerPlayback,
    togglePlayerMute,
    dismissTapToUnmute,
    fullscreenPlayer: session.fullscreenPlayer,
    compareSyntheticPlaybackFromDataUrl,
  };
}
