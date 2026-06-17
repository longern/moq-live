import { CircleUserRound } from "lucide-react";
import { LoadingSpinner } from "./LoadingSpinner.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

function getAvatarText(displayName, email, initialsLength) {
  const source = String(displayName || email || "").trim();
  if (!source) {
    return "";
  }

  const firstWord = source.split(/\s+/)[0] || source;
  return firstWord.slice(0, initialsLength).toUpperCase();
}

function getLoadingSpinnerStyle(imgWidth, imgHeight) {
  if (typeof imgWidth !== "number" || typeof imgHeight !== "number") {
    return undefined;
  }

  const size = Math.min(imgWidth, imgHeight) / 2;
  return {
    width: size,
    height: size
  };
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
  const shouldRenderImage = Boolean(avatarUrl) && !loading;

  if (shouldRenderImage) {
    return (
      <span className={className} aria-hidden="true">
        <img src={avatarUrl} alt={imgAlt || t("common.userAvatar")} width={imgWidth} height={imgHeight} />
      </span>
    );
  }

  const fallbackClassName = [
    className,
    loading || initials ? monogramClassName : placeholderClassName
  ].filter(Boolean).join(" ");
  const fallbackStyle = imgWidth || imgHeight
    ? {
      width: imgWidth,
      height: imgHeight,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center"
    }
    : undefined;
  const fallbackContent = loading ? (
    <LoadingSpinner className={loadingClassName} style={getLoadingSpinnerStyle(imgWidth, imgHeight)} ariaHidden />
  ) : initials ? (
    initials
  ) : (
    <CircleUserRound className={iconClassName} />
  );

  return (
    <span className={className} aria-hidden="true">
      <span className={fallbackClassName} style={fallbackStyle}>{fallbackContent}</span>
    </span>
  );
}
