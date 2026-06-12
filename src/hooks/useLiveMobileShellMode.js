import { useEffect, useState } from "react";
import { shouldUsePortraitImmersiveMode } from "../lib/mediaLayout.js";

const PREVIEW_SOURCE_CAMERA = "camera";

function resolveLiveMobileShellMode({
  cameraEnabled,
  portraitViewport,
  previewActive,
  previewHasVideo,
  previewOrientation,
  previewSourceType,
}) {
  const canUseImmersiveShell =
    portraitViewport &&
    cameraEnabled &&
    previewSourceType === PREVIEW_SOURCE_CAMERA;

  if (!canUseImmersiveShell) {
    return "compact";
  }

  if (previewActive && previewHasVideo) {
    return shouldUsePortraitImmersiveMode({
      mediaOrientation: previewOrientation,
      portraitViewport,
    })
      ? "immersive"
      : "compact";
  }

  return "immersive";
}

export function useLiveMobileShellMode({
  cameraEnabled,
  portraitViewport,
  previewActive,
  previewHasVideo,
  previewOrientation,
  previewSourceType,
}) {
  const [shellMode, setShellMode] = useState(() => resolveLiveMobileShellMode({
    cameraEnabled,
    portraitViewport,
    previewActive,
    previewHasVideo,
    previewOrientation,
    previewSourceType,
  }));

  useEffect(() => {
    setShellMode(resolveLiveMobileShellMode({
      cameraEnabled,
      portraitViewport,
      previewActive,
      previewHasVideo,
      previewOrientation,
      previewSourceType,
    }));
  }, [
    cameraEnabled,
    portraitViewport,
    previewActive,
    previewHasVideo,
    previewOrientation,
    previewSourceType,
  ]);

  return shellMode;
}
