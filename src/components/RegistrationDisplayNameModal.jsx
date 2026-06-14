import { X } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider.jsx";

export function RegistrationDisplayNameModal({
  error,
  inputValue,
  onChange,
  onClose,
  onSubmit,
  placeholder,
  saving,
}) {
  const { t } = useI18n();

  return (
    <div className="registration-name-layer" role="presentation">
      <div
        className="registration-name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="registration-name-title"
      >
        <button
          type="button"
          className="registration-name-close"
          aria-label={t("registrationName.close")}
          onClick={onClose}
          disabled={saving}
        >
          <X aria-hidden="true" />
        </button>
        <form className="registration-name-form" onSubmit={onSubmit}>
          <div className="registration-name-copy">
            <strong id="registration-name-title">{t("registrationName.title")}</strong>
            <span>{t("registrationName.message")}</span>
          </div>
          <label className="registration-name-field">
            <span>{t("accountPanel.displayName")}</span>
            <input
              type="text"
              value={inputValue}
              placeholder={placeholder || t("accountPanel.displayNamePlaceholder")}
              autoFocus
              onChange={(event) => onChange(event.currentTarget.value)}
              disabled={saving}
            />
          </label>
          {error ? <p className="registration-name-error">{error}</p> : null}
          <div className="registration-name-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </button>
            <button type="submit" className="primary" disabled={saving || !inputValue.trim()}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
