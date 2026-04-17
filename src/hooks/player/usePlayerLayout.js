import { useEffect, useState } from "preact/hooks";
import {
  ensureContainedPlayerStyles,
  ensureInitialCanvasSize,
  syncContainedCanvasLayout,
} from "./playerControllerUtils.js";

export function usePlayerLayout({
  playerRef,
  playerSession,
  audioPlaybackSupported,
}) {
  const [playerOrientation, setPlayerOrientation] = useState("landscape");

  useEffect(() => {
    const playerEl = playerRef.current;
    if (!playerSession || !playerEl) {
      return;
    }

    const updateCanvasLayout = () => {
      ensureInitialCanvasSize(playerEl);
      const nextOrientation = syncContainedCanvasLayout(playerEl);
      if (nextOrientation) {
        setPlayerOrientation(nextOrientation);
      }
    };

    ensureContainedPlayerStyles(playerEl);
    updateCanvasLayout();
    if (!audioPlaybackSupported && "muted" in playerEl) {
      playerEl.muted = true;
    }

    const resizeObserver =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            updateCanvasLayout();
          })
        : null;
    resizeObserver?.observe(playerEl);

    const canvasEl = playerEl.shadowRoot?.querySelector("canvas#canvas");
    const canvasObserver =
      canvasEl instanceof HTMLCanvasElement
        ? new MutationObserver(() => {
            updateCanvasLayout();
          })
        : null;
    canvasObserver?.observe(canvasEl, {
      attributes: true,
      attributeFilter: ["width", "height", "style", "class"],
    });

    const canvasSyncTicker = window.setInterval(() => {
      updateCanvasLayout();
    }, 250);

    return () => {
      clearInterval(canvasSyncTicker);
      canvasObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [audioPlaybackSupported, playerRef, playerSession]);

  useEffect(
    () => () => {
      setPlayerOrientation("landscape");
    },
    [],
  );

  return {
    playerOrientation,
  };
}
