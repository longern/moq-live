import {
  sanitizeIsoTimestamp,
  sanitizeMuteDisplayName,
} from "./sanitize.js";

export function getDefaultModerationState() {
  return {
    mutedUsers: [],
  };
}

export function normalizeModerationState(
  moderation,
  now = Date.now(),
  streamLive = false,
) {
  const mutedUsers = Array.isArray(moderation?.mutedUsers)
    ? moderation.mutedUsers
        .map((entry) => normalizeChatMute(entry))
        .filter((entry) => entry && isChatMuteActive(entry, now, streamLive))
    : [];

  return {
    mutedUsers,
  };
}

export function normalizeChatMute(entry) {
  const userId = String(entry?.userId || "").trim();
  if (!userId) {
    return null;
  }

  const untilStreamEnds = entry?.untilStreamEnds === true;
  const expiresAt = untilStreamEnds
    ? null
    : sanitizeIsoTimestamp(entry?.expiresAt);
  if (!untilStreamEnds && !expiresAt) {
    return null;
  }

  return {
    userId,
    displayName: sanitizeMuteDisplayName(entry?.displayName),
    mutedAt: sanitizeIsoTimestamp(entry?.mutedAt) || new Date().toISOString(),
    expiresAt,
    untilStreamEnds,
  };
}

export function getActiveChatMute(
  moderation,
  userId,
  now = Date.now(),
  streamLive = false,
) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return null;
  }
  const state = normalizeModerationState(moderation, now, streamLive);
  return (
    state.mutedUsers.find((entry) => entry.userId === normalizedUserId) || null
  );
}

export function isChatMuteActive(mute, now = Date.now(), streamLive = false) {
  if (!mute) {
    return false;
  }
  if (mute.untilStreamEnds) {
    return streamLive;
  }
  const expiresAt = Date.parse(mute.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function getPublicChatMute(mute) {
  if (!mute) {
    return null;
  }
  return {
    userId: mute.userId,
    displayName: mute.displayName,
    expiresAt: mute.expiresAt,
    untilStreamEnds: mute.untilStreamEnds,
  };
}

export function getPublicModerationState(
  moderation,
  now = Date.now(),
  streamLive = false,
  canView = false,
) {
  if (!canView) {
    return {
      mutedUsers: [],
    };
  }
  const state = normalizeModerationState(moderation, now, streamLive);
  return {
    mutedUsers: state.mutedUsers
      .map((entry) => getPublicChatMute(entry))
      .filter(Boolean)
      .sort((left, right) => {
        const leftTime = left.untilStreamEnds
          ? Number.MAX_SAFE_INTEGER
          : Date.parse(left.expiresAt);
        const rightTime = right.untilStreamEnds
          ? Number.MAX_SAFE_INTEGER
          : Date.parse(right.expiresAt);
        return (
          leftTime - rightTime ||
          left.displayName.localeCompare(right.displayName, "zh-Hans-CN")
        );
      }),
  };
}

export function clearStreamScopedMutes(moderation) {
  const state = normalizeModerationState(moderation, Date.now(), true);
  return {
    mutedUsers: state.mutedUsers.filter((entry) => !entry.untilStreamEnds),
  };
}
