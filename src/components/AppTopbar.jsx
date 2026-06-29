import { DesktopNavigation } from "./Navigation.jsx";
import {
  AnchoredPopover,
  PopoverMenu,
  PopoverMenuItem,
} from "./primitives/AnchoredPopover.jsx";
import { UserAvatar } from "./primitives/UserAvatar.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";

export function AppTopbar({
  authMenuOpen,
  authMenuRef,
  authState,
  avatarLabel,
  avatarStateClass,
  avatarTitle,
  onAuthMenuClose,
  onAuthMenuOpen,
  onAuthMenuScheduleClose,
  onAuthMenuToggle,
  onBeginWatch,
  onLogout,
  onOpenSettings,
  onPreloadLive,
  onReturnHome,
  onSelectPage,
  onStartLogin,
  onTopbarWatchRoomChange,
  page,
  siteIconUrl,
  siteTitle,
  topbarWatchRoom,
}) {
  const { t } = useI18n();

  function submitTopbarWatch(event) {
    event.preventDefault();
    const nextWatchRoom = topbarWatchRoom.trim();
    if (!nextWatchRoom) {
      return;
    }
    onBeginWatch(nextWatchRoom);
    onTopbarWatchRoomChange("");
  }

  return (
    <header className="topbar">
      <a
        href={window.location.pathname}
        className="brand brand-button"
        onClick={(event) => {
          event.preventDefault();
          onReturnHome();
        }}
        aria-label={t("watch.backToWatch", { title: siteTitle })}
      >
        {siteIconUrl ? (
          <img className="brand-icon" src={siteIconUrl} alt="" aria-hidden="true" />
        ) : null}
        <h1 className="brand-title">{siteTitle}</h1>
      </a>

      <div className="topbar-right">
        <form className="topbar-watch-form" role="search" onSubmit={submitTopbarWatch}>
          <input
            id="topbar-watch-room"
            name="watch_room"
            type="text"
            value={topbarWatchRoom}
            placeholder={t("watch.inputHostHandle")}
            aria-label={t("watch.inputHostHandleAria")}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            enterKeyHint="go"
            onInput={(event) => {
              onTopbarWatchRoomChange(event.currentTarget.value);
            }}
          />
        </form>
        <DesktopNavigation
          currentPage={page}
          onSelect={onSelectPage}
          onPreloadLive={onPreloadLive}
        />
        <div className="auth-toolbar">
          <div
            ref={authMenuRef}
            className="auth-menu-shell"
            onMouseEnter={onAuthMenuOpen}
            onMouseLeave={onAuthMenuScheduleClose}
            onFocus={onAuthMenuOpen}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (nextTarget instanceof Node && authMenuRef.current?.contains(nextTarget)) {
                return;
              }
              onAuthMenuScheduleClose();
            }}
          >
            <button
              type="button"
              className="auth-avatar-button"
              aria-haspopup="menu"
              aria-expanded={authMenuOpen ? "true" : "false"}
              aria-label={t("account.menuAria", { label: authState.user ? avatarLabel : t("common.anonymousUser") })}
              title={avatarTitle}
              onClick={onAuthMenuToggle}
            >
              <UserAvatar
                avatarUrl={authState.user?.avatarUrl}
                displayName={authState.user?.displayName}
                email={authState.user?.email}
                className={`auth-avatar${avatarStateClass}`}
                imgAlt={authState.user?.displayName || t("common.userAvatar")}
                imgWidth={40}
                imgHeight={40}
                loading={authState.loading}
                loadingClassName="auth-avatar-loading-spinner"
                iconClassName="auth-avatar-icon"
              />
            </button>

            <AnchoredPopover
              anchorRef={authMenuRef}
              ariaLabel={t("account.menu")}
              className="auth-menu-dropdown"
              onBlur={onAuthMenuScheduleClose}
              onClose={onAuthMenuClose}
              onFocus={onAuthMenuOpen}
              onMouseEnter={onAuthMenuOpen}
              onMouseLeave={onAuthMenuScheduleClose}
              open={authMenuOpen}
            >
              <PopoverMenu ariaLabel={t("account.menu")}>
                {authState.user ? (
                  <>
                    <PopoverMenuItem
                      className="auth-menu-item"
                      onClick={() => {
                        onAuthMenuClose();
                        onOpenSettings();
                      }}
                    >
                      {t("account.personalCenter")}
                    </PopoverMenuItem>
                    {authState.user.isSuperAdmin ? (
                      <PopoverMenuItem
                        className="auth-menu-item"
                        href="/admin/"
                      >
                        {t("account.admin")}
                      </PopoverMenuItem>
                    ) : null}
                    <PopoverMenuItem
                      className="auth-menu-item"
                      onClick={() => {
                        onAuthMenuClose();
                        onLogout();
                      }}
                    >
                      {t("account.logout")}
                    </PopoverMenuItem>
                  </>
                ) : (
                  <PopoverMenuItem
                    className="auth-menu-item"
                    onClick={() => {
                      onAuthMenuClose();
                      onStartLogin();
                    }}
                    disabled={authState.loading || !authState.available}
                    title={
                      !authState.available
                        ? t("account.authServiceUnavailable")
                        : undefined
                    }
                  >
                    {t("account.loginNow")}
                  </PopoverMenuItem>
                )}
              </PopoverMenu>
            </AnchoredPopover>
          </div>
        </div>
      </div>
    </header>
  );
}
