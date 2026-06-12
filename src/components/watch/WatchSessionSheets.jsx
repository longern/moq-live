import { Copy, PictureInPicture2, QrCode, Share } from "lucide-react";
import { SwipeableDrawer } from "../SwipeableDrawer.jsx";
import { UserAvatar } from "../UserAvatar.jsx";

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
  onShareWatchLink,
  onOpenImageShareModal,
  onCopyWatchLink,
  onOpenPictureInPicture,
}) {
  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel="关闭更多操作"
      className="watch-mobile-more-drawer"
      panelClassName="watch-mobile-more-panel"
    >
      <div className="watch-mobile-more-header">
        <UserAvatar
          avatarUrl={hostAvatarUrl}
          displayName={hostChipLabel}
          className="watch-mobile-more-avatar"
          imgAlt={hostChipLabel || "主播头像"}
          monogramClassName="is-monogram"
          placeholderClassName="is-placeholder"
          iconClassName="watch-mobile-more-avatar-icon"
        />
        <strong>{hostChipLabel}</strong>
      </div>
      <div className="watch-mobile-more-actions" role="group" aria-label="更多观看操作">
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={async () => {
            await onShareWatchLink?.();
            onClose?.();
          }}
          disabled={!watchLink || !shareSupported}
          aria-label="分享观看链接"
        >
          <span className="watch-mobile-more-action-icon">
            <Share aria-hidden="true" />
          </span>
          <span>分享</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={onOpenImageShareModal}
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
            await onCopyWatchLink?.();
            onClose?.();
          }}
          disabled={!watchLink}
          aria-label="复制观看链接"
        >
          <span className="watch-mobile-more-action-icon">
            <Copy aria-hidden="true" />
          </span>
          <span>复制链接</span>
        </button>
        <button
          type="button"
          className="watch-mobile-more-action"
          onClick={onOpenPictureInPicture}
          disabled={!(elementPipSupported || videoPipSupported) || !playerSession}
          aria-label={pictureInPictureActive ? "关闭小窗播放" : "小窗播放"}
        >
          <span className="watch-mobile-more-action-icon">
            <PictureInPicture2 aria-hidden="true" />
          </span>
          <span>{pictureInPictureActive ? "关闭小窗" : "小窗播放"}</span>
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
  hostProfileInfoItems = ["位置未知"],
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
  const profileInfoItems = Array.isArray(hostProfileInfoItems) && hostProfileInfoItems.length > 0
    ? hostProfileInfoItems
    : ["位置未知"];
  const normalizedHostBio = String(hostBio || "").trim();
  const hostHandleText = hostHandle || roomLabel;

  return (
    <>
      <div className="watch-host-profile-head">
        <UserAvatar
          avatarUrl={hostAvatarUrl}
          displayName={hostChipLabel}
          className="watch-host-profile-avatar"
          imgAlt={hostChipLabel || "主播头像"}
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
              aria-label={`复制主播号 ${hostHandleText}`}
            >
              {hostHandleText}
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
        {profileInfoItems.map((item, index) => (
          <span className="watch-host-profile-info-chip" key={`${item}:${index}`}>
            {item}
          </span>
        ))}
      </button>
      <div className="watch-host-profile-stats" aria-label="主播关注和粉丝">
        <div className="watch-host-profile-stat">
          <strong>{hostFollowingCountText}</strong>
          <span>关注</span>
        </div>
        <hr className="watch-host-profile-stat-divider" aria-hidden="true" />
        <div className="watch-host-profile-stat">
          <strong>{hostFollowerCountText}</strong>
          <span>粉丝</span>
        </div>
      </div>
      <p className={`watch-host-profile-bio${normalizedHostBio ? "" : " is-placeholder"}`}>
        {normalizedHostBio || "暂无个人简介"}
      </p>
      {followButton}
    </>
  );
}

export function WatchHostProfileSheet({
  open,
  onClose,
  ...profileProps
}) {
  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel="关闭主播信息"
      className="watch-host-profile-drawer"
      panelClassName="watch-host-profile-panel"
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
}) {
  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel="关闭观众列表"
      className="watch-audience-drawer"
      panelClassName="watch-audience-panel"
    >
      <div className="watch-audience-head">
        <strong>在线用户</strong>
        <span>{audienceCountText} 人</span>
      </div>
      {loggedInViewers.length > 0 ? (
        <div className="watch-audience-list">
          {loggedInViewers.map((viewer) => {
            const displayName = viewer.displayName || "已登录用户";
            return (
              <div className="watch-audience-row" key={viewer.id}>
                <UserAvatar
                  avatarUrl={viewer.avatarUrl}
                  displayName={displayName}
                  className="watch-audience-avatar"
                  imgAlt={`${displayName}头像`}
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
        <div className="watch-audience-empty">暂无在线用户</div>
      )}
    </SwipeableDrawer>
  );
}
