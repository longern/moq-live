import { StatusPill } from "./StatusPill.jsx";

export function LivePage({
  hidden,
  room,
  roomLabel,
  watchLink,
  publishStatus,
  publishBadge,
  cameraOptions,
  microphoneOptions,
  selectedCameraId,
  selectedMicrophoneId,
  isPublishing,
  previewActive,
  previewVideoRef,
  onCameraChange,
  onMicrophoneChange,
  onStartPublish,
  onStopPublish,
  onRegenerateRoom,
  onCopyWatchLink,
  onStartSynthetic,
  onStopSynthetic
}) {
  return (
    <section class="page page-immersive" data-page="live" hidden={hidden}>
      <div class="page-grid live-layout">
        <section class="stage-column">
          <div class="stage-frame live-stage-frame">
            <div class="publisher-host" id="publisherHost">
              <video
                ref={previewVideoRef}
                class="publisher-preview"
                id="publisherPreview"
                autoplay
                playsinline
                muted
                hidden={!previewActive}
              />
              {!previewActive ? (
                <div class="publisher-placeholder">
                  <p>打开摄像头预览</p>
                </div>
              ) : null}
            </div>
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
              <button type="button" id="startPublish" onClick={onStartPublish} disabled={isPublishing || !previewActive}>开始开播</button>
              <button type="button" id="stopPublish" class="secondary" onClick={onStopPublish} disabled={!isPublishing}>停止开播</button>
            </div>
            <label>
              房间 ID
              <input id="liveRoomId" value={room} readonly />
            </label>
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
              <button type="button" class="tertiary" id="startSynthetic" onClick={onStartSynthetic}>启动合成源</button>
              <button type="button" class="secondary" id="stopSynthetic" onClick={onStopSynthetic}>停止合成源</button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
