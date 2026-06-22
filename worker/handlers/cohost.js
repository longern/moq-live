import {
  getDb,
  getUserRoom,
  getSessionUser,
  json,
} from "../auth.js";
import {
  buildCohostActive,
  buildCohostRoomPayload,
  getChatRoomState,
  getRoomByHostHandle,
  getRoomById,
  isChatRoomOwner,
  postToChatRoom,
  sanitizeCohostHandle
} from "./shared.js";

export async function handleCohostRequest(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const targetHandle = sanitizeCohostHandle(payload.handle);
  if (!targetHandle) {
    return json(
      { ok: false, error: "Missing handle", code: "missing_handle" },
      { status: 400 },
    );
  }

  const requesterRoom = await getUserRoom(db, session.user.id);
  const targetRoom = await getRoomByHostHandle(db, targetHandle);
  if (!targetRoom?.room_id) {
    return json(
      { ok: false, error: "Room not found", code: "room_not_found" },
      { status: 404 },
    );
  }

  if (
    targetRoom.host_user_id === session.user.id ||
    targetRoom.room_id === requesterRoom.id
  ) {
    return json(
      { ok: false, error: "Cannot cohost with self", code: "cohost_self" },
      { status: 400 },
    );
  }

  const targetState = await getChatRoomState(env, targetRoom.room_id);
  if (!targetState?.stream?.isLive) {
    return json(
      { ok: false, error: "Room is not live", code: "room_not_live" },
      { status: 409 },
    );
  }
  if (targetState.cohost?.invitesAllowed === false) {
    return json(
      {
        ok: false,
        error: "Cohost invites are blocked",
        code: "cohost_invites_blocked",
      },
      { status: 403 },
    );
  }

  const invite = {
    id: `cohost-${Date.now().toString(36)}-${crypto.randomUUID()}`,
    requesterRoomId: requesterRoom.id,
    targetRoomId: targetRoom.room_id,
    requestedAt: new Date().toISOString(),
    requester: {
      id: session.user.id,
      handle: session.user.handle || "",
      displayName:
        session.user.displayName ||
        session.user.email ||
        session.user.handle ||
        "",
      avatarUrl: session.user.avatarUrl || "",
    },
  };

  const relayResponse = await postToChatRoom(
    env,
    targetRoom.room_id,
    "/cohost/request",
    { invite },
  );
  if (!relayResponse.ok) {
    return json(
      {
        ok: false,
        error: relayResponse.error || "Cohost request failed",
        code: relayResponse.code || "cohost_request_failed",
      },
      { status: relayResponse.status || 500 },
    );
  }

  return json({
    ok: true,
    invite,
    room: buildCohostRoomPayload(targetRoom, request),
  });
}

export async function handleCohostRespond(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const inviteId = String(payload.inviteId || "").trim();
  const requesterRoomId = String(payload.requesterRoomId || "").trim();
  const targetRoomId = String(payload.targetRoomId || "").trim();
  const accepted = Boolean(payload.accepted);
  if (!inviteId || !requesterRoomId || !targetRoomId) {
    return json(
      {
        ok: false,
        error: "Invalid cohost response",
        code: "invalid_cohost_response",
      },
      { status: 400 },
    );
  }

  const isOwner = await isChatRoomOwner(env, targetRoomId, session.user.id);
  if (!isOwner) {
    return json(
      { ok: false, error: "Forbidden", code: "forbidden_cohost_response" },
      { status: 403 },
    );
  }

  const targetRoom = await getRoomById(db, targetRoomId);
  const requesterRoom = await getRoomById(db, requesterRoomId);
  if (!targetRoom?.room_id || !requesterRoom?.room_id) {
    return json(
      { ok: false, error: "Room not found", code: "room_not_found" },
      { status: 404 },
    );
  }

  const response = {
    id: inviteId,
    accepted,
    respondedAt: new Date().toISOString(),
    target: {
      id: session.user.id,
      handle: session.user.handle || targetRoom.host_handle || "",
      displayName:
        session.user.displayName ||
        targetRoom.host_display_name ||
        session.user.email ||
        "",
      avatarUrl: session.user.avatarUrl || targetRoom.host_avatar_url || "",
    },
  };

  if (accepted) {
    const targetState = await getChatRoomState(env, targetRoomId);
    const requesterState = await getChatRoomState(env, requesterRoomId);
    if (!targetState?.stream?.isLive || !requesterState?.stream?.isLive) {
      return json(
        { ok: false, error: "Room is not live", code: "room_not_live" },
        { status: 409 },
      );
    }

    const acceptedAt = response.respondedAt;
    const targetActive = buildCohostActive({
      id: inviteId,
      acceptedAt,
      peerRoom: requesterRoom,
      peerState: requesterState,
      request,
    });
    const requesterActive = buildCohostActive({
      id: inviteId,
      acceptedAt,
      peerRoom: targetRoom,
      peerState: targetState,
      request,
    });

    if (!targetActive || !requesterActive) {
      return json(
        { ok: false, error: "Room is not live", code: "room_not_live" },
        { status: 409 },
      );
    }

    await postToChatRoom(env, targetRoomId, "/cohost/active", {
      active: targetActive,
    });
    await postToChatRoom(env, requesterRoomId, "/cohost/active", {
      active: requesterActive,
    });
  }

  const relayResponse = await postToChatRoom(
    env,
    requesterRoomId,
    "/cohost/response",
    { response },
  );
  if (!relayResponse.ok) {
    return json(
      {
        ok: false,
        error: relayResponse.error || "Cohost response failed",
        code: relayResponse.code || "cohost_response_failed",
      },
      { status: relayResponse.status || 500 },
    );
  }

  return json({ ok: true, accepted });
}
