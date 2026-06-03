import { useEffect, useRef, useState } from "react";

const DRAWER_EXIT_MS = 220;

export function SwipeableDrawer({
  open,
  onClose,
  ariaLabel = "关闭面板",
  className = "",
  panelClassName = "",
  children,
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const closeTimerRef = useRef(null);
  const openFrameRef = useRef(null);
  const dragStateRef = useRef({
    active: false,
    startY: 0,
    offset: 0,
  });

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
      setDragOffset(0);
      setMounted(true);
      setVisible(false);
      return undefined;
    }

    if (!mounted) {
      setVisible(false);
      setDragOffset(0);
      return undefined;
    }

    dragStateRef.current = {
      active: false,
      startY: 0,
      offset: 0,
    };
    setVisible(false);
    setDragOffset(0);
    setDragging(false);
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
    }, DRAWER_EXIT_MS);

    return undefined;
  }, [open]);

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

  function handleTouchStart(event) {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    dragStateRef.current = {
      active: true,
      startY: touch.clientY,
      offset: 0,
    };
    setDragOffset(0);
    setDragging(true);
  }

  function handleTouchMove(event) {
    if (!dragStateRef.current.active) {
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    const nextOffset = Math.max(0, touch.clientY - dragStateRef.current.startY);
    dragStateRef.current.offset = nextOffset;
    setDragOffset(nextOffset);
  }

  function handleTouchEnd() {
    const offset = dragStateRef.current.offset;
    dragStateRef.current = {
      active: false,
      startY: 0,
      offset: 0,
    };
    setDragging(false);

    if (offset > 96) {
      onClose?.();
      return;
    }

    setDragOffset(0);
  }

  if (!mounted) {
    return null;
  }

  const drawerClassName = [
    "swipeable-drawer",
    visible ? "is-open" : "",
    dragging ? "is-dragging" : "",
    className,
  ].filter(Boolean).join(" ");
  const drawerPanelClassName = [
    "swipeable-drawer-panel",
    panelClassName,
  ].filter(Boolean).join(" ");

  return (
    <>
      <button
        type="button"
        className={`swipeable-drawer-backdrop${visible ? " is-open" : ""}`}
        aria-label={ariaLabel}
        onClick={onClose}
      />
      <div
        className={drawerClassName}
        style={dragOffset ? { transform: `translateY(${dragOffset}px)` } : undefined}
      >
        <div
          className="swipeable-drawer-handle"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
        >
          <span className="swipeable-drawer-indicator" />
        </div>
        <div className={drawerPanelClassName}>{children}</div>
      </div>
    </>
  );
}
