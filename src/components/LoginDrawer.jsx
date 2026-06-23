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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path fill="#4285f4" d="M22 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.6c-.2 1.3-1 2.4-2.1 3.1V20h3.4c2-1.9 3.1-4.6 3.1-7.8Z" />
      <path fill="#34a853" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.7c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.8C4.4 19.7 7.9 22 12 22Z" />
      <path fill="#fbbc05" d="M6.2 13.5c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V6.7H2.7C2 8.1 1.6 9.8 1.6 11.5s.4 3.4 1.1 4.8l3.5-2.8Z" />
      <path fill="#ea4335" d="M12 5.2c1.5 0 2.9.5 4 1.6l3-3C17.2 2.1 14.8 1 12 1 7.9 1 4.4 3.3 2.7 6.7l3.5 2.8C7 7 9.3 5.2 12 5.2Z" />
    </svg>
  );
}

function TwitterIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path fill="currentColor" d="M13.9 10.5 21.3 2h-1.8l-6.4 7.4L8 2H2l7.8 11.3L2 22h1.8l6.8-7.8L16 22h6l-8.1-11.5Zm-2.4 2.7-.8-1.1L4.4 3.3h2.8l5 7 .8 1.1 6.6 9.3h-2.8l-5.3-7.5Z" />
    </svg>
  );
}

function ProviderIcon({ id }) {
  if (id === "google") {
    return <GoogleIcon />;
  }
  if (id === "twitter") {
    return <TwitterIcon />;
  }
  return <MicrosoftIcon />;
}

export function LoginDrawer({
  authAvailable,
  authLoading,
  authProviders = [],
  onClose,
  onLogin,
  transitionClassName = ""
}) {
  const { t } = useI18n();
  const transitionSuffix = transitionClassName ? ` ${transitionClassName}` : "";
  const providers = Array.isArray(authProviders) ? authProviders : [];
  const providerButtons = providers.length > 0
    ? providers
    : [{ id: "microsoft", label: "Microsoft" }];

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

          {providerButtons.map((provider) => (
            <button
              type="button"
              className="login-provider-button"
              key={provider.id}
              onClick={() => onLogin?.(provider)}
              disabled={!authAvailable || authLoading || providers.length === 0}
            >
              <span className="login-provider-icon" aria-hidden="true">
                <ProviderIcon id={provider.id} />
              </span>
              <span>
                {authLoading
                  ? t("settings.checkingAuth")
                  : t("settings.continueProviderLogin", { provider: provider.label })}
              </span>
            </button>
          ))}

          {!authAvailable ? <p className="inline-warning">{t("settings.authUnavailable")}</p> : null}
        </div>
      </aside>
    </>
  );
}
