import { Copy, Download, Share, X } from "lucide-react";
import { LoadingSpinner } from "../primitives/LoadingSpinner.jsx";

export function WatchImageShareDialog({
  imageShareClosing = false,
  imageShareReady = false,
  imageShareTitle = "图片分享",
  onClose,
  onCopyImage,
  onSaveImage,
  onShareImage,
  roomLabel,
  shareImageAlt = "",
  shareImageLoading = false,
  shareImageUrl = "",
  shareSupported = false,
}) {
  const dialogTitle = imageShareTitle || "图片分享";
  const imageAlt = shareImageAlt || `${roomLabel}直播间二维码分享图`;

  return (
    <div className={`watch-share-image-layer${imageShareClosing ? " is-closing" : ""}`}>
      <button
        type="button"
        className="watch-share-image-backdrop"
        aria-label="关闭图片分享"
        onClick={onClose}
      />
      <section
        className="watch-share-image-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={dialogTitle}
      >
        <div className="watch-share-image-head">
          <h3>{dialogTitle}</h3>
          <button
            type="button"
            className="watch-share-image-close"
            aria-label="关闭图片分享"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="watch-share-image-preview">
          {shareImageLoading ? (
            <LoadingSpinner className="watch-share-image-spinner" />
          ) : shareImageUrl ? (
            <img src={shareImageUrl} alt={imageAlt} />
          ) : null}
        </div>
        <div className="watch-share-image-actions">
          <button
            type="button"
            onClick={onShareImage}
            disabled={!imageShareReady || !shareSupported}
          >
            <Share aria-hidden="true" />
            <span>分享</span>
          </button>
          <button
            type="button"
            onClick={onCopyImage}
            disabled={!imageShareReady}
          >
            <Copy aria-hidden="true" />
            <span>复制图片</span>
          </button>
          <button
            type="button"
            onClick={onSaveImage}
            disabled={!imageShareReady}
          >
            <Download aria-hidden="true" />
            <span>保存图片</span>
          </button>
        </div>
      </section>
    </div>
  );
}

export function WatchDesktopSharePanel({
  left = 0,
  onClose,
  onCopyLink,
  onShareLink,
  open = false,
  shareSupported = false,
  top = 0,
  visible = false,
  watchLink = "",
}) {
  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="watch-desktop-share-backdrop"
        aria-label="关闭分享面板"
        onClick={onClose}
      />
      <section
        className={`watch-desktop-share-panel${visible ? " is-open" : ""}`}
        style={{
          left: `${left}px`,
          top: `${top}px`,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="分享到"
      >
        <div className="watch-desktop-share-title">分享到</div>
        <ul className="watch-desktop-share-actions">
          <li>
            <button
              type="button"
              className="watch-desktop-share-action"
              onClick={onCopyLink}
              disabled={!watchLink}
            >
              <Copy aria-hidden="true" />
              <span>复制链接</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className="watch-desktop-share-action"
              onClick={onShareLink}
              disabled={!watchLink || !shareSupported}
            >
              <Share aria-hidden="true" />
              <span>分享</span>
            </button>
          </li>
        </ul>
      </section>
    </>
  );
}
