import {
  getDb,
  getUserRoom,
  getSessionUser,
  json,
} from "../auth.js";
import {
  AUDIENCE_CALL_REALTIME_ROLE_HOST,
  AUDIENCE_CALL_REALTIME_ROLE_VIEWER,
  AUDIENCE_CALL_REALTIME_SESSION_TOKEN_TTL_MS,
  buildCloudflareRealtimeErrorResponse,
  callCloudflareRealtime,
  deleteWebRtcProxySession,
  formatWebRtcProxyResourceToken,
  getAudienceCallRealtimeSessionPathParts,
  getChatRoomState,
  getCloudflareRealtimeConfig,
  getRoomById,
  getWebRtcProxySession,
  isPlainObject,
  isValidRoomId,
  normalizeAudienceCallRealtimeRole,
  parseWebRtcProxyResourceToken,
  registerWebRtcProxySession,
  requireAudienceCallRealtimeSessionGrant,
  signAudienceCallRealtimePullToken,
  signAudienceCallRealtimeSessionToken,
  validateAudienceCallRemoteTrackGrants,
  WEBRTC_PROXY_RESOURCE_IDLE_TTL_MS,
} from "./shared.js";

export async function handleAudienceCallRealtimeSessionCreate(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const config = getCloudflareRealtimeConfig(env);
  if (!config) {
    return json(
      {
        ok: false,
        error: "Cloudflare Realtime is not configured",
        code: "cloudflare_realtime_not_configured",
      },
      { status: 500 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const roomId = String(payload.roomId || "").trim();
  const role = normalizeAudienceCallRealtimeRole(payload.role);
  if (!isValidRoomId(roomId) || !role) {
    return json(
      {
        ok: false,
        error: "Invalid Realtime session request",
        code: "invalid_realtime_session_request",
      },
      { status: 400 },
    );
  }

  const room = await getRoomById(db, roomId);
  if (!room?.room_id) {
    return json(
      { ok: false, error: "Room not found", code: "room_not_found" },
      { status: 404 },
    );
  }

  if (
    role === AUDIENCE_CALL_REALTIME_ROLE_HOST &&
    room.host_user_id !== session.user.id
  ) {
    return json(
      { ok: false, error: "Forbidden", code: "forbidden_realtime_host" },
      { status: 403 },
    );
  }

  if (role === AUDIENCE_CALL_REALTIME_ROLE_VIEWER) {
    const roomState = await getChatRoomState(env, roomId);
    if (!roomState?.stream?.isLive) {
      return json(
        { ok: false, error: "Room is not live", code: "room_not_live" },
        { status: 409 },
      );
    }
  }

  const query = new URLSearchParams();
  if (payload.thirdparty === true) {
    query.set("thirdparty", "true");
  }
  const rawCorrelationId = String(payload.correlationId || "").trim();
  query.set(
    "correlationId",
    rawCorrelationId
      ? rawCorrelationId.slice(0, 128)
      : `${roomId}:${session.user.id}:${Date.now()}`,
  );

  const realtimePayload = {};
  if (isPlainObject(payload.sessionDescription)) {
    realtimePayload.sessionDescription = payload.sessionDescription;
  }

  const cloudflareResponse = await callCloudflareRealtime(env, {
    method: "POST",
    path: `/apps/${encodeURIComponent(config.appId)}/sessions/new`,
    query,
    payload:
      Object.keys(realtimePayload).length > 0 ? realtimePayload : undefined,
  });
  if (!cloudflareResponse.ok) {
    return buildCloudflareRealtimeErrorResponse(cloudflareResponse);
  }

  const sessionId = String(cloudflareResponse.payload?.sessionId || "").trim();
  if (!sessionId) {
    return json(
      {
        ok: false,
        error: "Cloudflare Realtime response missing sessionId",
        code: "cloudflare_realtime_missing_session_id",
      },
      { status: 502 },
    );
  }

  const expiresAt = Date.now() + AUDIENCE_CALL_REALTIME_SESSION_TOKEN_TTL_MS;
  const sessionToken = await signAudienceCallRealtimeSessionToken(env, {
    version: 1,
    type: "session",
    userId: session.user.id,
    roomId,
    role,
    sessionId,
    expiresAt,
  });
  const trackPullToken = await signAudienceCallRealtimePullToken(env, {
    version: 1,
    type: "pull",
    userId: session.user.id,
    roomId,
    role,
    sessionId,
    expiresAt,
  });

  return json(
    {
      ok: true,
      role,
      roomId,
      sessionId,
      sessionToken,
      trackPullToken,
      expiresAt,
      realtime: cloudflareResponse.payload,
    },
    { status: cloudflareResponse.status },
  );
}

export async function handleAudienceCallRealtimeSessionGet(env, request) {
  const { sessionId } = getAudienceCallRealtimeSessionPathParts(request);
  const sessionGrant = await requireAudienceCallRealtimeSessionGrant(
    env,
    request,
    sessionId,
  );
  if (sessionGrant instanceof Response) {
    return sessionGrant;
  }

  const config = getCloudflareRealtimeConfig(env);
  if (!config) {
    return json(
      {
        ok: false,
        error: "Cloudflare Realtime is not configured",
        code: "cloudflare_realtime_not_configured",
      },
      { status: 500 },
    );
  }

  const cloudflareResponse = await callCloudflareRealtime(env, {
    method: "GET",
    path: `/apps/${encodeURIComponent(config.appId)}/sessions/${encodeURIComponent(sessionId)}`,
  });
  if (!cloudflareResponse.ok) {
    return buildCloudflareRealtimeErrorResponse(cloudflareResponse);
  }

  return json(
    {
      ok: true,
      roomId: sessionGrant.roomId,
      role: sessionGrant.role,
      sessionId,
      realtime: cloudflareResponse.payload,
    },
    { status: cloudflareResponse.status },
  );
}

export async function handleAudienceCallRealtimeSessionTracksNew(env, request) {
  return await handleAudienceCallRealtimeSessionProxy(env, request, {
    method: "POST",
    cloudflarePathSuffix: "/tracks/new",
  });
}

export async function handleAudienceCallRealtimeSessionTracksUpdate(env, request) {
  return await handleAudienceCallRealtimeSessionProxy(env, request, {
    method: "PUT",
    cloudflarePathSuffix: "/tracks/update",
  });
}

export async function handleAudienceCallRealtimeSessionRenegotiate(env, request) {
  return await handleAudienceCallRealtimeSessionProxy(env, request, {
    method: "PUT",
    cloudflarePathSuffix: "/renegotiate",
  });
}

export async function handleAudienceCallRealtimeSessionTracksClose(env, request) {
  return await handleAudienceCallRealtimeSessionProxy(env, request, {
    method: "PUT",
    cloudflarePathSuffix: "/tracks/close",
  });
}

async function handleAudienceCallRealtimeSessionProxy(
  env,
  request,
  { method, cloudflarePathSuffix },
) {
  const { sessionId } = getAudienceCallRealtimeSessionPathParts(request);
  const payload = await request.json().catch(() => ({}));
  if (!isPlainObject(payload)) {
    return json(
      {
        ok: false,
        error: "Invalid Realtime payload",
        code: "invalid_realtime_payload",
      },
      { status: 400 },
    );
  }

  const sessionGrant = await requireAudienceCallRealtimeSessionGrant(
    env,
    request,
    sessionId,
    payload,
  );
  if (sessionGrant instanceof Response) {
    return sessionGrant;
  }

  const remoteTrackGrantResponse = await validateAudienceCallRemoteTrackGrants(
    env,
    sessionGrant,
    payload,
  );
  if (remoteTrackGrantResponse instanceof Response) {
    return remoteTrackGrantResponse;
  }

  const config = getCloudflareRealtimeConfig(env);
  if (!config) {
    return json(
      {
        ok: false,
        error: "Cloudflare Realtime is not configured",
        code: "cloudflare_realtime_not_configured",
      },
      { status: 500 },
    );
  }

  delete payload.sessionToken;
  delete payload.remoteSessionTokens;
  delete payload.trackPullTokens;

  const cloudflareResponse = await callCloudflareRealtime(env, {
    method,
    path: `/apps/${encodeURIComponent(config.appId)}/sessions/${encodeURIComponent(sessionId)}${cloudflarePathSuffix}`,
    payload,
  });
  if (!cloudflareResponse.ok) {
    return buildCloudflareRealtimeErrorResponse(cloudflareResponse);
  }

  return json(
    {
      ok: true,
      roomId: sessionGrant.roomId,
      role: sessionGrant.role,
      sessionId,
      realtime: cloudflareResponse.payload,
    },
    { status: cloudflareResponse.status },
  );
}

export async function handleMyRoomWhipProxy(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const room = await getUserRoom(db, session.user.id);
  const targetUrl = String(room?.webRtcPublishUrl || "").trim();
  if (!targetUrl) {
    return json(
      {
        ok: false,
        error: "WebRTC publish URL is not provisioned",
        code: "webrtc_publish_url_missing",
      },
      { status: 409 },
    );
  }

  return await proxyWebRtcSignalingRequest(env, request, {
    targetUrl,
    roomId: room.id,
    kind: "whip",
  });
}

export async function handleRoomWhepProxy(env, request) {
  const db = getDb(env);
  const roomId = decodeURIComponent(
    new URL(request.url).pathname.split("/")[3] || "",
  ).trim();
  if (!isValidRoomId(roomId)) {
    return json(
      { ok: false, error: "Room not found", code: "room_not_found" },
      { status: 404 },
    );
  }

  const room = await getRoomById(db, roomId);
  if (!room?.room_id) {
    return json(
      { ok: false, error: "Room not found", code: "room_not_found" },
      { status: 404 },
    );
  }

  const roomState = await getChatRoomState(env, roomId);
  if (!roomState?.stream?.isLive) {
    return json(
      { ok: false, error: "Room is not live", code: "room_not_live" },
      { status: 409 },
    );
  }

  const targetUrl = String(room.web_rtc_playback_url || "").trim();
  if (!targetUrl) {
    return json(
      {
        ok: false,
        error: "WebRTC playback URL is not provisioned",
        code: "webrtc_playback_url_missing",
      },
      { status: 409 },
    );
  }

  return await proxyWebRtcSignalingRequest(env, request, {
    targetUrl,
    roomId,
    kind: "whep",
  });
}

export async function handleWebRtcProxyResource(env, request) {
  const token = decodeURIComponent(
    new URL(request.url).pathname.split("/")[4] || "",
  ).trim();
  const tokenParts = parseWebRtcProxyResourceToken(token);
  if (!tokenParts) {
    return json(
      {
        ok: false,
        error: "Invalid WebRTC proxy session",
        code: "invalid_webrtc_proxy_session",
      },
      { status: 401 },
    );
  }

  const sessionResponse = await getWebRtcProxySession(
    env,
    tokenParts.roomId,
    tokenParts.sessionId,
  );
  if (!sessionResponse.ok) {
    return json(
      {
        ok: false,
        error: sessionResponse.error || "WebRTC proxy session not found",
        code: sessionResponse.code || "webrtc_proxy_session_not_found",
      },
      { status: sessionResponse.status || 404 },
    );
  }
  const proxySession = sessionResponse.session;

  if (request.method === "PATCH") {
    const renewed = await registerWebRtcProxySession(env, tokenParts.roomId, {
      id: proxySession.id,
      kind: proxySession.kind,
      targetUrl: proxySession.targetUrl,
      expiresAt: Date.now() + WEBRTC_PROXY_RESOURCE_IDLE_TTL_MS,
    });
    if (!renewed.ok) {
      return json(
        {
          ok: false,
          error: renewed.error || "WebRTC proxy session renewal failed",
          code: renewed.code || "webrtc_proxy_session_renew_failed",
        },
        { status: renewed.status || 500 },
      );
    }
    return json({
      ok: true,
      expiresAt: renewed.session?.expiresAt || 0,
    });
  }

  const headers = new Headers();
  const contentType = request.headers.get("content-type") || "";
  if (contentType) {
    headers.set("content-type", contentType);
  }
  const accept = request.headers.get("accept") || "";
  if (accept) {
    headers.set("accept", accept);
  }

  const init = { method: request.method, headers };
  if (request.method !== "DELETE") {
    init.body = await request.text();
  }

  const upstreamResponse = await fetch(proxySession.targetUrl, init);
  const response = await buildWebRtcProxyResponse(
    env,
    request,
    upstreamResponse,
    {
      roomId: tokenParts.roomId,
      kind: proxySession.kind,
    },
  );
  if (request.method === "DELETE") {
    await deleteWebRtcProxySession(env, tokenParts.roomId, proxySession.id);
  }
  return response;
}

async function proxyWebRtcSignalingRequest(
  env,
  request,
  { targetUrl, roomId, kind },
) {
  const body = await request.text();
  const upstreamResponse = await fetch(targetUrl, {
    method: request.method,
    headers: {
      accept: request.headers.get("accept") || "application/sdp",
      "content-type": request.headers.get("content-type") || "application/sdp",
    },
    body,
  });

  return await buildWebRtcProxyResponse(env, request, upstreamResponse, {
    roomId,
    kind,
  });
}

async function buildWebRtcProxyResponse(
  env,
  request,
  upstreamResponse,
  { roomId, kind },
) {
  const responseBody = await upstreamResponse.text();
  const headers = new Headers();
  const contentType = upstreamResponse.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  headers.set("cache-control", "no-store");

  const upstreamLocation = upstreamResponse.headers.get("location") || "";
  if (upstreamLocation) {
    const targetUrl = new URL(
      upstreamLocation,
      upstreamResponse.url,
    ).toString();
    const sessionId = crypto.randomUUID();
    const registered = await registerWebRtcProxySession(env, roomId, {
      id: sessionId,
      kind,
      targetUrl,
      expiresAt: Date.now() + WEBRTC_PROXY_RESOURCE_IDLE_TTL_MS,
    });
    if (!registered.ok) {
      return json(
        {
          ok: false,
          error: registered.error || "WebRTC proxy session registration failed",
          code: registered.code || "webrtc_proxy_session_register_failed",
        },
        { status: registered.status || 500 },
      );
    }
    const token = formatWebRtcProxyResourceToken(roomId, sessionId);
    const requestUrl = new URL(request.url);
    headers.set(
      "location",
      `${requestUrl.origin}/api/webrtc/sessions/${encodeURIComponent(token)}`,
    );
  }

  return new Response(responseBody, {
    status: upstreamResponse.status,
    headers,
  });
}
