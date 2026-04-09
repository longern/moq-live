const DEFAULT_RELAY_URL = "https://draft-14.cloudflare.mediaoverquic.com/";

export function generateRoomId() {
  return `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function getInitialViewState() {
  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get("p");
  const routeRoom = params.get("r") ?? "";
  let page = requestedPage === "l" || requestedPage === "s" ? requestedPage : "w";
  let watchRoom = "";
  let liveRoom = "";

  if (!requestedPage && routeRoom) {
    page = "w";
  }

  if (page === "w") {
    watchRoom = routeRoom;
  } else if (page === "l") {
    liveRoom = routeRoom || generateRoomId();
  }

  return {
    page: page === "l" ? "live" : page === "s" ? "settings" : "watch",
    watchRoom,
    liveRoom,
    relayUrl: DEFAULT_RELAY_URL,
    autorun: page === "w" && Boolean(watchRoom)
  };
}

export function buildWatchLink(relayUrl, room) {
  if (!room) {
    return "等待生成观看链接";
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

export function writeRoute({ page, watchRoom, liveRoom }) {
  const next = new URL(window.location.href);
  next.search = "";

  if (page === "watch") {
    if (watchRoom) {
      next.searchParams.set("r", watchRoom);
    }
  } else if (page === "live") {
    next.searchParams.set("p", "l");
    if (liveRoom) {
      next.searchParams.set("r", liveRoom);
    }
  } else if (page === "settings") {
    next.searchParams.set("p", "s");
  }

  history.replaceState({}, "", next);
}

export { DEFAULT_RELAY_URL };
