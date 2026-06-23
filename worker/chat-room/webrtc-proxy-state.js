import { WEBRTC_PROXY_SESSION_STORAGE_PREFIX } from "./constants.js";
import { sanitizeUrl } from "./sanitize.js";

export function normalizeWebRtcProxySession(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = String(value.id || "").trim();
  const kind = String(value.kind || "").trim().toLowerCase();
  const targetUrl = sanitizeUrl(value.targetUrl);
  const expiresAt = Number(value.expiresAt || 0);
  if (
    !isValidWebRtcProxySessionId(id) ||
    !["whip", "whep"].includes(kind) ||
    !targetUrl ||
    !Number.isFinite(expiresAt)
  ) {
    return null;
  }

  return {
    id,
    kind,
    targetUrl,
    expiresAt,
  };
}

export function getPublicWebRtcProxySession(session) {
  return {
    id: session.id,
    kind: session.kind,
    targetUrl: session.targetUrl,
    expiresAt: session.expiresAt,
  };
}

export function getWebRtcProxySessionStorageKey(sessionId) {
  return `${WEBRTC_PROXY_SESSION_STORAGE_PREFIX}${sessionId}`;
}

export function isValidWebRtcProxySessionId(value) {
  return /^[a-z0-9_-]{3,160}$/i.test(String(value || ""));
}
