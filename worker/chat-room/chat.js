import {
  getActiveChatMute,
  getPublicChatMute,
  getPublicModerationState,
  isMessageFresh,
  MAX_MESSAGE_LENGTH,
  MAX_RECENT_MESSAGES,
  normalizeModerationState,
  RATE_LIMIT_MAX_MESSAGES,
  RATE_LIMIT_WINDOW_MS,
  sanitizeMessage,
  sanitizeMuteDisplayName,
  sanitizeMuteDurationMs,
} from "./utils.js";
import { persistStorageOrNotify } from "./broadcast-control.js";

export function pruneRecentMessages(room, now = Date.now()) {
  const nextMessages = room.recentMessages
    .filter((message) => isMessageFresh(message, now))
    .slice(-MAX_RECENT_MESSAGES);

  if (nextMessages.length === room.recentMessages.length) {
    return false;
  }

  room.recentMessages = nextMessages;
  return true;
}

export async function persistPrunedMessages(room, now = Date.now()) {
  if (!pruneRecentMessages(room, now)) {
    return;
  }
  await room.ctx.storage.put("recentMessages", room.recentMessages);
}

export async function handleMessageSend(room, ws, session, payload) {
  if (session.readOnly || !session.user?.id) {
    room.sendError(ws, "auth_required");
    return;
  }

  const activeMute = getActiveChatMute(
    room.roomState.moderation,
    session.user.id,
    Date.now(),
    room.roomState.stream.isLive,
  );
  if (activeMute) {
    room.sendError(ws, "chat_muted", {
      expiresAt: activeMute.expiresAt,
      untilStreamEnds: activeMute.untilStreamEnds,
    });
    return;
  }

  const text = sanitizeMessage(payload.text);
  if (!text) {
    room.sendError(ws, "empty_message");
    return;
  }

  if (text.length > MAX_MESSAGE_LENGTH) {
    room.sendError(ws, "message_too_long", {
      maxLength: MAX_MESSAGE_LENGTH,
    });
    return;
  }

  const now = Date.now();
  const sentAt = Array.isArray(session.sentAt)
    ? session.sentAt.filter(
        (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
      )
    : [];

  if (sentAt.length >= RATE_LIMIT_MAX_MESSAGES) {
    room.sendError(ws, "rate_limited");
    return;
  }

  sentAt.push(now);
  ws.serializeAttachment({
    ...session,
    sentAt,
  });

  const message = {
    id: crypto.randomUUID(),
    room: session.room,
    text,
    sentAt: new Date(now).toISOString(),
    user: {
      id: session.user.id,
      displayName:
        session.user.displayName || session.user.email || "匿名用户",
      avatarUrl: session.user.avatarUrl || "",
      email: session.user.email || "",
    },
  };

  const nextMessages = room.recentMessages
    .concat(message)
    .slice(-MAX_RECENT_MESSAGES);
  const persisted = await persistStorageOrNotify(
    room,
    ws,
    "recentMessages",
    nextMessages,
  );
  if (!persisted) {
    return;
  }
  room.recentMessages = nextMessages;

  room.broadcast({
    type: "message.created",
    message,
  });
}

export async function handleMessageRetract(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_message_retract");
    return;
  }

  const messageId =
    typeof payload.messageId === "string" ? payload.messageId.trim() : "";
  if (!messageId) {
    room.sendError(ws, "message_missing");
    return;
  }

  const nextMessages = room.recentMessages.filter(
    (message) => message.id !== messageId,
  );
  if (nextMessages.length === room.recentMessages.length) {
    return;
  }

  const persisted = await persistStorageOrNotify(
    room,
    ws,
    "recentMessages",
    nextMessages,
  );
  if (!persisted) {
    return;
  }
  room.recentMessages = nextMessages;

  room.broadcast({
    type: "message.retracted",
    messageId,
  });
}

export async function handleMessageMute(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_message_mute");
    return;
  }

  const messageId =
    typeof payload.messageId === "string" ? payload.messageId.trim() : "";
  if (!messageId) {
    room.sendError(ws, "message_missing");
    return;
  }

  const targetMessage = room.recentMessages.find(
    (message) => message.id === messageId,
  );
  if (!targetMessage) {
    room.sendError(ws, "message_missing");
    return;
  }

  const targetUserId = String(targetMessage.user?.id || "").trim();
  if (!targetUserId || targetUserId === session.user?.id) {
    room.sendError(ws, "invalid_message_mute_target");
    return;
  }

  const untilStreamEnds = payload.untilStreamEnds === true;
  const durationMs = untilStreamEnds
    ? null
    : sanitizeMuteDurationMs(payload.durationMs);
  if (!untilStreamEnds && durationMs === null) {
    room.sendError(ws, "invalid_mute_duration");
    return;
  }

  const now = Date.now();
  const mutedAt = new Date(now).toISOString();
  const mute = {
    userId: targetUserId,
    displayName: sanitizeMuteDisplayName(
      targetMessage.user?.displayName || targetMessage.user?.email || "用户",
    ),
    mutedAt,
    expiresAt: untilStreamEnds
      ? null
      : new Date(now + durationMs).toISOString(),
    untilStreamEnds,
  };
  const currentModeration = normalizeModerationState(
    room.roomState.moderation,
    now,
    room.roomState.stream.isLive,
  );
  const nextModeration = {
    ...currentModeration,
    mutedUsers: currentModeration.mutedUsers
      .filter((entry) => entry.userId !== targetUserId)
      .concat(mute),
  };
  const nextRoomState = {
    ...room.roomState,
    moderation: nextModeration,
  };
  const persisted = await persistStorageOrNotify(
    room,
    ws,
    "roomState",
    nextRoomState,
  );
  if (!persisted) {
    return;
  }
  room.roomState = nextRoomState;

  if (payload.retractMessage === true) {
    const nextMessages = room.recentMessages.filter(
      (message) => message.id !== messageId,
    );
    if (nextMessages.length !== room.recentMessages.length) {
        const messagesPersisted = await persistStorageOrNotify(
          room,
        ws,
        "recentMessages",
        nextMessages,
      );
      if (!messagesPersisted) {
        return;
      }
      room.recentMessages = nextMessages;
      room.broadcast({
        type: "message.retracted",
        messageId,
      });
    }
  }

  sendModerationEvent(room, {
    type: "message.muted",
    id: `mute-${Date.now().toString(36)}-${crypto.randomUUID()}`,
    mute: getPublicChatMute(mute),
    moderation: getPublicModerationState(
      room.roomState.moderation,
      Date.now(),
      room.roomState.stream.isLive,
      true,
    ),
  });
}

export async function handleMessageUnmute(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_message_mute");
    return;
  }

  const targetUserId = String(payload.userId || "").trim();
  if (!targetUserId) {
    room.sendError(ws, "invalid_message_mute_target");
    return;
  }

  const currentModeration = normalizeModerationState(
    room.roomState.moderation,
    Date.now(),
    room.roomState.stream.isLive,
  );
  const removedMute =
    currentModeration.mutedUsers.find(
      (entry) => entry.userId === targetUserId,
    ) || null;
  const nextMutedUsers = currentModeration.mutedUsers.filter(
    (entry) => entry.userId !== targetUserId,
  );
  if (nextMutedUsers.length === currentModeration.mutedUsers.length) {
    return;
  }

  const nextRoomState = {
    ...room.roomState,
    moderation: {
      ...currentModeration,
      mutedUsers: nextMutedUsers,
    },
  };
  const persisted = await persistStorageOrNotify(
    room,
    ws,
    "roomState",
    nextRoomState,
  );
  if (!persisted) {
    return;
  }
  room.roomState = nextRoomState;

  sendModerationEvent(room, {
    type: "message.unmuted",
    id: `unmute-${Date.now().toString(36)}-${crypto.randomUUID()}`,
    userId: targetUserId,
    mute: getPublicChatMute(removedMute),
    moderation: getPublicModerationState(
      room.roomState.moderation,
      Date.now(),
      room.roomState.stream.isLive,
      true,
    ),
  });
}

export function sendModerationEvent(room, payload) {
  const targetUserId = String(payload?.mute?.userId || payload?.userId || "");
  for (const { socket, session } of room.getActiveSessions()) {
    const isController =
      session?.isRoomOwner &&
      session.role === "broadcaster" &&
      session.canControlBroadcast;
    const isTarget = targetUserId && session?.user?.id === targetUserId;
    if (!isController && !isTarget) {
      continue;
    }
    if (isController) {
      room.send(socket, payload);
    } else {
      const targetPayload = { ...payload };
      delete targetPayload.moderation;
      room.send(socket, targetPayload);
    }
  }
}
