import { useEffect, useState } from "react";
import { getAppErrorMessage } from "../../lib/appErrors.js";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { LiveMenuItem, LiveMenuList } from "./LiveMenuList.jsx";
import { LiveSwitch } from "./LiveSwitch.jsx";
import {
  AudienceIcon,
  ChatIcon,
  CoverIcon,
  LocationIcon,
  MenuChevronIcon,
  NotificationIcon,
  SpeakerIcon,
  TitleIcon,
} from "./liveIcons.jsx";

function LiveMoreMenuItem({
  icon,
  label,
  onClick,
  disabled = false,
  ariaLabel = label,
}) {
  return (
    <LiveMenuItem
      className="live-more-menu-item"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <span className="live-more-menu-icon">{icon}</span>
      <span className="live-more-menu-label">{label}</span>
      <MenuChevronIcon />
    </LiveMenuItem>
  );
}

function LiveMoreMenuSwitchItem({
  icon,
  label,
  checked,
  onToggle,
  disabled = false,
  ariaLabel = label,
}) {
  return (
    <li className="live-menu-list-item">
      <button
        type="button"
        className="live-menu-item live-more-menu-item live-more-menu-switch-item"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={onToggle}
        disabled={disabled}
      >
        <span className="live-more-menu-icon">{icon}</span>
        <span className="live-more-menu-label">{label}</span>
        <LiveSwitch checked={checked} />
      </button>
    </li>
  );
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function formatMuteExpiresAt(value, t) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return t("live.muteExpiresUnknown");
  }
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    "-",
    padDatePart(date.getMonth() + 1),
    "-",
    padDatePart(date.getDate()),
    " ",
    padDatePart(date.getHours()),
    ":",
    padDatePart(date.getMinutes()),
  ].join("");
}

function getMuteExpiresLabel(mute, t) {
  return mute?.untilStreamEnds ? t("live.muteUntilStreamEnds") : formatMuteExpiresAt(mute?.expiresAt, t);
}

export function LiveMoreMenu({
  roomCoverUrl,
  roomCoverBusy,
  roomCoverLoading,
  roomCoverError,
  roomCoverStatus,
  roomCoverInputRef,
  roomTitle,
  roomWelcomeMessage,
  commentSpeechEnabled = false,
  commentSpeechSupported = false,
  liveNotificationEnabled = true,
  locationSharingEnabled = false,
  locationSharingSupported = false,
  locationSharingPending = false,
  onPickCover,
  onOpenCoverPicker,
  onSaveRoomTitle,
  onSaveRoomWelcomeMessage,
  onCommentSpeechEnabledChange,
  onLiveNotificationEnabledChange,
  onLocationSharingEnabledChange,
  roomInfoBlockedReason = "",
  onRoomInfoBlocked,
  mutedUsers = [],
  onUnmuteUser,
}) {
  const { t } = useI18n();
  const [activeEditor, setActiveEditor] = useState("");
  const [titleDraft, setTitleDraft] = useState(roomTitle || "");
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [titleStatus, setTitleStatus] = useState("");
  const [welcomeDraft, setWelcomeDraft] = useState(roomWelcomeMessage || "");
  const [welcomeSaving, setWelcomeSaving] = useState(false);
  const [welcomeError, setWelcomeError] = useState("");
  const [welcomeStatus, setWelcomeStatus] = useState("");
  const coverBusy = roomCoverBusy || roomCoverLoading;
  const titleUnchanged = titleDraft.trim().replace(/\s+/g, " ") === (roomTitle || "").trim().replace(/\s+/g, " ");
  const welcomeUnchanged = welcomeDraft.trim().replace(/\s+/g, " ") === (roomWelcomeMessage || "").trim().replace(/\s+/g, " ");
  const visibleMutedUsers = Array.isArray(mutedUsers) ? mutedUsers : [];

  useEffect(() => {
    setTitleDraft(roomTitle || "");
    setTitleError("");
    setTitleStatus("");
  }, [roomTitle]);

  useEffect(() => {
    setWelcomeDraft(roomWelcomeMessage || "");
    setWelcomeError("");
    setWelcomeStatus("");
  }, [roomWelcomeMessage]);

  async function handleTitleSubmit(event) {
    event.preventDefault();
    if (!onSaveRoomTitle || titleSaving || titleUnchanged) {
      return;
    }
    if (roomInfoBlockedReason) {
      onRoomInfoBlocked?.();
      return;
    }

    setTitleSaving(true);
    setTitleError("");
    setTitleStatus("");

    try {
      const result = await onSaveRoomTitle(titleDraft);
      if (!result) {
        return;
      }
      setTitleStatus(t("live.titleSaved"));
    } catch (error) {
      setTitleError(getAppErrorMessage(error));
    } finally {
      setTitleSaving(false);
    }
  }

  async function handleWelcomeSubmit(event) {
    event.preventDefault();
    if (!onSaveRoomWelcomeMessage || welcomeSaving || welcomeUnchanged) {
      return;
    }
    if (roomInfoBlockedReason) {
      onRoomInfoBlocked?.();
      return;
    }

    setWelcomeSaving(true);
    setWelcomeError("");
    setWelcomeStatus("");

    try {
      const result = await onSaveRoomWelcomeMessage(welcomeDraft);
      if (!result) {
        return;
      }
      setWelcomeStatus(t("live.welcomeSaved"));
    } catch (error) {
      setWelcomeError(getAppErrorMessage(error));
    } finally {
      setWelcomeSaving(false);
    }
  }

  const editorTitle = activeEditor === "cover"
    ? t("live.cover")
    : activeEditor === "welcome"
      ? t("live.welcomeMessage")
      : activeEditor === "management"
        ? t("live.roomManagement")
        : t("live.title");

  function handleCommentSpeechToggle() {
    if (!commentSpeechSupported) {
      return;
    }
    onCommentSpeechEnabledChange?.(!commentSpeechEnabled);
  }

  function handleLiveNotificationToggle() {
    onLiveNotificationEnabledChange?.(!liveNotificationEnabled);
  }

  function handleLocationSharingToggle() {
    if (roomInfoBlockedReason) {
      onRoomInfoBlocked?.();
      return;
    }
    if (!locationSharingSupported || locationSharingPending) {
      return;
    }
    onLocationSharingEnabledChange?.(!locationSharingEnabled);
  }

  return (
    <>
      <input
        ref={roomCoverInputRef}
        className="live-cover-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={onPickCover}
      />
      <div className={`live-more-menu-shell${activeEditor ? " is-editing" : ""}`} aria-label={t("live.moreActions")}>
        <div className="live-more-menu-track">
          <div className="live-more-menu-screen">
            <div className="live-more-menu-title">{t("live.liveSettings")}</div>
            <LiveMenuList className="live-more-menu-list">
              <LiveMoreMenuItem
                icon={<CoverIcon />}
                label={t("live.cover")}
                onClick={() => setActiveEditor("cover")}
              />
              <LiveMoreMenuItem
                icon={<TitleIcon />}
                label={t("live.title")}
                onClick={() => setActiveEditor("title")}
              />
              <LiveMoreMenuItem
                icon={<ChatIcon />}
                label={t("live.welcomeMessage")}
                onClick={() => setActiveEditor("welcome")}
              />
              <LiveMoreMenuItem
                icon={<AudienceIcon />}
                label={t("live.roomManagement")}
                onClick={() => setActiveEditor("management")}
              />
              <LiveMoreMenuSwitchItem
                icon={<SpeakerIcon />}
                label={t("live.readComments")}
                checked={commentSpeechEnabled}
                onToggle={handleCommentSpeechToggle}
                disabled={!commentSpeechSupported}
                ariaLabel={commentSpeechSupported ? t("live.readComments") : t("live.readCommentsUnsupported")}
              />
              <LiveMoreMenuSwitchItem
                icon={<NotificationIcon />}
                label={t("live.liveNotifications")}
                checked={liveNotificationEnabled}
                onToggle={handleLiveNotificationToggle}
                ariaLabel={t("live.liveNotifications")}
              />
              <LiveMoreMenuSwitchItem
                icon={<LocationIcon />}
                label={t("live.locationInfo")}
                checked={locationSharingEnabled}
                onToggle={handleLocationSharingToggle}
                disabled={!locationSharingSupported || locationSharingPending}
                ariaLabel={locationSharingSupported ? t("live.locationInfo") : t("live.locationInfoUnsupported")}
              />
            </LiveMenuList>
          </div>

          <div className="live-more-menu-screen live-more-editor-screen">
            <div className="live-more-editor-head">
              <button
                type="button"
                className="live-more-editor-back"
                onClick={() => setActiveEditor("")}
                aria-label={t("live.backToMore")}
              >
                <MenuChevronIcon />
              </button>
              <strong>{editorTitle}</strong>
            </div>

            {activeEditor === "cover" ? (
              <div className="live-more-cover-form">
                <button
                  type="button"
                  className={`live-cover-preview${coverBusy ? " is-disabled" : ""}`}
                  onClick={coverBusy ? undefined : onOpenCoverPicker}
                  disabled={coverBusy}
                  aria-label={t("live.uploadCover")}
                >
                  {roomCoverUrl ? (
                    <img src={roomCoverUrl} alt={t("live.coverPreviewAlt")} />
                  ) : (
                    <span className="live-cover-preview-placeholder">
                      {roomCoverLoading ? t("common.loading") : t("live.noCover")}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="live-more-primary-action"
                  onClick={onOpenCoverPicker}
                  disabled={coverBusy}
                >
                  {roomCoverBusy ? t("live.uploading") : t("live.changeCover")}
                </button>
                <p className="live-cover-note">{t("live.coverNote")}</p>
                {roomCoverError ? <p className="inline-warning">{roomCoverError}</p> : null}
                {roomCoverStatus ? <p className="status">{roomCoverStatus}</p> : null}
              </div>
            ) : activeEditor === "management" ? (
              <div className="live-more-management">
                <div className="live-more-management-section">
                  <div className="live-more-management-title">{t("live.mutedUsers")}</div>
                  {visibleMutedUsers.length ? (
                    <ul className="live-more-muted-list" aria-label={t("live.mutedUsersAria")}>
                      {visibleMutedUsers.map((mute) => (
                        <li key={mute.userId} className="live-more-muted-row">
                          <span className="live-more-muted-copy">
                            <strong>{mute.displayName || t("common.user")}</strong>
                            <span>{t("live.muteExpiresAt", { time: getMuteExpiresLabel(mute, t) })}</span>
                          </span>
                          <button
                            type="button"
                            className="live-more-muted-action"
                            onClick={() => onUnmuteUser?.(mute.userId)}
                            disabled={!onUnmuteUser}
                          >
                            {t("live.unmuteUser")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="live-more-management-empty">{t("live.noMutedUsers")}</p>
                  )}
                </div>
              </div>
            ) : activeEditor === "welcome" ? (
              <form className="live-more-title-form" onSubmit={handleWelcomeSubmit}>
                <label className="live-more-title-field">
                  <span>{t("live.welcomeMessage")}</span>
                  <textarea
                    value={welcomeDraft}
                    onChange={(event) => {
                      setWelcomeDraft(event.currentTarget.value);
                      setWelcomeError("");
                      setWelcomeStatus("");
                    }}
                    maxLength={160}
                    placeholder={t("live.welcomePlaceholder")}
                    disabled={welcomeSaving}
                    rows={4}
                  />
                </label>
                <div className="live-more-title-count">{Array.from(welcomeDraft).length}/160</div>
                <button
                  type="submit"
                  className="live-more-primary-action"
                  disabled={welcomeSaving || welcomeUnchanged}
                >
                  {welcomeSaving ? t("common.saving") : t("live.saveWelcomeMessage")}
                </button>
                {welcomeError ? <p className="inline-warning">{welcomeError}</p> : null}
                {welcomeStatus ? <p className="status">{welcomeStatus}</p> : null}
              </form>
            ) : (
              <form className="live-more-title-form" onSubmit={handleTitleSubmit}>
                <label className="live-more-title-field">
                  <span>{t("live.title")}</span>
                  <input
                    value={titleDraft}
                    onChange={(event) => {
                      setTitleDraft(event.currentTarget.value);
                      setTitleError("");
                      setTitleStatus("");
                    }}
                    maxLength={80}
                    placeholder={t("live.titlePlaceholder")}
                    disabled={titleSaving}
                  />
                </label>
                <div className="live-more-title-count">{Array.from(titleDraft).length}/80</div>
                <button
                  type="submit"
                  className="live-more-primary-action"
                  disabled={titleSaving || titleUnchanged}
                >
                  {titleSaving ? t("common.saving") : t("live.saveTitle")}
                </button>
                {titleError ? <p className="inline-warning">{titleError}</p> : null}
                {titleStatus ? <p className="status">{titleStatus}</p> : null}
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
