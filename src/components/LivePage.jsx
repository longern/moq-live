import { useEffect, useRef, useState } from "react";
import { useMediaOrientation } from "../hooks/useMediaOrientation.js";
import { useCompactViewport, usePortraitViewport } from "../hooks/useMediaQuery.js";
import { LiveDesktopPage } from "./live/LiveDesktopPage.jsx";
import { LiveMobilePage } from "./live/LiveMobilePage.jsx";
import { createApiError, getAppErrorMessage } from "../lib/appErrors.js";

const LIVE_PAGE_EXIT_MS = 280;

export function LivePage({
  hidden,
  activationContent,
  roomDetails,
  roomLabel,
  roomAvatarUrl,
  shareTarget,
  watchLink,
  publishBlocked,
  publishBlockedReason,
  publishBadge,
  cameraOptions,
  microphoneOptions,
  selectedCameraId,
  selectedMicrophoneId,
  cameraEnabled,
  microphoneEnabled,
  cameraMode,
  isPublishing,
  isStarting = false,
  previewActive,
  previewHasVideo,
  previewPending,
  previewSourceType,
  screenShareSupported,
  screenShareActive,
  syntheticPublishing,
  previewVideoRef,
  onCameraChange,
  onMicrophoneChange,
  onCycleCamera,
  onToggleMicrophone,
  onTogglePublish,
  onStartPublish,
  onStopPublish,
  onShare,
  onStartScreenShare,
  onStopScreenShare,
  onStartSynthetic,
  onStopSynthetic,
  chatMessages,
  chatDraft,
  chatConnectionState,
  chatOnlineCount,
  chatLoggedInViewers = [],
  chatReadOnly,
  chatError,
  authAvailable,
  authLoading,
  authUser,
  onChatDraftChange,
  onChatSend,
  onChatRequireLogin,
  onRoomDetailsChange,
  onRequestClose,
  onSelectLiveMode
}) {
  const compactViewport = useCompactViewport();
  const portraitViewport = usePortraitViewport();
  const previewOrientation = useMediaOrientation({
    mediaRef: previewVideoRef,
    active: previewActive && previewHasVideo,
  });
  const [roomCoverUrl, setRoomCoverUrl] = useState("");
  const [roomCoverLoading, setRoomCoverLoading] = useState(false);
  const [roomCoverBusy, setRoomCoverBusy] = useState(false);
  const [roomCoverError, setRoomCoverError] = useState("");
  const [roomCoverStatus, setRoomCoverStatus] = useState("");
  const [closing, setClosing] = useState(false);
  const [renderHidden, setRenderHidden] = useState(hidden);
  const closeTimerRef = useRef(null);
  const roomCoverInputRef = useRef(null);
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const mediaMode = cameraEnabled ? "video" : "voice";
  const mirrorPreview = previewSourceType === "camera" && cameraMode === "front";
  const immersiveTouchPortrait =
    portraitViewport &&
    previewActive &&
    previewHasVideo &&
    previewOrientation === "portrait";
  const useMobileShell = compactViewport || portraitViewport;
  const mobileShellMode = immersiveTouchPortrait ? "immersive" : "compact";

  useEffect(() => () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!hidden) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setRenderHidden(false);
      setClosing(false);
      return;
    }

    if (renderHidden) {
      return;
    }

    setClosing(true);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setRenderHidden(true);
      setClosing(false);
      closeTimerRef.current = null;
    }, LIVE_PAGE_EXIT_MS);
  }, [hidden, renderHidden]);

  function requestClose() {
    if (closing) {
      return;
    }

    setClosing(true);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setRenderHidden(true);
      setClosing(false);
      onRequestClose?.();
    }, LIVE_PAGE_EXIT_MS);
  }

  useEffect(() => {
    if (!authUser?.id || renderHidden) {
      setRoomCoverUrl("");
      setRoomCoverLoading(false);
      setRoomCoverBusy(false);
      setRoomCoverError("");
      setRoomCoverStatus("");
      return;
    }

    setRoomCoverUrl(roomDetails?.coverUrl || "");
    setRoomCoverLoading(false);
    setRoomCoverError("");
  }, [authUser?.id, renderHidden, roomDetails?.coverUrl, roomDetails?.id]);

  function openRoomCoverPicker() {
    roomCoverInputRef.current?.click();
  }

  async function handleRoomCoverPick(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    setRoomCoverBusy(true);
    setRoomCoverError("");
    setRoomCoverStatus("");

    try {
      const formData = new FormData();
      formData.set("cover", file);
      const response = await fetch("/api/me/room/cover", {
        method: "POST",
        credentials: "same-origin",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw createApiError(payload, "cover_upload_failed", { status: response.status });
      }

      setRoomCoverUrl(payload.room?.coverUrl || "");
      onRoomDetailsChange?.(payload.room || null);
      setRoomCoverStatus("直播封面已更新");
    } catch (error) {
      setRoomCoverError(getAppErrorMessage(error));
    } finally {
      setRoomCoverBusy(false);
    }
  }

  const pageProps = {
    hidden: renderHidden,
    closing,
    activationContent,
    roomLabel,
    roomAvatarUrl,
    shareTarget,
    watchLink,
    publishBlocked,
    publishBlockedReason,
    publishBadge,
    cameraOptions,
    microphoneOptions,
    selectedCameraId,
    selectedMicrophoneId,
    cameraEnabled,
    mediaMode,
    microphoneEnabled,
    cameraMode,
    isPublishing,
    isStarting,
    previewActive,
    previewHasVideo,
    previewPending,
    previewSourceType,
    screenShareSupported,
    screenShareActive,
    syntheticPublishing,
    previewVideoRef,
    mirrorPreview,
    onCameraChange,
    onMicrophoneChange,
    onCycleCamera,
    onToggleMicrophone,
    onTogglePublish,
    onStartPublish,
    onStopPublish,
    onShare,
    onStartScreenShare,
    onStopScreenShare,
    onStartSynthetic,
    onStopSynthetic,
    chatMessages,
    chatDraft,
    chatConnectionState,
    chatOnlineCount,
    chatLoggedInViewers,
    chatReadOnly,
    chatError,
    authAvailable,
    authLoading,
    authUser,
    onChatDraftChange,
    onChatSend,
    onChatRequireLogin,
    onRequestClose: requestClose,
    onSelectLiveMode,
    shareSupported,
    roomCoverUrl,
    roomCoverLoading,
    roomCoverBusy,
    roomCoverError,
    roomCoverStatus,
    roomCoverInputRef,
    onPickCover: handleRoomCoverPick,
    onOpenCoverPicker: openRoomCoverPicker
  };

  if (useMobileShell) {
    return <LiveMobilePage {...pageProps} shellMode={mobileShellMode} />;
  }

  return <LiveDesktopPage {...pageProps} />;
}
