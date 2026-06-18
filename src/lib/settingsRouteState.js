export const FOLLOWS_PANEL_TYPES = new Set(["following", "followers"]);
export const SETTINGS_ROUTE_PANEL_TYPES = new Set(["settings", "account", ...FOLLOWS_PANEL_TYPES]);

export function readRouteSettingsPanelType() {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("p") !== "s") {
    return null;
  }

  const panel = params.get("panel");
  return SETTINGS_ROUTE_PANEL_TYPES.has(panel) ? panel : null;
}

export function writeSettingsPanelRoute(type, { historyMode = "push" } = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const next = new URL(window.location.href);
  next.search = "";
  next.searchParams.set("p", "s");
  if (SETTINGS_ROUTE_PANEL_TYPES.has(type)) {
    next.searchParams.set("panel", type);
  }

  const nextHref = `${next.pathname}${next.search}${next.hash}`;
  const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextHref === currentHref) {
    return;
  }

  history[historyMode === "push" ? "pushState" : "replaceState"]({}, "", next);
}
