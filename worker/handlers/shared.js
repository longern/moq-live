import {
  getDb,
  getSessionUser,
  json,
} from "../auth.js";

const CLOUDFLARE_REALTIME_API_BASE_URL = "https://rtc.live.cloudflare.com/v1";
export const AUDIENCE_CALL_REALTIME_SESSION_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
export const AUDIENCE_CALL_REALTIME_ROLE_HOST = "host";
export const AUDIENCE_CALL_REALTIME_ROLE_VIEWER = "viewer";
export const WEBRTC_PROXY_RESOURCE_IDLE_TTL_MS = 3 * 60 * 60 * 1000;

export function sanitizeCohostHandle(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
}

export async function getRoomByHostHandle(db, handle) {
  return await db
    .prepare(
      `SELECT
      rooms.id AS room_id,
      rooms.title AS room_title,
      rooms.cover_url AS room_cover_url,
      rooms.welcome_message AS room_welcome_message,
      users.id AS host_user_id,
      users.handle AS host_handle,
      users.display_name AS host_display_name,
      users.primary_email AS host_email,
      users.avatar_url AS host_avatar_url
    FROM moq_rooms AS rooms
    INNER JOIN moq_users AS users
      ON users.id = rooms.host_user_id
    WHERE lower(users.handle) = ?
    LIMIT 1`,
    )
    .bind(handle)
    .first();
}

export async function getRoomById(db, roomId) {
  return await db
    .prepare(
      `SELECT
      rooms.id AS room_id,
      rooms.title AS room_title,
      rooms.cover_url AS room_cover_url,
      rooms.welcome_message AS room_welcome_message,
      rooms.live_notification_sent_at AS room_live_notification_sent_at,
      rooms.web_rtc_publish_url AS web_rtc_publish_url,
      rooms.web_rtc_playback_url AS web_rtc_playback_url,
      users.id AS host_user_id,
      users.handle AS host_handle,
      users.display_name AS host_display_name,
      users.primary_email AS host_email,
      users.avatar_url AS host_avatar_url
    FROM moq_rooms AS rooms
    INNER JOIN moq_users AS users
      ON users.id = rooms.host_user_id
    WHERE rooms.id = ?
    LIMIT 1`,
    )
    .bind(roomId)
    .first();
}

export function buildCohostRoomPayload(row, request) {
  return {
    id: row.room_id || "",
    title: row.room_title || "",
    welcomeMessage: row.room_welcome_message || "",
    coverUrl: normalizeMediaUrlForRequest(request, row.room_cover_url || ""),
    host: {
      id: row.host_user_id || "",
      handle: row.host_handle || "",
      displayName: row.host_display_name || "",
      email: row.host_email || "",
      avatarUrl: normalizeMediaUrlForRequest(
        request,
        row.host_avatar_url || "",
      ),
    },
  };
}

export function buildCohostActive({ id, acceptedAt, peerRoom, peerState, request }) {
  const stream = peerState?.roomMeta?.stream || {};
  const protocol = stream.protocol === "moq" ? "moq" : "webrtc";
  const defaultWebRtcUrl = peerRoom.room_id
    ? new URL(
        `/api/rooms/${encodeURIComponent(peerRoom.room_id)}/webrtc/whep`,
        request.url,
      ).toString()
    : "";
  const activeStream = {
    relayUrl: stream.relayUrl || "",
    namespace: stream.namespace || peerRoom.room_id || "",
    protocol,
    webRtcUrl: stream.webRtcUrl || defaultWebRtcUrl,
  };
  const moqReady =
    protocol === "moq" && activeStream.relayUrl && activeStream.namespace;
  const webRtcReady = protocol === "webrtc" && activeStream.webRtcUrl;
  if (!moqReady && !webRtcReady) {
    return null;
  }

  return {
    id,
    peerRoomId: peerRoom.room_id || "",
    acceptedAt,
    peer: {
      id: peerRoom.host_user_id || "",
      handle: peerRoom.host_handle || "",
      displayName: peerRoom.host_display_name || peerRoom.host_handle || "",
      avatarUrl: normalizeMediaUrlForRequest(
        request,
        peerRoom.host_avatar_url || "",
      ),
    },
    stream: activeStream,
  };
}

export async function getChatRoomState(env, roomId) {
  const response = await fetchChatRoom(env, roomId, "/state", {
    method: "GET",
  });
  if (!response.ok) {
    return null;
  }
  return await response.json().catch(() => null);
}

export async function postToChatRoom(env, roomId, pathname, payload) {
  const response = await fetchChatRoom(env, roomId, pathname, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const responsePayload = await response.json().catch(() => ({}));
  return {
    ...responsePayload,
    ok: response.ok && responsePayload.ok !== false,
    status: response.status,
  };
}

export async function fetchChatRoom(env, roomId, pathname, init) {
  if (!env.CHAT_ROOM) {
    return json(
      {
        ok: false,
        error: "Missing CHAT_ROOM durable object binding",
        code: "missing_chat_room",
      },
      { status: 500 },
    );
  }

  const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(roomId));
  return await stub.fetch(
    new Request(`https://chat-room.internal${pathname}`, init),
  );
}

export function runAfterResponse(ctx, task) {
  const guardedTask = Promise.resolve()
    .then(task)
    .catch((error) => {
      console.warn(
        "background follow count update failed",
        error instanceof Error ? error.message : String(error),
      );
    });

  if (typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(guardedTask);
    return;
  }

  void guardedTask;
}

export async function updateFollowCounts(
  db,
  { followerUserId, followedUserId, followerDelta, followingDelta },
) {
  if (followerDelta > 0) {
    await db
      .prepare(
        `UPDATE moq_users
       SET follower_count = follower_count + 1
       WHERE id = ?`,
      )
      .bind(followedUserId)
      .run();
  } else if (followerDelta < 0) {
    await db
      .prepare(
        `UPDATE moq_users
       SET follower_count = MAX(0, follower_count - 1)
       WHERE id = ?`,
      )
      .bind(followedUserId)
      .run();
  }

  if (followingDelta > 0) {
    await db
      .prepare(
        `UPDATE moq_users
       SET following_count = following_count + 1
       WHERE id = ?`,
      )
      .bind(followerUserId)
      .run();
  } else if (followingDelta < 0) {
    await db
      .prepare(
        `UPDATE moq_users
       SET following_count = MAX(0, following_count - 1)
       WHERE id = ?`,
      )
      .bind(followerUserId)
      .run();
  }
}


export function normalizeMediaUrlForRequest(request, value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }

  try {
    const requestUrl = new URL(request.url);
    const mediaUrl = new URL(rawValue, requestUrl);
    if (mediaUrl.pathname.startsWith("/media/room-covers/")) {
      return `${requestUrl.origin}${mediaUrl.pathname}${mediaUrl.search}`;
    }
    return mediaUrl.toString();
  } catch {
    return rawValue;
  }
}

export function slugifyError(message) {
  return (
    String(message)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "login_failed"
  );
}

export function isSuperAdminUser(env, user) {
  const superAdminUserIds = parseEnvList(env?.SUPER_ADMIN_USER_IDS);
  if (superAdminUserIds.length === 0) {
    return false;
  }
  return superAdminUserIds.includes(String(user?.id || "").trim());
}

export function withSuperAdminFlag(env, user) {
  return {
    ...user,
    isSuperAdmin: isSuperAdminUser(env, user),
  };
}

export function parseEnvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getCloudflareRealtimeConfig(env) {
  const appId = String(env?.CLOUDFLARE_REALTIME_APP_ID || "").trim();
  const appSecret = String(env?.CLOUDFLARE_REALTIME_APP_SECRET || "").trim();
  if (!appId || !appSecret) {
    return null;
  }
  return { appId, appSecret };
}

export async function callCloudflareRealtime(env, { method, path, query, payload }) {
  const config = getCloudflareRealtimeConfig(env);
  if (!config) {
    return {
      ok: false,
      status: 500,
      payload: {
        error: "Cloudflare Realtime is not configured",
        code: "cloudflare_realtime_not_configured",
      },
    };
  }

  const url = new URL(`${CLOUDFLARE_REALTIME_API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of query.entries()) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers({
    authorization: `Bearer ${config.appSecret}`,
  });
  const init = { method, headers };
  if (payload !== undefined) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(payload);
  }

  const response = await fetch(url.toString(), init);
  const responseText = await response.text().catch(() => "");
  let responsePayload = {};
  if (responseText) {
    try {
      responsePayload = JSON.parse(responseText);
    } catch {
      responsePayload = { message: responseText };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    payload: responsePayload,
  };
}

export function buildCloudflareRealtimeErrorResponse(cloudflareResponse) {
  const details = cloudflareResponse.payload || {};
  const error =
    details.error ||
    details.message ||
    details.errors?.[0]?.message ||
    `Cloudflare Realtime request failed with ${cloudflareResponse.status}`;
  return json(
    {
      ok: false,
      error,
      code: "cloudflare_realtime_request_failed",
      details,
    },
    { status: cloudflareResponse.status || 502 },
  );
}

export function normalizeAudienceCallRealtimeRole(value) {
  const role = String(value || "")
    .trim()
    .toLowerCase();
  if (role === AUDIENCE_CALL_REALTIME_ROLE_HOST) {
    return AUDIENCE_CALL_REALTIME_ROLE_HOST;
  }
  if (role === AUDIENCE_CALL_REALTIME_ROLE_VIEWER || role === "guest") {
    return AUDIENCE_CALL_REALTIME_ROLE_VIEWER;
  }
  return "";
}

export function getAudienceCallRealtimeSessionPathParts(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").map((part) => decodeURIComponent(part));
  return {
    sessionId: String(parts[5] || "").trim(),
  };
}

export async function requireAudienceCallRealtimeSessionGrant(
  env,
  request,
  sessionId,
  payload = null,
) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  if (!isValidRealtimeId(sessionId)) {
    return json(
      {
        ok: false,
        error: "Invalid session id",
        code: "invalid_realtime_session_id",
      },
      { status: 400 },
    );
  }

  const token = getAudienceCallRealtimeSessionToken(request, payload);
  const grant = await verifyAudienceCallRealtimeSessionToken(env, token);
  if (!grant) {
    return json(
      {
        ok: false,
        error: "Invalid Realtime session token",
        code: "invalid_realtime_session_token",
      },
      { status: 401 },
    );
  }

  if (grant.userId !== session.user.id || grant.sessionId !== sessionId) {
    return json(
      {
        ok: false,
        error: "Forbidden",
        code: "forbidden_realtime_session",
      },
      { status: 403 },
    );
  }

  return grant;
}

export function getAudienceCallRealtimeSessionToken(request, payload = null) {
  const url = new URL(request.url);
  const headerValue =
    request.headers.get("x-realtime-session-token") ||
    request.headers.get("x-audience-call-session-token") ||
    "";
  if (headerValue) {
    return headerValue.trim();
  }

  const authorization = request.headers.get("authorization") || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }

  const queryValue =
    url.searchParams.get("sessionToken") ||
    url.searchParams.get("session_token") ||
    "";
  if (queryValue) {
    return queryValue.trim();
  }

  return String(payload?.sessionToken || "").trim();
}

export async function signAudienceCallRealtimeSessionToken(env, grant) {
  const payload = base64UrlEncode(JSON.stringify(grant));
  const signature = await hmacSha256Base64Url(
    getAudienceCallRealtimeTokenSecret(env),
    payload,
  );
  return `${payload}.${signature}`;
}

export async function signAudienceCallRealtimePullToken(env, grant) {
  const payload = base64UrlEncode(JSON.stringify(grant));
  const signature = await hmacSha256Base64Url(
    getAudienceCallRealtimeTokenSecret(env),
    payload,
  );
  return `${payload}.${signature}`;
}

export async function verifyAudienceCallRealtimeSessionToken(env, token) {
  const grant = await verifyAudienceCallRealtimeSignedGrant(env, token);
  if (!grant || grant.type !== "session") {
    return null;
  }
  return grant;
}

export async function verifyAudienceCallRealtimePullToken(env, token) {
  const grant = await verifyAudienceCallRealtimeSignedGrant(env, token);
  if (!grant || grant.type !== "pull") {
    return null;
  }
  return grant;
}

export async function verifyAudienceCallRealtimeSignedGrant(env, token) {
  const [payload, signature, ...extra] = String(token || "").split(".");
  if (!payload || !signature || extra.length > 0) {
    return null;
  }

  const expectedSignature = await hmacSha256Base64Url(
    getAudienceCallRealtimeTokenSecret(env),
    payload,
  );
  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  let grant;
  try {
    grant = JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }

  if (
    grant?.version !== 1 ||
    !["session", "pull"].includes(grant.type) ||
    !isValidRealtimeId(grant.sessionId) ||
    !isValidRoomId(grant.roomId) ||
    !grant.userId ||
    !normalizeAudienceCallRealtimeRole(grant.role) ||
    Number(grant.expiresAt || 0) <= Date.now()
  ) {
    return null;
  }

  return {
    version: 1,
    type: grant.type,
    userId: String(grant.userId),
    roomId: String(grant.roomId),
    role: normalizeAudienceCallRealtimeRole(grant.role),
    sessionId: String(grant.sessionId),
    expiresAt: Number(grant.expiresAt),
  };
}

export function formatWebRtcProxyResourceToken(roomId, sessionId) {
  return `${roomId}.${sessionId}`;
}

export function parseWebRtcProxyResourceToken(token) {
  const value = String(token || "").trim();
  const separatorIndex = value.indexOf(".");
  if (separatorIndex <= 0 || separatorIndex >= value.length - 1) {
    return null;
  }

  const roomId = value.slice(0, separatorIndex);
  const sessionId = value.slice(separatorIndex + 1);
  if (!isValidRoomId(roomId) || !isValidRealtimeId(sessionId)) {
    return null;
  }

  return { roomId, sessionId };
}

export async function registerWebRtcProxySession(env, roomId, session) {
  return await postToChatRoom(env, roomId, "/webrtc/proxy-sessions", {
    session,
  });
}

export async function getWebRtcProxySession(env, roomId, sessionId) {
  const response = await fetchChatRoom(
    env,
    roomId,
    `/webrtc/proxy-sessions/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
  );
  return await response.json().catch(() => ({
    ok: false,
    status: response.status,
    error: "WebRTC proxy session lookup failed",
    code: "webrtc_proxy_session_lookup_failed",
  }));
}

export async function deleteWebRtcProxySession(env, roomId, sessionId) {
  const response = await fetchChatRoom(
    env,
    roomId,
    `/webrtc/proxy-sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
  return await response.json().catch(() => ({ ok: response.ok }));
}

export async function validateAudienceCallRemoteTrackGrants(
  env,
  sessionGrant,
  payload,
) {
  const remoteSessionIds = new Set();
  for (const track of Array.isArray(payload?.tracks) ? payload.tracks : []) {
    if (String(track?.location || "").toLowerCase() !== "remote") {
      continue;
    }
    const remoteSessionId = String(track?.sessionId || "").trim();
    if (
      !isValidRealtimeId(remoteSessionId) ||
      remoteSessionId === sessionGrant.sessionId
    ) {
      continue;
    }
    remoteSessionIds.add(remoteSessionId);
  }

  if (remoteSessionIds.size === 0) {
    return null;
  }

  const tokenValues = [
    ...normalizeTokenList(payload.remoteSessionTokens),
    ...normalizeTokenList(payload.trackPullTokens),
  ];
  const grantedSessionIds = new Set();
  for (const token of tokenValues) {
    const grant = await verifyAudienceCallRealtimePullToken(env, token);
    if (!grant || grant.roomId !== sessionGrant.roomId) {
      continue;
    }
    grantedSessionIds.add(grant.sessionId);
  }

  for (const remoteSessionId of remoteSessionIds) {
    if (!grantedSessionIds.has(remoteSessionId)) {
      return json(
        {
          ok: false,
          error: "Missing remote track grant",
          code: "missing_remote_track_grant",
        },
        { status: 403 },
      );
    }
  }

  return null;
}

export function normalizeTokenList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const token = String(value || "").trim();
  return token ? [token] : [];
}

export function getAudienceCallRealtimeTokenSecret(env) {
  const secret = String(env?.AUTH_COOKIE_SECRET || "").trim();
  if (!secret) {
    const error = new Error(
      "Audience call Realtime session signing secret is not configured",
    );
    error.status = 500;
    error.code = "audience_call_realtime_secret_missing";
    throw error;
  }
  return secret;
}

export async function hmacSha256Base64Url(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

export function base64UrlEncode(value) {
  return btoa(value)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return base64UrlEncode(binary);
}

export function base64UrlDecode(value) {
  const base64 = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return atob(padded);
}

export function constantTimeEqual(left, right) {
  const leftValue = String(left || "");
  const rightValue = String(right || "");
  if (leftValue.length !== rightValue.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < leftValue.length; index += 1) {
    diff |= leftValue.charCodeAt(index) ^ rightValue.charCodeAt(index);
  }
  return diff === 0;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isValidRoomId(value) {
  return /^[a-z0-9-]{3,80}$/i.test(String(value || ""));
}

export function isValidRealtimeId(value) {
  return /^[a-z0-9_-]{3,160}$/i.test(String(value || ""));
}

export async function getOptionalSessionUser(env, request) {
  try {
    if (!env.APP_DB) {
      return null;
    }
    return await getSessionUser(getDb(env), request);
  } catch {
    return null;
  }
}

export async function isChatRoomOwner(env, roomId, userId) {
  if (!env.APP_DB || !roomId || !userId) {
    return false;
  }

  const db = getDb(env);
  const row = await db
    .prepare(
      `SELECT 1
     FROM moq_rooms
     WHERE id = ? AND host_user_id = ?
     LIMIT 1`,
    )
    .bind(roomId, userId)
    .first();

  return Boolean(row);
}
