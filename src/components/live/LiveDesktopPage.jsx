import { useEffect, useState } from "preact/hooks";
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

function LiveDesktopPanel(props) {
  const {
    openPanel,
    cameraMode,
    selectedCameraId,
    selectedMicrophoneId,
    cameraOptions,
    microphoneOptions,
    microphoneEnabled,
    isPublishing,
    screenShareSupported,
    screenShareActive,
    previewSourceType,
    onCameraChange,
    onMicrophoneChange,
    onCycleCamera,
    onToggleMicrophone,
    onStartScreenShare,
    onStopScreenShare,
    watchLink,
    shareTarget,
    onShare,
    shareSupported,
    onRegenerateRoom,
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
    onOpenCoverPicker
  } = props;
  const sharingNamespace = shareTarget.startsWith("ns:");

  if (!openPanel) {
    return null;
  }

  return (
    <section class="live-desktop-panel">
      {openPanel === "camera" ? (
        <>
          <div class="live-desktop-panel-head">
            <strong>摄像头</strong>
            <span>{cameraMode === "off" ? "当前已关闭" : cameraMode === "rear" ? "当前后置" : "当前前置"}</span>
          </div>
          <label>
            选择设备
            <select id="cameraSelect" value={selectedCameraId} onChange={onCameraChange} disabled={isPublishing}>
              {cameraOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div class="action-row">
            <button type="button" class="secondary" onClick={onCycleCamera}>
              {cameraMode === "off" ? "打开摄像头" : "切换前后摄"}
            </button>
          </div>
        </>
      ) : null}

      {openPanel === "microphone" ? (
        <>
          <div class="live-desktop-panel-head">
            <strong>麦克风</strong>
            <span>{microphoneEnabled ? "正在采集声音" : "当前已静音"}</span>
          </div>
          <label>
            选择设备
            <select id="microphoneSelect" value={selectedMicrophoneId} onChange={onMicrophoneChange} disabled={isPublishing}>
              {microphoneOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <div class="action-row">
            <button type="button" class="secondary" onClick={onToggleMicrophone}>
              {microphoneEnabled ? "关闭麦克风" : "打开麦克风"}
            </button>
          </div>
        </>
      ) : null}

      {openPanel === "screen" ? (
        <>
          <div class="live-desktop-panel-head">
            <strong>屏幕分享</strong>
            <span>
              {!screenShareSupported
                ? "当前浏览器不支持"
                : screenShareActive
                  ? (isPublishing ? "当前正在以屏幕共享开播" : "当前预览源为屏幕共享")
                  : "选择窗口或整个屏幕作为开播源"}
            </span>
          </div>
          {isPublishing ? (
            <div class="summary-item live-desktop-summary">
              <strong>当前状态</strong>
              <span>直播中不能切换共享源，先停止开播再重新选择屏幕共享或摄像头。</span>
            </div>
          ) : null}
          <div class="action-row">
            <button type="button" onClick={onStartScreenShare} disabled={!screenShareSupported || isPublishing}>
              {screenShareActive ? "重新选择共享内容" : "开始屏幕共享"}
            </button>
            <button type="button" class="secondary" onClick={onStopScreenShare} disabled={!screenShareActive || isPublishing}>
              停止共享
            </button>
          </div>
          <div class="summary-item live-desktop-summary">
            <strong>预览源</strong>
            <span>
              {previewSourceType === "screen"
                ? "当前预览来自屏幕共享"
                : previewSourceType === "synthetic"
                  ? "当前预览来自合成源"
                  : "当前预览来自摄像头"}
            </span>
          </div>
        </>
      ) : null}

      {openPanel === "link" ? (
        <>
          <div class="live-desktop-panel-head">
            <strong>直播链接</strong>
            <span>{watchLink ? "可直接分享" : "等待生成"}</span>
          </div>
          <label>
            {sharingNamespace ? "直播 namespace" : "主播 handle"}
            <input id="liveRoomId" value={shareTarget} readonly />
          </label>
          <label>
            观看链接
            <input id="watchLinkInput" value={watchLink} readonly />
          </label>
          <div class="action-row">
            <button type="button" id="copyRoomLink" onClick={onShare} disabled={!shareSupported || !watchLink}>
              分享直播间
            </button>
            <button type="button" id="regenRoom" class="secondary" onClick={onRegenerateRoom}>重新生成房间</button>
          </div>
        </>
      ) : null}

      {openPanel === "more" ? (
        <>
          <div class="live-desktop-panel-head">
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
          <div class="action-row">
            <button
              type="button"
              class="tertiary"
              id="startSynthetic"
              onClick={onStartSynthetic}
              disabled={publishBlocked || syntheticPublishing}
            >
              启动合成源
            </button>
            <button
              type="button"
              class="secondary"
              id="stopSynthetic"
              onClick={onStopSynthetic}
              disabled={!syntheticPublishing}
            >
              停止合成源
            </button>
          </div>
        </>
      ) : null}
    </section>
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
    onRegenerateRoom,
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

  return (
    <section class="page page-immersive" data-page="live" hidden={hidden}>
      <div class="page-grid live-layout">
        <section class="stage-column">
          <div class="stage-frame live-stage-frame">
            <LivePreviewStage
              previewVideoRef={previewVideoRef}
              previewActive={previewActive}
              previewHasVideo={previewHasVideo}
              mirrorPreview={mirrorPreview}
            />
          </div>
          <div class="live-desktop-overlay">
            {openPanel ? (
              <button
                type="button"
                class="live-desktop-backdrop"
                aria-label="关闭浮动面板"
                onClick={() => setOpenPanel("")}
              />
            ) : null}
            <div class="live-desktop-meta">
              <div class="live-desktop-room">
                <span>直播间</span>
                <strong data-room-label>{roomLabel}</strong>
              </div>
              <StatusPill id="publishBadge" label={publishBadge.label} state={publishBadge.state} />
            </div>

            <div class="live-desktop-dock">
              <LiveDesktopPanel
                openPanel={openPanel}
                cameraMode={cameraMode}
                selectedCameraId={selectedCameraId}
                selectedMicrophoneId={selectedMicrophoneId}
                cameraOptions={cameraOptions}
                microphoneOptions={microphoneOptions}
                microphoneEnabled={microphoneEnabled}
                isPublishing={isPublishing}
                screenShareSupported={screenShareSupported}
                screenShareActive={screenShareActive}
                previewSourceType={previewSourceType}
                onCameraChange={onCameraChange}
                onMicrophoneChange={onMicrophoneChange}
                onCycleCamera={onCycleCamera}
                onToggleMicrophone={onToggleMicrophone}
                onStartScreenShare={onStartScreenShare}
                onStopScreenShare={onStopScreenShare}
                watchLink={watchLink}
                shareTarget={shareTarget}
                onShare={onShare}
                shareSupported={shareSupported}
                onRegenerateRoom={onRegenerateRoom}
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

              {publishBlocked ? (
                <p class="inline-warning live-desktop-warning">{publishBlockedReason}</p>
              ) : null}

              <div class="live-desktop-actions" role="toolbar" aria-label="开播控制">
                <button
                  type="button"
                  class={`live-dock-button${openPanel === "camera" ? " is-active" : ""}${cameraMode === "off" ? " is-muted" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "camera" ? "" : "camera"))}
                  aria-label="摄像头设置"
                  aria-expanded={openPanel === "camera"}
                  title="摄像头"
                >
                  <CameraIcon mode={cameraMode} />
                </button>
                <button
                  type="button"
                  class={`live-dock-button${openPanel === "microphone" ? " is-active" : ""}${microphoneEnabled ? "" : " is-muted"}`}
                  onClick={() => setOpenPanel((current) => (current === "microphone" ? "" : "microphone"))}
                  aria-label="麦克风设置"
                  aria-expanded={openPanel === "microphone"}
                  title="麦克风"
                >
                  <MicrophoneIcon enabled={microphoneEnabled} />
                </button>
                <button
                  type="button"
                  class={`live-dock-button${openPanel === "screen" || screenShareActive ? " is-active" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "screen" ? "" : "screen"))}
                  aria-label="屏幕分享设置"
                  aria-expanded={openPanel === "screen"}
                  title="屏幕分享"
                >
                  <ScreenShareIcon />
                </button>
                <button
                  type="button"
                  class={`live-dock-button live-dock-button-primary${isPublishing ? " is-live" : ""}`}
                  onClick={onTogglePublish}
                  aria-label={isPublishing ? "停止开播" : "开始开播"}
                  title={isPublishing ? "停止开播" : "开始开播"}
                  disabled={publishBlocked || (!cameraEnabled && !microphoneEnabled)}
                >
                  <BroadcastIcon active={isPublishing} />
                </button>
                <button
                  type="button"
                  class={`live-dock-button${openPanel === "link" ? " is-active" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "link" ? "" : "link"))}
                  aria-label="链接与分享"
                  aria-expanded={openPanel === "link"}
                  title="链接"
                >
                  <LinkIcon />
                </button>
                <button
                  type="button"
                  class={`live-dock-button${openPanel === "more" ? " is-active" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "more" ? "" : "more"))}
                  aria-label="更多"
                  aria-expanded={openPanel === "more"}
                  title="更多"
                >
                  <MoreIcon />
                </button>
                <button
                  type="button"
                  class="live-dock-button"
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

        <aside class="control-column live-chat-column">
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
            showComposer={false}
            showWelcome={false}
          />
        </aside>
      </div>
    </section>
  );
}
