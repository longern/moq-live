import { useEffect, useRef, useState } from "preact/hooks";
import { ChatPanel } from "../ChatPanel.jsx";
import { StatusPill } from "../StatusPill.jsx";
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
  const [dragOffset, setDragOffset] = useState(0);
  const closeTimerRef = useRef(null);
  const openFrameRef = useRef(null);
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    offset: 0
  });
  const {
    hidden,
    room,
    roomLabel,
    publishStatus,
    publishBlocked,
    publishBlockedReason,
    publishBadge,
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
    onRegenerateRoom,
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
    onOpenCoverPicker
  } = props;

  useEffect(() => () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
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

  return (
    <section class="page page-immersive live-mobile-page" data-page="live" hidden={hidden}>
      <div class="live-mobile-shell">
        <div class="live-mobile-head">
          <strong class="live-mobile-room">{roomLabel}</strong>
          <StatusPill id="publishBadgeOverlay" label={publishBadge.label} state={publishBadge.state} />
        </div>
        <div class="stage-frame live-stage-frame live-stage-frame-mobile">
          <LivePreviewStage
            previewVideoRef={previewVideoRef}
            previewActive={previewActive}
            previewHasVideo={previewHasVideo}
            mirrorPreview={mirrorPreview}
          />
          <div class="live-mobile-chat-overlay">
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
            <div class="live-mobile-warning">{publishBlockedReason}</div>
          ) : null}
          <div class="live-mobile-actions">
            <button
              type="button"
              class={`live-fab${cameraMode === "off" ? " is-muted" : ""}`}
              onClick={onCycleCamera}
              aria-label={`切换摄像头，当前${cameraMode === "rear" ? "后摄" : cameraMode === "front" ? "前摄" : "关闭"}`}
            >
              <CameraIcon mode={cameraMode} />
            </button>
            <button
              type="button"
              class={`live-fab${microphoneEnabled ? "" : " is-muted"}`}
              onClick={onToggleMicrophone}
              aria-label={microphoneEnabled ? "关闭麦克风" : "打开麦克风"}
            >
              <MicrophoneIcon enabled={microphoneEnabled} />
            </button>
            <button
              type="button"
              class={`live-fab live-fab-primary${isPublishing ? " is-active" : ""}`}
              onClick={onTogglePublish}
              disabled={publishBlocked || (!props.cameraEnabled && !microphoneEnabled)}
              aria-label={isPublishing ? "停止开播" : "开始开播"}
            >
              <BroadcastIcon active={isPublishing} />
            </button>
            <button
              type="button"
              class="live-fab"
              onClick={onShare}
              aria-label="分享直播间"
              disabled={!shareSupported || !watchLink}
            >
              <ShareIcon />
            </button>
            <button
              type="button"
              class={`live-fab${moreOpen ? " is-active" : ""}`}
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
              class={`live-mobile-drawer-backdrop${moreVisible ? " is-open" : ""}`}
              aria-label="关闭更多操作"
              onClick={() => {
                setMoreOpen(false);
                closeMoreSheet();
              }}
            />
            <div
              class={`live-mobile-drawer${moreVisible ? " is-open" : ""}`}
              style={dragOffset ? `transform: translateY(${dragOffset}px);` : undefined}
            >
              <div
                class="live-mobile-drawer-handle"
                onTouchStart={handleDrawerTouchStart}
                onTouchMove={handleDrawerTouchMove}
                onTouchEnd={handleDrawerTouchEnd}
                onTouchCancel={handleDrawerTouchEnd}
              >
                <span class="live-mobile-drawer-indicator" />
              </div>
              <div class="live-mobile-more-panel">
                <div class="live-mobile-more-header">
                  <strong>{room}</strong>
                  <span>{publishStatus}</span>
                </div>
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
                  class="secondary"
                  onClick={() => {
                    onRegenerateRoom();
                    setMoreOpen(false);
                    closeMoreSheet();
                  }}
                >
                  重新生成房间号
                </button>
                <button
                  type="button"
                  class={syntheticPublishing ? "secondary" : "tertiary"}
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
                  class="secondary"
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
