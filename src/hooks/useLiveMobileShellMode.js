import { useEffect, useState } from "react";
import { shouldUsePortraitImmersiveMode } from "../lib/mediaLayout.js";

const PREVIEW_SOURCE_CAMERA = "camera";

export function useLiveMobileShellMode({
  cameraEnabled,
  isPublishing,
  isStarting,
  portraitViewport,
  previewActive,
  previewHasVideo,
  previewOrientation,
  previewPending,
  previewSourceType,
}) {
  const [shellMode, setShellMode] = useState("compact");

  useEffect(() => {
    const canUseImmersiveShell =
      portraitViewport &&
      cameraEnabled &&
      previewSourceType === PREVIEW_SOURCE_CAMERA;

    setShellMode((currentMode) => {
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

      // Camera switches and tab restores can briefly clear preview state before
      // the new video size is known. Keep an existing immersive shell stable.
      if (currentMode === "immersive") {
        return currentMode;
      }

      if (previewPending || isStarting || isPublishing) {
        return currentMode;
      }

      return "compact";
    });
  }, [
    cameraEnabled,
    isPublishing,
    isStarting,
    portraitViewport,
    previewActive,
    previewHasVideo,
    previewOrientation,
    previewPending,
    previewSourceType,
  ]);

  return shellMode;
}
