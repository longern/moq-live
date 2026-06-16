import { ChevronLeft } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider.jsx";

function BackIcon() {
  return <ChevronLeft aria-hidden="true" />;
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="2" y="2" width="9" height="9" fill="#f25022" />
      <rect x="13" y="2" width="9" height="9" fill="#7fba00" />
      <rect x="2" y="13" width="9" height="9" fill="#00a4ef" />
      <rect x="13" y="13" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function LoginDrawer({
  authAvailable,
  authLoading,
  onClose,
  onMicrosoftLogin,
  transitionClassName = ""
}) {
  const { t } = useI18n();
  const transitionSuffix = transitionClassName ? ` ${transitionClassName}` : "";

  return (
    <>
      <button
        type="button"
        className={`auth-panel-backdrop${transitionSuffix}`}
        aria-label={t("settings.closeLoginPage")}
        onClick={onClose}
      />
      <aside className={`auth-panel auth-panel-login${transitionSuffix}`} aria-label={t("settings.loginPage")}>
        <div className="panel-page-head login-panel-head">
          <button
            type="button"
            className="panel-page-back login-panel-close"
            aria-label={t("common.back")}
            onClick={onClose}
          >
            <BackIcon />
          </button>
          <strong className="panel-page-title">{t("account.login")}</strong>
          <span className="panel-head-spacer" aria-hidden="true" />
        </div>
        <div className="login-panel-body">
          <div className="login-panel-copy">
            <h2>{t("settings.loginAccount")}</h2>
          </div>

          <button
            type="button"
            className="login-provider-button"
            onClick={onMicrosoftLogin}
            disabled={!authAvailable || authLoading}
          >
            <span className="login-provider-icon" aria-hidden="true">
              <MicrosoftIcon />
            </span>
            <span>{authLoading ? t("settings.checkingAuth") : t("settings.continueLogin")}</span>
          </button>

          {!authAvailable ? <p className="inline-warning">{t("settings.authUnavailable")}</p> : null}
        </div>
      </aside>
    </>
  );
}
