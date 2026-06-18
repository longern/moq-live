import { useEffect, useRef, useState } from "react";

export function useWatchStageControls({
  immersiveShell,
  playerBadgeState,
  playerSession,
}) {
  const [controlsVisible, setControlsVisible] = useState(false);
  const [immersiveControlsHidden, setImmersiveControlsHidden] = useState(false);
  const hideTimerRef = useRef(null);
  const touchModeRef = useRef(false);

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function hideControls() {
    clearHideTimer();
    setControlsVisible(false);
  }

  function scheduleHide(delay = 1600) {
    clearHideTimer();
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
    if (!playerSession || playerBadgeState === "error") {
      hideControls();
      setImmersiveControlsHidden(false);
      return undefined;
    }

    if (immersiveShell) {
      hideControls();
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
