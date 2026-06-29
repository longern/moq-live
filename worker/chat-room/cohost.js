import {
  json,
  MAX_COHOST_PEERS,
  normalizeCohostActive,
  normalizeCohostActiveList,
  normalizeCohostInvite,
  normalizeCohostInviteResponse,
} from "./utils.js";
import { persistStorageOrNotify } from "./broadcast-control.js";

function upsertCohostActive(currentActive, active) {
  const current = normalizeCohostActiveList(currentActive);
  if (!active) {
    return current;
  }
  const next = current.filter((item) => item.peerRoomId !== active.peerRoomId);
  next.push(active);
  return next.slice(-MAX_COHOST_PEERS);
}

export async function handleCohostInvitesAllowed(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_cohost_update");
    return;
  }

  const nextCohost = {
    ...room.roomState.cohost,
    invitesAllowed: payload.invitesAllowed !== false,
  };
  if (room.roomState.cohost.invitesAllowed === nextCohost.invitesAllowed) {
    return;
  }

  const nextRoomState = {
    ...room.roomState,
    cohost: nextCohost,
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
  room.broadcast({
    type: "cohost.invites.changed",
    invitesAllowed: nextCohost.invitesAllowed,
  });
}

export async function handleCohostActiveClear(room, ws, session) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_cohost_update");
    return;
  }

  const previousActive = normalizeCohostActiveList(room.roomState.cohost.active);
  if (!previousActive.length) {
    return;
  }

  const nextRoomState = {
    ...room.roomState,
    cohost: {
      ...room.roomState.cohost,
      active: [],
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
  room.broadcast({
    type: "cohost.active.changed",
    active: [],
  });
  await clearPeerCohostActive(room, previousActive, session.room);
}

export async function handleCohostInviteRequest(room, request) {
  const payload = await request.json().catch(() => ({}));
  const invite = normalizeCohostInvite(payload.invite);
  if (!invite) {
    return json(
      {
        ok: false,
        error: "Invalid cohost invite",
        code: "invalid_cohost_invite",
      },
      { status: 400 },
    );
  }

  if (!room.roomState.stream.isLive || !room.hasActiveBroadcastController()) {
    return json(
      { ok: false, error: "Room is not live", code: "room_not_live" },
      { status: 409 },
    );
  }

  if (room.roomState.cohost.invitesAllowed === false) {
    return json(
      {
        ok: false,
        error: "Cohost invites are blocked",
        code: "cohost_invites_blocked",
      },
      { status: 403 },
    );
  }

  let delivered = 0;
  for (const { socket, session } of room.getActiveSessions()) {
    if (
      !session?.isRoomOwner ||
      session.role !== "broadcaster" ||
      !session.canControlBroadcast
    ) {
      continue;
    }
    room.send(socket, {
      type: "cohost.invite.received",
      invite,
    });
    delivered += 1;
  }

  if (delivered === 0) {
    return json(
      { ok: false, error: "Room is not live", code: "room_not_live" },
      { status: 409 },
    );
  }

  return json({ ok: true, delivered });
}

export async function handleCohostInviteResponse(room, request) {
  const payload = await request.json().catch(() => ({}));
  const response = normalizeCohostInviteResponse(payload.response);
  if (!response) {
    return json(
      {
        ok: false,
        error: "Invalid cohost response",
        code: "invalid_cohost_response",
      },
      { status: 400 },
    );
  }

  room.broadcast({
    type: "cohost.invite.responded",
    response,
  });
  return json({ ok: true });
}

export async function handleCohostActiveUpdate(room, request) {
  const payload = await request.json().catch(() => ({}));
  const active = normalizeCohostActive(payload.active);
  const removePeerRoomId = String(payload.removePeerRoomId || "").trim();
  if (payload.active !== null && !removePeerRoomId && !active) {
    return json(
      { ok: false, error: "Invalid cohost active", code: "invalid_cohost_active" },
      { status: 400 },
    );
  }
  const nextActive = payload.active === null
    ? []
    : removePeerRoomId
      ? normalizeCohostActiveList(room.roomState.cohost.active)
          .filter((item) => item.peerRoomId !== removePeerRoomId)
    : upsertCohostActive(room.roomState.cohost.active, active);
  const nextCohost = {
    ...room.roomState.cohost,
    active: nextActive,
  };
  const nextRoomState = {
    ...room.roomState,
    cohost: nextCohost,
  };
  room.roomState = nextRoomState;
  await room.ctx.storage.put("roomState", nextRoomState);
  room.broadcast({
    type: "cohost.active.changed",
    active: nextActive,
  });
  return json({ ok: true });
}

export async function clearPeerCohostActive(room, active, roomId = "") {
  const activeItems = normalizeCohostActiveList(active);
  if (!activeItems.length || !room.env?.CHAT_ROOM) {
    return;
  }

  for (const item of activeItems) {
    try {
      const stub = room.env.CHAT_ROOM.get(
        room.env.CHAT_ROOM.idFromName(item.peerRoomId),
      );
      await stub.fetch(
        new Request("https://chat-room.internal/cohost/active", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(roomId ? { removePeerRoomId: roomId } : { active: null }),
        }),
      );
    } catch (error) {
      console.warn(
        "Failed to clear peer cohost state",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
