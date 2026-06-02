import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Copy,
  Maximize,
  Minimize,
  MoreHorizontal,
  Pause,
  Play,
  Share,
  Volume2,
  VolumeX
} from "lucide-react";
import { ChatPanel } from "./ChatPanel.jsx";
import { StatusPill } from "./StatusPill.jsx";
import { UserAvatar } from "./UserAvatar.jsx";

const WatchTestCanvas = import.meta.env.DEV
  ? lazy(() => import("./WatchTestCanvas.jsx").then((module) => ({ default: module.WatchTestCanvas })))
  : null;

export function WatchSessionPage({
  hidden,
  roomLabel,
  roomTitle,
  hostDisplayName,
  hostAvatarUrl,
  watchLink,
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
  playerRef,
  authAvailable,
  authLoading,
  authUser,
  chatMessages,
  chatDraft,
  chatConnectionState,
  chatOnlineCount,
  chatReadOnly,
  chatError,
  testPlayback,
  onChatDraftChange,
  onChatSend,
  onChatRequireLogin
}) {
  const watchLinkText = watchLink || "等待生成观看链接";
  const [controlsVisible, setControlsVisible] = useState(false);
  const [moreMounted, setMoreMounted] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [shareMenuMounted, setShareMenuMounted] = useState(false);
  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  const [shareMenuPosition, setShareMenuPosition] = useState({ left: 0, top: 0 });
  const hideTimerRef = useRef(null);
  const touchModeRef = useRef(false);
  const closeTimerRef = useRef(null);
  const openFrameRef = useRef(null);
  const shareCloseTimerRef = useRef(null);
  const shareOpenFrameRef = useRef(null);
  const shareButtonRef = useRef(null);
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";

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
  }, []);

  useEffect(() => () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    if (openFrameRef.current) {
      cancelAnimationFrame(openFrameRef.current);
    }
    if (shareCloseTimerRef.current) {
      clearTimeout(shareCloseTimerRef.current);
    }
    if (shareOpenFrameRef.current) {
      cancelAnimationFrame(shareOpenFrameRef.current);
    }
  }, []);

  useEffect(() => {
    if (!playerSession || playerBadge.state === "error") {
      hideControls();
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
  }, [playerSession, playerBadge.state]);

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
    if (controlsVisible) {
      hideControls();
      return;
    }
    revealControls();
  }

  function openMoreSheet() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openFrameRef.current) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    setMoreMounted(true);
    setMoreVisible(false);
    openFrameRef.current = requestAnimationFrame(() => {
      setMoreVisible(true);
      openFrameRef.current = null;
    });
  }

  function closeMoreSheet() {
    if (openFrameRef.current) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    setMoreVisible(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setMoreMounted(false);
      closeTimerRef.current = null;
    }, 260);
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
    try {
      await navigator.clipboard.writeText(watchLink);
    } finally {
      closeShareMenu();
    }
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

  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [moreMounted]);

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
    const visible = persistent || controlsVisible || playerBadge.state === "error";

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
          <div className="stage-mobile-meta stage-mobile-meta-left">
            <strong>{roomLabel}</strong>
          </div>
        </div>
        <div className="stage-mobile-hud-actions">
          <StatusPill id="playerBadgeOverlay" label={playerBadge.label} state={playerBadge.state} />
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
    <section className="page page-immersive" data-page="watch" data-joined="true" hidden={hidden}>
      <div className="page-grid watch-layout">
        <section className="stage-column">
          {playerOrientation !== "portrait" ? renderMobileHud("stage-mobile-hud-top", true) : null}
          <div
            ref={stageRef}
            className={`stage-frame watch-stage-frame${controlsVisible ? " controls-visible" : ""}${playerOrientation === "portrait" ? " is-portrait" : ""}`}
            onMouseMove={handleStagePointerMove}
            onMouseLeave={handleStagePointerLeave}
            onClick={handleStageClick}
          >
            <div id="playerMount">
              {playerSession && testPlayback && WatchTestCanvas ? (
                <Suspense fallback={null}>
                  <WatchTestCanvas
                    playback={testPlayback}
                    playerRef={playerRef}
                    playerSession={playerSession}
                  />
                </Suspense>
              ) : playerSession ? (
                <canvas
                  ref={playerRef}
                  className="player-moq"
                  width="1280"
                  height="720"
                  aria-label={`${playerSession.namespace} 直播画面`}
                />
              ) : (
                <div className="placeholder">
                  <p>{stageMessage}</p>
                </div>
              )}
            </div>
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
                  revealControls();
                }}
              >
                点按以取消静音
              </button>
            ) : null}
            {playerOrientation === "portrait" ? renderMobileHud("stage-mobile-hud-overlay", true) : null}
            {playerOrientation === "portrait" ? (
              <div className="watch-portrait-chat-overlay">
                <ChatPanel
                  roomLabel={chatRoomLabel}
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
            {playerBadge.state !== "error" ? (
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
                <UserAvatar
                  avatarUrl={hostAvatarUrl}
                  displayName={hostDisplayName}
                  className="watch-desktop-room-avatar"
                  imgAlt={hostDisplayName || "主播头像"}
                  monogramClassName="is-monogram"
                  placeholderClassName="is-placeholder"
                  iconClassName="watch-desktop-room-avatar-icon"
                />
                <div className="watch-desktop-room-copy">
                  <strong data-room-label>{roomTitle || roomLabel}</strong>
                  <p>{hostDisplayName || roomLabel}</p>
                </div>
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

        <aside className={`control-column${playerOrientation !== "portrait" ? " watch-control-column-landscape" : ""}`} data-joined="true">
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
      {moreMounted ? (
        <>
          <button
            type="button"
            className={`watch-mobile-more-backdrop${moreVisible ? " is-open" : ""}`}
            aria-label="关闭更多操作"
            onClick={closeMoreSheet}
          />
          <section className={`watch-mobile-more-panel${moreVisible ? " is-open" : ""}`}>
            <div className="watch-mobile-more-header">
              <strong>{roomLabel}</strong>
              <span>{playerBadge.label}</span>
            </div>
            <div className="summary-item">
              <strong>观看链接</strong>
              <span data-watch-link>{watchLinkText}</span>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={async () => {
                if (!watchLink) {
                  closeMoreSheet();
                  return;
                }
                try {
                  await navigator.clipboard.writeText(watchLink);
                  closeMoreSheet();
                } catch {
                  closeMoreSheet();
                }
              }}
              disabled={!watchLink}
            >
              复制观看链接
            </button>
          </section>
        </>
      ) : null}
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
