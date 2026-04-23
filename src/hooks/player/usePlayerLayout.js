import { useEffect, useState } from "preact/hooks";

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

    const updateMediaLayout = () => {
      const mediaWidth = playerEl instanceof HTMLCanvasElement
        ? playerEl.width
        : playerEl.videoWidth || playerEl.clientWidth;
      const mediaHeight = playerEl instanceof HTMLCanvasElement
        ? playerEl.height
        : playerEl.videoHeight || playerEl.clientHeight;
      if (mediaWidth && mediaHeight) {
        setPlayerOrientation(mediaHeight > mediaWidth ? "portrait" : "landscape");
      }
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
