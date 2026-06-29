import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlayPortalTarget } from "../../hooks/useOverlayPortalTarget.js";

const DEFAULT_MARGIN = 12;
const DEFAULT_GAP = 10;
const EXIT_ANIMATION_MS = 180;

function getPopoverPosition({
  align,
  anchorRect,
  gap,
  margin,
  panelRect,
  placement,
}) {
  const panelWidth = panelRect?.width || 240;
  const panelHeight = panelRect?.height || 120;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const preferredPlacement =
    placement === "top" || placement === "bottom" ? placement : "bottom";
  const bottomTop = anchorRect.bottom + gap;
  const topTop = anchorRect.top - panelHeight - gap;
  const bottomFits = bottomTop + panelHeight <= viewportHeight - margin;
  const topFits = topTop >= margin;
  const actualPlacement =
    placement === "auto"
      ? (bottomFits || !topFits ? "bottom" : "top")
      : preferredPlacement;

  let left = align === "start"
    ? anchorRect.left
    : anchorRect.right - panelWidth;
  if (align === "center") {
    left = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
  }

  const top = actualPlacement === "top" ? topTop : bottomTop;
  return {
    left: Math.max(margin, Math.min(left, viewportWidth - panelWidth - margin)),
    placement: actualPlacement,
    top: Math.max(margin, Math.min(top, viewportHeight - panelHeight - margin)),
  };
}

export function AnchoredPopover({
  align = "end",
  anchorRef,
  ariaLabel,
  backdrop = false,
  backdropAriaLabel,
  children,
  className = "",
  gap = DEFAULT_GAP,
  margin = DEFAULT_MARGIN,
  onBlur,
  onClose,
  onFocus,
  onMouseEnter,
  onMouseLeave,
  open = false,
  panelClassName = "",
  placement = "auto",
  role,
}) {
  const overlayPortalTarget = useOverlayPortalTarget();
  const panelRef = useRef(null);
  const frameRef = useRef(null);
  const exitTimerRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, placement: "bottom", top: 0 });
  const [positioned, setPositioned] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  function updatePosition() {
    const anchor = anchorRef?.current;
    const panel = panelRef.current;
    if (!anchor || !panel) {
      return;
    }
    setPosition(getPopoverPosition({
      align,
      anchorRect: anchor.getBoundingClientRect(),
      gap,
      margin,
      panelRect: panel.getBoundingClientRect(),
      placement,
    }));
    setPositioned(true);
  }

  useLayoutEffect(() => {
    if (!open) {
      setVisible(false);
      return undefined;
    }
    if (!mounted) {
      setMounted(true);
      return undefined;
    }
    updatePosition();
    frameRef.current = requestAnimationFrame(() => {
      updatePosition();
      setVisible(true);
      frameRef.current = null;
    });
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [open, mounted, align, gap, margin, placement]);

  useEffect(() => {
    if (open) {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setMounted(true);
      return undefined;
    }

    setVisible(false);
    if (!mounted) {
      setPositioned(false);
      return undefined;
    }

    exitTimerRef.current = window.setTimeout(() => {
      setMounted(false);
      setPositioned(false);
      exitTimerRef.current = null;
    }, EXIT_ANIMATION_MS);

    return () => {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
      }
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (panelRef.current?.contains(target) || anchorRef?.current?.contains(target)) {
        return;
      }
      onClose?.();
    }

    document.addEventListener("keydown", handleKeyDown);
    if (!backdrop) {
      document.addEventListener("pointerdown", handlePointerDown, true);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (!backdrop) {
        document.removeEventListener("pointerdown", handlePointerDown, true);
      }
    };
  }, [open, anchorRef, backdrop, onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    function handleViewportChange() {
      updatePosition();
    }
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, align, gap, margin, placement]);

  if (!mounted) {
    return null;
  }

  const popover = (
    <>
      {backdrop ? (
        <button
          type="button"
          className="anchored-popover-backdrop"
          aria-label={backdropAriaLabel || ariaLabel}
          onClick={onClose}
        />
      ) : null}
      <div
        ref={panelRef}
        className={[
          "anchored-popover-panel",
          `is-${position.placement}`,
          positioned ? "" : "is-measuring",
          visible ? "is-open" : "",
          className,
          panelClassName,
        ].filter(Boolean).join(" ")}
        role={role}
        aria-label={ariaLabel}
        style={{
          left: `${position.left}px`,
          top: `${position.top}px`,
        }}
        onBlur={onBlur}
        onFocus={onFocus}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {children}
      </div>
    </>
  );

  if (typeof document === "undefined") {
    return popover;
  }

  return createPortal(popover, overlayPortalTarget || document.body);
}

export function PopoverMenu({ ariaLabel, children, className = "" }) {
  return (
    <ul
      className={["popover-menu", className].filter(Boolean).join(" ")}
      role="menu"
      aria-label={ariaLabel}
    >
      {children}
    </ul>
  );
}

export function PopoverMenuItem({
  children,
  className = "",
  disabled = false,
  href,
  onClick,
  title,
}) {
  const Component = href ? "a" : "button";
  function handleClick(event) {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <li>
      <Component
        type={href ? undefined : "button"}
        className={["popover-menu-item", className].filter(Boolean).join(" ")}
        role="menuitem"
        href={href}
        onClick={handleClick}
        title={title}
        disabled={href ? undefined : disabled}
        aria-disabled={href && disabled ? "true" : undefined}
      >
        {children}
      </Component>
    </li>
  );
}
