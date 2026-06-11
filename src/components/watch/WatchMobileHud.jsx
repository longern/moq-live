import { ChevronLeft, MoreHorizontal, Users } from "lucide-react";
import { UserAvatar } from "../UserAvatar.jsx";

export function WatchMobileHud({
  audienceCountText,
  className = "",
  followButton,
  hostAvatarUrl,
  hostChipLabel,
  hostProfileOpen = false,
  onOpenAudienceSheet,
  onOpenHostProfile,
  onOpenMoreSheet,
  onStop,
  visible = false,
}) {
  return (
    <div className={`stage-mobile-hud${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}>
      <div className="stage-mobile-hud-left">
        <button
          type="button"
          className="stage-mobile-leave"
          onClick={(event) => {
            event.stopPropagation();
            onStop?.();
          }}
          aria-label="离开直播间"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <div className="watch-mobile-host-chip">
          <button
            type="button"
            className="watch-mobile-host-chip-main"
            onClick={onOpenHostProfile}
            aria-label={`查看${hostChipLabel}资料`}
            aria-haspopup="dialog"
            aria-expanded={hostProfileOpen ? "true" : "false"}
          >
            <UserAvatar
              avatarUrl={hostAvatarUrl}
              displayName={hostChipLabel}
              className="watch-mobile-host-avatar"
              imgAlt={hostChipLabel || "主播头像"}
              imgWidth={24}
              imgHeight={24}
              monogramClassName="is-monogram"
              placeholderClassName="is-placeholder"
              iconClassName="watch-mobile-host-avatar-icon"
            />
            <span className="watch-mobile-host-name">{hostChipLabel}</span>
          </button>
          {followButton}
        </div>
      </div>
      <div className="stage-mobile-hud-actions">
        <button
          type="button"
          className="watch-mobile-audience-chip"
          onClick={(event) => {
            event.stopPropagation();
            onOpenAudienceSheet?.();
          }}
          aria-label={`${audienceCountText}人在线，查看已登录观众`}
        >
          <Users aria-hidden="true" />
          <span>{audienceCountText}</span>
        </button>
        <button
          type="button"
          className="stage-mobile-more"
          onClick={(event) => {
            event.stopPropagation();
            onOpenMoreSheet?.();
          }}
          aria-label="更多操作"
        >
          <MoreHorizontal aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
