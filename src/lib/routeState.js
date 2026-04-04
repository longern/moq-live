const DEFAULT_RELAY_URL = "https://draft-14.cloudflare.mediaoverquic.com/";

export function generateRoomId() {
  return `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function getInitialViewState() {
  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get("p");
  let room = params.get("r") ?? "";
  let page = requestedPage === "l" || requestedPage === "s" ? requestedPage : "w";

  if (!requestedPage && room) {
    page = "w";
  }

  if (page === "l" && !room) {
    room = generateRoomId();
  }

  return {
    page: page === "l" ? "live" : page === "s" ? "settings" : "watch",
    room,
    relayUrl: DEFAULT_RELAY_URL,
    autorun: Boolean(room)
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

export function writeRoute({ page, room, relayUrl, autorun }) {
  const next = new URL(window.location.href);
  next.search = "";

  if (page === "watch") {
    if (room) {
      next.searchParams.set("r", room);
    }
  } else if (page === "live") {
    next.searchParams.set("p", "l");
    if (room) {
      next.searchParams.set("r", room);
    }
  } else if (page === "settings") {
    next.searchParams.set("p", "s");
  }

  history.replaceState({}, "", next);
}

export { DEFAULT_RELAY_URL };
