import { useEffect, useRef, useState } from "react";
import { AnimatedDialog } from "../AnimatedDialog.jsx";
import { LoadingSpinner } from "../primitives/LoadingSpinner.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { WatchHostProfileSheet } from "../watch/WatchSessionSheets.jsx";
import { SettingsPanelShell } from "./SettingsPanelShell.jsx";
import { formatAudienceCount } from "../../lib/audience.js";
import { createApiError, getAppErrorMessage } from "../../lib/appErrors.js";
import { buildHostProfileInfoItems } from "../../lib/watchSession.js";
import { useI18n } from "../../i18n/I18nProvider.jsx";

function PaginationControls({
  disabled = false,
  hasMore,
  loading,
  onLoadMore,
  remainingLabel,
}) {
  const { t } = useI18n();
  const terminalLabel = remainingLabel || t("follows.noMore");

  if (!hasMore && !loading) {
    return <div className="pagination-terminal">{terminalLabel}</div>;
  }

  return (
    <div className="pagination-controls">
      <button
        type="button"
        className="secondary pagination-load-more"
        disabled={disabled || loading}
        onClick={onLoadMore}
      >
        {loading ? t("common.loading") : t("follows.loadMore")}
      </button>
    </div>
  );
}

function FollowListItem({
  item,
  onOpenUserProfile,
  onOpenUserRoom,
  onRequestUnfollow,
  showFollowingAction,
  unfollowDisabled,
}) {
  const { t } = useI18n();
  const user = item?.user || {};
  const primary = user.displayName || user.handle || user.email || t("common.anonymousUser");
  const secondary = user.handle ? `@${user.handle}` : user.email || "";
  const watchTarget = user.handle || user.id || "";

  return (
    <li>
      <div className={`follow-list-row${showFollowingAction ? " has-action" : ""}`}>
        <button
          type="button"
          className="follow-list-open-button"
          disabled={!watchTarget}
          onClick={() => {
            if (!watchTarget) {
              return;
            }
            if (showFollowingAction) {
              onOpenUserRoom(watchTarget);
              return;
            }
            onOpenUserProfile(user);
          }}
        >
          <UserAvatar
            avatarUrl={user.avatarUrl}
            displayName={user.displayName}
            email={user.email}
            className="follow-list-avatar"
            imgAlt={primary}
            monogramClassName="is-monogram"
            placeholderClassName="is-placeholder"
          />
          <div className="follow-list-copy">
            <strong>{primary}</strong>
            {secondary ? <span>{secondary}</span> : null}
          </div>
        </button>
        {showFollowingAction ? (
          <button
            type="button"
            className="follow-list-action-button secondary"
            disabled={unfollowDisabled}
            onClick={() => {
              onRequestUnfollow(user);
            }}
          >
            {t("follows.followingState")}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function UnfollowConfirmDialog({
  error,
  loading,
  onCancel,
  onConfirm,
  open,
  user,
}) {
  const { t } = useI18n();
  const [renderUser, setRenderUser] = useState(user);

  useEffect(() => {
    if (user) {
      setRenderUser(user);
    }
  }, [user]);

  const name = renderUser?.displayName || renderUser?.handle || renderUser?.email || t("common.user");

  return (
    <AnimatedDialog
      ariaLabel={t("follows.confirmAria")}
      backdropLabel={t("follows.closeConfirm")}
      dialogClassName="follow-confirm-dialog"
      onClose={onCancel}
      open={open}
    >
      <div className="follow-confirm-copy">
        <strong>{t("follows.confirmTitle")}</strong>
        <span>{t("follows.confirmMessage", { name })}</span>
      </div>
      {error ? <p className="inline-warning">{error}</p> : null}
      <div className="follow-confirm-actions">
        <button
          type="button"
          className="follow-confirm-action-button"
          onClick={onCancel}
          disabled={loading}
        >
          {t("common.cancel")}
        </button>
        <hr className="follow-confirm-action-divider" aria-hidden="true" />
        <button
          type="button"
          className="follow-confirm-action-button is-confirm"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? t("common.processing") : t("follows.confirmAction")}
        </button>
      </div>
    </AnimatedDialog>
  );
}

export function SettingsFollowsDrawer({
  error,
  hasMore,
  items,
  loading,
  loadingMore,
  onClose,
  onConfirmUnfollow,
  onLoadMore,
  onOpenUserRoom,
  onRequestUnfollow,
  onRetry,
  onCancelUnfollow,
  pendingUnfollowUser,
  title,
  type,
  unfollowBusy,
  unfollowError,
  transitionClassName,
}) {
  const { t } = useI18n();
  const initialLoading = loading && !items.length;
  const showFollowingAction = type === "following";
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUser, setProfileUser] = useState(null);
  const [profileError, setProfileError] = useState("");
  const profileRequestIdRef = useRef(0);
  const profileUserName = profileUser?.displayName || profileUser?.handle || profileUser?.email || t("common.anonymousUser");
  const profileUserHandle = profileUser?.handle || "";
  const profileInfoItems = profileUser
    ? buildHostProfileInfoItems({
      gender: profileUser.gender || "",
      birthDate: profileUser.birthDate || "",
      province: profileUser.locationProvince || "",
      t,
    })
    : [];

  useEffect(() => () => {
    profileRequestIdRef.current += 1;
  }, []);

  async function openUserProfile(user) {
    if (!user?.id) {
      return;
    }
    const requestId = profileRequestIdRef.current + 1;
    profileRequestIdRef.current = requestId;
    setProfileUser(user);
    setProfileOpen(true);
    setProfileError("");

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.id)}/profile`, {
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw createApiError(payload, "follows_list_failed", { status: response.status });
      }
      if (profileRequestIdRef.current !== requestId) {
        return;
      }
      setProfileUser((current) => (
        current?.id === user.id && payload.user
          ? { ...current, ...payload.user }
          : current
      ));
    } catch (fetchError) {
      if (profileRequestIdRef.current === requestId) {
        setProfileError(getAppErrorMessage(fetchError));
      }
    }
  }

  async function copyUserHandle(handleValue) {
    const normalizedHandle = String(handleValue || "").trim();
    if (!normalizedHandle || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(normalizedHandle).catch(() => {});
  }

  return (
    <SettingsPanelShell
      backdropClassName="auth-panel-backdrop"
      backdropLabel={t("follows.closeList", { title })}
      bodyClassName="follows-panel-body"
      closeLabel={t("common.back")}
      closeButtonClassName="account-panel-close"
      headClassName="account-panel-head"
      onClose={onClose}
      panelClassName="auth-panel auth-panel-follows"
      panelLabel={t("follows.panelLabel", { title })}
      title={title}
      transitionClassName={transitionClassName}
    >
      {initialLoading ? (
        <div className="follow-list-state">
          <LoadingSpinner className="follow-list-loading-spinner" label={t("common.loading")} />
        </div>
      ) : error ? (
        <div className="follow-list-state is-error">
          <span>{error}</span>
          <button type="button" className="secondary" onClick={onRetry}>
            {t("follows.retry")}
          </button>
        </div>
      ) : items.length ? (
        <>
          <ul className="follow-list">
            {items.map((item) => (
              <FollowListItem
                key={`${item.user?.id || ""}-${item.createdAt}`}
                item={item}
                onOpenUserProfile={openUserProfile}
                onOpenUserRoom={onOpenUserRoom}
                onRequestUnfollow={onRequestUnfollow}
                showFollowingAction={showFollowingAction}
                unfollowDisabled={unfollowBusy}
              />
            ))}
          </ul>
          <PaginationControls
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={onLoadMore}
          />
        </>
      ) : (
        <div className="follow-list-state">{t("follows.empty", { title })}</div>
      )}
      <UnfollowConfirmDialog
        error={unfollowError}
        loading={unfollowBusy}
        onCancel={onCancelUnfollow}
        onConfirm={onConfirmUnfollow}
        open={Boolean(pendingUnfollowUser)}
        user={pendingUnfollowUser}
      />
      <WatchHostProfileSheet
        open={profileOpen}
        onClose={() => {
          profileRequestIdRef.current += 1;
          setProfileOpen(false);
          setProfileError("");
        }}
        portal
        viewport
        hostAvatarUrl={profileUser?.avatarUrl || ""}
        hostChipLabel={profileUserName}
        hostDisplayName={profileUser?.displayName || profileUserName}
        hostBio={profileUser?.bio || ""}
        hostProfileInfoItems={profileInfoItems}
        hostLocationClickable={false}
        hostLocationPending={false}
        onHostHandleCopy={copyUserHandle}
        hostHandle={profileUserHandle}
        roomLabel={profileUserName}
        hostFollowerCountText={formatAudienceCount(profileUser?.followerCount || 0)}
        hostFollowingCountText={formatAudienceCount(profileUser?.followingCount || 0)}
        followButton={(
          profileError ? <p className="inline-warning">{profileError}</p> : null
        )}
      />
    </SettingsPanelShell>
  );
}
