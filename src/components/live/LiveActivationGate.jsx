import { useI18n } from "../../i18n/I18nProvider.jsx";

export function LiveActivationGate({
  title,
  message,
  error,
  busy,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}) {
  const { t } = useI18n();

  return (
    <div className="live-activation-panel">
      <div className="live-activation-copy">
        <span>{t("live.feature")}</span>
        <h2>{title}</h2>
        <p>{message}</p>
        {error ? <p className="live-activation-error">{error}</p> : null}
      </div>
      <div className="live-activation-actions">
        {primaryLabel ? (
          <button type="button" className="primary" onClick={onPrimary} disabled={busy}>
            {busy ? t("common.processing") : primaryLabel}
          </button>
        ) : null}
        {secondaryLabel ? (
          <button type="button" className="live-activation-secondary" onClick={onSecondary} disabled={busy}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
