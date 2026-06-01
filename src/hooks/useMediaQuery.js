import { useEffect, useState } from "react";

function getMediaQueryMatch(query) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(query).matches;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => getMediaQueryMatch(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const media = window.matchMedia(query);
    const sync = () => {
      setMatches(media.matches);
    };

    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, [query]);

  return matches;
}

export function useCompactViewport() {
  return useMediaQuery("(max-width: 760px)");
}

export function useTouchPortraitViewport() {
  return useMediaQuery("(orientation: portrait) and (hover: none) and (pointer: coarse)");
}
