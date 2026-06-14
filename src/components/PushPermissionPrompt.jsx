import { X } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider.jsx";

export function PushPermissionPrompt({
  busy,
  dismissChecked,
  error,
  onClose,
  onDismissCheckedChange,
  onEnable,
}) {
  const { t } = useI18n();

  return (
    <div className="push-permission-layer" role="presentation">
      <button
        type="button"
        className="push-permission-backdrop"
        aria-label={t("push.closePrompt")}
        onClick={onClose}
      />
      <div className="push-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="push-permission-title">
        <button
          type="button"
          className="push-permission-close"
          aria-label={t("push.closePrompt")}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
        <div className="push-permission-copy">
          <strong id="push-permission-title">{t("push.title")}</strong>
          <span>{t("push.message")}</span>
        </div>
        <label className="push-permission-check">
          <input
            type="checkbox"
            checked={dismissChecked}
            onChange={(event) => {
              onDismissCheckedChange(event.currentTarget.checked);
            }}
          />
          <span>{t("push.doNotRemind")}</span>
        </label>
        {error ? <p className="push-permission-error">{error}</p> : null}
        <div className="push-permission-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t("push.later")}
          </button>
          <button type="button" className="primary" onClick={onEnable} disabled={busy}>
            {busy ? t("push.enabling") : t("push.enable")}
          </button>
        </div>
      </div>
    </div>
  );
}
