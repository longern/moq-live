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
  const headClassNames = ["panel-page-head", headClassName].filter(Boolean).join(" ");
  const closeButtonClassNames = ["panel-page-back", closeButtonClassName].filter(Boolean).join(" ");

  return (
    <>
      <button
        type="button"
        className={`${backdropClassName}${transitionSuffix}`}
        aria-label={backdropLabel}
        onClick={onClose}
      />
      <aside className={`${panelClassName}${transitionSuffix}`} aria-label={panelLabel}>
        <div className={headClassNames}>
          <button
            type="button"
            className={closeButtonClassNames}
            aria-label={closeLabel}
            onClick={onClose}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <strong className="panel-page-title">{title}</strong>
          <span className="panel-head-spacer" aria-hidden="true" />
        </div>
        <div className={bodyClassName}>{children}</div>
      </aside>
    </>
  );
}
