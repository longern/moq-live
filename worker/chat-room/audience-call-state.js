import {
  AUDIENCE_CALL_REQUEST_TTL_MS,
  MAX_AUDIENCE_CALL_ACTIVE,
  MAX_AUDIENCE_CALL_REQUESTS,
} from "./constants.js";
import {
  sanitizeDisplayName,
  sanitizeInviteId,
  sanitizeIsoTimestamp,
  sanitizeUrl,
} from "./sanitize.js";

export function getDefaultAudienceCallState() {
  return {
    enabled: false,
    requests: [],
    active: [],
  };
}

export function normalizeAudienceCallState(audienceCall) {
  const enabled = audienceCall?.enabled === true;
  return {
    enabled,
    requests: enabled
      ? pruneAudienceCallRequests(audienceCall?.requests, Date.now())
      : [],
    active: enabled ? normalizeAudienceCallActiveList(audienceCall?.active) : [],
  };
}

export function getPublicAudienceCallState(audienceCall, includeRequests = false) {
  const state = normalizeAudienceCallState(audienceCall);
  return {
    enabled: state.enabled,
    requests: includeRequests ? state.requests : [],
    active: includeRequests ? state.active : [],
  };
}

export function normalizeAudienceCallActiveList(active) {
  if (!Array.isArray(active)) {
    return [];
  }

  return active
    .map(normalizeAudienceCallActive)
    .filter(Boolean)
    .slice(0, MAX_AUDIENCE_CALL_ACTIVE);
}

export function normalizeAudienceCallActive(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = sanitizeInviteId(value.id);
  const userId = String(value.user?.id ?? "").trim().slice(0, 128);
  const sessionId = String(value.sessionId || "").trim();
  if (!id || !userId || !sessionId) {
    return null;
  }

  return {
    id,
    readyAt: sanitizeIsoTimestamp(value.readyAt) ?? new Date().toISOString(),
    sessionId,
    trackName: String(value.trackName || "").trim(),
    user: {
      id: userId,
      displayName: sanitizeDisplayName(value.user?.displayName) || "已登录用户",
      avatarUrl: sanitizeUrl(value.user?.avatarUrl),
    },
  };
}

export function pruneAudienceCallRequests(requests, now = Date.now()) {
  if (!Array.isArray(requests)) {
    return [];
  }

  return requests
    .map(normalizeAudienceCallRequest)
    .filter((request) => {
      if (!request) {
        return false;
      }
      const requestedAt = Date.parse(request.requestedAt);
      return Number.isFinite(requestedAt) && now - requestedAt <= AUDIENCE_CALL_REQUEST_TTL_MS;
    })
    .sort((left, right) => Date.parse(right.requestedAt) - Date.parse(left.requestedAt))
    .slice(0, MAX_AUDIENCE_CALL_REQUESTS);
}

export function normalizeAudienceCallRequest(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = sanitizeInviteId(value.id);
  const userId = String(value.user?.id ?? "").trim().slice(0, 128);
  if (!id || !userId) {
    return null;
  }

  return {
    id,
    requestedAt:
      sanitizeIsoTimestamp(value.requestedAt) ?? new Date().toISOString(),
    user: {
      id: userId,
      displayName: sanitizeDisplayName(value.user?.displayName) || "已登录用户",
      avatarUrl: sanitizeUrl(value.user?.avatarUrl),
    },
  };
}
