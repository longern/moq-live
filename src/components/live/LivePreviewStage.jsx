export function LivePreviewStage({
  previewVideoRef,
  previewActive,
  previewHasVideo,
  mirrorPreview = false
}) {
  return (
    <div className="publisher-host" id="publisherHost">
      <video
        ref={previewVideoRef}
        className={`publisher-preview${mirrorPreview ? " is-mirrored" : ""}`}
        id="publisherPreview"
        autoPlay
        playsInline
        muted
        hidden={!previewActive || !previewHasVideo}
      />
      {!previewActive ? (
        <div className="publisher-placeholder">
          <p>打开摄像头预览</p>
        </div>
      ) : !previewHasVideo ? (
        <div className="publisher-placeholder">
          <p>仅检测到麦克风，可进行纯音频开播</p>
        </div>
      ) : null}
    </div>
  );
}
