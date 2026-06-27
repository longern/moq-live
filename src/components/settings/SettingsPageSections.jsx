import { useState } from "react";
import {
  Check,
  ChevronRight,
  CircleHelp,
  History,
  Languages,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UsersRound,
  UserRound,
} from "lucide-react";
import { formatAudienceCount } from "../../lib/audience.js";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { ProfileBio, ProfileInfoChips } from "../ProfileInfoSummary.jsx";
import { SettingsProfileAvatar } from "./SettingsAccountPanels.jsx";
import { SettingsPanelShell } from "./SettingsPanelShell.jsx";

function ChevronIcon() {
  return <ChevronRight />;
}

export function SettingsIcon() {
  return <SlidersHorizontal />;
}

function SettingsPanelCard({ children, className = "" }) {
  return <div className={`settings-panel-card-frame${className ? ` ${className}` : ""}`}>{children}</div>;
}

function getLanguageDisplayName(locale) {
  const normalizedLocale = String(locale || "").trim() || "en";
  const languageCode = normalizedLocale.split(/[-_]/)[0] || normalizedLocale;
  try {
    const displayName = new Intl.DisplayNames([normalizedLocale], { type: "language" }).of(languageCode);
    if (displayName) {
      return displayName;
    }
  } catch {
    // Fall through to a readable fallback for browsers without Intl.DisplayNames.
  }
  return languageCode === "zh" ? "中文" : languageCode.toUpperCase();
}

function getWatchHistoryHref(item) {
  const room = item?.room?.trim();
  return room ? `?r=${encodeURIComponent(room)}` : "?";
}

function SettingsMenuItem({
  href,
  icon: Icon,
  label,
  onClick,
  ariaLabel = label,
}) {
  const content = (
    <>
      <span className="live-more-menu-icon settings-menu-icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="live-more-menu-label">{label}</span>
      <ChevronIcon />
    </>
  );

  return (
    <li className="live-menu-list-item">
      {href ? (
        <a
          className="live-menu-item live-more-menu-item settings-menu-item"
          href={href}
          aria-label={ariaLabel}
          onClick={onClick}
        >
          {content}
        </a>
      ) : (
        <button
          type="button"
          className="live-menu-item live-more-menu-item settings-menu-item"
          aria-label={ariaLabel}
          onClick={onClick}
        >
          {content}
        </button>
      )}
    </li>
  );
}

function LanguageOptionRow({
  active,
  label,
  detail,
  onClick,
}) {
  return (
    <li className="live-menu-list-item">
      <button
        type="button"
        className={`live-menu-item settings-language-option${active ? " is-active" : ""}`}
        aria-pressed={active}
        onClick={onClick}
      >
        <span className="settings-language-option-copy">
          <strong>{label}</strong>
          {detail ? <span>{detail}</span> : null}
        </span>
        {active ? (
          <span className="settings-language-check" aria-hidden="true">
            <Check />
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function SectionBlock({ title, action = null, children }) {
  return (
    <section className="my-section">
      <div className="my-section-head">
        <h3 className="my-section-title">{title}</h3>
        {action}
      </div>
      <div className="my-section-body">{children}</div>
    </section>
  );
}

export function ProfileSummaryCard({
  authPending,
  authUser,
  followerCount,
  followingCount,
  onOpenFollowers,
  onOpenFollowing,
  profileName,
  profileSubtitle,
  onOpenProfilePanel
}) {
  const { t } = useI18n();
  const profileLocationProvince = authUser?.locationProvince || authUser?.lastLocationProvince || t("profile.locationUnknown");

  return (
    <section className="my-account-card">
      <button
        type="button"
        className={`my-profile-row${authUser ? "" : " is-guest"}${authPending ? " is-loading" : ""}`}
        onClick={onOpenProfilePanel}
        disabled={authPending}
        aria-busy={authPending}
      >
        <SettingsProfileAvatar
          authUser={authUser}
          imgWidth={72}
          imgHeight={72}
          loading={authPending}
        />
        <span className="my-profile-copy">
          <strong>{profileName}</strong>
          {profileSubtitle ? <span>{profileSubtitle}</span> : null}
        </span>
        <span className="my-profile-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
      {authUser ? (
        <ProfileInfoChips
          className="profile-info-chips my-profile-info-chips"
          gender={authUser.gender}
          birthDate={authUser.birthDate}
          province={profileLocationProvince}
        />
      ) : null}
      {authUser ? (
        <div className="my-profile-stats" aria-label={t("profile.statsAria")}>
          <button
            type="button"
            className="my-profile-stat my-profile-stat-button"
            onClick={onOpenFollowing}
            aria-label={t("profile.followingListAria", { count: formatAudienceCount(followingCount) })}
          >
            <strong>{formatAudienceCount(followingCount)}</strong>
            <span>{t("profile.following")}</span>
          </button>
          <hr className="my-profile-stat-divider" aria-hidden="true" />
          <button
            type="button"
            className="my-profile-stat my-profile-stat-button"
            onClick={onOpenFollowers}
            aria-label={t("profile.followersListAria", { count: formatAudienceCount(followerCount) })}
          >
            <strong>{formatAudienceCount(followerCount)}</strong>
            <span>{t("profile.followers")}</span>
          </button>
        </div>
      ) : null}
      {authUser ? <ProfileBio className="profile-bio my-profile-bio" bio={authUser.bio} /> : null}
    </section>
  );
}

export function WatchHistorySection({ historyItems, onClearWatchHistory, onOpenWatchHistoryItem }) {
  const { t } = useI18n();

  return (
    <SectionBlock
      title={t("settings.history")}
      action={historyItems.length ? (
        <button type="button" className="my-section-link" onClick={onClearWatchHistory}>{t("settings.clear")}</button>
      ) : null}
    >
      {historyItems.length ? (
        <ul className="my-history-list">
          {historyItems.map((item) => (
            <li key={`${item.room}-${item.watchedAt}`}>
              <a
                href={getWatchHistoryHref(item)}
                className="my-history-row"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenWatchHistoryItem?.(item);
                }}
              >
                <span className="my-history-copy">
                  <strong>{item.room}</strong>
                </span>
                <span className="my-history-meta">
                  <span>{item.displayTime}</span>
                  <span className="my-row-chevron" aria-hidden="true">
                    <ChevronIcon />
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="my-empty-state">
          <span>{t("settings.noHistory")}</span>
        </div>
      )}
    </SectionBlock>
  );
}

export function AdvancedSettingsContent({
  buildLabel,
  logRef,
  logText
}) {
  const { t } = useI18n();

  return (
    <SectionBlock title={t("settings.diagnostics")}>
      <div className="my-info-row">
        <strong>{t("settings.build")}</strong>
        <span id="buildSubtitle">{buildLabel}</span>
      </div>
      <article className="my-log-block">
        <h3>{t("settings.devLog")}</h3>
        <pre id="log" ref={logRef}>{logText}</pre>
      </article>
    </SectionBlock>
  );
}

export function SettingsDrawer({
  buildLabel,
  canLogout,
  canOpenAdmin,
  localePreference,
  logRef,
  logText,
  onClose,
  onLocalePreferenceChange,
  onLogout,
  systemLocale,
  transitionClassName
}) {
  const { t } = useI18n();
  const [activePanel, setActivePanel] = useState("");
  const panelTitle = activePanel === "language"
    ? t("settings.language")
    : activePanel === "diagnostics"
      ? t("settings.issueDiagnostics")
      : t("settings.title");
  const systemLanguageLabel = getLanguageDisplayName(systemLocale);
  const zhLanguageLabel = getLanguageDisplayName("zh-CN");
  const enLanguageLabel = getLanguageDisplayName("en");

  return (
    <SettingsPanelShell
      backdropClassName="settings-panel-backdrop"
      backdropLabel={t("settings.closeSettingsPanel")}
      bodyClassName="settings-panel-body"
      closeLabel={t("common.back")}
      closeButtonClassName="settings-panel-close"
      headClassName="settings-panel-head"
      onClose={() => {
        if (activePanel) {
          setActivePanel("");
          return;
        }
        onClose();
      }}
      panelClassName="settings-panel"
      panelLabel={t("settings.settingsPanel")}
      title={panelTitle}
      transitionClassName={transitionClassName}
    >
      <div className={`settings-mobile-menu-shell${activePanel ? " is-editing" : ""}`}>
        <div className="settings-mobile-menu-track">
          <div className="settings-mobile-menu-screen">
            <div className="live-more-menu-title">{t("settings.title")}</div>
            <SettingsPanelCard>
              <ul className="live-menu-list settings-menu-list" aria-label={t("settings.title")}>
                <SettingsMenuItem
                  icon={Languages}
                  label={t("settings.language")}
                  onClick={() => {
                    setActivePanel("language");
                  }}
                />
                <SettingsMenuItem
                  icon={CircleHelp}
                  label={t("settings.issueDiagnostics")}
                  onClick={() => {
                    setActivePanel("diagnostics");
                  }}
                />
              </ul>
            </SettingsPanelCard>
            {canOpenAdmin ? (
              <SettingsPanelCard>
                <ul className="live-menu-list settings-menu-list" aria-label={t("account.admin")}>
                  <SettingsMenuItem
                    href="/admin/"
                    icon={ShieldCheck}
                    label={t("account.admin")}
                  />
                </ul>
              </SettingsPanelCard>
            ) : null}
            {canLogout ? (
              <SettingsPanelCard className="settings-logout-card">
                <ul className="live-menu-list settings-menu-list" aria-label={t("account.logout")}>
                  <li className="live-menu-list-item">
                    <button
                      type="button"
                      className="live-menu-item settings-logout-menu-item"
                      onClick={() => {
                        onClose();
                        onLogout();
                      }}
                    >
                      <span className="live-more-menu-label">{t("account.logout")}</span>
                    </button>
                  </li>
                </ul>
              </SettingsPanelCard>
            ) : null}
          </div>

          <div className="settings-mobile-menu-screen settings-mobile-detail-screen">
            {activePanel ? (
              <>
                {activePanel === "language" ? (
                  <SettingsPanelCard>
                    <ul className="live-menu-list settings-language-list" aria-label={t("settings.language")}>
                      <LanguageOptionRow
                        active={localePreference === "system"}
                        label={t("settings.languageSystem")}
                        detail={t("settings.languageSystemDetail", { language: systemLanguageLabel })}
                        onClick={() => {
                          onLocalePreferenceChange("system");
                        }}
                      />
                      <LanguageOptionRow
                        active={localePreference === "zh-CN"}
                        label={zhLanguageLabel}
                        onClick={() => {
                          onLocalePreferenceChange("zh-CN");
                        }}
                      />
                      <LanguageOptionRow
                        active={localePreference === "en"}
                        label={enLanguageLabel}
                        onClick={() => {
                          onLocalePreferenceChange("en");
                        }}
                      />
                    </ul>
                  </SettingsPanelCard>
                ) : (
                  <SettingsPanelCard>
                    <AdvancedSettingsContent
                      buildLabel={buildLabel}
                      logRef={logRef}
                      logText={logText}
                    />
                  </SettingsPanelCard>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </SettingsPanelShell>
  );
}

export function DesktopSettingsSidebar({
  activeSection,
  onSelectSection
}) {
  const { t } = useI18n();
  const items = [
    {
      id: "account",
      icon: UserRound,
      title: t("settings.accountInfo")
    },
    {
      id: "following",
      icon: UserCheck,
      title: t("settings.myFollowing")
    },
    {
      id: "followers",
      icon: UsersRound,
      title: t("settings.myFollowers")
    },
    {
      id: "history",
      icon: History,
      title: t("settings.history")
    },
    {
      id: "advanced",
      icon: SlidersHorizontal,
      title: t("settings.advanced")
    }
  ];

  return (
    <nav className="desktop-settings-sidebar" aria-label={t("account.personalCenter")}>
      <div className="desktop-settings-list">
        {items.map((item) => {
          const active = activeSection === item.id;
          const ItemIcon = item.icon;

          return (
            <button
              key={item.id}
              type="button"
              className={`desktop-settings-list-item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                onSelectSection(item.id);
              }}
            >
              <span className="desktop-settings-list-icon" aria-hidden="true">
                <ItemIcon />
              </span>
              <span className="desktop-settings-list-text">
                {item.title}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
