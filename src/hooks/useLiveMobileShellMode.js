import { useEffect, useState } from "react";
import { shouldUsePortraitImmersiveMode } from "../lib/mediaLayout.js";

const PREVIEW_SOURCE_CAMERA = "camera";

function resolveLiveMobileShellMode({
  mediaMode,
  portraitViewport,
  previewOrientation,
  previewSourceType,
}) {
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
  previewOrientation,
  previewSourceType,
}) {
  const [shellMode, setShellMode] = useState(() => resolveLiveMobileShellMode({
    mediaMode,
    portraitViewport,
    previewOrientation,
    previewSourceType,
  }));

  useEffect(() => {
    setShellMode(resolveLiveMobileShellMode({
      mediaMode,
      portraitViewport,
      previewOrientation,
      previewSourceType,
    }));
  }, [
    mediaMode,
    portraitViewport,
    previewOrientation,
    previewSourceType,
  ]);

  return shellMode;
}
