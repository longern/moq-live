import { useEffect, useState } from "react";

const MOBILE_PANEL_QUERY = "(max-width: 760px)";
const MOBILE_PANEL_EXIT_MS = 280;

export function useMobilePanelViewport() {
  const [matches, setMatches] = useState(() => (
    typeof window === "undefined" ? false : window.matchMedia(MOBILE_PANEL_QUERY).matches
  ));

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(MOBILE_PANEL_QUERY);
    const updateMatches = () => {
      setMatches(mediaQuery.matches);
    };

    updateMatches();
    mediaQuery.addEventListener("change", updateMatches);

    return () => {
      mediaQuery.removeEventListener("change", updateMatches);
    };
  }, []);

  return matches;
}

export function MobilePanelPresence({ open, children, exitMs = MOBILE_PANEL_EXIT_MS }) {
  const isMobilePanelViewport = useMobilePanelViewport();
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);

      if (!isMobilePanelViewport) {
        return undefined;
      }

      return undefined;
    }

    if (!isMobilePanelViewport) {
      setClosing(false);
      setMounted(false);
      return undefined;
    }

    setClosing(true);

    const timeout = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, exitMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [exitMs, isMobilePanelViewport, open]);

  if (!mounted) {
    return null;
  }

  return children({
    isMobilePanelViewport,
    transitionClassName: `mobile-panel-transition${closing ? " is-closing" : ""}`
  });
}
