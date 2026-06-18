import { useEffect, useState } from "react";

function getOverlayPortalTarget() {
  if (typeof document === "undefined") {
    return null;
  }
  return document.fullscreenElement || document.body;
}

export function useOverlayPortalTarget() {
  const [portalTarget, setPortalTarget] = useState(getOverlayPortalTarget);

  useEffect(() => {
    function handleFullscreenChange() {
      setPortalTarget(getOverlayPortalTarget());
    }

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  return portalTarget;
}
