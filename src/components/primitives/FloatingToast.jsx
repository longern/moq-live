import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOverlayPortalTarget } from "../../hooks/useOverlayPortalTarget.js";

const TOAST_EXIT_MS = 200;
const TOAST_VISIBLE_MS = 1800;
const ToastContext = createContext(null);

export function FloatingToast({ children, className = "", closing = false }) {
  return (
    <div className={`floating-toast${closing ? " is-closing" : ""}${className ? ` ${className}` : ""}`} role="status">
      {children}
    </div>
  );
}

function FloatingToastPresence({ children, className = "", exitMs = TOAST_EXIT_MS }) {
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

export function ToastProvider({ children }) {
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef(null);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const value = useMemo(() => ({
    showToast(message, options = {}) {
      const text = String(message || "");
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setToastMessage(text);
      if (!text) {
        return;
      }
      const durationMs = Number(options.durationMs) > 0 ? Number(options.durationMs) : TOAST_VISIBLE_MS;
      toastTimerRef.current = window.setTimeout(() => {
        setToastMessage("");
        toastTimerRef.current = null;
      }, durationMs);
    },
    clearToast() {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setToastMessage("");
    },
    toastMessage
  }), [toastMessage]);

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastViewport({ className = "", message = "", portal = true, portalTarget = null }) {
  const { toastMessage } = useToast();
  const overlayPortalTarget = useOverlayPortalTarget();
  const toast = (
    <FloatingToastPresence className={className}>
      {message || toastMessage}
    </FloatingToastPresence>
  );

  if (!portal) {
    return toast;
  }

  const target = portalTarget || overlayPortalTarget;
  return target ? createPortal(toast, target) : toast;
}
