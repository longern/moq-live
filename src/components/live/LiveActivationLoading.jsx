import { useI18n } from "../../i18n/I18nProvider.jsx";

export function LiveActivationLoading() {
  const { t } = useI18n();

  return (
    <span className="live-circular-progress" role="progressbar" aria-label={t("live.checkingActivation")} />
  );
}
