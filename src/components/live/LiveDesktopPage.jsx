import { useEffect, useState } from "react";
import { ChatPanel } from "../ChatPanel.jsx";
import { StatusPill } from "../StatusPill.jsx";
import {
  BroadcastIcon,
  CameraIcon,
  LinkIcon,
  MicrophoneIcon,
  MoreIcon,
  ScreenShareIcon,
  ShareIcon
} from "./liveIcons.jsx";
import { LiveCoverManager } from "./LiveCoverManager.jsx";
import { LivePreviewStage } from "./LivePreviewStage.jsx";

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
          {cameraMode === "off" ? "打开摄像头" : "切换前后摄"}
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
  syntheticPublishing,
  publishBlocked,
  publishStatus,
  onStartSynthetic,
  onStopSynthetic,
  roomCoverUrl,
  roomCoverLoading,
  roomCoverBusy,
  roomCoverError,
  roomCoverStatus,
  roomCoverInputRef,
  onPickCover,
  onOpenCoverPicker,
}) {
  return (
    <>
      <div className="live-desktop-panel-head">
        <strong>更多</strong>
        <span>{syntheticPublishing ? "当前合成源已启动" : publishStatus}</span>
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
        showNote={true}
      />
      <div className="action-row">
        <button
          type="button"
          className="success"
          id="startSynthetic"
          onClick={onStartSynthetic}
          disabled={publishBlocked || syntheticPublishing}
        >
          启动合成源
        </button>
        <button
          type="button"
          className="secondary"
          id="stopSynthetic"
          onClick={onStopSynthetic}
          disabled={!syntheticPublishing}
        >
          停止合成源
        </button>
      </div>
    </>
  );
}

export function LiveDesktopPage(props) {
  const [openPanel, setOpenPanel] = useState("");
  const {
    hidden,
    room,
    roomLabel,
    publishBlocked,
    publishBlockedReason,
    publishStatus,
    publishBadge,
    cameraOptions,
    microphoneOptions,
    selectedCameraId,
    selectedMicrophoneId,
    cameraEnabled,
    microphoneEnabled,
    cameraMode,
    isPublishing,
    previewActive,
    previewHasVideo,
    previewSourceType,
    screenShareSupported,
    screenShareActive,
    syntheticPublishing,
    previewVideoRef,
    mirrorPreview,
    onCameraChange,
    onMicrophoneChange,
    onCycleCamera,
    onToggleMicrophone,
    onTogglePublish,
    onShare,
    onStartScreenShare,
    onStopScreenShare,
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
    shareSupported,
    watchLink,
    shareTarget,
    roomCoverUrl,
    roomCoverLoading,
    roomCoverBusy,
    roomCoverError,
    roomCoverStatus,
    roomCoverInputRef,
    onPickCover,
    onOpenCoverPicker
  } = props;
  const cameraUnavailable = (cameraOptions?.length ?? 0) === 0;
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
  ) : openPanel === "link" ? (
    <ShareLinkPanel
      watchLink={watchLink}
      shareTarget={shareTarget}
      onShare={onShare}
      shareSupported={shareSupported}
    />
  ) : openPanel === "more" ? (
    <MorePanel
      syntheticPublishing={syntheticPublishing}
      publishBlocked={publishBlocked}
      publishStatus={publishStatus}
      onStartSynthetic={onStartSynthetic}
      onStopSynthetic={onStopSynthetic}
      roomCoverUrl={roomCoverUrl}
      roomCoverLoading={roomCoverLoading}
      roomCoverBusy={roomCoverBusy}
      roomCoverError={roomCoverError}
      roomCoverStatus={roomCoverStatus}
      roomCoverInputRef={roomCoverInputRef}
      onPickCover={onPickCover}
      onOpenCoverPicker={onOpenCoverPicker}
    />
  ) : null;
  const activePanelClassName = openPanel === "microphone" ? "is-microphone-panel" : "";

  return (
    <section className="page page-immersive" data-page="live" hidden={hidden}>
      <div className="page-grid live-layout">
        <section className="stage-column">
          <div className="stage-frame live-stage-frame">
            <LivePreviewStage
              previewVideoRef={previewVideoRef}
              previewActive={previewActive}
              previewHasVideo={previewHasVideo}
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
            <div className="live-desktop-meta">
              <div className="live-desktop-room">
                <span>直播间</span>
                <strong data-room-label>{roomLabel}</strong>
              </div>
              <StatusPill id="publishBadge" label={publishBadge.label} state={publishBadge.state} />
            </div>

            <div className="live-desktop-dock">
              <LiveDesktopPanel className={activePanelClassName}>{activePanel}</LiveDesktopPanel>

              {publishBlocked ? (
                <p className="inline-warning live-desktop-warning">{publishBlockedReason}</p>
              ) : null}

              <div className="live-desktop-actions" role="toolbar" aria-label="开播控制">
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "camera" ? " is-active" : ""}${cameraMode === "off" ? " is-muted" : ""}${cameraUnavailable ? " is-unavailable has-tooltip" : ""}`}
                  onClick={() => {
                    if (cameraUnavailable) {
                      setOpenPanel((current) => (current === "camera" ? "" : current));
                      return;
                    }
                    setOpenPanel((current) => (current === "camera" ? "" : "camera"));
                  }}
                  aria-label={cameraUnavailable ? "未检测到可用摄像头" : "摄像头设置"}
                  aria-describedby={cameraUnavailable ? "cameraUnavailableTooltip" : undefined}
                  aria-expanded={cameraUnavailable ? undefined : openPanel === "camera"}
                  aria-disabled={cameraUnavailable ? "true" : undefined}
                  title={cameraUnavailable ? "未检测到可用摄像头" : "摄像头"}
                >
                  <CameraIcon mode={cameraMode} />
                  {cameraUnavailable ? (
                    <span id="cameraUnavailableTooltip" className="live-dock-tooltip" role="tooltip">
                      未检测到可用摄像头
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "microphone" ? " is-active" : ""}${microphoneEnabled ? "" : " is-muted"}`}
                  onClick={() => setOpenPanel((current) => (current === "microphone" ? "" : "microphone"))}
                  aria-label="麦克风设置"
                  aria-expanded={openPanel === "microphone"}
                  title="麦克风"
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
                  className={`live-dock-button live-dock-button-primary${isPublishing ? " is-live" : ""}`}
                  onClick={onTogglePublish}
                  aria-label={isPublishing ? "停止开播" : "开始开播"}
                  title={isPublishing ? "停止开播" : "开始开播"}
                  disabled={publishBlocked || (!cameraEnabled && !microphoneEnabled)}
                >
                  <BroadcastIcon active={isPublishing} />
                </button>
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "link" ? " is-active" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "link" ? "" : "link"))}
                  aria-label="链接与分享"
                  aria-expanded={openPanel === "link"}
                  title="链接"
                >
                  <LinkIcon />
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
                <button
                  type="button"
                  className="live-dock-button"
                  onClick={onShare}
                  aria-label="分享直播间"
                  title="分享直播间"
                  disabled={!shareSupported || !watchLink}
                >
                  <ShareIcon />
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
            title="评论"
            showWelcome={false}
          />
        </aside>
      </div>
    </section>
  );
}
