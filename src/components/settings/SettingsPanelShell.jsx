import { ChevronLeft } from "lucide-react";

export function SettingsPanelShell({
  backdropClassName,
  backdropLabel,
  bodyClassName,
  closeLabel,
  closeButtonClassName,
  headClassName,
  onClose,
  panelClassName,
  panelLabel,
  title,
  transitionClassName = "",
  children,
}) {
  const transitionSuffix = transitionClassName ? ` ${transitionClassName}` : "";

  return (
    <>
      <button
        type="button"
        className={`${backdropClassName}${transitionSuffix}`}
        aria-label={backdropLabel}
        onClick={onClose}
      />
      <aside className={`${panelClassName}${transitionSuffix}`} aria-label={panelLabel}>
        <div className={headClassName}>
          <button
            type="button"
            className={closeButtonClassName}
            aria-label={closeLabel}
            onClick={onClose}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <strong>{title}</strong>
          <span className="panel-head-spacer" aria-hidden="true" />
        </div>
        <div className={bodyClassName}>{children}</div>
      </aside>
    </>
  );
}
