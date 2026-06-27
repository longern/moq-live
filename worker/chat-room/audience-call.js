import {
  getPublicAudienceCallState,
  MAX_AUDIENCE_CALL_ACTIVE,
  MAX_AUDIENCE_CALL_REQUESTS,
  normalizeAudienceCallActiveList,
  pruneAudienceCallInvites,
  normalizeAudienceCallSpeakingUserIds,
  pruneAudienceCallRequests,
  sanitizeDisplayName,
  sanitizeUrl,
} from "./utils.js";
import { persistStorageOrNotify } from "./broadcast-control.js";

export async function handleAudienceCallEnabledUpdate(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_audience_call_update");
    return;
  }

  const nextAudienceCall = {
    enabled: payload.enabled === true,
    requests: payload.enabled === true ? room.roomState.audienceCall.requests : [],
    invites: payload.enabled === true ? room.roomState.audienceCall.invites : [],
    active: payload.enabled === true ? room.roomState.audienceCall.active : [],
  };
  if (
    room.roomState.audienceCall.enabled === nextAudienceCall.enabled &&
    room.roomState.audienceCall.requests.length === nextAudienceCall.requests.length
  ) {
    return;
  }

  const nextRoomState = {
    ...room.roomState,
    audienceCall: nextAudienceCall,
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
  if (!nextAudienceCall.enabled) {
    updateAudienceCallSpeakingUserIds(room, []);
  }
  room.broadcast({
    type: "audience_call.changed",
    audienceCall: getPublicAudienceCallState(
      nextAudienceCall,
      false,
      room.audienceCallSpeakingUserIds,
    ),
  });
  broadcastToBroadcastControllers(room, {
    type: "audience_call.requests.changed",
    requests: nextAudienceCall.requests,
  });
  broadcastToBroadcastControllers(room, {
    type: "audience_call.invites.changed",
    invites: nextAudienceCall.invites,
  });
}

export async function handleAudienceCallRequest(room, ws, session) {
  if (session.role === "broadcaster") {
    room.sendError(ws, "audience_call_request_forbidden");
    return;
  }
  if (!room.roomState.stream.isLive || !room.roomState.audienceCall.enabled) {
    room.sendError(ws, "audience_call_unavailable");
    return;
  }
  if (!session.user?.id) {
    room.sendError(ws, "audience_call_login_required");
    return;
  }

  const now = Date.now();
  const requestedAt = new Date(now).toISOString();
  const user = {
    id: String(session.user.id || "").trim(),
    displayName: sanitizeDisplayName(
      session.user.displayName || session.user.email || "已登录用户",
    ),
    avatarUrl: sanitizeUrl(session.user.avatarUrl),
  };
  if (!user.id) {
    room.sendError(ws, "audience_call_login_required");
    return;
  }

  const existingRequests = pruneAudienceCallRequests(
    room.roomState.audienceCall.requests,
    now,
  ).filter((request) => request.user.id !== user.id);
  const nextRequests = [
    {
      id: `audience-call-${now.toString(36)}-${crypto.randomUUID()}`,
      requestedAt,
      user,
    },
    ...existingRequests,
  ].slice(0, MAX_AUDIENCE_CALL_REQUESTS);
  const nextAudienceCall = {
    ...room.roomState.audienceCall,
    requests: nextRequests,
  };
  const nextRoomState = {
    ...room.roomState,
    audienceCall: nextAudienceCall,
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
  room.send(ws, {
    type: "audience_call.request.sent",
    request: nextRequests[0],
  });
  broadcastToBroadcastControllers(room, {
    type: "audience_call.requests.changed",
    requests: nextRequests,
  });
}

export async function handleAudienceCallRequestCancel(room, ws, session) {
  if (session.role === "broadcaster") {
    room.sendError(ws, "audience_call_request_cancel_forbidden");
    return;
  }
  if (!session.user?.id) {
    room.sendError(ws, "audience_call_login_required");
    return;
  }

  const userId = String(session.user.id || "").trim();
  const currentRequests = pruneAudienceCallRequests(
    room.roomState.audienceCall.requests,
    Date.now(),
  );
  const nextRequests = currentRequests.filter((request) => request.user.id !== userId);
  if (nextRequests.length === currentRequests.length) {
    return;
  }

  const nextAudienceCall = {
    ...room.roomState.audienceCall,
    requests: nextRequests,
  };
  const nextRoomState = {
    ...room.roomState,
    audienceCall: nextAudienceCall,
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
  room.send(ws, {
    type: "audience_call.request.cancelled",
  });
  broadcastToBroadcastControllers(room, {
    type: "audience_call.requests.changed",
    requests: nextRequests,
  });
}

export async function handleAudienceCallRespond(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_audience_call_response");
    return;
  }

  const requestId = String(payload.requestId || "").trim();
  const accepted = payload.accepted === true;
  const currentRequests = pruneAudienceCallRequests(
    room.roomState.audienceCall.requests,
    Date.now(),
  );
  const request = currentRequests.find((item) => item.id === requestId);
  if (!request) {
    room.sendError(ws, "audience_call_request_not_found");
    return;
  }
  const currentActive = normalizeAudienceCallActiveList(
    room.roomState.audienceCall.active,
  );
  if (
    accepted &&
    currentActive.length >= MAX_AUDIENCE_CALL_ACTIVE &&
    !currentActive.some((item) => item.user.id === request.user.id)
  ) {
    room.sendError(ws, "audience_call_active_limit_reached");
    return;
  }

  const nextAudienceCall = {
    ...room.roomState.audienceCall,
    requests: currentRequests.filter((item) => item.id !== requestId),
    invites: pruneAudienceCallInvites(room.roomState.audienceCall.invites, Date.now()),
    active: currentActive,
  };
  const nextRoomState = {
    ...room.roomState,
    audienceCall: nextAudienceCall,
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
  const response = {
    requestId,
    accepted,
    respondedAt: new Date().toISOString(),
    request,
    realtime: accepted && payload.realtime && typeof payload.realtime === "object"
      ? {
          hostSessionId: String(payload.realtime.hostSessionId || "").trim(),
          hostTrackPullToken: String(payload.realtime.hostTrackPullToken || "").trim(),
          hostTrackName: String(payload.realtime.hostTrackName || "").trim(),
          expiresAt: Number(payload.realtime.expiresAt || 0) || 0,
        }
      : null,
  };
  broadcastToBroadcastControllers(room, {
    type: "audience_call.requests.changed",
    requests: nextAudienceCall.requests,
  });
  room.send(ws, {
    type: "audience_call.request.responded",
    response,
  });
  sendToAudienceCallRequester(room, request.user.id, {
    type: accepted ? "audience_call.accepted" : "audience_call.rejected",
    response,
  });
}

export async function handleAudienceCallInvite(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_audience_call_invite");
    return;
  }
  if (!room.roomState.stream.isLive || !room.roomState.audienceCall.enabled) {
    room.sendError(ws, "audience_call_unavailable");
    return;
  }

  const userId = String(payload.userId || "").trim();
  if (!userId) {
    room.sendError(ws, "invalid_audience_call_invite");
    return;
  }

  const currentActive = normalizeAudienceCallActiveList(
    room.roomState.audienceCall.active,
  );
  if (
    currentActive.length >= MAX_AUDIENCE_CALL_ACTIVE &&
    !currentActive.some((item) => item.user.id === userId)
  ) {
    room.sendError(ws, "audience_call_active_limit_reached");
    return;
  }

  const targetSession = Array.from(room.getActiveSessions())
    .map((entry) => entry.session)
    .find((entrySession) => (
      entrySession?.role !== "broadcaster" &&
      entrySession.user?.id === userId
    ));
  if (!targetSession?.user?.id) {
    room.sendError(ws, "audience_call_invite_target_unavailable");
    return;
  }

  const request = {
    id: `audience-invite-${Date.now().toString(36)}-${crypto.randomUUID()}`,
    requestedAt: new Date().toISOString(),
    user: {
      id: String(targetSession.user.id || "").trim(),
      displayName: sanitizeDisplayName(
        targetSession.user.displayName || targetSession.user.email || "已登录用户",
      ),
      avatarUrl: sanitizeUrl(targetSession.user.avatarUrl),
    },
  };
  const invite = {
    ...request,
    realtime: payload.realtime && typeof payload.realtime === "object"
      ? normalizeAudienceCallHostRealtime(payload.realtime)
      : null,
  };
  const existingInvites = pruneAudienceCallInvites(
    room.roomState.audienceCall.invites,
    Date.now(),
  ).filter((item) => item.user.id !== userId);
  const nextInvites = [invite, ...existingInvites].slice(0, MAX_AUDIENCE_CALL_REQUESTS);
  const nextAudienceCall = {
    ...room.roomState.audienceCall,
    invites: nextInvites,
  };
  const nextRoomState = {
    ...room.roomState,
    audienceCall: nextAudienceCall,
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
  sendToAudienceCallRequester(room, userId, {
    type: "audience_call.invite.received",
    invite,
  });
  broadcastToBroadcastControllers(room, {
    type: "audience_call.invites.changed",
    invites: nextInvites,
  });
  room.send(ws, {
    type: "audience_call.invite.sent",
    invite,
  });
}

export async function handleAudienceCallInviteRespond(room, ws, session, payload) {
  if (session.role === "broadcaster" || !session.user?.id) {
    room.sendError(ws, "audience_call_invite_response_forbidden");
    return;
  }

  const inviteId = String(payload.inviteId || "").trim();
  const accepted = payload.accepted === true;
  const userId = String(session.user.id || "").trim();
  const currentInvites = pruneAudienceCallInvites(
    room.roomState.audienceCall.invites,
    Date.now(),
  );
  const invite = currentInvites.find((item) => item.id === inviteId && item.user.id === userId);
  if (!invite) {
    room.sendError(ws, "audience_call_invite_not_found");
    return;
  }

  const currentActive = normalizeAudienceCallActiveList(
    room.roomState.audienceCall.active,
  );
  if (
    accepted &&
    currentActive.length >= MAX_AUDIENCE_CALL_ACTIVE &&
    !currentActive.some((item) => item.user.id === userId)
  ) {
    room.sendError(ws, "audience_call_active_limit_reached");
    return;
  }

  const nextInvites = currentInvites.filter((item) => item.id !== inviteId);
  const nextAudienceCall = {
    ...room.roomState.audienceCall,
    invites: nextInvites,
    active: currentActive,
  };
  const nextRoomState = {
    ...room.roomState,
    audienceCall: nextAudienceCall,
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
  const response = {
    requestId: inviteId,
    accepted,
    respondedAt: new Date().toISOString(),
    request: invite,
    realtime: accepted ? normalizeAudienceCallHostRealtime(invite.realtime) : null,
  };
  if (accepted) {
    room.send(ws, {
      type: "audience_call.accepted",
      response,
    });
  } else {
    room.send(ws, {
      type: "audience_call.rejected",
      response,
    });
  }
  broadcastToBroadcastControllers(room, {
    type: "audience_call.invites.changed",
    invites: nextInvites,
  });
  broadcastToBroadcastControllers(room, {
    type: "audience_call.invite.responded",
    response,
  });
}

function normalizeAudienceCallHostRealtime(realtime) {
  if (!realtime || typeof realtime !== "object") {
    return null;
  }
  return {
    hostSessionId: String(realtime.hostSessionId || "").trim(),
    hostTrackPullToken: String(realtime.hostTrackPullToken || "").trim(),
    hostTrackName: String(realtime.hostTrackName || "").trim(),
    expiresAt: Number(realtime.expiresAt || 0) || 0,
  };
}

export function sendToAudienceCallRequester(room, userId, payload) {
  const targetUserId = String(userId || "").trim();
  if (!targetUserId) {
    return;
  }

  for (const { socket, session } of room.getActiveSessions()) {
    if (session?.user?.id === targetUserId && session.role !== "broadcaster") {
      room.send(socket, payload);
    }
  }
}

export function handleAudienceCallViewerReady(room, ws, session, payload) {
  if (session.role === "broadcaster" || !session.user?.id) {
    room.sendError(ws, "audience_call_viewer_ready_forbidden");
    return;
  }
  if (!room.roomState.stream.isLive || !room.roomState.audienceCall.enabled) {
    room.sendError(ws, "audience_call_unavailable");
    return;
  }

  const viewer = {
    userId: String(session.user.id || "").trim(),
    displayName: sanitizeDisplayName(
      session.user.displayName || session.user.email || "已登录用户",
    ),
    avatarUrl: sanitizeUrl(session.user.avatarUrl),
    sessionId: String(payload.viewer?.sessionId || "").trim(),
    trackPullToken: String(payload.viewer?.trackPullToken || "").trim(),
    trackName: String(payload.viewer?.trackName || "").trim(),
    readyAt: new Date().toISOString(),
  };
  if (!viewer.sessionId || !viewer.trackPullToken || !viewer.trackName) {
    room.sendError(ws, "invalid_audience_call_viewer_ready");
    return;
  }

  const currentActive = normalizeAudienceCallActiveList(
    room.roomState.audienceCall.active,
  );
  const isExistingActiveViewer = currentActive.some(
    (item) => item.user.id === viewer.userId,
  );
  if (
    currentActive.length >= MAX_AUDIENCE_CALL_ACTIVE &&
    !isExistingActiveViewer
  ) {
    room.sendError(ws, "audience_call_active_limit_reached");
    return;
  }

  const remainingActive = currentActive.filter(
    (item) => item.user.id !== viewer.userId,
  );
  const nextActive = [
    {
      id: `audience-active-${Date.now().toString(36)}-${crypto.randomUUID()}`,
      readyAt: viewer.readyAt,
      sessionId: viewer.sessionId,
      trackPullToken: viewer.trackPullToken,
      trackName: viewer.trackName,
      user: {
        id: viewer.userId,
        displayName: viewer.displayName,
        avatarUrl: viewer.avatarUrl,
      },
    },
    ...remainingActive,
  ].slice(0, MAX_AUDIENCE_CALL_ACTIVE);
  const nextAudienceCall = {
    ...room.roomState.audienceCall,
    active: nextActive,
  };
  const nextRoomState = {
    ...room.roomState,
    audienceCall: nextAudienceCall,
  };
  room.roomState = nextRoomState;
  void room.ctx.storage.put("roomState", nextRoomState);
  syncAudienceCallSpeakingWithActive(room, nextActive);

  broadcastToBroadcastControllers(room, {
    type: "audience_call.viewer.ready",
    viewer,
  });
  room.broadcast({
    type: "audience_call.active.changed",
    active: getPublicAudienceCallActiveList(room, nextActive),
  });
  broadcastToAudienceCallParticipants(room, nextActive);
}

export function handleAudienceCallViewerFailed(room, ws, session, payload) {
  if (session.role === "broadcaster" || !session.user?.id) {
    room.sendError(ws, "audience_call_viewer_failed_forbidden");
    return;
  }

  const user = {
    id: String(session.user.id || "").trim(),
    displayName: sanitizeDisplayName(
      session.user.displayName || session.user.email || "已登录用户",
    ),
    avatarUrl: sanitizeUrl(session.user.avatarUrl),
  };
  const error = String(payload.error || "unknown error").trim().slice(0, 300);
  broadcastToBroadcastControllers(room, {
    type: "audience_call.viewer.failed",
    user,
    error,
  });
}

export function handleAudienceCallViewerLeave(room, ws, session) {
  if (session.role === "broadcaster" || !session.user?.id) {
    room.sendError(ws, "audience_call_viewer_leave_forbidden");
    return;
  }

  const userId = String(session.user.id || "").trim();
  const currentActive = normalizeAudienceCallActiveList(
    room.roomState.audienceCall.active,
  );
  const nextActive = currentActive.filter((item) => item.user.id !== userId);
  if (nextActive.length === currentActive.length) {
    return;
  }

  const nextAudienceCall = {
    ...room.roomState.audienceCall,
    active: nextActive,
  };
  const nextRoomState = {
    ...room.roomState,
    audienceCall: nextAudienceCall,
  };
  room.roomState = nextRoomState;
  void room.ctx.storage.put("roomState", nextRoomState);
  syncAudienceCallSpeakingWithActive(room, nextActive);

  room.broadcast({
    type: "audience_call.active.changed",
    active: getPublicAudienceCallActiveList(room, nextActive),
  });
  broadcastToAudienceCallParticipants(room, nextActive);
}

export async function handleAudienceCallActiveRemove(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_audience_call_active_remove");
    return;
  }

  const userId = String(payload.userId || "").trim();
  if (!userId) {
    room.sendError(ws, "invalid_audience_call_active_remove");
    return;
  }

  const currentActive = normalizeAudienceCallActiveList(
    room.roomState.audienceCall.active,
  );
  const nextActive = currentActive.filter((item) => item.user.id !== userId);
  if (nextActive.length === currentActive.length) {
    return;
  }

  const nextAudienceCall = {
    ...room.roomState.audienceCall,
    active: nextActive,
  };
  const nextRoomState = {
    ...room.roomState,
    audienceCall: nextAudienceCall,
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
  syncAudienceCallSpeakingWithActive(room, nextActive);
  sendToAudienceCallRequester(room, userId, {
    type: "audience_call.removed",
  });
  room.broadcast({
    type: "audience_call.active.changed",
    active: getPublicAudienceCallActiveList(room, nextActive),
  });
  broadcastToAudienceCallParticipants(room, nextActive);
}

export function handleAudienceCallSpeakingUpdate(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_audience_call_speaking");
    return;
  }

  const active = normalizeAudienceCallActiveList(room.roomState.audienceCall.active);
  const nextSpeakingUserIds = normalizeAudienceCallSpeakingUserIds(
    payload.speakingUserIds,
    active,
  );
  updateAudienceCallSpeakingUserIds(room, nextSpeakingUserIds);
}

function syncAudienceCallSpeakingWithActive(room, active) {
  const nextSpeakingUserIds = normalizeAudienceCallSpeakingUserIds(
    room.audienceCallSpeakingUserIds,
    active,
  );
  updateAudienceCallSpeakingUserIds(room, nextSpeakingUserIds);
}

function updateAudienceCallSpeakingUserIds(room, speakingUserIds) {
  const nextSpeakingUserIds = Array.isArray(speakingUserIds) ? speakingUserIds : [];
  const currentSignature = (room.audienceCallSpeakingUserIds || []).join("\n");
  const nextSignature = nextSpeakingUserIds.join("\n");
  if (currentSignature === nextSignature) {
    return;
  }

  room.audienceCallSpeakingUserIds = nextSpeakingUserIds;
  room.broadcast({
    type: "audience_call.speaking.changed",
    speakingUserIds: nextSpeakingUserIds,
  });
}

function getPublicAudienceCallActiveList(room, active) {
  return getPublicAudienceCallState(
    {
      ...room.roomState.audienceCall,
      active,
    },
    false,
    room.audienceCallSpeakingUserIds,
  ).active;
}

export function broadcastToBroadcastControllers(room, payload) {
  for (const { socket, session } of room.getActiveSessions()) {
    if (
      session?.isRoomOwner &&
      session.role === "broadcaster" &&
      session.canControlBroadcast
    ) {
      room.send(socket, payload);
    }
  }
}

function broadcastToAudienceCallParticipants(room, active) {
  const activeList = normalizeAudienceCallActiveList(active);
  const activeUserIds = new Set(activeList.map((item) => item.user.id));
  for (const { socket, session } of room.getActiveSessions()) {
    const userId = String(session?.user?.id || "").trim();
    if (!userId || session.role === "broadcaster" || !activeUserIds.has(userId)) {
      continue;
    }
    room.send(socket, {
      type: "audience_call.participants.changed",
      remotes: activeList
        .filter((item) => item.user.id !== userId)
        .map((item) => ({
          id: item.user.id,
          sessionId: item.sessionId,
          trackPullToken: item.trackPullToken,
          trackName: item.trackName,
          user: item.user,
        }))
        .filter((item) => item.sessionId && item.trackPullToken && item.trackName),
    });
  }
}
