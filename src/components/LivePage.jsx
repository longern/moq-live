import { useEffect, useRef, useState } from "react";
import { useMediaOrientation } from "../hooks/useMediaOrientation.js";
import { useCompactViewport, usePortraitViewport } from "../hooks/useMediaQuery.js";
import { useLiveMobileShellMode } from "../hooks/useLiveMobileShellMode.js";
import { LiveDesktopPage } from "./live/LiveDesktopPage.jsx";
import { LiveMobilePage } from "./live/LiveMobilePage.jsx";
import { FloatingToastPresence } from "./FloatingToast.jsx";
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
  roomInfoBlockedReason = "",
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
  commentSpeechEnabled = false,
  commentSpeechSupported = false,
  onCommentSpeechEnabledChange,
  locationSharingEnabled = false,
  locationSharingSupported = false,
  locationSharingPending = false,
  onLocationSharingEnabledChange,
  cohostInvitesAllowed = true,
  cohostInvite = null,
  cohostInviteResponse = null,
  cohostActive = null,
  cohostRecentHosts = [],
  onCohostInvitesAllowedChange,
  onCohostInviteRequest,
  onCohostInviteRespond,
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
    includeTrackSettings: false,
    includeClientSize: false,
    resetOnInactive: false,
  });
  const [roomCoverUrl, setRoomCoverUrl] = useState("");
  const [roomCoverLoading, setRoomCoverLoading] = useState(false);
  const [roomCoverBusy, setRoomCoverBusy] = useState(false);
  const [roomCoverError, setRoomCoverError] = useState("");
  const [roomCoverStatus, setRoomCoverStatus] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const roomCoverInputRef = useRef(null);
  const toastTimerRef = useRef(null);
  const lastCohostResponseIdRef = useRef("");
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const mediaMode = cameraEnabled ? "video" : "voice";
  const mirrorPreview = previewSourceType === "camera" && cameraMode === "front";
  const useMobileShell = compactViewport || portraitViewport;
  const mobileShellMode = useLiveMobileShellMode({
    cameraEnabled,
    isPublishing,
    isStarting,
    portraitViewport,
    previewActive,
    previewHasVideo,
    previewOrientation,
    previewPending,
    previewSourceType,
  });

  function requestClose() {
    onRequestClose?.();
  }

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  function showToast(message) {
    if (!message) {
      return;
    }
    if (message === roomInfoBlockedReason) {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setToastMessage("");
      return;
    }
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, 2200);
  }

  useEffect(() => {
    if (!cohostInviteResponse?.id || lastCohostResponseIdRef.current === cohostInviteResponse.id) {
      return;
    }

    lastCohostResponseIdRef.current = cohostInviteResponse.id;
    const name = cohostInviteResponse.target?.displayName || cohostInviteResponse.target?.handle || "对方";
    showToast(cohostInviteResponse.accepted ? `${name}已接受连线` : `${name}已拒绝连线`);
  }, [cohostInviteResponse?.accepted, cohostInviteResponse?.id, cohostInviteResponse?.target]);

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
    if (roomInfoBlockedReason) {
      showToast(roomInfoBlockedReason);
      return;
    }
    roomCoverInputRef.current?.click();
  }

  async function handleRoomCoverPick(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }
    if (roomInfoBlockedReason) {
      showToast(roomInfoBlockedReason);
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
    if (roomInfoBlockedReason) {
      showToast(roomInfoBlockedReason);
      return null;
    }

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

  async function handleRoomWelcomeMessageSave(welcomeMessage) {
    if (roomInfoBlockedReason) {
      showToast(roomInfoBlockedReason);
      return null;
    }

    const response = await fetch("/api/me/room", {
      method: "PATCH",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ welcomeMessage }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw createApiError(payload, "room_welcome_update_failed", { status: response.status });
    }

    onRoomDetailsChange?.(payload.room || null);
    return payload;
  }

  async function handleCohostInviteRequest(handle) {
    try {
      await onCohostInviteRequest?.(handle);
      showToast("连线邀请已发送");
      return true;
    } catch (error) {
      showToast(error?.message || getAppErrorMessage(error));
      return false;
    }
  }

  async function handleCohostInviteRespond(invite, accepted) {
    try {
      await onCohostInviteRespond?.(invite, accepted);
      showToast(accepted ? "已接受连线邀请" : "已拒绝连线邀请");
      return true;
    } catch (error) {
      showToast(getAppErrorMessage(error));
      return false;
    }
  }

  const pageProps = {
    hidden,
    roomLabel,
    roomAvatarUrl,
    shareTarget,
    watchLink,
    publishBlocked,
    publishBlockedReason,
    roomInfoBlockedReason,
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
    commentSpeechEnabled,
    commentSpeechSupported,
    onCommentSpeechEnabledChange,
    locationSharingEnabled,
    locationSharingSupported,
    locationSharingPending,
    onLocationSharingEnabledChange,
    cohostInvitesAllowed,
    cohostInvite,
    cohostActive,
    cohostRecentHosts,
    onCohostInvitesAllowedChange,
    onCohostInviteRequest: handleCohostInviteRequest,
    onCohostInviteRespond: handleCohostInviteRespond,
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
    roomWelcomeMessage: roomDetails?.welcomeMessage || "",
    onSaveRoomTitle: handleRoomTitleSave,
    onSaveRoomWelcomeMessage: handleRoomWelcomeMessageSave,
    onRoomInfoBlocked: () => showToast(roomInfoBlockedReason)
  };
  const visibleToastMessage = roomInfoBlockedReason || toastMessage;

  if (useMobileShell) {
    return (
      <>
        <LiveMobilePage {...pageProps} shellMode={mobileShellMode} />
        <FloatingToastPresence className="live-page-toast live-page-toast-mobile">{visibleToastMessage}</FloatingToastPresence>
      </>
    );
  }

  return (
    <>
      <LiveDesktopPage {...pageProps} />
      <FloatingToastPresence className="live-page-toast live-page-toast-desktop">{visibleToastMessage}</FloatingToastPresence>
    </>
  );
}
