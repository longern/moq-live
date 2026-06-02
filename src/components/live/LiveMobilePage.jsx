import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "../ChatPanel.jsx";
import { StatusPill } from "../StatusPill.jsx";
import { UserAvatar } from "../UserAvatar.jsx";
import {
  CloseIcon,
  EndBroadcastIcon,
  FlipCameraIcon,
  MicrophoneIcon,
  MoreIcon,
  ShareIcon
} from "./liveIcons.jsx";
import { LiveCoverManager } from "./LiveCoverManager.jsx";
import { LivePreviewStage } from "./LivePreviewStage.jsx";

export function LiveMobilePage(props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreMounted, setMoreMounted] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const [cameraNoticeVisible, setCameraNoticeVisible] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const closeTimerRef = useRef(null);
  const cameraNoticeTimerRef = useRef(null);
  const openFrameRef = useRef(null);
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    offset: 0
  });
  const {
    hidden,
    roomLabel,
    roomAvatarUrl,
    publishBlocked,
    publishBlockedReason,
    publishBadge,
    cameraOptions,
    cameraMode,
    microphoneEnabled,
    isPublishing,
    isStarting = false,
    previewVideoRef,
    previewActive,
    previewHasVideo,
    previewPending,
    mirrorPreview,
    onCycleCamera,
    onToggleMicrophone,
    onTogglePublish,
    onShare,
    shareSupported,
    watchLink,
    syntheticPublishing,
    onStartSynthetic,
    onStopSynthetic,
    chatMessages,
    chatDraft,
    chatConnectionState,
    chatOnlineCount,
    chatReadOnly,
    chatError,
    authAvailable,
    authLoading,
    authUser,
    onChatDraftChange,
    onChatSend,
    onChatRequireLogin,
    roomCoverUrl,
    roomCoverLoading,
    roomCoverBusy,
    roomCoverError,
    roomCoverStatus,
    roomCoverInputRef,
    onPickCover,
    onOpenCoverPicker,
    shellMode = "compact"
  } = props;
  const cameraUnavailable = (cameraOptions?.length ?? 0) === 0;
  const mediaMode = props.mediaMode;
  const publishControlActive = isPublishing || isStarting;

  useEffect(() => () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    if (cameraNoticeTimerRef.current) {
      clearTimeout(cameraNoticeTimerRef.current);
    }
    if (openFrameRef.current) {
      cancelAnimationFrame(openFrameRef.current);
    }
  }, []);

  function openMoreSheet() {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (openFrameRef.current) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    setDragOffset(0);
    setMoreMounted(true);
    setMoreVisible(false);
    openFrameRef.current = requestAnimationFrame(() => {
      setMoreVisible(true);
      openFrameRef.current = null;
    });
  }

  function closeMoreSheet() {
    setMoreOpen(false);
    dragStateRef.current = {
      active: false,
      startY: 0,
      offset: 0
    };
    setMoreVisible(false);
    setDragOffset(0);
    if (openFrameRef.current) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setMoreMounted(false);
      closeTimerRef.current = null;
    }, 260);
  }

  function handleDrawerTouchStart(event) {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    dragStateRef.current = {
      active: true,
      startY: touch.clientY,
      offset: 0
    };
    setDragOffset(0);
  }

  function handleDrawerTouchMove(event) {
    if (!dragStateRef.current.active) {
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    const nextOffset = Math.max(0, touch.clientY - dragStateRef.current.startY);
    dragStateRef.current.offset = nextOffset;
    setDragOffset(nextOffset);
  }

  function handleDrawerTouchEnd() {
    const offset = dragStateRef.current.offset;
    dragStateRef.current = {
      active: false,
      startY: 0,
      offset: 0
    };

    if (offset > 96) {
      closeMoreSheet();
      return;
    }

    setDragOffset(0);
  }

  function showCameraUnavailableNotice() {
    setCameraNoticeVisible(true);
    if (cameraNoticeTimerRef.current) {
      clearTimeout(cameraNoticeTimerRef.current);
    }
    cameraNoticeTimerRef.current = window.setTimeout(() => {
      setCameraNoticeVisible(false);
      cameraNoticeTimerRef.current = null;
    }, 1800);
  }

  function handleCameraAction() {
    if (mediaMode === "voice") {
      return;
    }

    if (cameraUnavailable) {
      showCameraUnavailableNotice();
      return;
    }

    onCycleCamera();
  }

  return (
    <section
      className={`page page-immersive live-mobile-page${props.closing ? " is-closing" : ""}`}
      data-page="live"
      data-shell={shellMode}
      hidden={hidden}
    >
      <div className="live-mobile-shell">
        <div className="live-mobile-head">
          <button
            type="button"
            className={`live-page-close${publishControlActive ? " is-live-control" : ""}`}
            onClick={publishControlActive ? onTogglePublish : props.onRequestClose}
            aria-label={publishControlActive ? (isStarting ? "取消开播" : "结束直播") : "退出开播页"}
          >
            {publishControlActive ? <EndBroadcastIcon /> : <CloseIcon />}
          </button>
          {!publishControlActive ? (
            <div className="live-mode-switch" role="group" aria-label="开播模式">
              <button
                type="button"
                className={mediaMode === "video" ? "is-active" : ""}
                onClick={() => props.onSelectLiveMode?.("video")}
                aria-pressed={mediaMode === "video"}
              >
                视频
              </button>
              <button
                type="button"
                className={mediaMode === "voice" ? "is-active" : ""}
                onClick={() => props.onSelectLiveMode?.("voice")}
                aria-pressed={mediaMode === "voice"}
              >
                语音
              </button>
            </div>
          ) : null}
          <StatusPill id="publishBadgeOverlay" label={publishBadge.label} state={publishBadge.state} />
        </div>
        <div className="live-mobile-room-chip">
          <UserAvatar
            avatarUrl={roomAvatarUrl}
            displayName={roomLabel}
            className="live-mobile-room-avatar"
            imgAlt={roomLabel || "主播头像"}
            imgWidth={24}
            imgHeight={24}
            monogramClassName="is-monogram"
            placeholderClassName="is-placeholder"
            iconClassName="live-mobile-room-avatar-icon"
          />
          <span className="live-mobile-room">{roomLabel}</span>
        </div>
        <div className="stage-frame live-stage-frame live-stage-frame-mobile">
          <LivePreviewStage
            previewVideoRef={previewVideoRef}
            previewActive={previewActive}
            previewHasVideo={previewHasVideo}
            previewPending={previewPending}
            mediaMode={mediaMode}
            mirrorPreview={mirrorPreview}
          />
          {publishBlocked ? (
            <div className="live-mobile-warning">{publishBlockedReason}</div>
          ) : null}
          {cameraNoticeVisible ? (
            <div className="live-mobile-toast" role="status">未检测到可用摄像头</div>
          ) : null}
          {props.activationContent ? (
            <div className="live-activation-overlay">
              {props.activationContent}
            </div>
          ) : null}
          <div className="live-mobile-bottom-stack">
            <div className="live-mobile-chat-overlay">
              <ChatPanel
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
                className="chat-panel-live-mobile"
                title="评论"
                showComposer={false}
                showWelcome={false}
              />
            </div>
            <div className="live-mobile-actions">
              <div className="live-mobile-utility-row" aria-label="开播辅助操作">
                <button
                  type="button"
                  className={`live-fab live-fab-icon${mediaMode === "voice" ? " is-muted" : ""}${cameraUnavailable ? " is-unavailable" : ""}`}
                  onClick={handleCameraAction}
                  aria-label={
                    mediaMode === "voice"
                      ? "语音模式下摄像头已关闭"
                      : cameraUnavailable
                        ? "未检测到可用摄像头"
                        : `翻转摄像头，当前${cameraMode === "rear" ? "后摄" : "前摄"}`
                  }
                  aria-disabled={mediaMode === "voice" || cameraUnavailable ? "true" : undefined}
                >
                  <FlipCameraIcon />
                </button>
                <button
                  type="button"
                  className={`live-fab live-fab-icon${microphoneEnabled ? "" : " is-muted"}`}
                  onClick={onToggleMicrophone}
                  aria-label={microphoneEnabled ? "关闭麦克风" : "打开麦克风"}
                >
                  <MicrophoneIcon enabled={microphoneEnabled} />
                </button>
                <button
                  type="button"
                  className="live-fab live-fab-icon"
                  onClick={onShare}
                  aria-label="分享直播间"
                  disabled={!shareSupported || !watchLink}
                >
                  <ShareIcon />
                </button>
                <button
                  type="button"
                  className={`live-fab live-fab-icon${moreOpen ? " is-active" : ""}`}
                  onClick={() => {
                    if (moreMounted) {
                      closeMoreSheet();
                      setMoreOpen(false);
                      return;
                    }
                    setMoreOpen(true);
                    openMoreSheet();
                  }}
                  aria-label={moreOpen ? "关闭更多操作" : "打开更多操作"}
                >
                  <MoreIcon />
                </button>
              </div>
              {!isPublishing ? (
                <button
                  type="button"
                  className={`live-fab live-fab-primary${isStarting ? " is-starting" : ""}`}
                  onClick={onTogglePublish}
                  disabled={isStarting || publishBlocked || (!props.cameraEnabled && !microphoneEnabled)}
                  aria-label={isStarting ? "正在开始直播" : "开始直播"}
                >
                  开始直播
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {moreMounted ? (
          <>
            <button
              type="button"
              className={`live-mobile-drawer-backdrop${moreVisible ? " is-open" : ""}`}
              aria-label="关闭更多操作"
              onClick={() => {
                setMoreOpen(false);
                closeMoreSheet();
              }}
            />
            <div
              className={`live-mobile-drawer${moreVisible ? " is-open" : ""}`}
              style={dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined}
            >
              <div
                className="live-mobile-drawer-handle"
                onTouchStart={handleDrawerTouchStart}
                onTouchMove={handleDrawerTouchMove}
                onTouchEnd={handleDrawerTouchEnd}
                onTouchCancel={handleDrawerTouchEnd}
              >
                <span className="live-mobile-drawer-indicator" />
              </div>
              <div className="live-mobile-more-panel">
                <LiveCoverManager
                  roomCoverUrl={roomCoverUrl}
                  roomCoverLoading={roomCoverLoading}
                  roomCoverBusy={roomCoverBusy}
                  roomCoverError={roomCoverError}
                  roomCoverStatus={roomCoverStatus}
                  roomCoverInputRef={roomCoverInputRef}
                  onPickCover={onPickCover}
                  onOpenPicker={onOpenCoverPicker}
                />
                <button
                  type="button"
                  className={syntheticPublishing ? "secondary" : "success"}
                  onClick={() => {
                    if (syntheticPublishing) {
                      onStopSynthetic();
                    } else {
                      onStartSynthetic();
                    }
                    setMoreOpen(false);
                    closeMoreSheet();
                  }}
                  disabled={publishBlocked}
                >
                  {syntheticPublishing ? "停止合成源" : "使用合成源"}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    onShare();
                    setMoreOpen(false);
                    closeMoreSheet();
                  }}
                  disabled={!shareSupported || !watchLink}
                >
                  分享直播间
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
