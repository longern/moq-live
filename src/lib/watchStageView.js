const PLAYER_STATUS_OVERLAY_KINDS = new Set(["ended", "left", "offair", "paused"]);
const PLAYER_STATUS_MESSAGES = {
  ended: "直播已结束",
  left: "已离开直播间",
  offair: "尚未开播",
  paused: "已暂停",
};

export function getWatchStageView({
  playerSession = null,
  playerStarted = false,
  playerStatusMessage = "",
  playerStatusKind = "idle",
  playerBadgeState = "idle",
  stageLoading = false,
  stageMessage = "",
} = {}) {
  const hasPlayerSession = Boolean(playerSession);
  const statusKind = playerStatusKind || "idle";
  const statusOverlayMessage = PLAYER_STATUS_MESSAGES[statusKind] || "";
  const errorMessage = playerStatusMessage || "";
  const showStatusOverlay =
    !hasPlayerSession &&
    !stageLoading &&
    statusOverlayMessage &&
    PLAYER_STATUS_OVERLAY_KINDS.has(statusKind);

  if (statusKind === "error") {
    return {
      placeholderLoading: !hasPlayerSession && stageLoading,
      placeholderMessage: hasPlayerSession ? "" : stageMessage,
      showPlaybackControls: false,
      showInitialPlaybackSpinner: false,
      statusOverlayKind: "error",
      statusOverlayMessage: errorMessage,
    };
  }

  return {
    placeholderLoading: !hasPlayerSession && stageLoading,
    placeholderMessage: hasPlayerSession || showStatusOverlay ? "" : stageMessage,
    showPlaybackControls: hasPlayerSession,
    showInitialPlaybackSpinner: Boolean(
      hasPlayerSession && !playerStarted && playerBadgeState === "warm"
    ),
    statusOverlayKind: showStatusOverlay ? "status" : "",
    statusOverlayMessage: showStatusOverlay ? statusOverlayMessage : "",
  };
}
