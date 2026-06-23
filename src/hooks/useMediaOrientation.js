import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_MEDIA_ORIENTATION,
  getMediaElementSize,
  getMediaOrientation,
  hasRenderableMediaSize,
} from "../lib/mediaLayout.js";

export function useMediaOrientation({
  mediaRef,
  active,
  fallback = DEFAULT_MEDIA_ORIENTATION,
  includeTrackSettings = true,
  includeClientSize = true,
  resetOnInactive = true,
}) {
  const [orientation, setOrientation] = useState(fallback);
  const hasMeasuredOrientationRef = useRef(false);

  useEffect(() => {
    if (!active) {
      if (resetOnInactive) {
        hasMeasuredOrientationRef.current = false;
        setOrientation(fallback);
      } else if (!hasMeasuredOrientationRef.current) {
        setOrientation(fallback);
      }
      return undefined;
    }

    let observedEl = null;
    let resizeObserver = null;

    const updateOrientation = () => {
      const mediaEl = mediaRef.current;
      const mediaSize = getMediaElementSize(mediaEl, {
        includeTrackSettings,
        includeClientSize,
      });
      if (hasRenderableMediaSize(mediaSize)) {
        hasMeasuredOrientationRef.current = true;
        setOrientation(getMediaOrientation(mediaSize));
      } else if (!hasMeasuredOrientationRef.current) {
        setOrientation(fallback);
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
  }, [
    active,
    fallback,
    includeClientSize,
    includeTrackSettings,
    mediaRef,
    resetOnInactive,
  ]);

  return orientation;
}
