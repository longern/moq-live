import { useEffect, useState } from "preact/hooks";
import { ChatPanel } from "./ChatPanel.jsx";
import { StatusPill } from "./StatusPill.jsx";

function CameraIcon({ mode }) {
  if (mode === "off") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 7h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4z" />
        <path d="m16 11 4-2.5v7L16 13" />
        <path d="m5 5 14 14" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 7h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4z" />
      <path d="m16 11 4-2.5v7L16 13" />
      <path d={mode === "rear" ? "M9 10h4M11 8l2 2-2 2" : "M13 10H9m2 2-2-2 2-2"} />
    </svg>
  );
}

function MicrophoneIcon({ enabled }) {
  if (!enabled) {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M12 4a2 2 0 0 1 2 2v4" />
        <path d="M10 10V6a2 2 0 0 1 3.4-1.4" />
        <path d="M16 10a4 4 0 0 1-6.8 2.8" />
        <path d="M8 10a4 4 0 0 0 1 2.6" />
        <path d="M12 18v3" />
        <path d="M8 21h8" />
        <path d="m4 4 16 16" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 4a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V6a2 2 0 0 1 2-2Z" />
      <path d="M8 10a4 4 0 0 0 8 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

function BroadcastIcon({ active }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M9 6v12" />
        <path d="M15 6v12" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function ScreenShareIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="4.5" width="18" height="12.5" rx="2.5" />
      <path d="M8 20h8" />
      <path d="M12 17v3" />
      <path d="m10 9 2-2 2 2" />
      <path d="M12 7v6" />
      <path d="M9 12.5h6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M10 13.5 8.5 15a3 3 0 1 1-4.2-4.2l3-3A3 3 0 0 1 11.5 12" />
      <path d="m14 10.5 1.5-1.5a3 3 0 0 1 4.2 4.2l-3 3A3 3 0 0 1 12.5 12" />
      <path d="M9.5 14.5 14.5 9.5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="6" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18" cy="12" r="1.8" />
    </svg>
  );
}

function renderPreview(previewVideoRef, previewActive, previewHasVideo) {
  return (
    <div class="publisher-host" id="publisherHost">
      <video
        ref={previewVideoRef}
        class="publisher-preview"
        id="publisherPreview"
        autoplay
        playsinline
        muted
        hidden={!previewActive || !previewHasVideo}
      />
      {!previewActive ? (
        <div class="publisher-placeholder">
          <p>打开摄像头预览</p>
        </div>
      ) : !previewHasVideo ? (
        <div class="publisher-placeholder">
          <p>仅检测到麦克风，可进行纯音频开播</p>
        </div>
      ) : null}
    </div>
  );
}

export function LivePage({
  hidden,
  room,
  roomLabel,
  watchLink,
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
  onCameraChange,
  onMicrophoneChange,
  onCycleCamera,
  onToggleMicrophone,
  onTogglePublish,
  onStartPublish,
  onStopPublish,
  onRegenerateRoom,
  onCopyWatchLink,
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
  onChatRequireLogin
}) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [moreOpen, setMoreOpen] = useState(false);
  const [openPanel, setOpenPanel] = useState("");

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => {
      setIsMobile(media.matches);
      if (media.matches) {
        setOpenPanel("");
      } else {
        setMoreOpen(false);
      }
    };

    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (!openPanel || isMobile) {
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
  }, [isMobile, openPanel]);

  if (isMobile) {
    return (
      <section class="page page-immersive live-mobile-page" data-page="live" hidden={hidden}>
        <div class="live-mobile-shell">
          <div class="live-mobile-head">
            <strong class="live-mobile-room">{roomLabel}</strong>
            <StatusPill id="publishBadgeOverlay" label={publishBadge.label} state={publishBadge.state} />
          </div>
          <div class="stage-frame live-stage-frame live-stage-frame-mobile">
            {renderPreview(previewVideoRef, previewActive, previewHasVideo)}
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
                disabled={publishBlocked || (!cameraEnabled && !microphoneEnabled)}
                aria-label={isPublishing ? "停止开播" : "开始开播"}
              >
                <BroadcastIcon active={isPublishing} />
              </button>
              <button
                type="button"
                class="live-fab"
                onClick={onShare}
                aria-label="复制观看链接"
              >
                <ShareIcon />
              </button>
              <button
                type="button"
                class={`live-fab${moreOpen ? " is-active" : ""}`}
                onClick={() => setMoreOpen((open) => !open)}
                aria-label={moreOpen ? "关闭更多操作" : "打开更多操作"}
              >
                <MoreIcon />
              </button>
            </div>
          </div>

          {moreOpen ? (
            <>
              <button
                type="button"
                class="live-mobile-more-backdrop"
                aria-label="关闭更多操作"
                onClick={() => setMoreOpen(false)}
              />
              <div class="live-mobile-more-panel">
                <div class="live-mobile-more-header">
                  <strong>{room}</strong>
                  <span>{publishStatus}</span>
                </div>
                <button
                  type="button"
                  class="secondary"
                  onClick={() => {
                    onRegenerateRoom();
                    setMoreOpen(false);
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
                  }}
                  disabled={publishBlocked}
                >
                  {syntheticPublishing ? "停止合成源" : "使用合成源"}
                </button>
                <button
                  type="button"
                  class="secondary"
                  onClick={() => {
                    onCopyWatchLink();
                    setMoreOpen(false);
                  }}
                >
                  复制观看链接
                </button>
              </div>
            </>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section class="page page-immersive" data-page="live" hidden={hidden}>
      <div class="page-grid live-layout">
        <section class="stage-column">
          <div class="stage-frame live-stage-frame">
            {renderPreview(previewVideoRef, previewActive, previewHasVideo)}
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
              {openPanel ? (
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
                              ? (isPublishing
                                  ? "当前正在以屏幕共享开播"
                                  : "当前预览源为屏幕共享")
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
                        <button
                          type="button"
                          onClick={onStartScreenShare}
                          disabled={!screenShareSupported || isPublishing}
                        >
                          {screenShareActive ? "重新选择共享内容" : "开始屏幕共享"}
                        </button>
                        <button
                          type="button"
                          class="secondary"
                          onClick={onStopScreenShare}
                          disabled={!screenShareActive || isPublishing}
                        >
                          停止共享
                        </button>
                      </div>
                      <div class="summary-item live-desktop-summary">
                        <strong>预览源</strong>
                        <span>{previewSourceType === "screen" ? "当前预览来自屏幕共享" : "当前预览来自摄像头"}</span>
                      </div>
                    </>
                  ) : null}

                  {openPanel === "link" ? (
                    <>
                      <div class="live-desktop-panel-head">
                        <strong>直播链接</strong>
                        <span>{watchLink === "等待生成观看链接" ? "等待生成" : "可直接分享"}</span>
                      </div>
                      <label>
                        房间 ID
                        <input id="liveRoomId" value={room} readonly />
                      </label>
                      <label>
                        观看链接
                        <input id="watchLinkInput" value={watchLink === "等待生成观看链接" ? "" : watchLink} readonly />
                      </label>
                      <div class="action-row">
                        <button type="button" id="copyRoomLink" onClick={onCopyWatchLink}>复制观看链接</button>
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
              ) : null}

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
                  aria-label="复制观看链接"
                  title="复制观看链接"
                >
                  <ShareIcon />
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside class="control-column live-chat-column">
          <ChatPanel
            room={room}
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
            emptyText="还没有评论，开播后等观众来互动。"
          />
        </aside>
      </div>
    </section>
  );
}
