const DEFAULT_RELAY_URL = "https://draft-14.cloudflare.mediaoverquic.com/";

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

export function getInitialViewState() {
  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get("p");
  const routeRoom = params.get("r") ?? "";
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
    relayUrl: DEFAULT_RELAY_URL,
    autorun: page === "w" && Boolean(watchRoom),
  };
}

export function buildWatchLink(relayUrl, room) {
  if (!room) {
    return "";
  }

  return `${window.location.origin}${window.location.pathname}?r=${encodeURIComponent(room)}`;
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
      next.searchParams.set("r", watchRoom);
    }
  } else if (page === "live") {
    next.searchParams.set("p", "l");
  } else if (page === "settings") {
    next.searchParams.set("p", "s");
  }

  const nextHref = `${next.pathname}${next.search}${next.hash}`;
  const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextHref === currentHref) {
    return;
  }

  history[historyMode === "push" ? "pushState" : "replaceState"]({}, "", next);
}

export { DEFAULT_RELAY_URL };
