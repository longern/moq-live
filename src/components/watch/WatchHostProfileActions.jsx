import { Bell, BellOff } from "lucide-react";

export function WatchHostProfileActions({
  authAvailable,
  followButton,
  followBusy = false,
  following = false,
  notifyBusy = false,
  notifyLiveStarted = false,
  onNotifyLiveToggle,
}) {
  if (!followButton) {
    return null;
  }
  if (!following) {
    return followButton;
  }

  const NotificationIcon = notifyLiveStarted ? Bell : BellOff;
  const notificationLabel = notifyLiveStarted ? "关闭开播通知" : "接收开播通知";
  return (
    <div className="watch-host-profile-actions">
      {followButton}
      <button
        type="button"
        className={`watch-host-live-notify-button${notifyLiveStarted ? " is-on" : " is-off"}`}
        onClick={(event) => {
          event.stopPropagation();
          onNotifyLiveToggle?.();
        }}
        disabled={notifyBusy || followBusy || !authAvailable}
        aria-pressed={notifyLiveStarted}
        aria-label={notificationLabel}
        title={notificationLabel}
      >
        <NotificationIcon size={18} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}
