function joinClassNames(...classNames) {
  return classNames.filter(Boolean).join(" ");
}

export function LiveMenuList({
  children,
  className = "",
  role,
  ariaLabel,
}) {
  return (
    <div
      className={joinClassNames("live-menu-list", className)}
      role={role}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

export function LiveMenuItem({
  children,
  className = "",
  active = false,
  ...buttonProps
}) {
  return (
    <button
      type="button"
      className={joinClassNames("live-menu-item", active ? "is-active" : "", className)}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
