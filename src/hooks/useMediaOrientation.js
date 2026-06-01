import { useEffect, useState } from "preact/hooks";

function getElementDimensions(mediaEl) {
  if (!mediaEl) {
    return { width: 0, height: 0 };
  }

  const stream = mediaEl.srcObject;
  const track = typeof stream?.getVideoTracks === "function"
    ? stream.getVideoTracks()[0]
    : null;
  const settings = track?.getSettings?.() ?? {};

  return {
    width: mediaEl.videoWidth || settings.width || mediaEl.clientWidth || 0,
    height: mediaEl.videoHeight || settings.height || mediaEl.clientHeight || 0,
  };
}

export function useMediaOrientation({
  mediaRef,
  active,
  fallback = "landscape",
}) {
  const [orientation, setOrientation] = useState(fallback);

  useEffect(() => {
    if (!active) {
      setOrientation(fallback);
      return undefined;
    }

    let observedEl = null;
    let resizeObserver = null;

    const updateOrientation = () => {
      const mediaEl = mediaRef.current;
      const { width, height } = getElementDimensions(mediaEl);
      if (width && height) {
        setOrientation(height > width ? "portrait" : "landscape");
      }
    };

    const bindCurrentElement = () => {
      const mediaEl = mediaRef.current;
      if (mediaEl === observedEl) {
        return;
      }

      if (observedEl) {
        observedEl.removeEventListener("loadedmetadata", updateOrientation);
        observedEl.removeEventListener("resize", updateOrientation);
      }
      resizeObserver?.disconnect();
      resizeObserver = null;

      observedEl = mediaEl;
      if (!observedEl) {
        return;
      }

      observedEl.addEventListener("loadedmetadata", updateOrientation);
      observedEl.addEventListener("resize", updateOrientation);
      resizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(updateOrientation)
        : null;
      resizeObserver?.observe(observedEl);
      updateOrientation();
    };

    bindCurrentElement();
    const syncTicker = window.setInterval(() => {
      bindCurrentElement();
      updateOrientation();
    }, 250);

    return () => {
      window.clearInterval(syncTicker);
      if (observedEl) {
        observedEl.removeEventListener("loadedmetadata", updateOrientation);
        observedEl.removeEventListener("resize", updateOrientation);
      }
      resizeObserver?.disconnect();
    };
  }, [active, fallback, mediaRef]);

  return orientation;
}
