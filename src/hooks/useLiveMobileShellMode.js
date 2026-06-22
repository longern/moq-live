import { useEffect, useState } from "react";
import { shouldUsePortraitImmersiveMode } from "../lib/mediaLayout.js";

const PREVIEW_SOURCE_CAMERA = "camera";

function resolveLiveMobileShellMode({
  cameraEnabled,
  portraitViewport,
  previewActive,
  previewHasVideo,
  previewOrientation,
  previewOrientationFallback,
  previewSourceType,
}) {
  const canUseImmersiveShell =
    portraitViewport &&
    cameraEnabled &&
    previewSourceType === PREVIEW_SOURCE_CAMERA;

  if (!canUseImmersiveShell) {
    return "compact";
  }

  const effectivePreviewOrientation = previewActive && previewHasVideo
    ? previewOrientation
    : previewOrientationFallback;

  return shouldUsePortraitImmersiveMode({
    mediaOrientation: effectivePreviewOrientation,
    portraitViewport,
  })
    ? "immersive"
    : "compact";
}

export function useLiveMobileShellMode({
  cameraEnabled,
  portraitViewport,
  previewActive,
  previewHasVideo,
  previewOrientation,
  previewOrientationFallback,
  previewSourceType,
}) {
  const [shellMode, setShellMode] = useState(() => resolveLiveMobileShellMode({
    cameraEnabled,
    portraitViewport,
    previewActive,
    previewHasVideo,
    previewOrientation,
    previewOrientationFallback,
    previewSourceType,
  }));

  useEffect(() => {
    setShellMode(resolveLiveMobileShellMode({
      cameraEnabled,
      portraitViewport,
      previewActive,
      previewHasVideo,
      previewOrientation,
      previewOrientationFallback,
      previewSourceType,
    }));
  }, [
    cameraEnabled,
    portraitViewport,
    previewActive,
    previewHasVideo,
    previewOrientation,
    previewOrientationFallback,
    previewSourceType,
  ]);

  return shellMode;
}
