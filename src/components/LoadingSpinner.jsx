import { useI18n } from "../i18n/I18nProvider.jsx";

export function LoadingSpinner({
  className = "",
  label = "",
  ariaHidden = false,
}) {
  const { t } = useI18n();
  const nextClassName = ["loading-spinner", className].filter(Boolean).join(" ");
  const resolvedLabel = label || t("common.loading");

  if (ariaHidden) {
    return <span className={nextClassName} aria-hidden="true" />;
  }

  return <span className={nextClassName} role="status" aria-label={resolvedLabel} />;
}
