import { Radio, Share } from "lucide-react";
import { StatusPill } from "../primitives/StatusPill.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { WatchHostProfileContent } from "./WatchSessionSheets.jsx";

export function WatchRoomInfoStrip({
  copyHostHandle,
  hostAvatarUrl,
  hostBio,
  hostChipLabel,
  hostDisplayName,
  hostFollowerCountText,
  hostFollowingCountText,
  hostHandle,
  hostIcon,
  hostLocationClickable,
  hostProfileInfoItems,
  hostDistancePending,
  onHostLocationClick,
  playerBadge,
  renderHostFollowButton,
  renderHostProfileActions,
  roomLabel,
  roomTitle,
  shareButtonRef,
  shareMenuMounted,
  openShareMenu,
  watchLink,
}) {
  return (
    <div className="info-strip">
      <div className="info-item">
        <div className="watch-desktop-room-meta">
          {hostIcon === "public-channel" ? (
            <span className="watch-desktop-room-avatar is-public-channel" aria-hidden="true">
              <Radio className="watch-desktop-room-avatar-icon" />
            </span>
          ) : (
            <div
              className="watch-desktop-host-profile-trigger"
              role="group"
              tabIndex={0}
              aria-label="查看主播信息"
            >
              <UserAvatar
                avatarUrl={hostAvatarUrl}
                displayName={hostDisplayName}
                className="watch-desktop-room-avatar"
                imgAlt={hostDisplayName || "主播头像"}
                monogramClassName="is-monogram"
                placeholderClassName="is-placeholder"
                iconClassName="watch-desktop-room-avatar-icon"
              />
              <div
                className="watch-desktop-host-profile-popover"
                role="dialog"
                aria-label="主播信息"
              >
                <WatchHostProfileContent
                  hostAvatarUrl={hostAvatarUrl}
                  hostChipLabel={hostChipLabel}
                  hostDisplayName={hostDisplayName}
                  hostBio={hostBio}
                  hostProfileInfoItems={hostProfileInfoItems}
                  hostLocationClickable={hostLocationClickable}
                  hostLocationPending={hostDistancePending}
                  onHostLocationClick={onHostLocationClick}
                  onHostHandleCopy={copyHostHandle}
                  hostHandle={hostHandle}
                  roomLabel={roomLabel}
                  hostFollowerCountText={hostFollowerCountText}
                  hostFollowingCountText={hostFollowingCountText}
                  followButton={renderHostProfileActions()}
                />
              </div>
            </div>
          )}
          <div className="watch-desktop-room-copy">
            <strong data-room-label>{roomTitle || roomLabel}</strong>
            <p>{hostDisplayName || roomLabel}</p>
          </div>
          {renderHostFollowButton("watch-host-follow-button-desktop")}
        </div>
      </div>
      <div className="info-item info-item-pill watch-desktop-status-actions">
        <button
          ref={shareButtonRef}
          type="button"
          className="watch-desktop-share-button"
          onClick={openShareMenu}
          disabled={!watchLink}
          aria-label="分享"
          aria-haspopup="dialog"
          aria-expanded={shareMenuMounted ? "true" : "false"}
        >
          <Share aria-hidden="true" />
        </button>
        <StatusPill id="playerBadgeInline" label={playerBadge.label} state={playerBadge.state} />
      </div>
    </div>
  );
}
