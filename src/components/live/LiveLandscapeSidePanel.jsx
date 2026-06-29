import { Fragment, useEffect, useRef, useState } from "react";

const SIDE_PANEL_EXIT_MS = 220;

export function LiveLandscapeSidePanel({
  ariaLabel,
  children,
  open,
  panelClassName = "",
  panelKey = "",
  onClose,
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const closeTimerRef = useRef(null);
  const openFrameRef = useRef(null);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (openFrameRef.current) {
        cancelAnimationFrame(openFrameRef.current);
        openFrameRef.current = null;
      }
      setMounted(true);
      setVisible(false);
      return undefined;
    }

    if (!mounted) {
      setVisible(false);
      return undefined;
    }

    setVisible(false);
    if (openFrameRef.current) {
      cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setMounted(false);
      closeTimerRef.current = null;
    }, SIDE_PANEL_EXIT_MS);

    return undefined;
  }, [mounted, open]);

  useEffect(() => {
    if (!open || !mounted) {
      return undefined;
    }

    openFrameRef.current = requestAnimationFrame(() => {
      openFrameRef.current = requestAnimationFrame(() => {
        setVisible(true);
        openFrameRef.current = null;
      });
    });

    return () => {
      if (openFrameRef.current) {
        cancelAnimationFrame(openFrameRef.current);
        openFrameRef.current = null;
      }
    };
  }, [mounted, open]);

  useEffect(() => () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    if (openFrameRef.current) {
      cancelAnimationFrame(openFrameRef.current);
    }
  }, []);

  useEffect(() => {
    if (!open || !mounted) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, onClose, open]);

  if (!mounted) {
    return null;
  }

  return (
    <aside
      className={`live-landscape-side-panel${visible ? " is-open" : ""}`}
      aria-label={ariaLabel}
    >
      <div
        className={[
          "swipeable-drawer-panel",
          "live-landscape-side-panel-surface",
          panelClassName,
        ].filter(Boolean).join(" ")}
      >
        <div className="swipeable-drawer-panel-content">
          <Fragment key={panelKey}>{children}</Fragment>
        </div>
      </div>
    </aside>
  );
}
