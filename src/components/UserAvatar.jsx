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
    <span class={nextClassName} aria-hidden="true">
      {loading ? (
        <span class={loadingClassName} />
      ) : avatarUrl ? (
        <img src={avatarUrl} alt={imgAlt} width={imgWidth} height={imgHeight} />
      ) : initials ? (
        <span>{initials}</span>
      ) : (
        <svg viewBox="0 0 24 24" class={iconClassName}>
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5.5 19.5c1.8-3.2 4.1-4.8 6.5-4.8s4.7 1.6 6.5 4.8" />
        </svg>
      )}
    </span>
  );
}
