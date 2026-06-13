import { CircleUserRound } from "lucide-react";
import { LoadingSpinner } from "./LoadingSpinner.jsx";
import { useI18n } from "../i18n/I18nProvider.jsx";

function getAvatarText(displayName, email, initialsLength) {
  const source = String(displayName || email || "").trim();
  if (!source) {
    return "";
  }

  const firstWord = source.split(/\s+/)[0] || source;
  return firstWord.slice(0, initialsLength).toUpperCase();
}

export function UserAvatar({
  avatarUrl,
  displayName,
  email,
  className = "",
  imgAlt = "",
  imgWidth,
  imgHeight,
  initialsLength = 1,
  loading = false,
  loadingClassName = "",
  iconClassName = "",
  monogramClassName = "",
  placeholderClassName = ""
}) {
  const { t } = useI18n();
  const initials = getAvatarText(displayName, email, initialsLength);
  const modeClassName = avatarUrl
    ? ""
    : initials
      ? monogramClassName
      : placeholderClassName;
  const nextClassName = [className, modeClassName].filter(Boolean).join(" ");

  return (
    <span className={nextClassName} aria-hidden="true">
      {loading ? (
        <LoadingSpinner className={loadingClassName} ariaHidden />
      ) : avatarUrl ? (
        <img src={avatarUrl} alt={imgAlt || t("common.userAvatar")} width={imgWidth} height={imgHeight} />
      ) : initials ? (
        <span>{initials}</span>
      ) : (
        <CircleUserRound className={iconClassName} />
      )}
    </span>
  );
}
