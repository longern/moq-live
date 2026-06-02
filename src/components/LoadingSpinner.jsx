export function LoadingSpinner({
  className = "",
  label = "加载中",
  ariaHidden = false,
}) {
  const nextClassName = ["loading-spinner", className].filter(Boolean).join(" ");

  if (ariaHidden) {
    return <span className={nextClassName} aria-hidden="true" />;
  }

  return <span className={nextClassName} role="status" aria-label={label} />;
}
