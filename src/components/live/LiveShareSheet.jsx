import { Copy, QrCode, Share } from "lucide-react";
import { SwipeableDrawer } from "../SwipeableDrawer.jsx";

export function LiveShareSheet({
  open,
  onClose,
  onCopyLink,
  onOpenImageShare,
  onShareLink,
  shareSupported = false,
  watchLink = "",
}) {
  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel="关闭分享面板"
      className="live-mobile-drawer"
      panelClassName="live-mobile-share-panel"
    >
      <div className="watch-mobile-more-actions live-share-actions" role="group" aria-label="分享直播间">
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={async () => {
            await onShareLink?.();
            onClose?.();
          }}
          disabled={!watchLink || !shareSupported}
          aria-label="分享直播间"
        >
          <span className="watch-mobile-more-action-icon">
            <Share aria-hidden="true" />
          </span>
          <span>分享</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={onOpenImageShare}
          disabled={!watchLink}
          aria-label="图片分享"
        >
          <span className="watch-mobile-more-action-icon">
            <QrCode aria-hidden="true" />
          </span>
          <span>图片分享</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={async () => {
            await onCopyLink?.();
            onClose?.();
          }}
          disabled={!watchLink}
          aria-label="复制直播链接"
        >
          <span className="watch-mobile-more-action-icon">
            <Copy aria-hidden="true" />
          </span>
          <span>复制链接</span>
        </button>
      </div>
    </SwipeableDrawer>
  );
}
