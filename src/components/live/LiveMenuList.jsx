function joinClassNames(...classNames) {
  return classNames.filter(Boolean).join(" ");
}

export function LiveMenuList({
  children,
  className = "",
  ariaLabel,
}) {
  return (
    <ul
      className={joinClassNames("live-menu-list", className)}
      aria-label={ariaLabel}
    >
      {children}
    </ul>
  );
}

export function LiveMenuItem({
  children,
  className = "",
  active = false,
  ...buttonProps
}) {
  return (
    <li className="live-menu-list-item">
      <button
        type="button"
        className={joinClassNames("live-menu-item", active ? "is-active" : "", className)}
        {...buttonProps}
      >
        {children}
      </button>
    </li>
  );
}
