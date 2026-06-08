import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "../ChatPanel.jsx";
import { FloatingToast } from "../FloatingToast.jsx";
import { SwipeableDrawer } from "../SwipeableDrawer.jsx";
import { UserAvatar } from "../UserAvatar.jsx";
import { formatAudienceCount } from "../../lib/audience.js";
import {
  AudienceIcon,
  ChatIcon,
  CloseIcon,
  EndBroadcastIcon,
  FlipCameraIcon,
  MicrophoneIcon,
  MoreIcon,
  QualityIcon,
  ShareIcon
} from "./liveIcons.jsx";
import { LiveMoreMenu } from "./LiveMoreMenu.jsx";
import { LivePreviewStage } from "./LivePreviewStage.jsx";
import { LiveQualityMenu } from "./LiveQualityMenu.jsx";

export function LiveMobilePage(props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [qualityDrawerOpen, setQualityDrawerOpen] = useState(false);
  const [cameraNoticeVisible, setCameraNoticeVisible] = useState(false);
  const cameraNoticeTimerRef = useRef(null);
  const {
    hidden,
    roomLabel,
    roomAvatarUrl,
    publishBlocked,
    publishBlockedReason,
    cameraOptions,
    publishQualityOptions = [],
    publishProtocolOptions = [],
    publishQualityId,
    publishProtocol,
    webRtcPublishUrl,
    webRtcPlaybackUrl,
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
    onPublishQualityChange,
    onPublishProtocolChange,
    onWebRtcPublishUrlChange,
    onWebRtcPlaybackUrlChange,
    onTogglePublish,
    onShare,
    shareSupported,
    watchLink,
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
    roomCoverUrl,
    roomCoverLoading,
    roomCoverBusy,
    roomCoverError,
    roomCoverStatus,
    roomCoverInputRef,
    roomTitle,
    onSaveRoomTitle,
    roomInfoBlockedReason,
    onRoomInfoBlocked,
    onPickCover,
    onOpenCoverPicker,
    shellMode = "compact"
  } = props;
  const cameraUnavailable = (cameraOptions?.length ?? 0) === 0;
  const mediaMode = props.mediaMode;
  const publishControlActive = isPublishing || isStarting;
  const immersiveShell = shellMode === "immersive";
  const voiceMode = mediaMode === "voice";
  const hasInlineChatComposer = false;
  const showChatDrawerEntry = !hasInlineChatComposer;
  const showPassiveChatPreview = showChatDrawerEntry;
  const showLiveHeader = isPublishing;
  const showModeSwitch = !publishControlActive;
  const showStartButton = !isPublishing;
  const showCameraControl = !voiceMode;
  const audienceCountText = formatAudienceCount(chatOnlineCount);
  const loggedInViewers = Array.isArray(chatLoggedInViewers) ? chatLoggedInViewers : [];

  useEffect(() => () => {
    if (cameraNoticeTimerRef.current) {
      clearTimeout(cameraNoticeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!showChatDrawerEntry) {
      setChatDrawerOpen(false);
    }
  }, [showChatDrawerEntry]);

  useEffect(() => {
    if (!showLiveHeader) {
      setAudienceOpen(false);
    }
  }, [showLiveHeader]);

  function openMoreSheet() {
    setChatDrawerOpen(false);
    setAudienceOpen(false);
    setQualityDrawerOpen(false);
    setMoreOpen(true);
  }

  function closeMoreSheet() {
    setMoreOpen(false);
  }

  function openChatDrawer() {
    if (!showChatDrawerEntry) {
      return;
    }
    setMoreOpen(false);
    setAudienceOpen(false);
    setQualityDrawerOpen(false);
    setChatDrawerOpen(true);
  }

  function closeChatDrawer() {
    setChatDrawerOpen(false);
  }

  function openAudienceSheet() {
    if (!showLiveHeader) {
      return;
    }
    setMoreOpen(false);
    setChatDrawerOpen(false);
    setQualityDrawerOpen(false);
    setAudienceOpen(true);
  }

  function closeAudienceSheet() {
    setAudienceOpen(false);
  }

  function openQualitySheet() {
    setMoreOpen(false);
    setChatDrawerOpen(false);
    setAudienceOpen(false);
    setQualityDrawerOpen(true);
  }

  function closeQualitySheet() {
    setQualityDrawerOpen(false);
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
    if (voiceMode) {
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
      className="page page-immersive live-mobile-page"
      data-page="live"
      data-media={mediaMode}
      data-shell={shellMode}
      hidden={hidden}
    >
      <div className="live-mobile-shell">
        <div className="live-mobile-head">
          <div className="live-mobile-head-left">
            <button
              type="button"
              className={`live-page-close${publishControlActive ? " is-live-control" : ""}`}
              onClick={publishControlActive ? onTogglePublish : props.onRequestClose}
              aria-label={publishControlActive ? (isStarting ? "取消开播" : "结束直播") : "退出开播页"}
            >
              {publishControlActive ? <EndBroadcastIcon /> : <CloseIcon />}
            </button>
            {showLiveHeader ? (
              <div className="live-mobile-room-chip live-mobile-room-chip-head">
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
            ) : (
              <UserAvatar
                avatarUrl={roomAvatarUrl}
                displayName={roomLabel}
                className="live-mobile-head-avatar"
                imgAlt={roomLabel || "主播头像"}
                imgWidth={30}
                imgHeight={30}
                monogramClassName="is-monogram"
                placeholderClassName="is-placeholder"
                iconClassName="live-mobile-head-avatar-icon"
              />
            )}
          </div>
          <div className="live-mobile-head-center">
            {showModeSwitch ? (
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
          </div>
          <div className="live-mobile-head-right">
            {showLiveHeader ? (
              <button
                type="button"
                className="live-mobile-audience-chip"
                onClick={(event) => {
                  event.stopPropagation();
                  openAudienceSheet();
                }}
                aria-label={`${audienceCountText}人在线，查看在线用户`}
              >
                <AudienceIcon />
                <span>{audienceCountText}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="live-mobile-head-share"
              onClick={onShare}
              aria-label="分享直播间"
              disabled={!shareSupported || !watchLink}
            >
              <ShareIcon />
            </button>
          </div>
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
          {publishBlockedReason ? (
            <div className="live-mobile-warning">{publishBlockedReason}</div>
          ) : null}
          {cameraNoticeVisible ? (
            <FloatingToast className="live-mobile-toast">未检测到可用摄像头</FloatingToast>
          ) : null}
          <div className="live-mobile-bottom-stack">
            {showPassiveChatPreview ? (
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
            ) : null}
            <div className="live-mobile-actions">
              <div className="live-mobile-utility-row" aria-label="开播辅助操作">
                {showCameraControl ? (
                  <button
                    type="button"
                    className={`live-fab live-fab-icon${cameraUnavailable ? " is-unavailable" : ""}`}
                    onClick={handleCameraAction}
                    aria-label={cameraUnavailable
                      ? "未检测到可用摄像头"
                      : `翻转摄像头，当前${cameraMode === "rear" ? "后摄" : "前摄"}`}
                    aria-disabled={cameraUnavailable ? "true" : undefined}
                  >
                    <FlipCameraIcon />
                  </button>
                ) : null}
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
                  className={`live-fab live-fab-icon${qualityDrawerOpen ? " is-active" : ""}`}
                  onClick={qualityDrawerOpen ? closeQualitySheet : openQualitySheet}
                  aria-label={qualityDrawerOpen ? "关闭画质设置" : "画质设置"}
                  aria-expanded={qualityDrawerOpen}
                >
                  <QualityIcon />
                </button>
                {showChatDrawerEntry ? (
                  <button
                    type="button"
                    className={`live-fab live-fab-icon${chatDrawerOpen ? " is-active" : ""}`}
                    onClick={() => {
                      if (chatDrawerOpen) {
                        closeChatDrawer();
                        return;
                      }
                      openChatDrawer();
                    }}
                    aria-label={chatDrawerOpen ? "关闭评论" : "打开评论"}
                    aria-expanded={chatDrawerOpen}
                  >
                    <ChatIcon />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`live-fab live-fab-icon${moreOpen ? " is-active" : ""}`}
                  onClick={() => {
                    if (moreOpen) {
                      closeMoreSheet();
                      return;
                    }
                    openMoreSheet();
                  }}
                  aria-label={moreOpen ? "关闭更多操作" : "打开更多操作"}
                >
                  <MoreIcon />
                </button>
              </div>
              {showStartButton ? (
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

        {showChatDrawerEntry ? (
          <SwipeableDrawer
            open={chatDrawerOpen}
            onClose={closeChatDrawer}
            ariaLabel="关闭评论"
            className="live-mobile-drawer live-mobile-chat-drawer"
            panelClassName="live-mobile-chat-panel"
          >
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
              title="评论"
              showWelcome={false}
              className="chat-panel-live-drawer"
            />
          </SwipeableDrawer>
        ) : null}

        {showLiveHeader ? (
          <SwipeableDrawer
            open={audienceOpen}
            onClose={closeAudienceSheet}
            ariaLabel="关闭在线用户"
            className="live-mobile-drawer live-mobile-audience-drawer"
            panelClassName="live-mobile-audience-panel"
          >
            <div className="live-audience-head">
              <strong>在线用户</strong>
              <span>{audienceCountText} 人</span>
            </div>
            {loggedInViewers.length > 0 ? (
              <div className="live-audience-list">
                {loggedInViewers.map((viewer) => {
                  const displayName = viewer.displayName || "已登录用户";
                  return (
                    <div className="live-audience-row" key={viewer.id}>
                      <UserAvatar
                        avatarUrl={viewer.avatarUrl}
                        displayName={displayName}
                        className="live-audience-avatar"
                        imgAlt={`${displayName}头像`}
                        imgWidth={48}
                        imgHeight={48}
                        monogramClassName="is-monogram"
                        placeholderClassName="is-placeholder"
                        iconClassName="live-audience-avatar-icon"
                      />
                      <span>{displayName}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="live-audience-empty">暂无在线用户</div>
            )}
          </SwipeableDrawer>
        ) : null}

        <SwipeableDrawer
          open={qualityDrawerOpen}
          onClose={closeQualitySheet}
          ariaLabel="关闭画质设置"
          className="live-mobile-drawer"
          panelClassName="live-mobile-quality-panel"
        >
          <LiveQualityMenu
            publishQualityOptions={publishQualityOptions}
            publishQualityId={publishQualityId}
            publishProtocolOptions={publishProtocolOptions}
            publishProtocol={publishProtocol}
            webRtcPublishUrl={webRtcPublishUrl}
            webRtcPlaybackUrl={webRtcPlaybackUrl}
            onPublishQualityChange={onPublishQualityChange}
            onPublishProtocolChange={onPublishProtocolChange}
            onWebRtcPublishUrlChange={onWebRtcPublishUrlChange}
            onWebRtcPlaybackUrlChange={onWebRtcPlaybackUrlChange}
            onAfterSelect={closeQualitySheet}
          />
        </SwipeableDrawer>

        <SwipeableDrawer
          open={moreOpen}
          onClose={closeMoreSheet}
          ariaLabel="关闭更多操作"
          className="live-mobile-drawer"
          panelClassName="live-mobile-more-panel"
        >
          <LiveMoreMenu
            roomCoverUrl={roomCoverUrl}
            roomCoverLoading={roomCoverLoading}
            roomCoverBusy={roomCoverBusy}
            roomCoverError={roomCoverError}
            roomCoverStatus={roomCoverStatus}
            roomCoverInputRef={roomCoverInputRef}
            roomTitle={roomTitle}
            onPickCover={onPickCover}
            onOpenCoverPicker={onOpenCoverPicker}
            onSaveRoomTitle={onSaveRoomTitle}
            roomInfoBlockedReason={roomInfoBlockedReason}
            onRoomInfoBlocked={onRoomInfoBlocked}
            onShare={onShare}
            shareSupported={shareSupported}
            watchLink={watchLink}
            onClose={closeMoreSheet}
          />
        </SwipeableDrawer>
      </div>
    </section>
  );
}
