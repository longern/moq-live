import { useEffect, useRef, useState } from "react";
import { RETAINED_PLAYER_LAYOUT_STATES } from "../../lib/status.js";

const DEFAULT_PLAYER_ORIENTATION = "landscape";

function getMediaSize(playerEl) {
  if (playerEl instanceof HTMLCanvasElement) {
    return {
      width: playerEl.width,
      height: playerEl.height,
    };
  }

  return {
    width: playerEl.videoWidth || playerEl.clientWidth,
    height: playerEl.videoHeight || playerEl.clientHeight,
  };
}

function getMediaOrientation({ width, height }) {
  return height > width ? "portrait" : "landscape";
}

function hasRenderableMediaSize(size) {
  return Boolean(size?.width && size?.height);
}

export function usePlayerLayout({
  playerRef,
  playerSession,
  playerStatusKind,
  layoutScopeKey = "",
  audioPlaybackSupported,
}) {
  const [layoutSnapshot, setLayoutSnapshot] = useState({
    scopeKey: layoutScopeKey,
    sessionKey: "",
    mediaSize: null,
    orientation: DEFAULT_PLAYER_ORIENTATION,
  });
  const lastSessionKeyRef = useRef("");

  useEffect(() => {
    lastSessionKeyRef.current = "";
    setLayoutSnapshot({
      scopeKey: layoutScopeKey,
      sessionKey: "",
      mediaSize: null,
      orientation: DEFAULT_PLAYER_ORIENTATION,
    });
  }, [layoutScopeKey]);

  useEffect(() => {
    const sessionKey = playerSession?.key ?? "";
    if (
      sessionKey &&
      playerSession?.layoutScopeKey === layoutScopeKey &&
      sessionKey !== lastSessionKeyRef.current
    ) {
      lastSessionKeyRef.current = sessionKey;
      setLayoutSnapshot({
        scopeKey: layoutScopeKey,
        sessionKey,
        mediaSize: null,
        orientation: DEFAULT_PLAYER_ORIENTATION,
      });
    }
  }, [layoutScopeKey, playerSession?.key, playerSession?.layoutScopeKey]);

  useEffect(() => {
    const playerEl = playerRef.current;
    if (!playerSession || !playerEl) {
      return;
    }

    const updateMediaLayout = () => {
      if (playerSession.layoutScopeKey !== layoutScopeKey) {
        return;
      }

      if (RETAINED_PLAYER_LAYOUT_STATES.has(playerStatusKind)) {
        return;
      }

      const mediaSize = getMediaSize(playerEl);
      if (!hasRenderableMediaSize(mediaSize)) {
        return;
      }

      const orientation = getMediaOrientation(mediaSize);
      setLayoutSnapshot((current) => {
        if (
          current.scopeKey === layoutScopeKey &&
          current.sessionKey === playerSession.key &&
          current.orientation === orientation &&
          current.mediaSize?.width === mediaSize.width &&
          current.mediaSize?.height === mediaSize.height
        ) {
          return current;
        }

        return {
          scopeKey: layoutScopeKey,
          sessionKey: playerSession.key,
          mediaSize,
          orientation,
        };
      });
    };

    updateMediaLayout();
    if (!audioPlaybackSupported && "muted" in playerEl) {
      playerEl.muted = true;
    }

    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            updateMediaLayout();
          })
        : null;
    resizeObserver?.observe(playerEl);

    playerEl.addEventListener("loadedmetadata", updateMediaLayout);
    playerEl.addEventListener("resize", updateMediaLayout);

    const mediaSyncTicker = window.setInterval(() => {
      updateMediaLayout();
    }, 250);

    return () => {
      clearInterval(mediaSyncTicker);
      playerEl.removeEventListener("loadedmetadata", updateMediaLayout);
      playerEl.removeEventListener("resize", updateMediaLayout);
      resizeObserver?.disconnect();
    };
  }, [audioPlaybackSupported, layoutScopeKey, playerRef, playerSession, playerStatusKind]);

  useEffect(
    () => () => {
      setLayoutSnapshot({
        scopeKey: "",
        sessionKey: "",
        mediaSize: null,
        orientation: DEFAULT_PLAYER_ORIENTATION,
      });
    },
    [],
  );

  return {
    playerMediaSize: layoutSnapshot.mediaSize,
    playerOrientation: layoutSnapshot.orientation,
  };
}
