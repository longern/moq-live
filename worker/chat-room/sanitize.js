import {
  MAX_CHAT_MUTE_DURATION_MS,
  MAX_ROOM_TITLE_LENGTH,
  STREAM_PROTOCOL_MOQ,
  STREAM_PROTOCOL_WEBRTC,
} from "./constants.js";

export function sanitizeRequestId(value) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

export function sanitizeInviteId(value) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 96);
}

export function sanitizeHandle(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

export function sanitizeDisplayName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 48);
}

export function sanitizePublicUser(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = String(value.id || "").trim();
  if (!id) {
    return null;
  }

  const email = String(value.email || "").trim().toLowerCase();
  const displayName = sanitizeDisplayName(value.displayName);

  return {
    id,
    handle: sanitizeHandle(value.handle),
    displayName: email && displayName.toLowerCase() === email ? "" : displayName,
    avatarUrl: sanitizeUrl(value.avatarUrl),
  };
}

export function parseUserHeader(headerValue) {
  if (!headerValue) {
    return null;
  }

  try {
    return sanitizePublicUser(JSON.parse(decodeURIComponent(headerValue)));
  } catch {
    return null;
  }
}

export function sanitizeMessage(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeRoomTitle(value) {
  const title = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  return title.slice(0, MAX_ROOM_TITLE_LENGTH);
}

export function sanitizeIsoTimestamp(value) {
  if (typeof value !== "string") {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

export function sanitizeUrl(value) {
  const nextValue = String(value ?? "").trim();
  if (!nextValue) {
    return "";
  }

  if (nextValue.startsWith("data:image/")) {
    return nextValue;
  }

  try {
    const url = new URL(nextValue);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

export function sanitizeNamespace(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 128);
}

export function sanitizeStreamProtocol(value) {
  return value === STREAM_PROTOCOL_MOQ
    ? STREAM_PROTOCOL_MOQ
    : STREAM_PROTOCOL_WEBRTC;
}

export function sanitizeCoordinate(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    return null;
  }
  return Math.round(number * 1_000_000) / 1_000_000;
}

export function sanitizeAccuracy(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }
  return Math.round(number);
}

export function sanitizeLocationProvince(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export function sanitizeMuteDisplayName(value) {
  return (
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "用户"
  );
}

export function sanitizeMuteDurationMs(value) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs)) {
    return null;
  }
  const normalized = Math.round(durationMs);
  if (normalized < 60_000 || normalized > MAX_CHAT_MUTE_DURATION_MS) {
    return null;
  }
  return normalized;
}
