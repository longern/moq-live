export function LivePreviewStage({
  previewVideoRef,
  previewActive,
  previewHasVideo,
  mirrorPreview = false
}) {
  return (
    <div class="publisher-host" id="publisherHost">
      <video
        ref={previewVideoRef}
        class={`publisher-preview${mirrorPreview ? " is-mirrored" : ""}`}
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
