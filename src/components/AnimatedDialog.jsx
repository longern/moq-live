import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlayPortalTarget } from "../hooks/useOverlayPortalTarget.js";

const DEFAULT_EXIT_MS = 180;

export function AnimatedDialog({
  ariaLabel,
  backdropLabel,
  children,
  className = "",
  dialogClassName = "",
  exitMs = DEFAULT_EXIT_MS,
  onClose,
  open,
  portalTarget = null,
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const overlayPortalTarget = useOverlayPortalTarget();

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }

    if (!mounted) {
      return undefined;
    }

    setClosing(true);
    const timeoutId = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, exitMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [exitMs, mounted, open]);

  if (!mounted) {
    return null;
  }

  const layerClassName = [
    "animated-dialog-layer",
    closing ? "is-closing" : "",
    className,
  ].filter(Boolean).join(" ");
  const panelClassName = [
    "animated-dialog",
    dialogClassName,
  ].filter(Boolean).join(" ");

  const dialog = (
    <div className={layerClassName}>
      <button
        type="button"
        className="animated-dialog-backdrop"
        aria-label={backdropLabel || ariaLabel}
        onClick={onClose}
      />
      <section
        className={panelClassName}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {children}
      </section>
    </div>
  );

  return createPortal(dialog, portalTarget || overlayPortalTarget || document.body);
}
