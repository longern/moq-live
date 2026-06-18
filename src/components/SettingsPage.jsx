import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
} from "lucide-react";
import { LoginDrawer } from "./LoginDrawer.jsx";
import { MobilePanelPresence, useMobilePanelViewport } from "./MobilePanelPresence.jsx";
import {
  AccountDrawer,
  AccountEditDrawer,
  DesktopAccountDetailsContent,
  formatAccountGender,
} from "./settings/SettingsAccountPanels.jsx";
import {
  AdvancedSettingsContent,
  DesktopSettingsSidebar,
  ProfileSummaryCard,
  SectionBlock,
  SettingsDrawer,
  SettingsIcon,
  WatchHistorySection,
} from "./settings/SettingsPageSections.jsx";
import { SettingsFollowsDrawer } from "./settings/SettingsFollowsDrawer.jsx";
import { SwipeableDrawer } from "./primitives/SwipeableDrawer.jsx";
import { ToastViewport, useToast } from "./primitives/FloatingToast.jsx";
import {
  readRouteSettingsPanelType,
  writeSettingsPanelRoute,
} from "../lib/settingsRouteState.js";
import { useSettingsAccountEditor } from "../hooks/useSettingsAccountEditor.js";
import { useSettingsFollowsPanel } from "../hooks/useSettingsFollowsPanel.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

const GENDER_MENU_OPTIONS = ["male", "female", "other"];

function formatHistoryTime(value, locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getFollowsPanelTitle(type, t) {
  return type === "followers" ? t("follows.titleFollowers") : t("follows.titleFollowing");
}

export function SettingsPage({
  hidden,
  buildLabel,
  authAvailable,
  authLoading,
  authUser,
  onMicrosoftLogin,
  onLogout,
  onUpdateDisplayName,
  onUpdateHandle,
  onUpdateBio,
  onUpdateGender,
  onUpdateBirthDate,
  onUpdateAvatar,
  onOpenFollowUserRoom,
  watchHistoryItems,
  onOpenWatchHistoryItem,
  onClearWatchHistory,
  onRefreshAuth,
  logText,
  logRef
}) {
  const { locale, localePreference, setLocalePreference, systemLocale, t } = useI18n();
  const { showToast } = useToast();
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [loginPanelOpen, setLoginPanelOpen] = useState(false);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [mobileEditPanel, setMobileEditPanel] = useState(null);
  const [routePanelType, setRoutePanelType] = useState(readRouteSettingsPanelType);
  const [desktopSection, setDesktopSection] = useState("account");
  const settingsPanelRoutePushedRef = useRef(null);
  const authPending = authLoading;
  const isMobilePanelViewport = useMobilePanelViewport();
  const accountEditor = useSettingsAccountEditor({
    authUser,
    isMobilePanelViewport,
    locale,
    onUpdateAvatar,
    onUpdateBio,
    onUpdateBirthDate,
    onUpdateDisplayName,
    onUpdateGender,
    onUpdateHandle,
    showToast,
    setMobileEditPanel,
    t,
  });
  const accountEdit = accountEditor.mobileEditProps;
  const followsPanel = useSettingsFollowsPanel({
    authPending,
    authUser,
    hidden,
    isMobilePanelViewport,
    onOpenFollowUserRoom,
    onRefreshAuth,
    openLoginPanel,
    routePanelType,
    setRoutePanelType,
    settingsPanelRoutePushedRef,
  });

  useEffect(() => {
    function handlePopState() {
      settingsPanelRoutePushedRef.current = null;
      setRoutePanelType(readRouteSettingsPanelType());
    }

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      setMobileEditPanel(null);
      setAccountPanelOpen(false);
      return;
    }

    setLoginPanelOpen(false);
  }, [authUser?.id]);

  const profileHandleLabel = authUser?.handle ? `@${authUser.handle}` : "";
  const profileName = authPending
    ? t("account.loading")
    : authUser?.displayName || authUser?.handle || authUser?.email || t("account.login");
  const profileSubtitle = authPending
    ? null
    : authUser
      ? profileHandleLabel || t("account.signedIn")
      : null;
  const profileFollowerCount = Math.max(0, Number(authUser?.followerCount || 0));
  const profileFollowingCount = Math.max(0, Number(authUser?.followingCount || 0) + followsPanel.profileFollowingAdjustment);
  const historyItems = useMemo(() => (watchHistoryItems ?? []).map((item) => ({
    ...item,
    displayTime: formatHistoryTime(item.watchedAt, locale)
  })), [locale, watchHistoryItems]);

  function openLoginPanel() {
    if (authPending) {
      return;
    }

    setLoginPanelOpen(true);
  }

  function openRoutedSettingsPanel(type, openPanel) {
    if (isMobilePanelViewport) {
      writeSettingsPanelRoute(type, { historyMode: "push" });
      settingsPanelRoutePushedRef.current = type;
      setRoutePanelType(type);
    }

    openPanel();
  }

  function closeRoutedSettingsPanel(type, closePanel) {
    closePanel();

    if (!isMobilePanelViewport || readRouteSettingsPanelType() !== type) {
      return;
    }

    if (settingsPanelRoutePushedRef.current === type) {
      settingsPanelRoutePushedRef.current = null;
      history.back();
      return;
    }

    writeSettingsPanelRoute(null, { historyMode: "replace" });
    setRoutePanelType(null);
  }

  function openSettingsPanel() {
    openRoutedSettingsPanel("settings", () => {
      setSettingsPanelOpen(true);
    });
  }

  function closeSettingsPanel() {
    closeRoutedSettingsPanel("settings", () => {
      setSettingsPanelOpen(false);
    });
  }

  function openProfilePanel() {
    if (authPending) {
      return;
    }

    if (authUser) {
      openRoutedSettingsPanel("account", () => {
        setAccountPanelOpen(true);
      });
      return;
    }

    openLoginPanel();
  }

  function closeAccountPanel() {
    closeRoutedSettingsPanel("account", () => {
      setAccountPanelOpen(false);
      setMobileEditPanel(null);
    });
  }

  useEffect(() => {
    if (hidden || !isMobilePanelViewport) {
      return;
    }

    const routeSettingsPanelOpen = routePanelType === "settings";
    const routeAccountPanelOpen = routePanelType === "account";
    setSettingsPanelOpen(routeSettingsPanelOpen);

    if (!routeAccountPanelOpen) {
      setAccountPanelOpen(false);
      setMobileEditPanel(null);
      return;
    }

    if (authPending) {
      return;
    }

    setAccountPanelOpen(Boolean(authUser));
  }, [authPending, authUser, hidden, isMobilePanelViewport, routePanelType]);

  return (
    <section className="page" data-page="settings" hidden={hidden}>
      <div className="page-grid settings-layout">
        <div className="my-page-shell">
          <div className="my-page-toolbar my-page-toolbar-mobile">
            <div />
            <button
              type="button"
              className="my-page-settings-button"
              aria-label={t("account.settingsButtonAria")}
              onClick={openSettingsPanel}
            >
              <SettingsIcon />
            </button>
          </div>

          <div className="profile-page-layout">
            <aside className="profile-page-aside">
              <DesktopSettingsSidebar
                activeSection={desktopSection}
                onSelectSection={setDesktopSection}
              />
            </aside>

            <hr className="profile-page-divider" aria-hidden="true" />

            <div className="profile-page-content">
              <div className="desktop-settings-content my-page-sections">
                {desktopSection === "account" ? (
                  <SectionBlock title={t("settings.accountInfo")}>
                    {authUser ? (
                      <DesktopAccountDetailsContent
                        {...accountEditor.desktopAccountProps}
                      />
                    ) : (
                      <div className="my-empty-state my-login-empty">
                        <span>{authPending ? t("account.loading") : t("settings.loginHint")}</span>
                        <button
                          type="button"
                          className="my-plain-login-button"
                          onClick={openLoginPanel}
                          disabled={authPending}
                        >
                          {t("settings.continueLogin")}
                        </button>
                      </div>
                    )}
                  </SectionBlock>
                ) : null}

                {desktopSection === "history" ? (
                  <WatchHistorySection
                    historyItems={historyItems}
                    onClearWatchHistory={onClearWatchHistory}
                    onOpenWatchHistoryItem={onOpenWatchHistoryItem}
                  />
                ) : null}

                {desktopSection === "advanced" ? (
                  <AdvancedSettingsContent
                    buildLabel={buildLabel}
                    logRef={logRef}
                    logText={logText}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="mobile-profile-layout">
            <ProfileSummaryCard
              authPending={authPending}
              authUser={authUser}
              followerCount={profileFollowerCount}
              followingCount={profileFollowingCount}
              profileName={profileName}
              profileSubtitle={profileSubtitle}
              onOpenFollowers={() => {
                followsPanel.openFollowsPanel("followers");
              }}
              onOpenFollowing={() => {
                followsPanel.openFollowsPanel("following");
              }}
              onOpenProfilePanel={openProfilePanel}
            />
            <div className="mobile-settings-content my-page-sections">
              <WatchHistorySection
                historyItems={historyItems}
                onClearWatchHistory={onClearWatchHistory}
                onOpenWatchHistoryItem={onOpenWatchHistoryItem}
              />
            </div>
          </div>
        </div>

        <MobilePanelPresence open={settingsPanelOpen}>
          {({ transitionClassName }) => (
            <SettingsDrawer
              buildLabel={buildLabel}
              canLogout={Boolean(authUser)}
              localePreference={localePreference}
              logRef={logRef}
              logText={logText}
              onClose={closeSettingsPanel}
              onLocalePreferenceChange={setLocalePreference}
              onLogout={onLogout}
              systemLocale={systemLocale}
              transitionClassName={transitionClassName}
            />
          )}
        </MobilePanelPresence>

        <MobilePanelPresence open={accountPanelOpen && Boolean(authUser)}>
          {({ transitionClassName }) => (authUser ? (
            <AccountDrawer
              {...accountEditor.accountDrawerProps}
              onClose={closeAccountPanel}
              transitionClassName={transitionClassName}
            />
          ) : null)}
        </MobilePanelPresence>

        <MobilePanelPresence open={mobileEditPanel === "handle" && Boolean(authUser)}>
          {({ transitionClassName }) => (authUser ? (
            <AccountEditDrawer
              closeLabel={t("accountPanel.closeHandleEditPage")}
              error={accountEdit.handleError}
              inputValue={accountEdit.handleInput}
              label={t("accountPanel.handle")}
              maxLength={24}
              note={(
                <>
                  {accountEdit.handleIsDefault
                    ? t("accountPanel.handleDefaultNote")
                    : accountEdit.handleCooldownActive
                      ? t("accountPanel.handleCooldownNote", { time: new Date(authUser.nextHandleChangeAt).toLocaleString(locale) })
                      : t("accountPanel.handleNote")}
                  <br />
                  {t("accountPanel.handleRule")}
                </>
              )}
              onCancel={accountEdit.cancelHandleEditing}
              onInput={(event) => {
                accountEdit.setHandleInput(event.currentTarget.value.toLowerCase());
                accountEdit.setHandleError("");
                accountEdit.setHandleStatus("");
              }}
              onSave={() => {
                void accountEdit.submitHandle();
              }}
              placeholder={t("accountPanel.handlePlaceholder")}
              readOnly={accountEdit.handleReadOnly}
              saveDisabled={
                accountEdit.handleSaving
                || accountEdit.handleReadOnly
                || !accountEdit.handleInput.trim()
                || accountEdit.handleUnchanged
              }
              saving={accountEdit.handleSaving}
              status={accountEdit.handleStatus}
              title={t("accountPanel.editPageTitleHandle")}
              transitionClassName={transitionClassName}
            />
          ) : null)}
        </MobilePanelPresence>

        <MobilePanelPresence open={mobileEditPanel === "displayName" && Boolean(authUser)}>
          {({ transitionClassName }) => (authUser ? (
            <AccountEditDrawer
              closeLabel={t("accountPanel.closeDisplayNameEditPage")}
              error={accountEdit.displayNameError}
              inputValue={accountEdit.displayNameInput}
              label={t("accountPanel.displayName")}
              maxLength={32}
              note={accountEdit.displayNameCooldownActive
                ? t("accountPanel.displayNameCooldownNote", { time: new Date(authUser.nextDisplayNameChangeAt).toLocaleString(locale) })
                : t("accountPanel.displayNameNote")}
              onCancel={accountEdit.cancelDisplayNameEditing}
              onInput={(event) => {
                accountEdit.setDisplayNameInput(event.currentTarget.value);
                accountEdit.setDisplayNameError("");
                accountEdit.setDisplayNameStatus("");
              }}
              onSave={() => {
                void accountEdit.submitDisplayName();
              }}
              placeholder={t("accountPanel.displayNamePlaceholder")}
              readOnly={accountEdit.displayNameCooldownActive}
              saveDisabled={
                accountEdit.displayNameSaving
                || accountEdit.displayNameCooldownActive
                || !accountEdit.displayNameInput.trim()
                || accountEdit.displayNameUnchanged
              }
              saving={accountEdit.displayNameSaving}
              status={accountEdit.displayNameStatus}
              title={t("accountPanel.editPageTitleDisplayName")}
              transitionClassName={transitionClassName}
            />
          ) : null)}
        </MobilePanelPresence>

        <SwipeableDrawer
          open={mobileEditPanel === "gender" && Boolean(authUser)}
          onClose={accountEdit.cancelGenderEditing}
          ariaLabel={t("accountPanel.closeGenderEditPage")}
          className="account-field-drawer"
          panelClassName="account-field-drawer-panel"
          portal
          viewport
        >
          <div className="account-choice-panel">
            <ul className="live-menu-list settings-language-list" aria-label={t("accountPanel.gender")}>
              {GENDER_MENU_OPTIONS.map((gender) => {
                const active = gender === (authUser?.gender || "");
                return (
                  <li key={gender} className="live-menu-list-item">
                    <button
                      type="button"
                      className={`live-menu-item settings-language-option${active ? " is-active" : ""}`}
                      aria-pressed={active}
                      disabled={accountEdit.genderSaving}
                      onClick={() => {
                        if (active) {
                          accountEdit.cancelGenderEditing();
                          return;
                        }
                        accountEdit.setGenderInput(gender);
                        void accountEdit.submitGender(gender, { closeImmediately: true });
                      }}
                    >
                      <span className="settings-language-option-copy">
                        <strong>{formatAccountGender(gender, t)}</strong>
                      </span>
                      {active ? (
                        <span className="settings-language-check" aria-hidden="true">
                          <Check />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </SwipeableDrawer>

        <SwipeableDrawer
          open={mobileEditPanel === "birthDate" && Boolean(authUser)}
          onClose={accountEdit.cancelBirthDateEditing}
          ariaLabel={t("accountPanel.closeBirthDateEditPage")}
          className="account-field-drawer"
          panelClassName="account-field-drawer-panel"
          portal
          viewport
        >
          <div className="account-field-drawer-head">
            <button
              type="button"
              className="account-field-drawer-save"
              disabled={accountEdit.birthDateSaving}
              onClick={() => {
                void accountEdit.submitBirthDate({ closeImmediately: true });
              }}
            >
              {accountEdit.birthDateSaving ? t("common.saving") : t("common.save")}
            </button>
          </div>
          <label className="account-field-drawer-input">
            <span>{t("accountPanel.birthDate")}</span>
            <input
              type="date"
              value={accountEdit.birthDateInput}
              onInput={(event) => {
                accountEdit.setBirthDateInput(event.currentTarget.value);
                accountEdit.setBirthDateError("");
                accountEdit.setBirthDateStatus("");
              }}
              autoFocus
            />
          </label>
        </SwipeableDrawer>



        <MobilePanelPresence open={mobileEditPanel === "bio" && Boolean(authUser)}>
          {({ transitionClassName }) => (authUser ? (
            <AccountEditDrawer
              closeLabel={t("accountPanel.closeBioEditPage")}
              error={accountEdit.bioError}
              inputValue={accountEdit.bioInput}
              label={t("accountPanel.bio")}
              maxLength={160}
              multiline
              note={t("accountPanel.bioNote")}
              onCancel={accountEdit.cancelBioEditing}
              onInput={(event) => {
                accountEdit.setBioInput(event.currentTarget.value);
                accountEdit.setBioError("");
                accountEdit.setBioStatus("");
              }}
              onSave={() => {
                void accountEdit.submitBio();
              }}
              placeholder={t("profile.noBio")}
              saveDisabled={accountEdit.bioSaving || accountEdit.bioUnchanged}
              saving={accountEdit.bioSaving}
              status={accountEdit.bioStatus}
              title={t("accountPanel.editPageTitleBio")}
              transitionClassName={transitionClassName}
            />
          ) : null)}
        </MobilePanelPresence>

        <MobilePanelPresence open={Boolean(followsPanel.followsPanelOpen && authUser)}>
          {({ transitionClassName }) => followsPanel.visibleFollowsPanelType ? (
            <SettingsFollowsDrawer
              error={followsPanel.activeFollowsState.error}
              hasMore={followsPanel.activeFollowsState.hasMore}
              items={followsPanel.activeFollowsState.items}
              loading={followsPanel.activeFollowsState.loading}
              loadingMore={followsPanel.activeFollowsState.loadingMore}
              onClose={() => {
                followsPanel.closeFollowsPanel();
              }}
              onLoadMore={() => {
                void followsPanel.loadFollows(followsPanel.visibleFollowsPanelType);
              }}
              onOpenUserRoom={followsPanel.openFollowUserRoom}
              onRequestUnfollow={followsPanel.requestUnfollow}
              onRetry={() => {
                void followsPanel.loadFollows(followsPanel.visibleFollowsPanelType, { reset: true });
              }}
              onCancelUnfollow={followsPanel.cancelUnfollow}
              onConfirmUnfollow={() => {
                void followsPanel.confirmUnfollow();
              }}
              pendingUnfollowUser={followsPanel.pendingUnfollowUser}
              title={getFollowsPanelTitle(followsPanel.visibleFollowsPanelType, t)}
              type={followsPanel.visibleFollowsPanelType}
              unfollowBusy={followsPanel.unfollowBusy}
              unfollowError={followsPanel.unfollowError}
              transitionClassName={transitionClassName}
            />
          ) : null}
        </MobilePanelPresence>

        <MobilePanelPresence open={loginPanelOpen}>
          {({ transitionClassName }) => (
            <LoginDrawer
              authAvailable={authAvailable}
              authLoading={authLoading}
              onClose={() => {
                setLoginPanelOpen(false);
              }}
              onMicrosoftLogin={onMicrosoftLogin}
              transitionClassName={transitionClassName}
            />
          )}
        </MobilePanelPresence>

        {hidden ? null : <ToastViewport className="settings-page-toast" />}
      </div>
    </section>
  );
}
