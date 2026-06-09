import { useEffect, useState } from "react";

const TOAST_EXIT_MS = 200;

export function FloatingToast({ children, className = "", closing = false }) {
  return (
    <div className={`floating-toast${closing ? " is-closing" : ""}${className ? ` ${className}` : ""}`} role="status">
      {children}
    </div>
  );
}

export function FloatingToastPresence({ children, className = "", exitMs = TOAST_EXIT_MS }) {
  const [mounted, setMounted] = useState(Boolean(children));
  const [closing, setClosing] = useState(false);
  const [renderedChildren, setRenderedChildren] = useState(children);

  useEffect(() => {
    if (children) {
      setRenderedChildren(children);
      setMounted(true);
      setClosing(false);
      return undefined;
    }

    if (!mounted) {
      return undefined;
    }

    setClosing(true);
    const timeout = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
      setRenderedChildren(null);
    }, exitMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [children, exitMs, mounted]);

  if (!mounted) {
    return null;
  }

  return (
    <FloatingToast className={className} closing={closing}>
      {renderedChildren}
    </FloatingToast>
  );
}
