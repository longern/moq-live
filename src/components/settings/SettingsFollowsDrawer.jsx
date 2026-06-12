import { UserAvatar } from "../UserAvatar.jsx";
import { SettingsPanelShell } from "./SettingsPanelShell.jsx";

function PaginationControls({
  disabled = false,
  hasMore,
  loading,
  onLoadMore,
  remainingLabel = "没有更多了",
}) {
  if (!hasMore && !loading) {
    return <div className="pagination-terminal">{remainingLabel}</div>;
  }

  return (
    <div className="pagination-controls">
      <button
        type="button"
        className="secondary pagination-load-more"
        disabled={disabled || loading}
        onClick={onLoadMore}
      >
        {loading ? "加载中" : "加载更多"}
      </button>
    </div>
  );
}

function FollowListItem({
  item,
  onOpenUserRoom,
  onRequestUnfollow,
  openable,
  showFollowingAction,
  unfollowDisabled,
}) {
  const user = item?.user || {};
  const primary = user.displayName || user.handle || user.email || "匿名用户";
  const secondary = user.handle ? `@${user.handle}` : user.email || "";
  const watchTarget = user.handle || user.id || "";

  return (
    <li>
      <div className={`follow-list-row${showFollowingAction ? " has-action" : ""}`}>
        <button
          type="button"
          className="follow-list-open-button"
          disabled={!openable || !watchTarget}
          onClick={() => {
            if (openable && watchTarget) {
              onOpenUserRoom(watchTarget);
            }
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
            已关注
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
  user,
}) {
  const name = user?.displayName || user?.handle || user?.email || "该用户";

  return (
    <div className="follow-confirm-layer">
      <button
        type="button"
        className="follow-confirm-backdrop"
        aria-label="关闭取消关注确认框"
        onClick={onCancel}
      />
      <section
        className="follow-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="取消关注确认"
      >
        <div className="follow-confirm-copy">
          <strong>取消关注？</strong>
          <span>{name}</span>
        </div>
        {error ? <p className="inline-warning">{error}</p> : null}
        <div className="follow-confirm-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={loading}>
            取消
          </button>
          <button type="button" className="primary" onClick={onConfirm} disabled={loading}>
            {loading ? "处理中" : "确认"}
          </button>
        </div>
      </section>
    </div>
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
  const initialLoading = loading && !items.length;
  const showFollowingAction = type === "following";

  return (
    <SettingsPanelShell
      backdropClassName="auth-panel-backdrop"
      backdropLabel={`关闭${title}列表`}
      bodyClassName="follows-panel-body"
      closeLabel="返回"
      closeButtonClassName="account-panel-close"
      headClassName="account-panel-head"
      onClose={onClose}
      panelClassName="auth-panel auth-panel-follows"
      panelLabel={`${title}列表`}
      title={title}
      transitionClassName={transitionClassName}
    >
      {initialLoading ? (
        <div className="follow-list-state">加载中</div>
      ) : error ? (
        <div className="follow-list-state is-error">
          <span>{error}</span>
          <button type="button" className="secondary" onClick={onRetry}>
            重试
          </button>
        </div>
      ) : items.length ? (
        <>
          <ul className="follow-list">
            {items.map((item) => (
              <FollowListItem
                key={`${item.user?.id || ""}-${item.createdAt}`}
                item={item}
                onOpenUserRoom={onOpenUserRoom}
                onRequestUnfollow={onRequestUnfollow}
                openable={showFollowingAction}
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
        <div className="follow-list-state">暂无{title}</div>
      )}
      {pendingUnfollowUser ? (
        <UnfollowConfirmDialog
          error={unfollowError}
          loading={unfollowBusy}
          onCancel={onCancelUnfollow}
          onConfirm={onConfirmUnfollow}
          user={pendingUnfollowUser}
        />
      ) : null}
    </SettingsPanelShell>
  );
}
