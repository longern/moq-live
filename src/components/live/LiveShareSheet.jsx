import { Camera, Copy, QrCode, Share } from "lucide-react";
import { SwipeableDrawer } from "../primitives/SwipeableDrawer.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function LiveShareSheet({
  open,
  onClose,
  onCopyLink,
  onOpenImageShare,
  onOpenScreenshotShare,
  onShareLink,
  screenshotShareAvailable = false,
  shareSupported = false,
  watchLink = "",
}) {
  const { t } = useI18n();

  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel={t("live.closeSharePanel")}
      className="live-mobile-drawer"
      panelClassName="live-mobile-share-panel"
    >
      <div className="watch-mobile-more-actions live-share-actions" role="group" aria-label={t("live.shareRoom")}>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={async () => {
            await onShareLink?.();
            onClose?.();
          }}
          disabled={!watchLink || !shareSupported}
          aria-label={t("live.shareRoom")}
        >
          <span className="watch-mobile-more-action-icon">
            <Share aria-hidden="true" />
          </span>
          <span>{t("live.nativeShare")}</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={onOpenImageShare}
          disabled={!watchLink}
          aria-label={t("live.imageShare")}
        >
          <span className="watch-mobile-more-action-icon">
            <QrCode aria-hidden="true" />
          </span>
          <span>{t("live.imageShare")}</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={onOpenScreenshotShare}
          disabled={!watchLink || !screenshotShareAvailable}
          aria-label={t("live.screenshotShare")}
        >
          <span className="watch-mobile-more-action-icon">
            <Camera aria-hidden="true" />
          </span>
          <span>{t("live.screenshotShare")}</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={async () => {
            await onCopyLink?.();
            onClose?.();
          }}
          disabled={!watchLink}
          aria-label={t("live.copyLiveLink")}
        >
          <span className="watch-mobile-more-action-icon">
            <Copy aria-hidden="true" />
          </span>
          <span>{t("live.copyLiveLink")}</span>
        </button>
      </div>
    </SwipeableDrawer>
  );
}
