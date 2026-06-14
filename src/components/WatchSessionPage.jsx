import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  Share,
  MoreHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ChatPanel } from "./ChatPanel.jsx";
import { ToastViewport, useToast } from "./FloatingToast.jsx";
import { LoadingSpinner } from "./LoadingSpinner.jsx";
import { StatusPill } from "./StatusPill.jsx";
import { UserAvatar } from "./UserAvatar.jsx";
import {
  WatchAudienceSheet,
  WatchHostProfileContent,
  WatchHostProfileSheet,
  WatchMobileMoreSheet,
} from "./watch/WatchSessionSheets.jsx";
import { WatchHostProfileActions } from "./watch/WatchHostProfileActions.jsx";
import { WatchMobileHud } from "./watch/WatchMobileHud.jsx";
import {
  WatchDesktopSharePanel,
  WatchImageShareDialog,
} from "./watch/WatchSharePanels.jsx";
import { formatAudienceCount } from "../lib/audience.js";
import {
  isPortraitMedia,
  shouldUsePortraitImmersiveMode,
} from "../lib/mediaLayout.js";
import { buildWatchShareImage } from "../lib/shareImage.js";
import { STREAM_PROTOCOL_WEBRTC } from "../lib/streamProtocol.js";
import {
  buildHostLocationLabel,
  buildHostProfileInfoItems,
  getViewerPosition,
  getWatchPlayerTileClassName,
  getWatchStageLayout,
} from "../lib/watchSession.js";
import { getWatchStageView } from "../lib/watchStageView.js";
import { usePortraitViewport } from "../hooks/useMediaQuery.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

const WatchTestCanvas = import.meta.env.DEV
  ? lazy(() => import("./WatchTestCanvas.jsx").then((module) => ({ default: module.WatchTestCanvas })))
  : null;

const IMAGE_SHARE_EXIT_MS = 180;

export function WatchSessionPage({
  hidden,
  roomLabel,
  roomTitle,
  welcomeMessage,
  siteTitle,
  host = {},
  media = {},
  player = {},
  cohost = {},
  auth = {},
  chat = {},
  actions = {},
  testPlayback
}) {
  const { t } = useI18n();
  const {
    userId: hostUserId,
    handle: hostHandle,
    displayName: hostDisplayName,
    avatarUrl: hostAvatarUrl,
    gender: hostGender = "",
    birthDate: hostBirthDate = "",
    bio: hostBio = "",
    locationProvince: hostLocationProvince = t("profile.locationUnknown"),
    locationAvailable: hostLocationAvailable = false,
    distanceAvailable: hostDistanceAvailable = hostLocationAvailable,
    locationUpdatedAt: hostLocationUpdatedAt = "",
    followerCount: hostFollowerCount = 0,
    followingCount: hostFollowingCount = 0,
    icon: hostIcon,
    following: hostFollowing = false,
    followLoading: hostFollowLoading = false,
    followBusy: hostFollowBusy = false,
    notifyLiveStarted: hostNotifyLiveStarted = false,
    notifyBusy: hostNotifyBusy = false,
  } = host;
  const {
    roomCoverUrl,
    siteIconUrl,
    watchLink,
    stageLoading,
    stageMessage,
  } = media;
  const {
    statusMessage: playerStatusMessage,
    statusKind: playerStatusKind = "idle",
    badge: playerBadge,
    fullscreenActive,
    paused: playerPaused,
    muted: playerMuted,
    showTapToUnmute,
    orientation: playerOrientation,
    stageRef,
    session: playerSession,
    started: playerStarted = false,
    freezeFrameUrl: playerFreezeFrameUrl = "",
    ref: playerRef,
  } = player;
  const {
    active: cohostActive = null,
    session: cohostPlayerSession = null,
    started: cohostPlayerStarted = false,
    muted: cohostPlayerMuted = true,
    ref: cohostPlayerRef,
    status: cohostPlayerStatus = "",
    badge: cohostPlayerBadge = { state: "idle" },
    orientation: cohostPlayerOrientation,
  } = cohost;
  const {
    available: authAvailable,
    loading: authLoading,
    user: authUser,
  } = auth;
  const {
    room: chatRoom,
    roomLabel: chatRoomLabel,
    messages: chatMessages,
    draft: chatDraft,
    connectionState: chatConnectionState,
    onlineCount: chatOnlineCount,
    loggedInViewers: chatLoggedInViewers = [],
    readOnly: chatReadOnly,
    error: chatError,
    recovering: chatRecovering = false,
  } = chat;
  const {
    onStop,
    onTogglePlayback,
    onToggleMute,
    onDismissTapToUnmute,
    onFullscreen,
    onHostFollowToggle,
    onHostNotifyLiveToggle,
    onChatDraftChange,
    onChatSend,
    onChatRequireLogin,
  } = actions;
  const [controlsVisible, setControlsVisible] = useState(false);
  const [immersiveControlsHidden, setImmersiveControlsHidden] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hostProfileOpen, setHostProfileOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [elementPipSupported, setElementPipSupported] = useState(false);
  const [videoPipSupported, setVideoPipSupported] = useState(false);
  const [pictureInPictureActive, setPictureInPictureActive] = useState(false);
  const [imageShareMounted, setImageShareMounted] = useState(false);
  const [imageShareClosing, setImageShareClosing] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState("");
  const [shareImageLoading, setShareImageLoading] = useState(false);
  const [hostDistanceText, setHostDistanceText] = useState("");
  const [hostDistancePending, setHostDistancePending] = useState(false);
  const [viewerLocationPermission, setViewerLocationPermission] = useState("checking");
  const [shareMenuMounted, setShareMenuMounted] = useState(false);
  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  const [shareMenuPosition, setShareMenuPosition] = useState({ left: 0, top: 0 });
  const hideTimerRef = useRef(null);
  const touchModeRef = useRef(false);
  const shareCloseTimerRef = useRef(null);
  const shareOpenFrameRef = useRef(null);
  const imageShareCloseTimerRef = useRef(null);
  const shareButtonRef = useRef(null);
  const pipWindowRef = useRef(null);
  const pipPlaceholderRef = useRef(null);
  const pipVideoRef = useRef(null);
  const pipVideoStreamRef = useRef(null);
  const hostDistanceRequestRef = useRef(0);
  const hostDistanceAutoKeyRef = useRef("");
  const { showToast } = useToast();
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const portraitViewport = usePortraitViewport();
  const portraitMedia = isPortraitMedia(playerOrientation);
  const immersivePortrait = shouldUsePortraitImmersiveMode({
    mediaOrientation: playerOrientation,
    portraitViewport,
  });
  const audienceCountText = formatAudienceCount(chatOnlineCount);
  const hostFollowerCountText = formatAudienceCount(hostFollowerCount);
  const hostFollowingCountText = formatAudienceCount(hostFollowingCount);
  const loggedInViewers = Array.isArray(chatLoggedInViewers) ? chatLoggedInViewers : [];
  const hostChipLabel = hostDisplayName || roomTitle || roomLabel;
  const imageShareReady = Boolean(shareImageUrl && !shareImageLoading);
  const hostProfileInfoItems = buildHostProfileInfoItems({
    gender: hostGender,
    birthDate: hostBirthDate,
    province: hostLocationProvince,
    distanceText: hostDistanceText,
    t,
  });
  const hostLocationClickable = Boolean(
    hostDistanceAvailable
    && hostLocationAvailable
    && viewerLocationPermission !== "granted"
    && viewerLocationPermission !== "checking"
  );
  const showHostFollowButton = Boolean(hostUserId && authUser?.id !== hostUserId);
  const showCohostLayout = Boolean(cohostActive && (cohostPlayerSession || cohostPlayerBadge.state === "warm"));
  const immersiveShell = immersivePortrait || (portraitViewport && showCohostLayout);
  const stageLayout = getWatchStageLayout({
    cohost: showCohostLayout,
    portrait: portraitMedia,
  });
  const immersiveStage = stageLayout === "single-portrait" || stageLayout === "cohost";
  const stageClassName = [
    "stage-frame",
    "watch-stage-frame",
    controlsVisible ? "controls-visible" : "",
    immersiveStage ? "is-immersive-stage" : "",
    stageLayout === "single-portrait" ? "is-portrait" : "",
    stageLayout === "cohost" ? "is-cohost-stage" : "",
  ].filter(Boolean).join(" ");
  const stageView = getWatchStageView({
    playerSession,
    playerStarted,
    playerStatusMessage,
    playerStatusKind,
    playerBadgeState: playerBadge.state,
    stageLoading,
    stageMessage,
  });

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

  useEffect(() => {
    touchModeRef.current = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    setElementPipSupported(
      typeof window.documentPictureInPicture?.requestWindow === "function"
    );
    setVideoPipSupported(
      Boolean(
        document.pictureInPictureEnabled &&
        typeof HTMLVideoElement !== "undefined" &&
        typeof HTMLVideoElement.prototype.requestPictureInPicture === "function"
      )
    );
  }, []);

  useEffect(() => () => {
    if (shareCloseTimerRef.current) {
      clearTimeout(shareCloseTimerRef.current);
    }
    if (shareOpenFrameRef.current) {
      cancelAnimationFrame(shareOpenFrameRef.current);
    }
    if (imageShareCloseTimerRef.current) {
      clearTimeout(imageShareCloseTimerRef.current);
    }
    restoreElementPictureInPicture();
    restoreVideoPictureInPicture();
  }, []);

  useEffect(() => {
    hostDistanceRequestRef.current += 1;
    hostDistanceAutoKeyRef.current = "";
    setHostDistanceText("");
    setHostDistancePending(false);
    setViewerLocationPermission("checking");
  }, [chatRoom, hostDistanceAvailable, hostLocationAvailable, hostLocationUpdatedAt]);

  useEffect(() => {
    if (!hostProfileOpen) {
      return undefined;
    }

    if (
      typeof navigator === "undefined"
      || !navigator.permissions
      || typeof navigator.permissions.query !== "function"
    ) {
      setViewerLocationPermission("prompt");
      return undefined;
    }

    let cancelled = false;
    void navigator.permissions.query({ name: "geolocation" }).then((permissionStatus) => {
      if (cancelled) {
        return;
      }

      const syncPermission = () => {
        setViewerLocationPermission(permissionStatus.state);
      };
      syncPermission();
      permissionStatus.onchange = syncPermission;

      if (permissionStatus.state !== "granted") {
        return;
      }

      if (!hostDistanceAvailable || !hostLocationAvailable || !chatRoom) {
        return;
      }

      const locationKey = `${chatRoom}:${hostLocationUpdatedAt || "location"}`;
      if (hostDistanceAutoKeyRef.current === locationKey) {
        return;
      }

      hostDistanceAutoKeyRef.current = locationKey;
      void requestHostDistance({ userInitiated: false });
    }).catch(() => {
      if (!cancelled) {
        setViewerLocationPermission("prompt");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chatRoom, hostDistanceAvailable, hostLocationAvailable, hostLocationUpdatedAt, hostProfileOpen]);

  async function requestHostDistance({ userInitiated = false } = {}) {
    if (!hostLocationAvailable || !chatRoom) {
      if (userInitiated) {
        showToast("主播位置未知");
      }
      return false;
    }
    if (!hostDistanceAvailable) {
      if (userInitiated) {
        showToast("主播未开播，暂不可查看距离");
      }
      return false;
    }

    const requestId = hostDistanceRequestRef.current + 1;
    hostDistanceRequestRef.current = requestId;
    setHostDistancePending(true);
    try {
      const position = await getViewerPosition();
      if (hostDistanceRequestRef.current !== requestId) {
        return false;
      }

      const response = await fetch(`/api/chat/${encodeURIComponent(chatRoom)}/location/distance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        if (payload.code === "location_unavailable" || payload.code === "distance_unavailable") {
          setHostDistanceText("");
          if (userInitiated) {
            showToast(payload.code === "distance_unavailable" ? "主播未开播，暂不可查看距离" : "主播位置未知");
          }
          return false;
        }
        throw new Error(payload.error || payload.code || "location distance failed");
      }

      setHostDistanceText(String(payload.distanceText || "").trim());
      return true;
    } catch (error) {
      if (userInitiated) {
        showToast("无法获取你的位置");
      }
      return false;
    } finally {
      if (hostDistanceRequestRef.current === requestId) {
        setHostDistancePending(false);
      }
    }
  }

  async function handleHostLocationClick() {
    await requestHostDistance({ userInitiated: true });
  }

  async function writeClipboardText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    if (!playerSession || playerBadge.state === "error") {
      hideControls();
      setImmersiveControlsHidden(false);
      return;
    }

    if (immersiveShell) {
      hideControls();
      setImmersiveControlsHidden(false);
      return;
    }

    if (touchModeRef.current) {
      scheduleHide(2200);
      return;
    }

    setControlsVisible(true);
    scheduleHide();

    return () => {
      clearHideTimer();
    };
  }, [immersiveShell, playerSession, playerBadge.state]);

  function revealControls() {
    if (!playerSession || playerBadge.state === "error") {
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
    if (!touchModeRef.current || !playerSession || playerBadge.state === "error") {
      return;
    }
    if (immersiveShell) {
      clearHideTimer();
      setImmersiveControlsHidden((current) => !current);
      return;
    }
    if (controlsVisible) {
      hideControls();
      return;
    }
    revealControls();
  }

  function openMoreSheet() {
    setMoreOpen(true);
  }

  function closeMoreSheet() {
    setMoreOpen(false);
  }

  function openHostProfile(event) {
    event?.stopPropagation();
    setHostProfileOpen(true);
  }

  function closeHostProfile() {
    setHostProfileOpen(false);
  }

  async function copyHostHandle(handleValue) {
    const normalizedHandle = String(handleValue || "").trim();
    if (!normalizedHandle) {
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedHandle);
      showToast("主播号复制成功");
    } catch {
      showToast("复制失败");
    }
  }

  function renderHostFollowButton(className = "") {
    if (!showHostFollowButton || authLoading || hostFollowLoading) {
      return null;
    }

    return (
      <button
        type="button"
        className={`watch-host-follow-button${hostFollowing ? " is-following" : " is-primary"}${className ? ` ${className}` : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onHostFollowToggle?.();
        }}
        disabled={hostFollowBusy || !authAvailable}
        aria-pressed={authUser ? hostFollowing : undefined}
      >
        {hostFollowing ? "已关注" : "关注"}
      </button>
    );
  }

  function renderHostProfileActions() {
    return (
      <WatchHostProfileActions
        authAvailable={authAvailable}
        followButton={renderHostFollowButton("watch-host-follow-button-profile")}
        followBusy={hostFollowBusy}
        following={hostFollowing}
        notifyBusy={hostNotifyBusy}
        notifyLiveStarted={hostNotifyLiveStarted}
        onNotifyLiveToggle={onHostNotifyLiveToggle}
      />
    );
  }

  function openAudienceSheet() {
    setAudienceOpen(true);
  }

  function closeAudienceSheet() {
    setAudienceOpen(false);
  }

  function positionShareMenu() {
    const button = shareButtonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const panelWidth = 248;
    const panelHeight = 150;
    const gap = 8;
    const margin = 12;
    const left = Math.min(
      Math.max(rect.right - panelWidth, margin),
      window.innerWidth - panelWidth - margin
    );
    let top = rect.bottom + gap;
    if (top + panelHeight > window.innerHeight - margin) {
      top = rect.top - panelHeight - gap;
    }
    setShareMenuPosition({
      left,
      top: Math.max(margin, top)
    });
  }

  function openShareMenu() {
    if (shareCloseTimerRef.current) {
      clearTimeout(shareCloseTimerRef.current);
      shareCloseTimerRef.current = null;
    }
    if (shareOpenFrameRef.current) {
      cancelAnimationFrame(shareOpenFrameRef.current);
      shareOpenFrameRef.current = null;
    }
    positionShareMenu();
    setShareMenuMounted(true);
    setShareMenuVisible(false);
    shareOpenFrameRef.current = requestAnimationFrame(() => {
      positionShareMenu();
      setShareMenuVisible(true);
      shareOpenFrameRef.current = null;
    });
  }

  function closeShareMenu() {
    if (shareOpenFrameRef.current) {
      cancelAnimationFrame(shareOpenFrameRef.current);
      shareOpenFrameRef.current = null;
    }
    setShareMenuVisible(false);
    if (shareCloseTimerRef.current) {
      clearTimeout(shareCloseTimerRef.current);
    }
    shareCloseTimerRef.current = window.setTimeout(() => {
      setShareMenuMounted(false);
      shareCloseTimerRef.current = null;
    }, 180);
  }

  async function copyWatchLink() {
    if (!watchLink) {
      closeShareMenu();
      return;
    }
    const copied = await writeClipboardText(watchLink);
    if (copied) {
      showToast("复制成功");
    }
    closeShareMenu();
  }

  async function shareWatchLink() {
    if (!watchLink || !shareSupported) {
      closeShareMenu();
      return;
    }
    try {
      await navigator.share({
        title: roomTitle || roomLabel,
        text: `${hostDisplayName || roomLabel}的直播间`,
        url: watchLink
      });
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        console.error("watch room share failed", error);
      }
    } finally {
      closeShareMenu();
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
    const name = (roomTitle || roomLabel || "直播间")
      .replace(/[\\/:*?"<>|]+/g, "")
      .trim();
    return `${name || "直播间"}分享图.png`;
  }

  async function shareWatchImage() {
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
          title: roomTitle || roomLabel,
          text: `${hostDisplayName || roomLabel}的直播间`,
        });
        return;
      }
      await shareWatchLink();
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) {
        console.error("watch room share image failed", error);
        showToast("分享失败");
      }
    }
  }

  async function copyWatchImage() {
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
      console.error("watch room share image copy failed", error);
      showToast("复制失败");
    }
  }

  function saveWatchImage() {
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
      closeShareMenu();
      closeMoreSheet();
      return;
    }

    closeShareMenu();
    closeMoreSheet();
    if (imageShareCloseTimerRef.current) {
      clearTimeout(imageShareCloseTimerRef.current);
      imageShareCloseTimerRef.current = null;
    }
    setImageShareMounted(true);
    setImageShareClosing(false);
    setShareImageUrl("");
    setShareImageLoading(true);

    try {
      const imageUrl = await buildWatchShareImage({
        watchLink,
        roomLabel,
        roomTitle,
        hostDisplayName,
        hostAvatarUrl,
        roomCoverUrl,
        siteIconUrl,
        siteTitle,
      });
      setShareImageUrl(imageUrl);
    } catch (error) {
      console.error("watch room share image failed", error);
      setImageShareOpen(false);
      showToast("生成失败");
    } finally {
      setShareImageLoading(false);
    }
  }

  function copyStyleSheetsToPictureInPicture(pipWindow) {
    const pipHead = pipWindow.document.head;
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      pipHead.appendChild(node.cloneNode(true));
    });
  }

  function restoreElementPictureInPicture() {
    const pipWindow = pipWindowRef.current;
    const placeholder = pipPlaceholderRef.current;
    const stageEl = stageRef?.current;

    if (placeholder?.parentNode && stageEl) {
      placeholder.parentNode.insertBefore(stageEl, placeholder);
      placeholder.remove();
    }

    pipPlaceholderRef.current = null;
    pipWindowRef.current = null;
    setPictureInPictureActive(false);

    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
    }
  }

  async function restoreVideoPictureInPicture() {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch (error) {
      console.error("video picture-in-picture restore failed", error);
    }

    cleanupVideoPictureInPicture();
  }

  function cleanupVideoPictureInPicture() {
    const pipVideo = pipVideoRef.current;
    const pipVideoStream = pipVideoStreamRef.current;

    if (pipVideoStream) {
      pipVideoStream.getTracks().forEach((track) => track.stop());
    }

    if (pipVideo) {
      pipVideo.pause();
      pipVideo.removeAttribute("src");
      pipVideo.srcObject = null;
      pipVideo.remove();
    }

    pipVideoRef.current = null;
    pipVideoStreamRef.current = null;
    setPictureInPictureActive(false);
  }

  function createCanvasPictureInPictureVideo(canvasEl) {
    if (typeof canvasEl.captureStream !== "function") {
      return null;
    }

    const stream = canvasEl.captureStream(30);
    const pipVideo = document.createElement("video");
    pipVideo.autoplay = true;
    pipVideo.muted = true;
    pipVideo.playsInline = true;
    pipVideo.srcObject = stream;
    pipVideo.style.position = "fixed";
    pipVideo.style.left = "0";
    pipVideo.style.bottom = "0";
    pipVideo.style.width = "1px";
    pipVideo.style.height = "1px";
    pipVideo.style.opacity = "0";
    pipVideo.style.pointerEvents = "none";
    document.body.appendChild(pipVideo);
    pipVideoRef.current = pipVideo;
    pipVideoStreamRef.current = stream;
    return pipVideo;
  }

  function getVideoPictureInPictureElement() {
    const playerEl = playerRef?.current;

    if (typeof HTMLVideoElement !== "undefined" && playerEl instanceof HTMLVideoElement) {
      return playerEl;
    }

    if (typeof HTMLCanvasElement !== "undefined" && playerEl instanceof HTMLCanvasElement) {
      return createCanvasPictureInPictureVideo(playerEl);
    }

    return null;
  }

  async function openVideoPictureInPicture() {
    if (
      !document.pictureInPictureEnabled ||
      typeof HTMLVideoElement === "undefined" ||
      typeof HTMLVideoElement.prototype.requestPictureInPicture !== "function"
    ) {
      return false;
    }

    try {
      const pipVideo = getVideoPictureInPictureElement();
      if (!pipVideo) {
        return false;
      }
      await pipVideo.play();
      pipVideo.addEventListener("leavepictureinpicture", cleanupVideoPictureInPicture, { once: true });
      await pipVideo.requestPictureInPicture();
      setPictureInPictureActive(true);
      return true;
    } catch (error) {
      console.error("video picture-in-picture failed", error);
      cleanupVideoPictureInPicture();
      return false;
    }
  }

  async function openElementPictureInPicture() {
    const stageEl = stageRef?.current;
    const requestWindow = window.documentPictureInPicture?.requestWindow;

    if (!stageEl || typeof requestWindow !== "function") {
      return false;
    }

    try {
      const rect = stageEl.getBoundingClientRect();
      const pipWindow = await requestWindow.call(window.documentPictureInPicture, {
        width: Math.round(Math.min(Math.max(rect.width || 360, 320), 720)),
        height: Math.round(Math.min(Math.max(rect.height || 240, 240), 540)),
      });
      const placeholder = document.createComment("watch-stage-picture-in-picture-placeholder");
      stageEl.parentNode?.insertBefore(placeholder, stageEl);

      pipWindowRef.current = pipWindow;
      pipPlaceholderRef.current = placeholder;

      copyStyleSheetsToPictureInPicture(pipWindow);
      pipWindow.document.body.className = "watch-element-pip-body";
      pipWindow.document.body.appendChild(stageEl);
      pipWindow.addEventListener("pagehide", restoreElementPictureInPicture, { once: true });
      setPictureInPictureActive(true);
      return true;
    } catch (error) {
      console.error("element picture-in-picture failed", error);
      restoreElementPictureInPicture();
      return false;
    }
  }

  async function openPictureInPicture() {
    if (pictureInPictureActive) {
      restoreElementPictureInPicture();
      await restoreVideoPictureInPicture();
      closeMoreSheet();
      return;
    }

    try {
      const openedElementPip = await openElementPictureInPicture();
      if (!openedElementPip) {
        await openVideoPictureInPicture();
      }
    } finally {
      closeMoreSheet();
    }
  }

  useEffect(() => {
    if (!shareMenuMounted) {
      return;
    }

    function updatePosition() {
      positionShareMenu();
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [shareMenuMounted]);

  function renderMobileMoreButton(className = "watch-composer-more-mobile") {
    return (
      <button
        type="button"
        className={`chat-composer-more watch-composer-more${moreOpen ? " is-active" : ""}${className ? ` ${className}` : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          openMoreSheet();
        }}
        aria-label="更多操作"
        aria-expanded={moreOpen}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
    );
  }

  function renderMobileHud(className = "", persistent = false) {
    const visible = immersiveShell
      ? !immersiveControlsHidden || playerBadge.state === "error"
      : persistent || controlsVisible || playerBadge.state === "error";

    return (
      <WatchMobileHud
        audienceCountText={audienceCountText}
        className={className}
        followButton={renderHostFollowButton("watch-host-follow-button-mobile")}
        hostAvatarUrl={hostAvatarUrl}
        hostChipLabel={hostChipLabel}
        hostProfileOpen={hostProfileOpen}
        onOpenAudienceSheet={openAudienceSheet}
        onOpenHostProfile={openHostProfile}
        onOpenMoreSheet={openMoreSheet}
        onStop={onStop}
        showMoreButton={false}
        visible={visible}
      />
    );
  }

  return (
    <section
      className="page page-immersive"
      data-page="watch"
      data-joined="true"
      data-immersive={immersiveShell ? "true" : "false"}
      hidden={hidden}
    >
      <div className="page-grid watch-layout">
        <section className="stage-column">
          {!immersiveShell ? renderMobileHud("stage-mobile-hud-top", true) : null}
          <div
            ref={stageRef}
            className={stageClassName}
            onMouseMove={handleStagePointerMove}
            onMouseLeave={handleStagePointerLeave}
            onClick={handleStageClick}
          >
            <div id="playerMount" className={showCohostLayout ? "watch-player-mount is-cohost" : "watch-player-mount"}>
              <div className={getWatchPlayerTileClassName({
                loading: stageView.showInitialPlaybackSpinner,
                orientation: playerOrientation,
              })}>
                <div className="watch-player-media">
                  {playerSession && testPlayback && WatchTestCanvas ? (
                    <Suspense fallback={null}>
                      <WatchTestCanvas
                        playback={testPlayback}
                        playerRef={playerRef}
                        playerSession={playerSession}
                      />
                    </Suspense>
                  ) : playerSession ? (
                    playerSession.protocol === STREAM_PROTOCOL_WEBRTC ? (
                      <video
                        ref={playerRef}
                        className="player-webrtc"
                        autoPlay
                        playsInline
                        muted={playerMuted}
                        aria-label={`${hostDisplayName || hostChipLabel} 直播画面`}
                      />
                    ) : (
                      <canvas
                        ref={playerRef}
                        className="player-moq"
                        width="1280"
                        height="720"
                        aria-label={`${playerSession.namespace} 直播画面`}
                      />
                    )
                  ) : (
                    <div className="placeholder">
                      {stageView.placeholderLoading ? (
                        <LoadingSpinner className="stage-loading-spinner" />
                      ) : stageView.placeholderMessage ? (
                        <p>{stageView.placeholderMessage}</p>
                      ) : null}
                    </div>
                  )}
                  {stageView.showInitialPlaybackSpinner ? (
                    <div className="placeholder stage-first-frame-loading" aria-hidden="true">
                      <LoadingSpinner className="stage-loading-spinner" />
                    </div>
                  ) : null}
                  {showCohostLayout ? <span className="watch-player-label">{hostDisplayName || hostChipLabel}</span> : null}
                </div>
              </div>
              {showCohostLayout ? (
                <div className={getWatchPlayerTileClassName({ orientation: cohostPlayerOrientation })}>
                  <div className="watch-player-media">
                    {cohostPlayerSession ? (
                      cohostPlayerSession.protocol === STREAM_PROTOCOL_WEBRTC ? (
                        <video
                          ref={cohostPlayerRef}
                          className="player-webrtc"
                          autoPlay
                          playsInline
                          muted={cohostPlayerMuted}
                          aria-label={`${cohostActive.peer.displayName || cohostActive.peer.handle} 直播画面`}
                        />
                      ) : (
                        <canvas
                          ref={cohostPlayerRef}
                          className="player-moq"
                          width="1280"
                          height="720"
                          aria-label={`${cohostPlayerSession.namespace} 直播画面`}
                        />
                      )
                    ) : (
                      <div className="placeholder">
                        {cohostPlayerBadge.state === "warm" ? (
                          <LoadingSpinner className="stage-loading-spinner" />
                        ) : (
                          <p>{cohostPlayerStatus || "连线画面加载中"}</p>
                        )}
                      </div>
                    )}
                    <span className="watch-player-label">{cohostActive.peer.displayName || cohostActive.peer.handle}</span>
                  </div>
                </div>
              ) : null}
            </div>
            {playerFreezeFrameUrl ? (
              <img
                className="stage-freeze-frame"
                src={playerFreezeFrameUrl}
                alt=""
                aria-hidden="true"
              />
            ) : null}
            {stageView.statusOverlayKind ? (
              <div className={`stage-error${stageView.statusOverlayKind === "status" ? " stage-status-overlay" : ""}`}>
                <p>{stageView.statusOverlayMessage}</p>
              </div>
            ) : null}
            {showTapToUnmute && playerSession && playerBadge.state !== "error" ? (
              <button
                type="button"
                className="stage-unmute-prompt"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismissTapToUnmute();
                  if (!immersiveShell) {
                    revealControls();
                  }
                }}
              >
                点按以取消静音
              </button>
            ) : null}
            {immersiveShell ? renderMobileHud("stage-mobile-hud-overlay", true) : null}
            {immersiveShell ? (
              <div
                className={`watch-portrait-chat-overlay${immersiveControlsHidden ? " is-hidden" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <ChatPanel
                  roomLabel={chatRoomLabel}
                  welcomeMessage={welcomeMessage}
                  authAvailable={authAvailable}
                  authLoading={authLoading}
                  authUser={authUser}
                  messages={chatMessages}
                  draft={chatDraft}
                  onDraftChange={onChatDraftChange}
                  onSend={onChatSend}
                  onRequireLogin={onChatRequireLogin}
                  connectionState={chatConnectionState}
                  onlineCount={chatOnlineCount}
                  readOnly={chatReadOnly}
                  chatError={chatError}
                  chatRecovering={chatRecovering}
                  variant="floating"
                  className="chat-panel-watch-overlay"
                  composerTrailingAction={renderMobileMoreButton()}
                  composerTrailingActionClassName="watch-composer-more-extra"
                />
              </div>
            ) : null}
            {stageView.showPlaybackControls && !immersiveShell ? (
              <div className={`stage-controls${controlsVisible ? " is-visible" : ""}`}>
                <div className="stage-controls-fade" />
                <button
                  type="button"
                  className="stage-control-button stage-control-primary"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePlayback();
                    revealControls();
                  }}
                  aria-label={playerPaused ? "继续播放" : "暂停播放"}
                >
                  {playerPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                </button>
                <div className="stage-controls-right">
                  <button
                    type="button"
                    className="stage-control-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleMute();
                      revealControls();
                    }}
                    aria-label={playerMuted ? "取消静音" : "静音"}
                  >
                    {playerMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="stage-control-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void openPictureInPicture();
                      revealControls();
                    }}
                    disabled={!(elementPipSupported || videoPipSupported) || !playerSession}
                    aria-label={pictureInPictureActive ? "关闭小窗播放" : "小窗播放"}
                  >
                    <PictureInPicture2 aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="stage-control-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onFullscreen();
                      revealControls();
                    }}
                    aria-label={fullscreenActive ? "退出全屏" : "全屏播放"}
                  >
                    {fullscreenActive ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="info-strip">
            <div className="info-item">
              <div className="watch-desktop-room-meta">
                {hostIcon === "public-channel" ? (
                  <span className="watch-desktop-room-avatar is-public-channel" aria-hidden="true">
                    <Radio className="watch-desktop-room-avatar-icon" />
                  </span>
                ) : (
                  <div
                    className="watch-desktop-host-profile-trigger"
                    role="group"
                    tabIndex={0}
                    aria-label="查看主播信息"
                  >
                    <UserAvatar
                      avatarUrl={hostAvatarUrl}
                      displayName={hostDisplayName}
                      className="watch-desktop-room-avatar"
                      imgAlt={hostDisplayName || "主播头像"}
                      monogramClassName="is-monogram"
                      placeholderClassName="is-placeholder"
                      iconClassName="watch-desktop-room-avatar-icon"
                    />
                    <div
                      className="watch-desktop-host-profile-popover"
                      role="dialog"
                      aria-label="主播信息"
                    >
                      <WatchHostProfileContent
                        hostAvatarUrl={hostAvatarUrl}
                        hostChipLabel={hostChipLabel}
                        hostDisplayName={hostDisplayName}
                        hostBio={hostBio}
                        hostProfileInfoItems={hostProfileInfoItems}
                        hostLocationClickable={hostLocationClickable}
                        hostLocationPending={hostDistancePending}
                        onHostLocationClick={handleHostLocationClick}
                        onHostHandleCopy={copyHostHandle}
                        hostHandle={hostHandle}
                        roomLabel={roomLabel}
                        hostFollowerCountText={hostFollowerCountText}
                        hostFollowingCountText={hostFollowingCountText}
                        followButton={renderHostProfileActions()}
                      />
                    </div>
                  </div>
                )}
	                <div className="watch-desktop-room-copy">
	                  <strong data-room-label>{roomTitle || roomLabel}</strong>
	                  <p>{hostDisplayName || roomLabel}</p>
	                </div>
	                {renderHostFollowButton("watch-host-follow-button-desktop")}
	              </div>
            </div>
            <div className="info-item info-item-pill watch-desktop-status-actions">
              <button
                ref={shareButtonRef}
                type="button"
                className="watch-desktop-share-button"
                onClick={openShareMenu}
                disabled={!watchLink}
                aria-label="分享观看链接"
                aria-haspopup="dialog"
                aria-expanded={shareMenuMounted ? "true" : "false"}
              >
                <Share aria-hidden="true" />
              </button>
              <StatusPill id="playerBadgeInline" label={playerBadge.label} state={playerBadge.state} />
            </div>
          </div>
        </section>

        <aside className={`control-column${!immersiveShell ? " watch-control-column-landscape" : ""}`} data-joined="true">
          <div className="info-strip info-strip-mobile">
            <div className="info-item">
              <strong data-room-label>{roomLabel}</strong>
            </div>
            <div className="info-item info-item-pill">
              <StatusPill id="playerBadgeInlineMobile" label={playerBadge.label} state={playerBadge.state} />
            </div>
          </div>
          <ChatPanel
            roomLabel={chatRoomLabel}
            welcomeMessage={welcomeMessage}
            authAvailable={authAvailable}
            authLoading={authLoading}
            authUser={authUser}
            messages={chatMessages}
            draft={chatDraft}
            onDraftChange={onChatDraftChange}
            onSend={onChatSend}
            onRequireLogin={onChatRequireLogin}
            connectionState={chatConnectionState}
            onlineCount={chatOnlineCount}
            readOnly={chatReadOnly}
            chatError={chatError}
            chatRecovering={chatRecovering}
            composerTrailingAction={renderMobileMoreButton()}
            composerTrailingActionClassName="watch-composer-more-extra"
          />
        </aside>
      </div>
      <WatchMobileMoreSheet
        open={moreOpen}
        onClose={closeMoreSheet}
        hostAvatarUrl={hostAvatarUrl}
        hostChipLabel={hostChipLabel}
        watchLink={watchLink}
        shareSupported={shareSupported}
        elementPipSupported={elementPipSupported}
        videoPipSupported={videoPipSupported}
        playerSession={playerSession}
        pictureInPictureActive={pictureInPictureActive}
        onShareWatchLink={shareWatchLink}
        onOpenImageShareModal={openImageShareModal}
        onCopyWatchLink={copyWatchLink}
        onOpenPictureInPicture={openPictureInPicture}
      />
      <WatchHostProfileSheet
        open={hostProfileOpen}
        onClose={closeHostProfile}
        hostAvatarUrl={hostAvatarUrl}
        hostChipLabel={hostChipLabel}
        hostDisplayName={hostDisplayName}
        hostBio={hostBio}
        hostProfileInfoItems={hostProfileInfoItems}
        hostLocationClickable={hostLocationClickable}
        hostLocationPending={hostDistancePending}
        onHostLocationClick={handleHostLocationClick}
        onHostHandleCopy={copyHostHandle}
        hostHandle={hostHandle}
        roomLabel={roomLabel}
        hostFollowerCountText={hostFollowerCountText}
        hostFollowingCountText={hostFollowingCountText}
        followButton={renderHostProfileActions()}
      />
      {hidden ? null : <ToastViewport className="watch-session-toast" />}
      {imageShareMounted ? (
        <WatchImageShareDialog
          imageShareClosing={imageShareClosing}
          imageShareReady={imageShareReady}
          onClose={closeImageShareModal}
          onCopyImage={copyWatchImage}
          onSaveImage={saveWatchImage}
          onShareImage={shareWatchImage}
          roomLabel={roomLabel}
          shareImageLoading={shareImageLoading}
          shareImageUrl={shareImageUrl}
          shareSupported={shareSupported}
        />
      ) : null}
      <WatchAudienceSheet
        open={audienceOpen}
        onClose={closeAudienceSheet}
        audienceCountText={audienceCountText}
        loggedInViewers={loggedInViewers}
      />
      <WatchDesktopSharePanel
        left={shareMenuPosition.left}
        onClose={closeShareMenu}
        onCopyLink={copyWatchLink}
        onShareLink={shareWatchLink}
        open={shareMenuMounted}
        shareSupported={shareSupported}
        top={shareMenuPosition.top}
        visible={shareMenuVisible}
        watchLink={watchLink}
      />
    </section>
  );
}
