import { useEffect, useState } from "react";
import {
  isPortraitMedia,
  shouldUsePortraitImmersiveMode,
} from "../lib/mediaLayout.js";

const PREVIEW_SOURCE_CAMERA = "camera";

function resolveLiveMobileShellMode({
  mediaMode,
  portraitViewport,
  shortLandscapeViewport,
  previewOrientation,
  previewSourceType,
}) {
  if (
    mediaMode === "video" &&
    shortLandscapeViewport &&
    !isPortraitMedia(previewOrientation)
  ) {
    return "landscape-immersive";
  }

  const canUseImmersiveShell =
    mediaMode === "video" &&
    portraitViewport &&
    previewSourceType === PREVIEW_SOURCE_CAMERA;

  if (!canUseImmersiveShell) {
    return "compact";
  }

  return shouldUsePortraitImmersiveMode({
    mediaOrientation: previewOrientation,
    portraitViewport,
  })
    ? "immersive"
    : "compact";
}

export function useLiveMobileShellMode({
  mediaMode = "video",
  portraitViewport,
  shortLandscapeViewport = false,
  previewOrientation,
  previewSourceType,
}) {
  const [shellMode, setShellMode] = useState(() => resolveLiveMobileShellMode({
    mediaMode,
    portraitViewport,
    shortLandscapeViewport,
    previewOrientation,
    previewSourceType,
  }));

  useEffect(() => {
    setShellMode(resolveLiveMobileShellMode({
      mediaMode,
      portraitViewport,
      shortLandscapeViewport,
      previewOrientation,
      previewSourceType,
    }));
  }, [
    mediaMode,
    portraitViewport,
    shortLandscapeViewport,
    previewOrientation,
    previewSourceType,
  ]);

  return shellMode;
}
