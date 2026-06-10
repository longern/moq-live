import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Copy,
  Download,
  Maximize,
  Minimize,
  MoreHorizontal,
  Pause,
  Play,
  Radio,
  Share,
  Users,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import { ChatPanel } from "./ChatPanel.jsx";
import { FloatingToastPresence } from "./FloatingToast.jsx";
import { LoadingSpinner } from "./LoadingSpinner.jsx";
import { StatusPill } from "./StatusPill.jsx";
import { UserAvatar } from "./UserAvatar.jsx";
import {
  WatchAudienceSheet,
  WatchHostProfileSheet,
  WatchMobileMoreSheet,
} from "./watch/WatchSessionSheets.jsx";
import { formatAudienceCount } from "../lib/audience.js";
import {
  isPortraitMedia,
  shouldUsePortraitImmersiveMode,
} from "../lib/mediaLayout.js";
import { buildWatchShareImage } from "../lib/shareImage.js";
import { STREAM_PROTOCOL_WEBRTC } from "../lib/streamProtocol.js";
import { usePortraitViewport } from "../hooks/useMediaQuery.js";

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
  hostUserId,
  hostHandle,
  hostDisplayName,
  hostAvatarUrl,
  hostFollowerCount = 0,
  hostFollowingCount = 0,
  hostIcon,
  hostFollowing = false,
  hostFollowLoading = false,
  hostFollowBusy = false,
  onHostFollowToggle,
  roomCoverUrl,
  siteIconUrl,
  watchLink,
  stageLoading,
  stageMessage,
  chatRoom,
  chatRoomLabel,
  playerStatus,
  playerBadge,
  fullscreenActive,
  playerPaused,
  playerMuted,
  showTapToUnmute,
  playerOrientation,
  onStop,
  onTogglePlayback,
  onToggleMute,
  onDismissTapToUnmute,
  onFullscreen,
  stageRef,
  playerSession,
  playerStarted = false,
  playerFreezeFrameUrl = "",
  playerRef,
  cohostActive = null,
  cohostPlayerSession = null,
  cohostPlayerStarted = false,
  cohostPlayerMuted = true,
  cohostPlayerRef,
  cohostPlayerStatus = "",
  cohostPlayerBadge = { state: "idle" },
  authAvailable,
  authLoading,
  authUser,
  chatMessages,
  chatDraft,
  chatConnectionState,
  chatOnlineCount,
  chatLoggedInViewers = [],
  chatReadOnly,
  chatError,
  testPlayback,
  onChatDraftChange,
  onChatSend,
  onChatRequireLogin
}) {
  const [controlsVisible, setControlsVisible] = useState(false);
  const [immersiveControlsHidden, setImmersiveControlsHidden] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hostProfileOpen, setHostProfileOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [elementPipSupported, setElementPipSupported] = useState(false);
  const [videoPipSupported, setVideoPipSupported] = useState(false);
  const [pictureInPictureActive, setPictureInPictureActive] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [imageShareMounted, setImageShareMounted] = useState(false);
  const [imageShareClosing, setImageShareClosing] = useState(false);
  const [shareImageUrl, setShareImageUrl] = useState("");
  const [shareImageLoading, setShareImageLoading] = useState(false);
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
  const toastTimerRef = useRef(null);
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
  const showHostFollowButton = Boolean(hostUserId && authUser?.id !== hostUserId);
  const showInitialPlaybackSpinner = Boolean(
    !playerStarted && playerBadge.state === "warm"
  );
  const showCohostLayout = Boolean(cohostActive && (cohostPlayerSession || cohostPlayerBadge.state === "warm"));

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
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
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

  function showToast(message) {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, 1600);
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

    if (immersivePortrait) {
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
  }, [immersivePortrait, playerSession, playerBadge.state]);

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
    if (immersivePortrait) {
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

  function renderMobileHud(className = "", persistent = false) {
    const visible = immersivePortrait
      ? !immersiveControlsHidden || playerBadge.state === "error"
      : persistent || controlsVisible || playerBadge.state === "error";

    return (
      <div className={`stage-mobile-hud${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}>
        <div className="stage-mobile-hud-left">
          <button
            type="button"
            className="stage-mobile-leave"
            onClick={(event) => {
              event.stopPropagation();
              onStop();
            }}
            aria-label="离开直播间"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <div className="watch-mobile-host-chip">
            <button
              type="button"
              className="watch-mobile-host-chip-main"
              onClick={openHostProfile}
              aria-label={`查看${hostChipLabel}资料`}
              aria-haspopup="dialog"
              aria-expanded={hostProfileOpen ? "true" : "false"}
            >
              <UserAvatar
                avatarUrl={hostAvatarUrl}
                displayName={hostChipLabel}
                className="watch-mobile-host-avatar"
                imgAlt={hostChipLabel || "主播头像"}
                imgWidth={24}
                imgHeight={24}
                monogramClassName="is-monogram"
                placeholderClassName="is-placeholder"
                iconClassName="watch-mobile-host-avatar-icon"
              />
              <span className="watch-mobile-host-name">{hostChipLabel}</span>
            </button>
            {renderHostFollowButton("watch-host-follow-button-mobile")}
          </div>
        </div>
        <div className="stage-mobile-hud-actions">
          <button
            type="button"
            className="watch-mobile-audience-chip"
            onClick={(event) => {
              event.stopPropagation();
              openAudienceSheet();
            }}
            aria-label={`${audienceCountText}人在线，查看已登录观众`}
          >
            <Users aria-hidden="true" />
            <span>{audienceCountText}</span>
          </button>
          <button
            type="button"
            className="stage-mobile-more"
            onClick={(event) => {
              event.stopPropagation();
              openMoreSheet();
            }}
            aria-label="更多操作"
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      className="page page-immersive"
      data-page="watch"
      data-joined="true"
      data-immersive={immersivePortrait ? "true" : "false"}
      hidden={hidden}
    >
      <div className="page-grid watch-layout">
        <section className="stage-column">
          {!immersivePortrait ? renderMobileHud("stage-mobile-hud-top", true) : null}
          <div
            ref={stageRef}
            className={`stage-frame watch-stage-frame${controlsVisible ? " controls-visible" : ""}${portraitMedia ? " is-portrait" : ""}`}
            onMouseMove={handleStagePointerMove}
            onMouseLeave={handleStagePointerLeave}
            onClick={handleStageClick}
          >
            <div id="playerMount" className={showCohostLayout ? "watch-player-mount is-cohost" : "watch-player-mount"}>
              <div className="watch-player-tile">
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
                    {stageLoading ? (
                      <LoadingSpinner className="stage-loading-spinner" />
                    ) : (
                      <p>{stageMessage}</p>
                    )}
                  </div>
                )}
                {showCohostLayout ? <span className="watch-player-label">{hostDisplayName || hostChipLabel}</span> : null}
              </div>
              {showCohostLayout ? (
                <div className="watch-player-tile">
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
            {showInitialPlaybackSpinner ? (
              <div className="placeholder stage-first-frame-loading" aria-hidden="true">
                <LoadingSpinner className="stage-loading-spinner" />
              </div>
            ) : null}
            {playerBadge.state === "error" ? (
              <div className="stage-error">
                <p>{playerStatus}</p>
              </div>
            ) : null}
            {showTapToUnmute && playerSession && playerBadge.state !== "error" ? (
              <button
                type="button"
                className="stage-unmute-prompt"
                onClick={(event) => {
                  event.stopPropagation();
                  onDismissTapToUnmute();
                  if (!immersivePortrait) {
                    revealControls();
                  }
                }}
              >
                点按以取消静音
              </button>
            ) : null}
            {immersivePortrait ? renderMobileHud("stage-mobile-hud-overlay", true) : null}
            {immersivePortrait ? (
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
                  variant="floating"
                  className="chat-panel-watch-overlay"
                />
              </div>
            ) : null}
            {playerBadge.state !== "error" && !immersivePortrait ? (
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
                  <UserAvatar
                    avatarUrl={hostAvatarUrl}
                    displayName={hostDisplayName}
                    className="watch-desktop-room-avatar"
                    imgAlt={hostDisplayName || "主播头像"}
                    monogramClassName="is-monogram"
                    placeholderClassName="is-placeholder"
                    iconClassName="watch-desktop-room-avatar-icon"
                  />
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

        <aside className={`control-column${!immersivePortrait ? " watch-control-column-landscape" : ""}`} data-joined="true">
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
        hostHandle={hostHandle}
        roomLabel={roomLabel}
        hostFollowerCountText={hostFollowerCountText}
        hostFollowingCountText={hostFollowingCountText}
        followButton={renderHostFollowButton("watch-host-follow-button-profile")}
      />
      <FloatingToastPresence className="watch-session-toast">{toastMessage}</FloatingToastPresence>
      {imageShareMounted ? (
        <div className={`watch-share-image-layer${imageShareClosing ? " is-closing" : ""}`}>
          <button
            type="button"
            className="watch-share-image-backdrop"
            aria-label="关闭图片分享"
            onClick={closeImageShareModal}
          />
          <section
            className="watch-share-image-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="图片分享"
          >
            <div className="watch-share-image-head">
              <h3>图片分享</h3>
              <button
                type="button"
                className="watch-share-image-close"
                aria-label="关闭图片分享"
                onClick={closeImageShareModal}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="watch-share-image-preview">
              {shareImageLoading ? (
                <LoadingSpinner className="watch-share-image-spinner" />
              ) : shareImageUrl ? (
                <img src={shareImageUrl} alt={`${roomLabel}直播间二维码分享图`} />
              ) : null}
            </div>
            <div className="watch-share-image-actions">
              <button
                type="button"
                onClick={shareWatchImage}
                disabled={!imageShareReady || !shareSupported}
              >
                <Share aria-hidden="true" />
                <span>分享</span>
              </button>
              <button
                type="button"
                onClick={copyWatchImage}
                disabled={!imageShareReady}
              >
                <Copy aria-hidden="true" />
                <span>复制图片</span>
              </button>
              <button
                type="button"
                onClick={saveWatchImage}
                disabled={!imageShareReady}
              >
                <Download aria-hidden="true" />
                <span>保存图片</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <WatchAudienceSheet
        open={audienceOpen}
        onClose={closeAudienceSheet}
        audienceCountText={audienceCountText}
        loggedInViewers={loggedInViewers}
      />
      {shareMenuMounted ? (
        <>
          <button
            type="button"
            className="watch-desktop-share-backdrop"
            aria-label="关闭分享面板"
            onClick={closeShareMenu}
          />
          <section
            className={`watch-desktop-share-panel${shareMenuVisible ? " is-open" : ""}`}
            style={{
              left: `${shareMenuPosition.left}px`,
              top: `${shareMenuPosition.top}px`
            }}
            role="dialog"
            aria-modal="true"
            aria-label="分享到"
          >
            <div className="watch-desktop-share-title">分享到</div>
            <button
              type="button"
              className="watch-desktop-share-action"
              onClick={copyWatchLink}
              disabled={!watchLink}
            >
              <Copy aria-hidden="true" />
              <span>复制链接</span>
            </button>
            <button
              type="button"
              className="watch-desktop-share-action"
              onClick={shareWatchLink}
              disabled={!watchLink || !shareSupported}
            >
              <Share aria-hidden="true" />
              <span>分享</span>
            </button>
          </section>
        </>
      ) : null}
    </section>
  );
}
