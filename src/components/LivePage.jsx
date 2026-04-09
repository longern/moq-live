import { useEffect, useState } from "preact/hooks";
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
  onStartSynthetic,
  onStopSynthetic
}) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => {
      setIsMobile(media.matches);
      if (!media.matches) {
        setMoreOpen(false);
      }
    };

    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

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
          <div class="info-strip">
            <div class="info-item">
              <strong data-room-label>{roomLabel}</strong>
            </div>
            <div class="info-item">
              <strong data-publish-status>{publishBadge.label}</strong>
            </div>
          </div>
        </section>

        <aside class="control-column">
          <div class="info-strip info-strip-mobile">
            <div class="info-item">
              <strong data-room-label>{roomLabel}</strong>
            </div>
            <div class="info-item info-item-pill">
              <StatusPill id="publishBadgeInlineMobile" label={publishBadge.label} state={publishBadge.state} />
            </div>
          </div>
          <section class="control-block">
            <div class="control-head">
              <h3>开播</h3>
              <StatusPill id="publishBadge" label={publishBadge.label} state={publishBadge.state} />
            </div>
            <label>
              摄像头
              <select id="cameraSelect" value={selectedCameraId} onChange={onCameraChange} disabled={isPublishing}>
                {cameraOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              麦克风
              <select id="microphoneSelect" value={selectedMicrophoneId} onChange={onMicrophoneChange} disabled={isPublishing}>
                {microphoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <div class="action-row">
              <button type="button" id="startPublish" onClick={onStartPublish} disabled={isPublishing || !previewActive || publishBlocked}>开始开播</button>
              <button type="button" id="stopPublish" class="secondary" onClick={onStopPublish} disabled={!isPublishing}>停止开播</button>
            </div>
            <label>
              房间 ID
              <input id="liveRoomId" value={room} readonly />
            </label>
            {publishBlocked ? (
              <p class="inline-warning">{publishBlockedReason}</p>
            ) : null}
            <div class="action-row">
              <button type="button" id="regenRoom" class="secondary" onClick={onRegenerateRoom}>重新生成房间</button>
              <button type="button" id="copyRoomLink" onClick={onCopyWatchLink}>复制观看链接</button>
            </div>
            <label>
              观看链接
              <input id="watchLinkInput" value={watchLink === "等待生成观看链接" ? "" : watchLink} readonly />
            </label>
          </section>

          <section class="control-block">
            <h3>合成源</h3>
            <div class="action-row">
              <button type="button" class="tertiary" id="startSynthetic" onClick={onStartSynthetic} disabled={publishBlocked}>启动合成源</button>
              <button type="button" class="secondary" id="stopSynthetic" onClick={onStopSynthetic}>停止合成源</button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
