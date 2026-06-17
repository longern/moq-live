import { SwipeableDrawer } from "../primitives/SwipeableDrawer.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

export function LiveMobileAudienceSheet({
  open,
  onClose,
  audienceCountText,
  loggedInViewers,
}) {
  const { t } = useI18n();

  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel={t("watchSheet.closeAudience")}
      className="live-mobile-drawer live-mobile-audience-drawer"
      panelClassName="live-mobile-audience-panel"
    >
      <div className="live-audience-head">
        <strong>{t("watchSheet.onlineUsers")}</strong>
        <span>{t("watchSheet.peopleCount", { count: audienceCountText })}</span>
      </div>
      {loggedInViewers.length > 0 ? (
        <div className="live-audience-list">
          {loggedInViewers.map((viewer) => {
            const displayName = viewer.displayName || t("common.signedInUser");
            return (
              <div className="live-audience-row" key={viewer.id}>
                <UserAvatar
                  avatarUrl={viewer.avatarUrl}
                  displayName={displayName}
                  className="live-audience-avatar"
                  imgAlt={t("common.userAvatar")}
                  imgWidth={48}
                  imgHeight={48}
                  monogramClassName="is-monogram"
                  placeholderClassName="is-placeholder"
                  iconClassName="live-audience-avatar-icon"
                />
                <span>{displayName}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="live-audience-empty">{t("watchSheet.noOnlineUsers")}</div>
      )}
    </SwipeableDrawer>
  );
}
