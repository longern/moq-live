import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "../ChatPanel.jsx";
import { StatusPill } from "../StatusPill.jsx";
import { UserAvatar } from "../UserAvatar.jsx";
import {
  BroadcastIcon,
  CameraIcon,
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
    previewVideoRef,
    previewActive,
    previewHasVideo,
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
    if (cameraUnavailable) {
      showCameraUnavailableNotice();
      return;
    }

    onCycleCamera();
  }

  return (
    <section className="page page-immersive live-mobile-page" data-page="live" data-shell={shellMode} hidden={hidden}>
      <div className="live-mobile-shell">
        <div className="live-mobile-head">
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
          <StatusPill id="publishBadgeOverlay" label={publishBadge.label} state={publishBadge.state} />
        </div>
        <div className="stage-frame live-stage-frame live-stage-frame-mobile">
          <LivePreviewStage
            previewVideoRef={previewVideoRef}
            previewActive={previewActive}
            previewHasVideo={previewHasVideo}
            mirrorPreview={mirrorPreview}
          />
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
          {publishBlocked ? (
            <div className="live-mobile-warning">{publishBlockedReason}</div>
          ) : null}
          {cameraNoticeVisible ? (
            <div className="live-mobile-toast" role="status">未检测到可用摄像头</div>
          ) : null}
          <div className="live-mobile-actions">
            <button
              type="button"
              className={`live-fab${cameraMode === "off" ? " is-muted" : ""}${cameraUnavailable ? " is-unavailable" : ""}`}
              onClick={handleCameraAction}
              aria-label={cameraUnavailable ? "未检测到可用摄像头" : `切换摄像头，当前${cameraMode === "rear" ? "后摄" : cameraMode === "front" ? "前摄" : "关闭"}`}
              aria-disabled={cameraUnavailable ? "true" : undefined}
            >
              <CameraIcon mode={cameraMode} />
            </button>
            <button
              type="button"
              className={`live-fab${microphoneEnabled ? "" : " is-muted"}`}
              onClick={onToggleMicrophone}
              aria-label={microphoneEnabled ? "关闭麦克风" : "打开麦克风"}
            >
              <MicrophoneIcon enabled={microphoneEnabled} />
            </button>
            <button
              type="button"
              className={`live-fab live-fab-primary${isPublishing ? " is-active" : ""}`}
              onClick={onTogglePublish}
              disabled={publishBlocked || (!props.cameraEnabled && !microphoneEnabled)}
              aria-label={isPublishing ? "停止开播" : "开始开播"}
            >
              <BroadcastIcon active={isPublishing} />
            </button>
            <button
              type="button"
              className="live-fab"
              onClick={onShare}
              aria-label="分享直播间"
              disabled={!shareSupported || !watchLink}
            >
              <ShareIcon />
            </button>
            <button
              type="button"
              className={`live-fab${moreOpen ? " is-active" : ""}`}
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
