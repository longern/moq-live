import { useEffect, useRef, useState } from "react";
import { useMediaOrientation } from "../hooks/useMediaOrientation.js";
import { useCompactViewport, useMediaQuery, usePortraitViewport } from "../hooks/useMediaQuery.js";
import { useLiveMobileShellMode } from "../hooks/useLiveMobileShellMode.js";
import { LiveDesktopPage } from "./live/LiveDesktopPage.jsx";
import { LiveMobilePage } from "./live/LiveMobilePage.jsx";
import { ToastViewport, useToast } from "./primitives/FloatingToast.jsx";
import { WatchImageShareDialog } from "./watch/WatchSharePanels.jsx";
import { createApiError, getAppErrorMessage } from "../lib/appErrors.js";
import { buildLiveScreenshotShareImage, buildWatchShareImage } from "../lib/shareImage.js";

const IMAGE_SHARE_EXIT_MS = 180;

export function LivePage({
  view = {},
  room = {},
  share = {},
  publish = {},
  media = {},
  settings = {},
  cohost = {},
  chat = {},
  auth = {},
  actions = {},
}) {
  const { hidden } = view;
  const {
    details: roomDetails,
    label: roomLabel,
    avatarUrl: roomAvatarUrl,
    infoBlockedReason: roomInfoBlockedReason = "",
    siteIconUrl = "",
    siteTitle = "",
  } = room;
  const {
    target: shareTarget,
    watchLink,
  } = share;
  const {
    blocked: publishBlocked,
    blockedReason: publishBlockedReason,
    badge: publishBadge,
    isPublishing,
    isStarting = false,
    syntheticPublishing,
  } = publish;
  const {
    cameraOptions,
    microphoneOptions,
    publishQualityOptions,
    publishProtocolOptions,
    selectedCameraId,
    selectedMicrophoneId,
    publishQualityId,
    publishProtocol,
    relayUrl,
    webRtcPublishUrl,
    webRtcPlaybackUrl,
    cameraEnabled,
    microphoneEnabled,
    cameraMode,
    previewActive,
    previewHasVideo,
    previewPending,
    previewSourceType,
    screenShareSupported,
    screenShareActive,
    previewVideoRef,
  } = media;
  const {
    commentSpeechEnabled = false,
    commentSpeechSupported = false,
    liveNotificationEnabled = true,
    locationSharingEnabled = false,
    locationSharingSupported = false,
    locationSharingPending = false,
  } = settings;
  const {
    invitesAllowed: cohostInvitesAllowed = true,
    invite: cohostInvite = null,
    inviteResponse: cohostInviteResponse = null,
    active: cohostActive = null,
    recentHosts: cohostRecentHosts = [],
  } = cohost;
  const {
    messages: chatMessages,
    draft: chatDraft,
    connectionState: chatConnectionState,
    onlineCount: chatOnlineCount,
    loggedInViewers: chatLoggedInViewers = [],
    readOnly: chatReadOnly,
    error: chatError,
    recovering: chatRecovering = false,
    canRetractMessages = false,
    mutedUsers: chatMutedUsers = [],
    moderationEvent: chatModerationEvent = null,
  } = chat;
  const {
    available: authAvailable,
    loading: authLoading,
    user: authUser,
  } = auth;
  const {
    onCameraChange,
    onMicrophoneChange,
    onPublishQualityChange,
    onPublishProtocolChange,
    onRelayUrlChange,
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
    onCommentSpeechEnabledChange,
    onLiveNotificationEnabledChange,
    onLocationSharingEnabledChange,
    onCohostInvitesAllowedChange,
    onCohostDisconnect,
    onCohostInviteRequest,
    onCohostInviteRespond,
    onStartSynthetic,
    onStopSynthetic,
    onChatDraftChange,
    onChatSend,
    onChatMessageMute,
    onChatMessageRetract,
    onChatUserUnmute,
    onChatRequireLogin,
    onRoomDetailsChange,
    onRequestClose,
    onSelectLiveMode,
  } = actions;
  const compactViewport = useCompactViewport();
  const portraitViewport = usePortraitViewport();
  const landscapeSplitViewport = useMediaQuery(
    "(min-width: 601px) and (max-width: 980px) and (orientation: landscape)",
  );
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
  const [shareImageUrl, setShareImageUrl] = useState("");
  const [shareImageLoading, setShareImageLoading] = useState(false);
  const [shareImageKind, setShareImageKind] = useState("poster");
  const [imageShareMounted, setImageShareMounted] = useState(false);
  const [imageShareClosing, setImageShareClosing] = useState(false);
  const roomCoverInputRef = useRef(null);
  const imageShareCloseTimerRef = useRef(null);
  const shareImageRequestIdRef = useRef(0);
  const lastCohostResponseIdRef = useRef("");
  const { clearToast, showToast } = useToast();
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const mediaMode = cameraEnabled ? "video" : "voice";
  const mirrorPreview = previewSourceType === "camera" && cameraMode === "front";
  const useMobileShell = compactViewport || portraitViewport;
  const mobileShellMode = useLiveMobileShellMode({
    cameraEnabled,
    portraitViewport,
    previewActive,
    previewHasVideo,
    previewOrientation,
    previewSourceType,
  });
  const mediaClass = `media-${mediaMode}`;
  const mobileLayoutModeClass = mobileShellMode === "immersive"
    ? "media-layout media-immersive"
    : "media-layout media-portrait-split";
  const mobileLayoutClass = `${mobileLayoutModeClass} ${mediaClass}`;
  const desktopLayoutClass = landscapeSplitViewport ? `media-layout media-landscape-split ${mediaClass}` : mediaClass;

  function requestClose() {
    onRequestClose?.();
  }

  useEffect(() => () => {
    if (imageShareCloseTimerRef.current) {
      clearTimeout(imageShareCloseTimerRef.current);
      imageShareCloseTimerRef.current = null;
    }
  }, []);

  async function writeClipboardText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function copyLiveLink() {
    if (!watchLink) {
      return;
    }

    const copied = await writeClipboardText(watchLink);
    showToast(copied ? "复制成功" : "复制失败");
  }

  async function shareLiveLink() {
    if (!watchLink || !shareSupported || !onShare) {
      return;
    }

    try {
      await onShare();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        console.error("live room share failed", error);
        showToast("分享失败");
      }
    }
  }

  async function getShareImageBlob() {
    if (!shareImageUrl) {
      return null;
    }

    const response = await fetch(shareImageUrl);
    return response.blob();
  }

  function getShareImageFileName() {
    const name = (roomDetails?.title || roomLabel || "直播间")
      .replace(/[\\/:*?"<>|]+/g, "")
      .trim();
    const suffix = shareImageKind === "screenshot" ? "截屏分享图" : "分享图";
    return `${name || "直播间"}${suffix}.png`;
  }

  async function shareLiveImage() {
    if (!shareImageUrl) {
      return;
    }

    try {
      const blob = await getShareImageBlob();
      if (!blob) {
        return;
      }
      const file = new File([blob], getShareImageFileName(), { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: roomDetails?.title || roomLabel,
          text: `${roomLabel || "主播"}的直播间`,
        });
        return;
      }
      await shareLiveLink();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        console.error("live room share image failed", error);
        showToast("分享失败");
      }
    }
  }

  async function copyLiveImage() {
    if (!shareImageUrl || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      showToast("复制失败");
      return;
    }

    try {
      const blob = await getShareImageBlob();
      if (!blob) {
        showToast("复制失败");
        return;
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
        }),
      ]);
      showToast("复制成功");
    } catch (error) {
      console.error("live room share image copy failed", error);
      showToast("复制失败");
    }
  }

  function saveLiveImage() {
    if (!shareImageUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = shareImageUrl;
    link.download = getShareImageFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function closeImageShareModal() {
    shareImageRequestIdRef.current += 1;
    if (imageShareCloseTimerRef.current) {
      clearTimeout(imageShareCloseTimerRef.current);
    }
    setImageShareClosing(true);
    imageShareCloseTimerRef.current = window.setTimeout(() => {
      setImageShareMounted(false);
      setImageShareClosing(false);
      imageShareCloseTimerRef.current = null;
    }, IMAGE_SHARE_EXIT_MS);
  }

  async function openImageShareModal() {
    if (!watchLink) {
      return;
    }

    if (imageShareCloseTimerRef.current) {
      clearTimeout(imageShareCloseTimerRef.current);
      imageShareCloseTimerRef.current = null;
    }
    setImageShareMounted(true);
    setImageShareClosing(false);
    setShareImageKind("poster");
    setShareImageUrl("");
    setShareImageLoading(true);
    const requestId = shareImageRequestIdRef.current + 1;
    shareImageRequestIdRef.current = requestId;

    try {
      const imageUrl = await buildWatchShareImage({
        watchLink,
        roomLabel,
        roomTitle: roomDetails?.title || "",
        hostDisplayName: roomLabel,
        hostAvatarUrl: roomAvatarUrl,
        roomCoverUrl,
        siteIconUrl,
        siteTitle,
      });
      if (shareImageRequestIdRef.current !== requestId) {
        return;
      }
      setShareImageUrl(imageUrl);
    } catch (error) {
      if (shareImageRequestIdRef.current !== requestId) {
        return;
      }
      console.error("live room share image failed", error);
      setImageShareMounted(false);
      showToast("生成失败");
    } finally {
      if (shareImageRequestIdRef.current === requestId) {
        setShareImageLoading(false);
      }
    }
  }

  async function openScreenshotShareModal() {
    if (!watchLink) {
      return;
    }

    if (imageShareCloseTimerRef.current) {
      clearTimeout(imageShareCloseTimerRef.current);
      imageShareCloseTimerRef.current = null;
    }
    setImageShareMounted(true);
    setImageShareClosing(false);
    setShareImageKind("screenshot");
    setShareImageUrl("");
    setShareImageLoading(true);
    const requestId = shareImageRequestIdRef.current + 1;
    shareImageRequestIdRef.current = requestId;

    try {
      const imageUrl = await buildLiveScreenshotShareImage({
        watchLink,
        videoElement: previewVideoRef?.current,
        hostAvatarUrl: roomAvatarUrl,
        siteIconUrl,
        siteTitle,
        mirrorPreview,
      });
      if (shareImageRequestIdRef.current !== requestId) {
        return;
      }
      setShareImageUrl(imageUrl);
    } catch (error) {
      if (shareImageRequestIdRef.current !== requestId) {
        return;
      }
      console.error("live room screenshot share image failed", error);
      setImageShareMounted(false);
      showToast("生成失败");
    } finally {
      if (shareImageRequestIdRef.current === requestId) {
        setShareImageLoading(false);
      }
    }
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
    if (!chatModerationEvent?.id) {
      return;
    }
    if (chatModerationEvent.type === "message.muted") {
      const name = chatModerationEvent.mute?.displayName || "用户";
      showToast(`已禁言 ${name}`);
      return;
    }
    if (chatModerationEvent.type === "message.unmuted") {
      const name = chatModerationEvent.mute?.displayName || "用户";
      showToast(`已解除 ${name} 的禁言`);
    }
  }, [chatModerationEvent?.id, chatModerationEvent?.mute?.displayName, chatModerationEvent?.type]);

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
    view: {
      hidden,
      shareSupported,
    },
    room: {
      label: roomLabel,
      avatarUrl: roomAvatarUrl,
      title: roomDetails?.title || "",
      welcomeMessage: roomDetails?.welcomeMessage || "",
      coverUrl: roomCoverUrl,
      coverLoading: roomCoverLoading,
      coverBusy: roomCoverBusy,
      coverError: roomCoverError,
      coverStatus: roomCoverStatus,
      coverInputRef: roomCoverInputRef,
      infoBlockedReason: roomInfoBlockedReason,
      siteIconUrl,
      siteTitle,
    },
    share: {
      target: shareTarget,
      watchLink,
    },
    publish: {
      blocked: publishBlocked,
      blockedReason: publishBlockedReason,
      badge: publishBadge,
      isPublishing,
      isStarting,
      syntheticPublishing,
    },
    media: {
      cameraOptions,
      microphoneOptions,
      publishQualityOptions,
      publishProtocolOptions,
      selectedCameraId,
      selectedMicrophoneId,
      publishQualityId,
      publishProtocol,
      relayUrl,
      webRtcPublishUrl,
      webRtcPlaybackUrl,
      cameraEnabled,
      mediaMode,
      microphoneEnabled,
      cameraMode,
      previewActive,
      previewHasVideo,
      previewPending,
      previewSourceType,
      screenShareSupported,
      screenShareActive,
      previewVideoRef,
      mirrorPreview,
    },
    settings: {
      commentSpeechEnabled,
      commentSpeechSupported,
      liveNotificationEnabled,
      locationSharingEnabled,
      locationSharingSupported,
      locationSharingPending,
    },
    cohost: {
      invitesAllowed: cohostInvitesAllowed,
      invite: cohostInvite,
      active: cohostActive,
      recentHosts: cohostRecentHosts,
    },
    chat: {
      messages: chatMessages,
      draft: chatDraft,
      connectionState: chatConnectionState,
      onlineCount: chatOnlineCount,
      loggedInViewers: chatLoggedInViewers,
      readOnly: chatReadOnly,
      error: chatError,
      recovering: chatRecovering,
      canRetractMessages,
      mutedUsers: chatMutedUsers,
    },
    auth: {
      available: authAvailable,
      loading: authLoading,
      user: authUser,
    },
    actions: {
      onCameraChange,
      onMicrophoneChange,
      onPublishQualityChange,
      onPublishProtocolChange,
      onRelayUrlChange,
      onWebRtcPublishUrlChange,
      onWebRtcPlaybackUrlChange,
      onCycleCamera,
      onToggleMicrophone,
      onTogglePublish,
      onStartPublish,
      onStopPublish,
      onShare: shareLiveLink,
      onCopyShareLink: copyLiveLink,
      onOpenImageShare: openImageShareModal,
      onOpenScreenshotShare: openScreenshotShareModal,
      onStartScreenShare,
      onStopScreenShare,
      onCommentSpeechEnabledChange,
      onLiveNotificationEnabledChange,
      onLocationSharingEnabledChange,
      onCohostInvitesAllowedChange,
      onCohostDisconnect,
      onCohostInviteRequest: handleCohostInviteRequest,
      onCohostInviteRespond: handleCohostInviteRespond,
      onStartSynthetic,
      onStopSynthetic,
      onChatDraftChange,
      onChatSend,
      onChatMessageMute,
      onChatMessageRetract,
      onChatUserUnmute,
      onChatRequireLogin,
      onRequestClose: requestClose,
      onSelectLiveMode,
      onPickCover: handleRoomCoverPick,
      onOpenCoverPicker: openRoomCoverPicker,
      onSaveRoomTitle: handleRoomTitleSave,
      onSaveRoomWelcomeMessage: handleRoomWelcomeMessageSave,
      onRoomInfoBlocked: clearToast,
    },
  };

  if (useMobileShell) {
    return (
      <>
        <LiveMobilePage
          {...pageProps}
          view={{ ...pageProps.view, layoutClassName: mobileLayoutClass, shellMode: mobileShellMode }}
        />
        {hidden ? null : <ToastViewport className="live-page-toast live-page-toast-mobile" message={roomInfoBlockedReason} />}
        {imageShareMounted ? (
          <WatchImageShareDialog
            imageShareClosing={imageShareClosing}
            imageShareReady={Boolean(shareImageUrl && !shareImageLoading)}
            imageShareTitle={shareImageKind === "screenshot" ? "截屏分享" : "图片分享"}
            onClose={closeImageShareModal}
            onCopyImage={copyLiveImage}
            onSaveImage={saveLiveImage}
            onShareImage={shareLiveImage}
            roomLabel={roomLabel}
            shareImageAlt={shareImageKind === "screenshot" ? `${roomLabel}直播间截屏分享图` : undefined}
            shareImageLoading={shareImageLoading}
            shareImageUrl={shareImageUrl}
            shareSupported={shareSupported}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <LiveDesktopPage {...pageProps} view={{ ...pageProps.view, layoutClassName: desktopLayoutClass }} />
      {hidden ? null : <ToastViewport className="live-page-toast live-page-toast-desktop" message={roomInfoBlockedReason} />}
      {imageShareMounted ? (
        <WatchImageShareDialog
          imageShareClosing={imageShareClosing}
          imageShareReady={Boolean(shareImageUrl && !shareImageLoading)}
          imageShareTitle={shareImageKind === "screenshot" ? "截屏分享" : "图片分享"}
          onClose={closeImageShareModal}
          onCopyImage={copyLiveImage}
          onSaveImage={saveLiveImage}
          onShareImage={shareLiveImage}
          roomLabel={roomLabel}
          shareImageAlt={shareImageKind === "screenshot" ? `${roomLabel}直播间截屏分享图` : undefined}
          shareImageLoading={shareImageLoading}
          shareImageUrl={shareImageUrl}
          shareSupported={shareSupported}
        />
      ) : null}
    </>
  );
}
