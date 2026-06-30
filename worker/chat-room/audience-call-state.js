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
    invites: [],
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
    invites: enabled
      ? pruneAudienceCallInvites(audienceCall?.invites, Date.now())
      : [],
    active: enabled ? normalizeAudienceCallActiveList(audienceCall?.active) : [],
  };
}

export function getPublicAudienceCallState(audienceCall, includeRequests = false, speakingUserIds = []) {
  const state = normalizeAudienceCallState(audienceCall);
  return {
    enabled: state.enabled,
    requests: includeRequests ? state.requests : [],
    invites: includeRequests ? state.invites : [],
    active: state.active.map(getPublicAudienceCallActive),
    speakingUserIds: normalizeAudienceCallSpeakingUserIds(speakingUserIds, state.active),
  };
}

export function normalizeAudienceCallSpeakingUserIds(speakingUserIds, active = []) {
  if (!Array.isArray(speakingUserIds)) {
    return [];
  }

  const activeUserIds = new Set(
    normalizeAudienceCallActiveList(active)
      .map((item) => item.user.id)
      .filter(Boolean),
  );
  const normalized = [];
  for (const userId of speakingUserIds) {
    const normalizedUserId = String(userId || "").trim().slice(0, 128);
    if (
      normalizedUserId &&
      activeUserIds.has(normalizedUserId) &&
      !normalized.includes(normalizedUserId)
    ) {
      normalized.push(normalizedUserId);
    }
  }
  return normalized.slice(0, MAX_AUDIENCE_CALL_ACTIVE);
}

function getPublicAudienceCallActive(active) {
  return {
    id: active.id,
    readyAt: active.readyAt,
    sessionId: active.sessionId,
    trackName: active.trackName,
    user: active.user,
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
    trackPullToken: String(value.trackPullToken || "").trim(),
    trackName: String(value.trackName || "").trim(),
    user: {
      id: userId,
      handle: sanitizeHandle(value.user?.handle),
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

export function pruneAudienceCallInvites(invites, now = Date.now()) {
  if (!Array.isArray(invites)) {
    return [];
  }

  return invites
    .map(normalizeAudienceCallInvite)
    .filter((invite) => {
      if (!invite) {
        return false;
      }
      const requestedAt = Date.parse(invite.requestedAt);
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
      handle: sanitizeHandle(value.user?.handle),
      displayName: sanitizeDisplayName(value.user?.displayName) || "已登录用户",
      avatarUrl: sanitizeUrl(value.user?.avatarUrl),
    },
  };
}

export function normalizeAudienceCallInvite(value) {
  const request = normalizeAudienceCallRequest(value);
  if (!request) {
    return null;
  }

  return {
    ...request,
    realtime: normalizeAudienceCallHostRealtime(value.realtime),
  };
}

function normalizeAudienceCallHostRealtime(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    hostSessionId: String(value.hostSessionId || "").trim(),
    hostTrackPullToken: String(value.hostTrackPullToken || "").trim(),
    hostTrackName: String(value.hostTrackName || "").trim(),
    expiresAt: Number(value.expiresAt || 0) || 0,
  };
}
