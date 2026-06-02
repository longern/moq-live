import { LoadingSpinner } from "../LoadingSpinner.jsx";

export function LivePreviewStage({
  previewVideoRef,
  previewActive,
  previewHasVideo,
  previewPending = false,
  mediaMode = "video",
  mirrorPreview = false
}) {
  const showPending = mediaMode === "video" && previewPending && !previewHasVideo;
  const placeholderText = !previewActive
    ? (mediaMode === "voice" ? "语音直播" : "打开摄像头预览")
    : mediaMode === "voice"
      ? "语音直播"
      : "未检测到摄像头";

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
      {!previewActive || !previewHasVideo ? (
        <div className="publisher-placeholder">
          {showPending ? (
            <LoadingSpinner className="publisher-preview-spinner" label="正在打开摄像头" />
          ) : (
            <p>{placeholderText}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
