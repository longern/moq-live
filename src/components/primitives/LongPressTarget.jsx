import { forwardRef, useEffect, useRef } from "react";

const DEFAULT_LONG_PRESS_DELAY = 500;
const DEFAULT_MOVE_TOLERANCE = 12;

export const LongPressTarget = forwardRef(function LongPressTarget({
  as: Component = "div",
  className = "",
  longPressDelay = DEFAULT_LONG_PRESS_DELAY,
  longPressEnabled = true,
  longPressIgnoreSelector = "",
  longPressMoveTolerance = DEFAULT_MOVE_TOLERANCE,
  onClick,
  onContextMenu,
  onLongPress,
  onTouchCancel,
  onTouchEnd,
  onTouchMove,
  onTouchStart,
  ...props
}, ref) {
  const timerRef = useRef(null);
  const touchRef = useRef(null);
  const handledRef = useRef(false);
  const rootClassName = ["long-press-target", className].filter(Boolean).join(" ");

  function clearLongPressTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    touchRef.current = null;
  }

  useEffect(() => clearLongPressTimer, []);

  function shouldIgnoreLongPress(event) {
    if (!longPressIgnoreSelector) {
      return false;
    }
    const target = event.target;
    return target instanceof Element && Boolean(target.closest(longPressIgnoreSelector));
  }

  function handleTouchStart(event) {
    onTouchStart?.(event);
    clearLongPressTimer();
    handledRef.current = false;

    const canTrackTouch = longPressEnabled
      && !shouldIgnoreLongPress(event)
      && event.touches.length === 1;

    if (!canTrackTouch) {
      return;
    }

    const touch = event.touches[0];
    touchRef.current = {
      clientX: touch.clientX,
      clientY: touch.clientY,
    };

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const handled = onLongPress?.(event) !== false;
      if (handled) {
        handledRef.current = true;
      }
    }, longPressDelay);
  }

  function handleTouchStartCapture(event) {
    if (event.touches.length !== 1) {
      clearLongPressTimer();
    }
  }

  function handleTouchMove(event) {
    onTouchMove?.(event);
    const origin = touchRef.current;
    if (!origin || event.touches.length !== 1) {
      clearLongPressTimer();
      return;
    }

    const touch = event.touches[0];
    const moved = Math.abs(touch.clientX - origin.clientX) > longPressMoveTolerance
      || Math.abs(touch.clientY - origin.clientY) > longPressMoveTolerance;
    if (moved) {
      clearLongPressTimer();
    }
  }

  function handleTouchMoveCapture(event) {
    if (event.touches.length !== 1) {
      clearLongPressTimer();
    }
  }

  function handleTouchEnd(event) {
    onTouchEnd?.(event);
    clearLongPressTimer();
    if (handledRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleTouchCancel(event) {
    onTouchCancel?.(event);
    clearLongPressTimer();
  }

  function handleClick(event) {
    if (handledRef.current) {
      handledRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  }

  function handleContextMenu(event) {
    if (shouldIgnoreLongPress(event)) {
      return;
    }
    onContextMenu?.(event);
  }

  return (
    <Component
      {...props}
      ref={ref}
      className={rootClassName}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onTouchStartCapture={handleTouchStartCapture}
      onTouchStart={handleTouchStart}
      onTouchMoveCapture={handleTouchMoveCapture}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    />
  );
});
