import { useEffect, useRef, useState } from "react";

export function useWatchStageControls({
  controlsHoldActive = false,
  immersiveShell,
  manualHideControlsEnabled = true,
  playerBadgeState,
  playerSession,
}) {
  const [controlsVisible, setControlsVisible] = useState(false);
  const [immersiveControlsHidden, setImmersiveControlsHidden] = useState(false);
  const hideTimerRef = useRef(null);
  const controlsHoldActiveRef = useRef(false);
  const touchModeRef = useRef(false);

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function hideControls({ force = false } = {}) {
    clearHideTimer();
    if (controlsHoldActiveRef.current && !force) {
      return;
    }
    setControlsVisible(false);
  }

  function scheduleHide(delay = 1600) {
    clearHideTimer();
    if (controlsHoldActiveRef.current) {
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      hideTimerRef.current = null;
    }, delay);
  }

  function revealControls() {
    if (!playerSession || playerBadgeState === "error") {
      return;
    }

    setControlsVisible(true);
    scheduleHide(touchModeRef.current ? 2200 : 1600);
  }

  function handleStagePointerMove() {
    if (touchModeRef.current) {
      return;
    }
    revealControls();
  }

  function handleStagePointerLeave() {
    if (touchModeRef.current || !controlsVisible) {
      return;
    }
    scheduleHide(500);
  }

  function handleStageClick() {
    if (!playerSession || playerBadgeState === "error") {
      return;
    }
    if (immersiveShell) {
      setImmersiveControlsHidden(false);
      return;
    }
    if (!touchModeRef.current) {
      return;
    }
    revealControls();
  }

  function handleStageContextMenu(event) {
    if (!playerSession || playerBadgeState === "error") {
      return;
    }

    if (!manualHideControlsEnabled) {
      return;
    }

    if (immersiveShell) {
      event.preventDefault();
      clearHideTimer();
      setImmersiveControlsHidden(true);
      return;
    }

    if (!touchModeRef.current) {
      return;
    }

    if (controlsVisible) {
      event.preventDefault();
      hideControls();
    }
  }

  function handleStageLongPress() {
    if (!playerSession || playerBadgeState === "error") {
      return false;
    }

    if (!manualHideControlsEnabled) {
      return false;
    }

    if (immersiveShell) {
      clearHideTimer();
      setImmersiveControlsHidden(true);
      return true;
    }

    if (touchModeRef.current && controlsVisible) {
      hideControls();
      return true;
    }

    return false;
  }

  useEffect(() => {
    touchModeRef.current = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  }, []);

  useEffect(() => {
    const wasHoldActive = controlsHoldActiveRef.current;
    controlsHoldActiveRef.current = controlsHoldActive;

    if (controlsHoldActive) {
      clearHideTimer();
      if (playerSession && playerBadgeState !== "error") {
        if (immersiveShell) {
          setImmersiveControlsHidden(false);
        } else {
          setControlsVisible(true);
        }
      }
      return undefined;
    }

    if (
      wasHoldActive
      && playerSession
      && playerBadgeState !== "error"
      && !immersiveShell
      && touchModeRef.current
      && controlsVisible
    ) {
      scheduleHide(2200);
    }

    return undefined;
  }, [controlsHoldActive, controlsVisible, immersiveShell, playerBadgeState, playerSession]);

  useEffect(() => {
    if (!playerSession || playerBadgeState === "error") {
      hideControls({ force: true });
      setImmersiveControlsHidden(false);
      return undefined;
    }

    if (immersiveShell) {
      hideControls({ force: true });
      setImmersiveControlsHidden(false);
      return undefined;
    }

    if (touchModeRef.current) {
      scheduleHide(2200);
      return undefined;
    }

    setControlsVisible(true);
    scheduleHide();

    return () => {
      clearHideTimer();
    };
  }, [immersiveShell, playerSession, playerBadgeState]);

  useEffect(() => () => {
    clearHideTimer();
  }, []);

  return {
    controlsVisible,
    immersiveControlsHidden,
    handleStageClick,
    handleStageContextMenu,
    handleStageLongPress,
    handleStagePointerLeave,
    handleStagePointerMove,
    revealControls,
  };
}
