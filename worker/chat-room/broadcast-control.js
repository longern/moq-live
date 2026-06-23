import {
  isDurableObjectWriteLimitError,
  sanitizeRequestId,
} from "./utils.js";

export function handleBroadcastControlCheck(room, ws, session, payload) {
  const requestId = sanitizeRequestId(payload?.requestId);
  const canControlBroadcast =
    session.isRoomOwner &&
    session.role === "broadcaster" &&
    session.canControlBroadcast;

  room.send(ws, {
    type: "broadcast.control.checked",
    requestId,
    canControlBroadcast,
  });

  if (!canControlBroadcast) {
    room.sendError(ws, "broadcast_control_read_only", { requestId });
  }
}

export function handleBroadcastControlRelease(room, ws, session) {
  if (
    !session.isRoomOwner ||
    session.role !== "broadcaster" ||
    !session.user?.id
  ) {
    return;
  }

  const hadControl = session.canControlBroadcast;
  ws.serializeAttachment({
    ...session,
    canControlBroadcast: false,
  });

  if (hadControl) {
    room.send(ws, {
      type: "broadcast.control.changed",
      canControlBroadcast: false,
    });
  }
  try {
    ws.close(1000, "broadcast_control_released");
  } catch {
    // Ignore close failures on already-closing sockets.
  }
  room.refreshBroadcastControlState({ excludeSocket: ws });
  room.broadcastPresence();
}

export async function persistStorageOrNotify(room, ws, key, value) {
  try {
    await room.ctx.storage.put(key, value);
    return true;
  } catch (error) {
    if (!isDurableObjectWriteLimitError(error)) {
      throw error;
    }

    room.sendError(ws, "storage_write_limited");
    console.warn(
      `Skipped Durable Object write for ${key} because free tier row quota was exceeded.`,
    );
    return false;
  }
}
