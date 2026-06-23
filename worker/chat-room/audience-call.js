import {
  getPublicAudienceCallState,
  MAX_AUDIENCE_CALL_ACTIVE,
  MAX_AUDIENCE_CALL_REQUESTS,
  normalizeAudienceCallActiveList,
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
  room.broadcast({
    type: "audience_call.changed",
    audienceCall: getPublicAudienceCallState(nextAudienceCall),
  });
  broadcastToBroadcastControllers(room, {
    type: "audience_call.requests.changed",
    requests: nextAudienceCall.requests,
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

  broadcastToBroadcastControllers(room, {
    type: "audience_call.viewer.ready",
    viewer,
  });
  broadcastToBroadcastControllers(room, {
    type: "audience_call.active.changed",
    active: nextActive,
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

  broadcastToBroadcastControllers(room, {
    type: "audience_call.active.changed",
    active: nextActive,
  });
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
