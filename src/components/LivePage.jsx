import { useEffect, useRef, useState } from "react";
import { useMediaOrientation } from "../hooks/useMediaOrientation.js";
import { useCompactViewport, usePortraitViewport } from "../hooks/useMediaQuery.js";
import { LiveDesktopPage } from "./live/LiveDesktopPage.jsx";
import { LiveMobilePage } from "./live/LiveMobilePage.jsx";
import { createApiError, getAppErrorMessage } from "../lib/appErrors.js";

export function LivePage({
  hidden,
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
  publishQualityOptions,
  publishProtocolOptions,
  selectedCameraId,
  selectedMicrophoneId,
  publishQualityId,
  publishProtocol,
  webRtcPublishUrl,
  webRtcPlaybackUrl,
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
  onPublishQualityChange,
  onPublishProtocolChange,
  onWebRtcPublishUrlChange,
  onWebRtcPlaybackUrlChange,
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

  function requestClose() {
    onRequestClose?.();
  }

  useEffect(() => {
    if (!authUser?.id || hidden) {
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
  }, [authUser?.id, hidden, roomDetails?.coverUrl, roomDetails?.id]);

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

  async function handleRoomTitleSave(title) {
    const response = await fetch("/api/me/room", {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ title }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw createApiError(payload, "room_title_update_failed", { status: response.status });
    }

    onRoomDetailsChange?.(payload.room || null);
    return payload;
  }

  const pageProps = {
    hidden,
    roomLabel,
    roomAvatarUrl,
    shareTarget,
    watchLink,
    publishBlocked,
    publishBlockedReason,
    publishBadge,
    cameraOptions,
    microphoneOptions,
    publishQualityOptions,
    publishProtocolOptions,
    selectedCameraId,
    selectedMicrophoneId,
    publishQualityId,
    publishProtocol,
    webRtcPublishUrl,
    webRtcPlaybackUrl,
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
    onPublishQualityChange,
    onPublishProtocolChange,
    onWebRtcPublishUrlChange,
    onWebRtcPlaybackUrlChange,
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
    onOpenCoverPicker: openRoomCoverPicker,
    roomTitle: roomDetails?.title || "",
    onSaveRoomTitle: handleRoomTitleSave
  };

  if (useMobileShell) {
    return <LiveMobilePage {...pageProps} shellMode={mobileShellMode} />;
  }

  return <LiveDesktopPage {...pageProps} />;
}
