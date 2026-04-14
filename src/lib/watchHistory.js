const WATCH_HISTORY_STORAGE_KEY = "moq-live.watch-history";
const MAX_WATCH_HISTORY_ITEMS = 20;

function normalizeItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const room = typeof item.room === "string" ? item.room.trim() : "";
  if (!room) {
    return null;
  }

  return {
    room,
    relayUrl: typeof item.relayUrl === "string" ? item.relayUrl : "",
    relayHost: typeof item.relayHost === "string" ? item.relayHost : "",
    watchedAt: typeof item.watchedAt === "string" ? item.watchedAt : new Date().toISOString()
  };
}

export function readWatchHistory() {
  try {
    const raw = window.localStorage.getItem(WATCH_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeItem).filter(Boolean).slice(0, MAX_WATCH_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

export function persistWatchHistoryEntry(entry) {
  const normalized = normalizeItem({
    ...entry,
    watchedAt: entry?.watchedAt || new Date().toISOString()
  });
  if (!normalized) {
    return readWatchHistory();
  }

  const nextItems = [
    normalized,
    ...readWatchHistory().filter((item) => item.room !== normalized.room)
  ].slice(0, MAX_WATCH_HISTORY_ITEMS);

  try {
    window.localStorage.setItem(WATCH_HISTORY_STORAGE_KEY, JSON.stringify(nextItems));
  } catch {
    return nextItems;
  }

  return nextItems;
}

export function clearWatchHistory() {
  try {
    window.localStorage.removeItem(WATCH_HISTORY_STORAGE_KEY);
  } catch {
    return [];
  }

  return [];
}
