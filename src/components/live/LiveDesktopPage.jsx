import { useEffect, useState } from "react";
import { ChatPanel } from "../ChatPanel.jsx";
import { StatusPill } from "../StatusPill.jsx";
import { UserAvatar } from "../UserAvatar.jsx";
import {
  BroadcastIcon,
  CloseIcon,
  EndBroadcastIcon,
  FlipCameraIcon,
  MicrophoneIcon,
  MoreIcon,
  QualityIcon,
  ScreenShareIcon,
  ShareIcon
} from "./liveIcons.jsx";
import { LiveMoreMenu } from "./LiveMoreMenu.jsx";
import { LivePreviewStage } from "./LivePreviewStage.jsx";
import { LiveQualityMenu } from "./LiveQualityMenu.jsx";

function getCameraStatusLabel(cameraMode) {
  if (cameraMode === "off") {
    return "当前已关闭";
  }
  return cameraMode === "rear" ? "当前后置" : "当前前置";
}

function LiveDesktopPanel({ children, className = "" }) {
  if (!children) {
    return null;
  }

  return <section className={`live-desktop-panel${className ? ` ${className}` : ""}`}>{children}</section>;
}

function CameraPanel({
  cameraMode,
  selectedCameraId,
  cameraOptions,
  isPublishing,
  previewSourceType,
  onCameraChange,
  onCycleCamera,
}) {
  return (
    <>
      <div className="live-desktop-panel-head">
        <strong>摄像头</strong>
        <span>{getCameraStatusLabel(cameraMode)}</span>
      </div>
      <label>
        选择设备
        <select
          id="cameraSelect"
          value={selectedCameraId}
          onChange={onCameraChange}
          disabled={isPublishing && previewSourceType !== "camera"}
        >
          {cameraOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="action-row">
        <button type="button" className="secondary" onClick={onCycleCamera}>
          翻转摄像头
        </button>
      </div>
    </>
  );
}

function MicrophonePanel({
  selectedMicrophoneId,
  microphoneOptions,
  microphoneEnabled,
  isPublishing,
  onMicrophoneChange,
  onToggleMicrophone,
}) {
  return (
    <>
      <div className="live-desktop-panel-head live-microphone-panel-head">
        <strong>麦克风</strong>
      </div>
      <label className="live-panel-field">
        <span>选择设备</span>
        <select id="microphoneSelect" value={selectedMicrophoneId} onChange={onMicrophoneChange} disabled={isPublishing}>
          {microphoneOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="action-row live-panel-actions">
        <button
          type="button"
          className={`live-panel-toggle${microphoneEnabled ? " is-danger" : " is-on"}`}
          onClick={onToggleMicrophone}
        >
          <MicrophoneIcon enabled={microphoneEnabled} />
          <span>{microphoneEnabled ? "关闭麦克风" : "打开麦克风"}</span>
        </button>
      </div>
    </>
  );
}

function ShareLinkPanel({
  watchLink,
  shareTarget,
  onShare,
  shareSupported,
}) {
  const sharingNamespace = shareTarget.startsWith("ns:");

  return (
    <>
      <div className="live-desktop-panel-head">
        <strong>直播链接</strong>
        <span>{watchLink ? "可直接分享" : "等待生成"}</span>
      </div>
      <label>
        {sharingNamespace ? "直播 namespace" : "主播号"}
        <input id="liveRoomId" value={shareTarget} readOnly />
      </label>
      <label>
        观看链接
        <input id="watchLinkInput" value={watchLink} readOnly />
      </label>
      <div className="action-row">
        <button type="button" id="copyRoomLink" className="primary" onClick={onShare} disabled={!shareSupported || !watchLink}>
          分享直播间
        </button>
      </div>
    </>
  );
}

function MorePanel({
  roomCoverUrl,
  roomCoverLoading,
  roomCoverBusy,
  roomCoverError,
  roomCoverStatus,
  roomCoverInputRef,
  roomTitle,
  roomWelcomeMessage,
  commentSpeechEnabled,
  commentSpeechSupported,
  liveNotificationEnabled,
  locationSharingEnabled,
  locationSharingSupported,
  locationSharingPending,
  onPickCover,
  onOpenCoverPicker,
  onSaveRoomTitle,
  onSaveRoomWelcomeMessage,
  onCommentSpeechEnabledChange,
  onLiveNotificationEnabledChange,
  onLocationSharingEnabledChange,
  roomInfoBlockedReason,
  onRoomInfoBlocked,
  onShare,
  shareSupported,
  watchLink,
  onClose,
}) {
  return (
    <LiveMoreMenu
      roomCoverUrl={roomCoverUrl}
      roomCoverLoading={roomCoverLoading}
      roomCoverBusy={roomCoverBusy}
      roomCoverError={roomCoverError}
      roomCoverStatus={roomCoverStatus}
      roomCoverInputRef={roomCoverInputRef}
      roomTitle={roomTitle}
      roomWelcomeMessage={roomWelcomeMessage}
      commentSpeechEnabled={commentSpeechEnabled}
      commentSpeechSupported={commentSpeechSupported}
      liveNotificationEnabled={liveNotificationEnabled}
      locationSharingEnabled={locationSharingEnabled}
      locationSharingSupported={locationSharingSupported}
      locationSharingPending={locationSharingPending}
      onPickCover={onPickCover}
      onOpenCoverPicker={onOpenCoverPicker}
      onSaveRoomTitle={onSaveRoomTitle}
      onSaveRoomWelcomeMessage={onSaveRoomWelcomeMessage}
      onCommentSpeechEnabledChange={onCommentSpeechEnabledChange}
      onLiveNotificationEnabledChange={onLiveNotificationEnabledChange}
      onLocationSharingEnabledChange={onLocationSharingEnabledChange}
      roomInfoBlockedReason={roomInfoBlockedReason}
      onRoomInfoBlocked={onRoomInfoBlocked}
      onShare={onShare}
      shareSupported={shareSupported}
      watchLink={watchLink}
      onClose={onClose}
    />
  );
}

export function LiveDesktopPage({
  view = {},
  room: roomInfo = {},
  share = {},
  publish = {},
  media = {},
  settings = {},
  chat = {},
  auth = {},
  actions = {},
}) {
  const [openPanel, setOpenPanel] = useState("");
  const {
    hidden,
    shareSupported,
  } = view;
  const {
    id: room,
    label: roomLabel,
    avatarUrl: roomAvatarUrl,
    coverUrl: roomCoverUrl,
    coverLoading: roomCoverLoading,
    coverBusy: roomCoverBusy,
    coverError: roomCoverError,
    coverStatus: roomCoverStatus,
    coverInputRef: roomCoverInputRef,
    title: roomTitle,
    welcomeMessage: roomWelcomeMessage,
    infoBlockedReason: roomInfoBlockedReason,
  } = roomInfo;
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
    publishQualityOptions = [],
    publishProtocolOptions = [],
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
    previewActive,
    previewHasVideo,
    previewPending,
    previewSourceType,
    screenShareSupported,
    screenShareActive,
    previewVideoRef,
    mirrorPreview,
  } = media;
  const {
    commentSpeechEnabled,
    commentSpeechSupported,
    liveNotificationEnabled,
    locationSharingEnabled,
    locationSharingSupported,
    locationSharingPending,
  } = settings;
  const {
    messages: chatMessages,
    draft: chatDraft,
    connectionState: chatConnectionState,
    onlineCount: chatOnlineCount,
    readOnly: chatReadOnly,
    error: chatError,
    recovering: chatRecovering = false,
    canRetractMessages = false,
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
    onWebRtcPublishUrlChange,
    onWebRtcPlaybackUrlChange,
    onCycleCamera,
    onToggleMicrophone,
    onTogglePublish,
    onShare,
    onStartScreenShare,
    onStopScreenShare,
    onChatDraftChange,
    onChatSend,
    onChatMessageRetract,
    onChatRequireLogin,
    onSaveRoomTitle,
    onSaveRoomWelcomeMessage,
    onCommentSpeechEnabledChange,
    onLiveNotificationEnabledChange,
    onLocationSharingEnabledChange,
    onPickCover,
    onOpenCoverPicker,
    onRequestClose,
    onSelectLiveMode,
    onRoomInfoBlocked,
  } = actions;
  const cameraUnavailable = (cameraOptions?.length ?? 0) === 0;
  const hasSingleMicrophone = (microphoneOptions?.length ?? 0) === 1;
  const publishControlActive = isPublishing || isStarting;
  const screenShareUnavailableReason = !screenShareSupported
    ? "当前浏览器不支持屏幕分享"
    : isPublishing
      ? "直播中不能切换共享源"
      : "";
  const screenShareUnavailable = Boolean(screenShareUnavailableReason);
  const screenShareButtonLabel = screenShareUnavailable
    ? screenShareUnavailableReason
    : screenShareActive
      ? "停止屏幕分享"
      : "屏幕分享";
  const desktopHostId = shareTarget || room || roomLabel;

  useEffect(() => {
    if (!openPanel) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenPanel("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  useEffect(() => {
    if ((cameraUnavailable && openPanel === "camera") || openPanel === "screen") {
      setOpenPanel("");
    }
  }, [cameraUnavailable, openPanel]);

  function handleScreenShareClick() {
    setOpenPanel("");
    if (screenShareUnavailable) {
      return;
    }

    if (screenShareActive) {
      onStopScreenShare();
      return;
    }

    onStartScreenShare();
  }

  function handleCameraFlip() {
    if (mediaMode === "voice" || cameraUnavailable) {
      return;
    }

    onCycleCamera();
  }

  function handleMicrophoneClick() {
    if (hasSingleMicrophone) {
      setOpenPanel("");
      onToggleMicrophone();
      return;
    }

    setOpenPanel((current) => (current === "microphone" ? "" : "microphone"));
  }

  const activePanel = openPanel === "camera" ? (
    <CameraPanel
      cameraMode={cameraMode}
      selectedCameraId={selectedCameraId}
      cameraOptions={cameraOptions}
      isPublishing={isPublishing}
      previewSourceType={previewSourceType}
      onCameraChange={onCameraChange}
      onCycleCamera={onCycleCamera}
    />
  ) : openPanel === "microphone" ? (
    <MicrophonePanel
      selectedMicrophoneId={selectedMicrophoneId}
      microphoneOptions={microphoneOptions}
      microphoneEnabled={microphoneEnabled}
      isPublishing={isPublishing}
      onMicrophoneChange={onMicrophoneChange}
      onToggleMicrophone={onToggleMicrophone}
    />
  ) : openPanel === "quality" ? (
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
    />
  ) : openPanel === "link" ? (
    <ShareLinkPanel
      watchLink={watchLink}
      shareTarget={shareTarget}
      onShare={onShare}
      shareSupported={shareSupported}
    />
  ) : openPanel === "more" ? (
    <MorePanel
      roomCoverUrl={roomCoverUrl}
      roomCoverLoading={roomCoverLoading}
      roomCoverBusy={roomCoverBusy}
      roomCoverError={roomCoverError}
      roomCoverStatus={roomCoverStatus}
      roomCoverInputRef={roomCoverInputRef}
      roomTitle={roomTitle}
      roomWelcomeMessage={roomWelcomeMessage}
      commentSpeechEnabled={commentSpeechEnabled}
      commentSpeechSupported={commentSpeechSupported}
      liveNotificationEnabled={liveNotificationEnabled}
      locationSharingEnabled={locationSharingEnabled}
      locationSharingSupported={locationSharingSupported}
      locationSharingPending={locationSharingPending}
      onPickCover={onPickCover}
      onOpenCoverPicker={onOpenCoverPicker}
      onSaveRoomTitle={onSaveRoomTitle}
      onSaveRoomWelcomeMessage={onSaveRoomWelcomeMessage}
      onCommentSpeechEnabledChange={onCommentSpeechEnabledChange}
      onLiveNotificationEnabledChange={onLiveNotificationEnabledChange}
      onLocationSharingEnabledChange={onLocationSharingEnabledChange}
      roomInfoBlockedReason={roomInfoBlockedReason}
      onRoomInfoBlocked={onRoomInfoBlocked}
      onShare={onShare}
      shareSupported={shareSupported}
      watchLink={watchLink}
      onClose={() => setOpenPanel("")}
    />
  ) : null;
  const activePanelClassName = openPanel === "microphone" ? "is-microphone-panel" : "";

  return (
    <section className="page page-immersive live-desktop-page" data-page="live" hidden={hidden}>
      <div className="live-page-top">
        <div className="live-desktop-head-left">
          <button
            type="button"
            className={`live-page-close${publishControlActive ? " is-live-control" : ""}`}
            onClick={publishControlActive ? onTogglePublish : onRequestClose}
            aria-label={publishControlActive ? (isStarting ? "取消开播" : "结束直播") : "退出开播页"}
          >
            {publishControlActive ? <EndBroadcastIcon /> : <CloseIcon />}
          </button>
          <div className="live-desktop-head-identity">
            <UserAvatar
              avatarUrl={roomAvatarUrl}
              displayName={roomLabel}
              className="live-desktop-head-avatar"
              imgAlt={roomLabel || "主播头像"}
              imgWidth={30}
              imgHeight={30}
              monogramClassName="is-monogram"
              placeholderClassName="is-placeholder"
              iconClassName="live-desktop-head-avatar-icon"
            />
            <span>{desktopHostId}</span>
          </div>
        </div>
        {!publishControlActive ? (
          <div className="live-mode-switch" role="group" aria-label="开播模式">
            <button
              type="button"
              className={mediaMode === "video" ? "is-active" : ""}
              onClick={() => onSelectLiveMode?.("video")}
              aria-pressed={mediaMode === "video"}
            >
              视频
            </button>
            <button
              type="button"
              className={mediaMode === "voice" ? "is-active" : ""}
              onClick={() => onSelectLiveMode?.("voice")}
              aria-pressed={mediaMode === "voice"}
            >
              语音
            </button>
          </div>
        ) : null}
        <StatusPill id="publishBadge" label={publishBadge.label} state={publishBadge.state} />
      </div>
      <div className="page-grid live-layout">
        <section className="stage-column">
          <div className="stage-frame live-stage-frame">
            <LivePreviewStage
              previewVideoRef={previewVideoRef}
              previewActive={previewActive}
              previewHasVideo={previewHasVideo}
              previewPending={previewPending}
              mediaMode={mediaMode}
              mirrorPreview={mirrorPreview}
            />
          </div>
          <div className="live-desktop-overlay">
            {openPanel ? (
              <button
                type="button"
                className="live-desktop-backdrop"
                aria-label="关闭浮动面板"
                onClick={() => setOpenPanel("")}
              />
            ) : null}
            {publishBlockedReason ? (
              <p className="inline-warning live-desktop-warning">{publishBlockedReason}</p>
            ) : null}
            <div className="live-desktop-dock">
              <LiveDesktopPanel className={activePanelClassName}>{activePanel}</LiveDesktopPanel>

              <div className="live-desktop-actions" role="toolbar" aria-label="开播控制">
                <button
                  type="button"
                  className={`live-dock-button${mediaMode === "voice" ? " is-muted" : ""}${cameraUnavailable ? " is-unavailable has-tooltip" : ""}`}
                  onClick={handleCameraFlip}
                  aria-label={
                    mediaMode === "voice"
                      ? "语音模式下摄像头已关闭"
                      : cameraUnavailable
                        ? "未检测到可用摄像头"
                        : `翻转摄像头，当前${cameraMode === "rear" ? "后摄" : "前摄"}`
                  }
                  aria-describedby={cameraUnavailable ? "cameraUnavailableTooltip" : undefined}
                  aria-disabled={mediaMode === "voice" || cameraUnavailable ? "true" : undefined}
                  title={cameraUnavailable ? "未检测到可用摄像头" : "翻转摄像头"}
                >
                  <FlipCameraIcon />
                  {cameraUnavailable ? (
                    <span id="cameraUnavailableTooltip" className="live-dock-tooltip" role="tooltip">
                      未检测到可用摄像头
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "microphone" ? " is-active" : ""}${microphoneEnabled ? "" : " is-muted"}`}
                  onClick={handleMicrophoneClick}
                  aria-label={hasSingleMicrophone ? (microphoneEnabled ? "关闭麦克风" : "打开麦克风") : "麦克风设置"}
                  aria-expanded={hasSingleMicrophone ? undefined : openPanel === "microphone"}
                  title={hasSingleMicrophone ? (microphoneEnabled ? "关闭麦克风" : "打开麦克风") : "麦克风"}
                >
                  <MicrophoneIcon enabled={microphoneEnabled} />
                </button>
                <button
                  type="button"
                  className={`live-dock-button${screenShareActive ? " is-active" : ""}${screenShareUnavailable ? " is-unavailable has-tooltip" : ""}`}
                  onClick={handleScreenShareClick}
                  aria-label={screenShareButtonLabel}
                  aria-describedby={screenShareUnavailable ? "screenShareUnavailableTooltip" : undefined}
                  aria-disabled={screenShareUnavailable ? "true" : undefined}
                  title={screenShareButtonLabel}
                >
                  <ScreenShareIcon />
                  {screenShareUnavailable ? (
                    <span id="screenShareUnavailableTooltip" className="live-dock-tooltip" role="tooltip">
                      {screenShareUnavailableReason}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={`live-dock-button live-dock-button-primary${isPublishing ? " is-live" : ""}${isStarting ? " is-starting" : ""}`}
                  onClick={onTogglePublish}
                  aria-label={publishControlActive ? (isStarting ? "正在开始直播" : "结束直播") : "开始直播"}
                  title={publishControlActive ? (isStarting ? "正在开始直播" : "结束直播") : "开始直播"}
                  disabled={isStarting || publishBlocked || (!cameraEnabled && !microphoneEnabled)}
                >
                  <BroadcastIcon active={publishControlActive} />
                </button>
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "quality" ? " is-active" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "quality" ? "" : "quality"))}
                  aria-label="画质设置"
                  aria-expanded={openPanel === "quality"}
                  title="画质"
                >
                  <QualityIcon />
                </button>
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "link" ? " is-active" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "link" ? "" : "link"))}
                  aria-label="链接与分享"
                  aria-expanded={openPanel === "link"}
                  title="链接"
                >
                  <ShareIcon />
                </button>
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "more" ? " is-active" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "more" ? "" : "more"))}
                  aria-label="更多"
                  aria-expanded={openPanel === "more"}
                  title="更多"
                >
                  <MoreIcon />
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="control-column live-chat-column">
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
            chatRecovering={chatRecovering}
            canRetractMessages={canRetractMessages}
            onRetractMessage={onChatMessageRetract}
            title="评论"
            showWelcome={false}
          />
        </aside>
      </div>
    </section>
  );
}
