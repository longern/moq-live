import { COHOST_INVITE_TTL_MS, STREAM_PROTOCOL_MOQ, STREAM_PROTOCOL_WEBRTC } from "./constants.js";
import {
  sanitizeDisplayName,
  sanitizeHandle,
  sanitizeInviteId,
  sanitizeIsoTimestamp,
  sanitizeNamespace,
  sanitizeStreamProtocol,
  sanitizeUrl,
} from "./sanitize.js";

export function getDefaultCohostState() {
  return {
    invitesAllowed: true,
    active: null,
  };
}

export function normalizeCohostState(cohost) {
  return {
    invitesAllowed: cohost?.invitesAllowed === false ? false : true,
    active: normalizeCohostActive(cohost?.active),
  };
}

export function normalizeCohostUser(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const handle = sanitizeHandle(value.handle);
  if (!handle) {
    return null;
  }

  return {
    id: String(value.id ?? "")
      .trim()
      .slice(0, 128),
    handle,
    displayName: sanitizeDisplayName(value.displayName),
    avatarUrl: sanitizeUrl(value.avatarUrl),
  };
}

export function normalizeCohostStream(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const protocol = sanitizeStreamProtocol(value.protocol);
  const relayUrl = sanitizeUrl(value.relayUrl);
  const namespace = sanitizeNamespace(value.namespace);
  const webRtcUrl = sanitizeUrl(value.webRtcUrl);
  const moqReady = protocol === STREAM_PROTOCOL_MOQ && relayUrl && namespace;
  const webRtcReady = protocol === STREAM_PROTOCOL_WEBRTC && webRtcUrl;
  if (!moqReady && !webRtcReady) {
    return null;
  }

  return {
    relayUrl,
    namespace,
    protocol,
    webRtcUrl,
  };
}

export function normalizeCohostInvite(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = sanitizeInviteId(value.id);
  const requesterRoomId = sanitizeNamespace(value.requesterRoomId);
  const targetRoomId = sanitizeNamespace(value.targetRoomId);
  const requester = normalizeCohostUser(value.requester);
  const requestedAt =
    sanitizeIsoTimestamp(value.requestedAt) ?? new Date().toISOString();
  if (!id || !requesterRoomId || !targetRoomId || !requester) {
    return null;
  }

  if (Date.now() - Date.parse(requestedAt) > COHOST_INVITE_TTL_MS) {
    return null;
  }

  return {
    id,
    requesterRoomId,
    targetRoomId,
    requestedAt,
    requester,
  };
}

export function normalizeCohostInviteResponse(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = sanitizeInviteId(value.id);
  const target = normalizeCohostUser(value.target);
  if (!id || !target) {
    return null;
  }

  return {
    id,
    accepted: Boolean(value.accepted),
    respondedAt:
      sanitizeIsoTimestamp(value.respondedAt) ?? new Date().toISOString(),
    target,
  };
}

export function normalizeCohostActive(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const peerRoomId = sanitizeNamespace(value.peerRoomId);
  const peer = normalizeCohostUser(value.peer);
  const stream = normalizeCohostStream(value.stream);
  if (!peerRoomId || !peer || !stream) {
    return null;
  }

  return {
    id: sanitizeInviteId(value.id) || `cohost-${Date.now().toString(36)}`,
    peerRoomId,
    acceptedAt:
      sanitizeIsoTimestamp(value.acceptedAt) ?? new Date().toISOString(),
    peer,
    stream,
  };
}
