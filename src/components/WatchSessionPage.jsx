import { useEffect, useRef, useState } from "preact/hooks";
import { ChatPanel } from "./ChatPanel.jsx";
import { StatusPill } from "./StatusPill.jsx";
import { UserAvatar } from "./UserAvatar.jsx";

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
      <div class={`stage-mobile-hud${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}>
        <div class="stage-mobile-hud-left">
          <button
            type="button"
            class="stage-mobile-leave"
            onClick={(event) => {
              event.stopPropagation();
              onStop();
            }}
            aria-label="离开直播间"
          >
            <svg viewBox="0 0 24 24">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </button>
          <div class="stage-mobile-meta stage-mobile-meta-left">
            <strong>{roomLabel}</strong>
          </div>
        </div>
        <div class="stage-mobile-hud-actions">
          <StatusPill id="playerBadgeOverlay" label={playerBadge.label} state={playerBadge.state} />
          <button
            type="button"
            class="stage-mobile-more"
            onClick={(event) => {
              event.stopPropagation();
              openMoreSheet();
            }}
            aria-label="更多操作"
          >
            <svg viewBox="0 0 24 24">
              <circle cx="6" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="18" cy="12" r="1.8" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <section class="page page-immersive" data-page="watch" data-joined="true" hidden={hidden}>
      <div class="page-grid watch-layout">
        <section class="stage-column">
          {playerOrientation !== "portrait" ? renderMobileHud("stage-mobile-hud-top", true) : null}
          <div
            ref={stageRef}
            class={`stage-frame watch-stage-frame${controlsVisible ? " controls-visible" : ""}${playerOrientation === "portrait" ? " is-portrait" : ""}`}
            onMouseMove={handleStagePointerMove}
            onMouseLeave={handleStagePointerLeave}
            onClick={handleStageClick}
          >
            <div id="playerMount">
              {playerSession ? (
                <canvas
                  ref={playerRef}
                  class="player-moq"
                  width="1280"
                  height="720"
                  aria-label={`${playerSession.namespace} 直播画面`}
                />
              ) : (
                <div class="placeholder">
                  <p>{stageMessage}</p>
                </div>
              )}
            </div>
            {playerBadge.state === "error" ? (
              <div class="stage-error">
                <p>{playerStatus}</p>
              </div>
            ) : null}
            {showTapToUnmute && playerSession && playerBadge.state !== "error" ? (
              <button
                type="button"
                class="stage-unmute-prompt"
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
              <div class="watch-portrait-chat-overlay">
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
              <div class={`stage-controls${controlsVisible ? " is-visible" : ""}`}>
                <div class="stage-controls-fade" />
                <button
                  type="button"
                  class="stage-control-button stage-control-primary"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePlayback();
                    revealControls();
                  }}
                  aria-label={playerPaused ? "继续播放" : "暂停播放"}
                >
                  {playerPaused ? (
                    <svg viewBox="0 0 24 24">
                      <path d="M8 6v12l10-6Z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24">
                      <path d="M9 6v12" />
                      <path d="M15 6v12" />
                    </svg>
                  )}
                </button>
                <div class="stage-controls-right">
                  <button
                    type="button"
                    class="stage-control-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleMute();
                      revealControls();
                    }}
                    aria-label={playerMuted ? "取消静音" : "静音"}
                  >
                    {playerMuted ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
                        <path d="m16 9 5 5" />
                        <path d="m21 9-5 5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24">
                        <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
                        <path d="M15.5 9.5a4 4 0 0 1 0 5" />
                        <path d="M18 7a7.5 7.5 0 0 1 0 10" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    class="stage-control-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onFullscreen();
                      revealControls();
                    }}
                    aria-label={fullscreenActive ? "退出全屏" : "全屏播放"}
                  >
                    {fullscreenActive ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M9 4H4v5" />
                        <path d="m4 4 6 6" />
                        <path d="M15 4h5v5" />
                        <path d="m20 4-6 6" />
                        <path d="M9 20H4v-5" />
                        <path d="m4 20 6-6" />
                        <path d="M15 20h5v-5" />
                        <path d="m20 20-6-6" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24">
                        <path d="M8 4H4v4" />
                        <path d="m4 4 5 5" />
                        <path d="M16 4h4v4" />
                        <path d="m20 4-5 5" />
                        <path d="M8 20H4v-4" />
                        <path d="m4 20 5-5" />
                        <path d="M16 20h4v-4" />
                        <path d="m20 20-5-5" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div class="info-strip">
            <div class="info-item">
              <div class="watch-desktop-room-meta">
                <UserAvatar
                  avatarUrl={hostAvatarUrl}
                  displayName={hostDisplayName}
                  className="watch-desktop-room-avatar"
                  imgAlt={hostDisplayName || "主播头像"}
                  monogramClassName="is-monogram"
                  placeholderClassName="is-placeholder"
                  iconClassName="watch-desktop-room-avatar-icon"
                />
                <div class="watch-desktop-room-copy">
                  <strong data-room-label>{roomTitle || roomLabel}</strong>
                  <p>{hostDisplayName || roomLabel}</p>
                </div>
              </div>
            </div>
            <div class="info-item info-item-pill watch-desktop-status-actions">
              <button
                ref={shareButtonRef}
                type="button"
                class="watch-desktop-share-button"
                onClick={openShareMenu}
                disabled={!watchLink}
                aria-label="分享观看链接"
                aria-haspopup="dialog"
                aria-expanded={shareMenuMounted ? "true" : "false"}
              >
                <ShareIcon />
              </button>
              <StatusPill id="playerBadgeInline" label={playerBadge.label} state={playerBadge.state} />
            </div>
          </div>
        </section>

        <aside class={`control-column${playerOrientation !== "portrait" ? " watch-control-column-landscape" : ""}`} data-joined="true">
          <div class="info-strip info-strip-mobile">
            <div class="info-item">
              <strong data-room-label>{roomLabel}</strong>
            </div>
            <div class="info-item info-item-pill">
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
            class={`watch-mobile-more-backdrop${moreVisible ? " is-open" : ""}`}
            aria-label="关闭更多操作"
            onClick={closeMoreSheet}
          />
          <section class={`watch-mobile-more-panel${moreVisible ? " is-open" : ""}`}>
            <div class="watch-mobile-more-header">
              <strong>{roomLabel}</strong>
              <span>{playerBadge.label}</span>
            </div>
            <div class="summary-item">
              <strong>观看链接</strong>
              <span data-watch-link>{watchLinkText}</span>
            </div>
            <button
              type="button"
              class="secondary"
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
            class="watch-desktop-share-backdrop"
            aria-label="关闭分享面板"
            onClick={closeShareMenu}
          />
          <section
            class={`watch-desktop-share-panel${shareMenuVisible ? " is-open" : ""}`}
            style={{
              left: `${shareMenuPosition.left}px`,
              top: `${shareMenuPosition.top}px`
            }}
            role="dialog"
            aria-modal="true"
            aria-label="分享到"
          >
            <div class="watch-desktop-share-title">分享到</div>
            <button
              type="button"
              class="watch-desktop-share-action"
              onClick={copyWatchLink}
              disabled={!watchLink}
            >
              <CopyIcon />
              <span>复制链接</span>
            </button>
            <button
              type="button"
              class="watch-desktop-share-action"
              onClick={shareWatchLink}
              disabled={!watchLink || !shareSupported}
            >
              <ShareIcon />
              <span>分享</span>
            </button>
          </section>
        </>
      ) : null}
    </section>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
