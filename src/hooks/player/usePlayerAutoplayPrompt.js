import { useEffect, useRef, useState } from "preact/hooks";
import { canAutoplayAudioWithoutGesture } from "./playerControllerUtils.js";

export function usePlayerAutoplayPrompt({
  audioPlaybackSupported,
  playerSession,
  playbackStartToken,
  setPlayerMutedStateOnly,
  requestAudiblePlayback,
  log,
}) {
  const [showTapToUnmute, setShowTapToUnmute] = useState(false);

  const logRef = useRef(log);
  const setPlayerMutedStateOnlyRef = useRef(setPlayerMutedStateOnly);
  const requestAudiblePlaybackRef = useRef(requestAudiblePlayback);
  const lastStartWasUserInitiatedRef = useRef(false);
  const autoplayPromptTokenRef = useRef(0);

  logRef.current = log;
  setPlayerMutedStateOnlyRef.current = setPlayerMutedStateOnly;
  requestAudiblePlaybackRef.current = requestAudiblePlayback;

  function invalidatePrompt() {
    autoplayPromptTokenRef.current += 1;
    setShowTapToUnmute(false);
  }

  function noteStartIntent(initiatedByUser = false) {
    lastStartWasUserInitiatedRef.current = initiatedByUser;
    invalidatePrompt();
  }

  function noteUserInteraction() {
    lastStartWasUserInitiatedRef.current = true;
    invalidatePrompt();
  }

  async function dismissTapToUnmute() {
    noteUserInteraction();
    await requestAudiblePlaybackRef.current();
  }

  useEffect(() => {
    if (!playerSession) {
      invalidatePrompt();
    }
  }, [playerSession]);

  useEffect(() => {
    if (!playerSession || playbackStartToken === 0) {
      return;
    }

    const promptToken = ++autoplayPromptTokenRef.current;
    let cancelled = false;

    void (async () => {
      if (
        !audioPlaybackSupported ||
        lastStartWasUserInitiatedRef.current ||
        navigator.userActivation?.hasBeenActive
      ) {
        return;
      }

      const canAutoplay = await canAutoplayAudioWithoutGesture();

      if (
        cancelled ||
        canAutoplay ||
        lastStartWasUserInitiatedRef.current ||
        navigator.userActivation?.hasBeenActive ||
        promptToken !== autoplayPromptTokenRef.current
      ) {
        return;
      }

      setShowTapToUnmute(true);
      setPlayerMutedStateOnlyRef.current(true);
      logRef.current?.("autoplay started muted until user interaction");
    })();

    return () => {
      cancelled = true;
    };
  }, [audioPlaybackSupported, playbackStartToken, playerSession]);

  return {
    showTapToUnmute,
    noteStartIntent,
    noteUserInteraction,
    dismissTapToUnmute,
  };
}
