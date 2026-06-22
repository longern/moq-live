const DEFAULT_RELAY_URL = "https://draft-14.cloudflare.mediaoverquic.com/";
const RELAY_URL_STORAGE_KEY = "moq-live.relay-url";
const HANDLE_PATH_PATTERN = /^(?!\d+$)[a-z0-9](?:[a-z0-9_]{4,22}[a-z0-9])?$/;

function readStoredRelayUrl() {
  try {
    const storedRelayUrl = window.localStorage.getItem(RELAY_URL_STORAGE_KEY);
    return storedRelayUrl === null ? DEFAULT_RELAY_URL : storedRelayUrl;
  } catch {
    return DEFAULT_RELAY_URL;
  }
}

export function writeStoredRelayUrl(relayUrl) {
  try {
    window.localStorage.setItem(RELAY_URL_STORAGE_KEY, relayUrl);
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

export function generateRoomId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (value) =>
    value.toString(36).padStart(2, "0"),
  )
    .join("")
    .slice(0, 10);
  return `puptv-${suffix}`;
}

function getRouteHandleFromPathname(pathname = window.location.pathname) {
  const normalizedPath = String(pathname || "").replace(/\/+$/, "");
  const match = /^\/([^/]+)$/.exec(normalizedPath);
  if (!match) {
    return "";
  }

  let handle = "";
  try {
    handle = decodeURIComponent(match[1] || "").trim().toLowerCase();
  } catch {
    return "";
  }
  return HANDLE_PATH_PATTERN.test(handle) ? handle : "";
}

export function getInitialViewState() {
  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get("p");
  const routeRoom = getInitialWatchRouteRoom();
  let page =
    requestedPage === "l" || requestedPage === "s" ? requestedPage : "w";
  let watchRoom = "";
  let liveRoom = "";

  if (!requestedPage && routeRoom) {
    page = "w";
  }

  if (page === "w") {
    watchRoom = routeRoom;
  } else if (page === "l") {
    liveRoom = generateRoomId();
  }

  return {
    page: page === "l" ? "live" : page === "s" ? "settings" : "watch",
    watchRoom,
    liveRoom,
    relayUrl: readStoredRelayUrl(),
    autorun: page === "w" && Boolean(watchRoom),
  };
}

export function getInitialWatchRouteRoom() {
  const params = new URLSearchParams(window.location.search);
  return params.get("r") ?? getRouteHandleFromPathname();
}

export function buildWatchLink(relayUrl, room) {
  if (!room) {
    return "";
  }

  const normalizedRoom = String(room).trim();
  if (HANDLE_PATH_PATTERN.test(normalizedRoom)) {
    return `${window.location.origin}/${encodeURIComponent(normalizedRoom)}`;
  }

  return `${window.location.origin}/?r=${encodeURIComponent(normalizedRoom)}`;
}

export function getRelayHostValue(relayUrl) {
  if (!relayUrl) {
    return "未配置 relay";
  }

  try {
    return new URL(relayUrl).host;
  } catch {
    return relayUrl;
  }
}

export function writeRoute(
  { page, watchRoom, liveRoom },
  { historyMode = "replace" } = {},
) {
  const next = new URL(window.location.href);
  next.search = "";

  if (page === "watch") {
    if (watchRoom) {
      const normalizedWatchRoom = String(watchRoom).trim();
      if (HANDLE_PATH_PATTERN.test(normalizedWatchRoom)) {
        next.pathname = `/${encodeURIComponent(normalizedWatchRoom)}`;
      } else {
        next.pathname = "/";
        next.searchParams.set("r", normalizedWatchRoom);
      }
    } else {
      next.pathname = "/";
    }
  } else if (page === "live") {
    next.pathname = "/";
    next.searchParams.set("p", "l");
  } else if (page === "settings") {
    next.pathname = "/";
    next.searchParams.set("p", "s");
  }

  const nextHref = `${next.pathname}${next.search}${next.hash}`;
  const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextHref === currentHref) {
    return;
  }

  history[historyMode === "push" ? "pushState" : "replaceState"]({}, "", next);
}
