export function LiveSwitch({ checked = false, className = "" }) {
  const switchClassName = `live-switch${checked ? " is-on" : ""}${className ? ` ${className}` : ""}`;

  return (
    <span className={switchClassName} aria-hidden="true">
      <span className="live-switch-thumb" />
    </span>
  );
}
