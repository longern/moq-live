import { CircleUserRound } from "lucide-react";

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
  imgAlt = "用户头像",
  imgWidth,
  imgHeight,
  initialsLength = 1,
  loading = false,
  loadingClassName = "",
  iconClassName = "",
  monogramClassName = "",
  placeholderClassName = ""
}) {
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
        <span className={loadingClassName} />
      ) : avatarUrl ? (
        <img src={avatarUrl} alt={imgAlt} width={imgWidth} height={imgHeight} />
      ) : initials ? (
        <span>{initials}</span>
      ) : (
        <CircleUserRound className={iconClassName} />
      )}
    </span>
  );
}
