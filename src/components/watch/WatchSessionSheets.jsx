import { Camera, Copy, PhoneCall, PhoneOff, PictureInPicture2, QrCode, Share } from "lucide-react";
import { SwipeableDrawer } from "../primitives/SwipeableDrawer.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { ProfileBio, ProfileInfoChips } from "../ProfileInfoSummary.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

function getWatchSheetDrawerProps({
  className,
  panelClassName,
  portalTarget,
  presentation,
}) {
  const fullscreenSide = presentation === "fullscreen-side";
  const fullscreenSidePending = fullscreenSide && !portalTarget;
  return {
    backdropClassName: fullscreenSide ? "watch-fullscreen-side-sheet-backdrop" : "",
    className: [
      className,
      fullscreenSide ? "watch-fullscreen-side-sheet-drawer" : "",
    ].filter(Boolean).join(" "),
    panelClassName: [
      panelClassName,
      fullscreenSide ? "watch-fullscreen-side-sheet-panel" : "",
    ].filter(Boolean).join(" "),
    fullscreenSidePending,
    portal: fullscreenSide,
    portalTarget,
  };
}

export function WatchMobileMoreSheet({
  open,
  onClose,
  hostAvatarUrl,
  hostChipLabel,
  watchLink,
  shareSupported,
  elementPipSupported,
  videoPipSupported,
  playerSession,
  pictureInPictureActive,
  audienceCallEnabled = false,
  audienceCallConnected = false,
  onShareWatchLink,
  onOpenImageShareModal,
  onOpenScreenshotShareModal,
  onCopyWatchLink,
  onAudienceCallRequest,
  onAudienceCallDisconnect,
  onOpenPictureInPicture,
  portalTarget = null,
  presentation = "drawer",
}) {
  const { t } = useI18n();
  const drawerProps = getWatchSheetDrawerProps({
    className: "watch-mobile-more-drawer",
    panelClassName: "watch-mobile-more-panel",
    portalTarget,
    presentation,
  });
  if (drawerProps.fullscreenSidePending) {
    return null;
  }

  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel={t("watchSheet.closeMore")}
      {...drawerProps}
    >
      <div className="watch-mobile-more-header">
        <UserAvatar
          avatarUrl={hostAvatarUrl}
          displayName={hostChipLabel}
          className="watch-mobile-more-avatar"
          imgAlt={hostChipLabel || t("profile.hostAvatar")}
          monogramClassName="is-monogram"
          placeholderClassName="is-placeholder"
          iconClassName="watch-mobile-more-avatar-icon"
        />
        <strong>{hostChipLabel}</strong>
      </div>
      <div className="watch-mobile-more-actions" role="group" aria-label={t("watchSheet.moreActions")}>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={async () => {
            await onShareWatchLink?.();
            onClose?.();
          }}
          disabled={!watchLink || !shareSupported}
          aria-label={t("watchSheet.shareWatchLink")}
        >
          <span className="watch-mobile-more-action-icon">
            <Share aria-hidden="true" />
          </span>
          <span>{t("watchSheet.shareWatchLink")}</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={onOpenImageShareModal}
          disabled={!watchLink}
          aria-label={t("watchSheet.imageShare")}
        >
          <span className="watch-mobile-more-action-icon">
            <QrCode aria-hidden="true" />
          </span>
          <span>{t("watchSheet.imageShare")}</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={onOpenScreenshotShareModal}
          disabled={!watchLink || !playerSession}
          aria-label={t("watchSheet.screenshotShare")}
        >
          <span className="watch-mobile-more-action-icon">
            <Camera aria-hidden="true" />
          </span>
          <span>{t("watchSheet.screenshotShare")}</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={async () => {
            await onCopyWatchLink?.();
            onClose?.();
          }}
          disabled={!watchLink}
          aria-label={t("watchSheet.copyWatchLink")}
        >
          <span className="watch-mobile-more-action-icon">
            <Copy aria-hidden="true" />
          </span>
          <span>{t("watchSheet.copyWatchLink")}</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={audienceCallConnected ? onAudienceCallDisconnect : onAudienceCallRequest}
          disabled={!audienceCallEnabled}
          aria-label={audienceCallConnected
            ? t("watchSheet.audienceCallDisconnect")
            : t("watchSheet.audienceCall")}
        >
          <span className="watch-mobile-more-action-icon">
            {audienceCallConnected
              ? <PhoneOff aria-hidden="true" />
              : <PhoneCall aria-hidden="true" />}
          </span>
          <span>{audienceCallConnected
            ? t("watchSheet.audienceCallDisconnect")
            : t("watchSheet.audienceCall")}</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={onOpenPictureInPicture}
          disabled={!(elementPipSupported || videoPipSupported) || !playerSession}
          aria-label={pictureInPictureActive ? t("watchSheet.pipClose") : t("watchSheet.pipOpen")}
        >
          <span className="watch-mobile-more-action-icon">
            <PictureInPicture2 aria-hidden="true" />
          </span>
          <span>{pictureInPictureActive ? t("watchSheet.pipCloseShort") : t("watchSheet.pipOpenShort")}</span>
        </button>
      </div>
    </SwipeableDrawer>
  );
}

export function WatchHostProfileContent({
  hostAvatarUrl,
  hostChipLabel,
  hostDisplayName,
  hostBio = "",
  hostProfileInfoItems = null,
  hostLocationClickable = false,
  hostLocationPending = false,
  onHostLocationClick,
  onHostHandleCopy,
  hostHandle,
  roomLabel,
  hostFollowerCountText,
  hostFollowingCountText,
  followButton,
}) {
  const { t } = useI18n();
  const profileInfoItems = Array.isArray(hostProfileInfoItems) && hostProfileInfoItems.length > 0
    ? hostProfileInfoItems
    : [t("profile.locationUnknown")];
  const hostHandleText = hostHandle || roomLabel;

  return (
    <>
      <div className="watch-host-profile-head">
        <UserAvatar
          avatarUrl={hostAvatarUrl}
          displayName={hostChipLabel}
          className="watch-host-profile-avatar"
          imgAlt={hostChipLabel || t("profile.hostAvatar")}
          imgWidth={64}
          imgHeight={64}
          monogramClassName="is-monogram"
          placeholderClassName="is-placeholder"
          iconClassName="watch-host-profile-avatar-icon"
        />
        <div className="watch-host-profile-copy">
          <strong>{hostDisplayName || hostChipLabel}</strong>
          {hostHandleText ? (
            <button
              type="button"
              className="watch-host-profile-handle"
              onClick={(event) => {
                event.stopPropagation();
                onHostHandleCopy?.(hostHandleText);
              }}
              aria-label={t("profile.copyHostHandle", { handle: hostHandleText })}
            >
              {`@${hostHandleText}`}
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="watch-host-profile-location"
        onClick={onHostLocationClick}
        disabled={!hostLocationClickable}
        aria-busy={hostLocationPending ? "true" : "false"}
      >
        <ProfileInfoChips
          as="span"
          className="profile-info-chips watch-host-profile-info-chips"
          items={profileInfoItems}
        />
      </button>
      <div className="watch-host-profile-stats" aria-label={t("profile.hostStatsAria")}>
        <div className="watch-host-profile-stat">
          <strong>{hostFollowingCountText}</strong>
          <span>{t("profile.following")}</span>
        </div>
        <hr className="watch-host-profile-stat-divider" aria-hidden="true" />
        <div className="watch-host-profile-stat">
          <strong>{hostFollowerCountText}</strong>
          <span>{t("profile.followers")}</span>
        </div>
      </div>
      <ProfileBio className="profile-bio watch-host-profile-bio" bio={hostBio} />
      {followButton}
    </>
  );
}

export function WatchHostProfileSheet({
  open,
  onClose,
  portal = false,
  portalTarget = null,
  presentation = "drawer",
  viewport = false,
  ...profileProps
}) {
  const { t } = useI18n();
  const drawerProps = getWatchSheetDrawerProps({
    className: "watch-host-profile-drawer",
    panelClassName: "watch-host-profile-panel",
    portalTarget,
    presentation,
  });
  if (drawerProps.fullscreenSidePending) {
    return null;
  }

  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel={t("profile.closeHostProfile")}
      {...drawerProps}
      portal={portal || drawerProps.portal}
      viewport={viewport}
    >
      <WatchHostProfileContent {...profileProps} />
    </SwipeableDrawer>
  );
}

export function WatchAudienceSheet({
  open,
  onClose,
  audienceCountText,
  loggedInViewers,
  portalTarget = null,
  presentation = "drawer",
}) {
  const { t } = useI18n();
  const drawerProps = getWatchSheetDrawerProps({
    className: "watch-audience-drawer",
    panelClassName: "watch-audience-panel",
    portalTarget,
    presentation,
  });
  if (drawerProps.fullscreenSidePending) {
    return null;
  }

  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel={t("watchSheet.closeAudience")}
      {...drawerProps}
    >
      <div className="watch-audience-head">
        <strong>{t("watchSheet.onlineUsers")}</strong>
        <span>{t("watchSheet.peopleCount", { count: audienceCountText })}</span>
      </div>
      {loggedInViewers.length > 0 ? (
        <div className="watch-audience-list">
          {loggedInViewers.map((viewer) => {
            const displayName = viewer.displayName || t("common.signedInUser");
            return (
              <div className="watch-audience-row" key={viewer.id}>
                <UserAvatar
                  avatarUrl={viewer.avatarUrl}
                  displayName={displayName}
                  className="watch-audience-avatar"
                  imgAlt={displayName}
                  imgWidth={48}
                  imgHeight={48}
                  monogramClassName="is-monogram"
                  placeholderClassName="is-placeholder"
                  iconClassName="watch-audience-avatar-icon"
                />
                <span>{displayName}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="watch-audience-empty">{t("watchSheet.noOnlineUsers")}</div>
      )}
    </SwipeableDrawer>
  );
}
