import {
  appendAuthError,
  buildMicrosoftAuthorizationUrl,
  buildSessionCookie,
  createUserRoom,
  createDeleteCookie,
  createMicrosoftOAuthState,
  createSession,
  exchangeMicrosoftCode,
  getAuthConfig,
  getDb,
  getMicrosoftLoginUrl,
  getMicrosoftOAuthCookieName,
  getUserRoom,
  getSessionCookieName,
  getSessionUser,
  json,
  parseCookies,
  removeUserAvatar,
  removeUserRoomCover,
  readMicrosoftOAuthState,
  redirect,
  revokeSession,
  sanitizeRedirectTo,
  shouldUseSecureCookies,
  updateUserAvatar,
  updateUserProfile,
  updateUserRoomCover,
  updateUserRoomSettings,
  upsertMicrosoftUser,
  verifyMicrosoftIdToken
} from "./auth.js";
import { ChatRoomDO } from "./chat-room.js";

const LIVE_NOTIFICATION_COOLDOWN_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname.startsWith("/media/room-covers/")) {
      return await handleRoomCoverMedia(env, request);
    }
    if (request.method === "GET" && url.pathname.startsWith("/media/user-avatars/")) {
      return await handleUserAvatarMedia(env, request);
    }

    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
        return env.ASSETS.fetch(request);
      }
      return new Response("Missing ASSETS binding.", { status: 500 });
    }

    try {
      if (url.pathname === "/api/me" && request.method === "GET") {
        return await handleMe(env, request);
      }
      if (url.pathname === "/api/me/room" && request.method === "GET") {
        return await handleMyRoom(env, request);
      }
      if (url.pathname === "/api/me/room" && request.method === "POST") {
        return await handleMyRoomCreate(env, request);
      }
      if (url.pathname === "/api/me/room" && request.method === "PATCH") {
        return await handleMyRoomUpdate(env, request);
      }
      if (url.pathname === "/api/me/room/cover" && request.method === "POST") {
        return await handleMyRoomCoverUpload(env, request);
      }
      if (url.pathname === "/api/me/room/cover" && request.method === "DELETE") {
        return await handleMyRoomCoverDelete(env, request);
      }
      if (url.pathname === "/api/me/follows" && request.method === "GET") {
        return await handleMyFollows(env, request);
      }
      if (url.pathname === "/api/rooms" && request.method === "GET") {
        return await handleRooms(env);
      }
      if (url.pathname === "/api/rooms/resolve" && request.method === "GET") {
        return await handleRoomResolve(env, request);
      }
      if (url.pathname === "/api/cohost/request" && request.method === "POST") {
        return await handleCohostRequest(env, request);
      }
      if (url.pathname === "/api/cohost/respond" && request.method === "POST") {
        return await handleCohostRespond(env, request);
      }
      if (/^\/api\/users\/[^/]+\/follow$/.test(url.pathname) && ["GET", "POST", "PATCH", "DELETE"].includes(request.method)) {
        return await handleUserFollow(env, request, ctx);
      }
      if (url.pathname === "/api/push/public-key" && request.method === "GET") {
        return await handlePushPublicKey(env);
      }
      if (url.pathname === "/api/me/push-subscriptions" && ["POST", "DELETE"].includes(request.method)) {
        return await handleMyPushSubscription(env, request);
      }
      if (request.method === "POST" && /^\/api\/rooms\/[^/]+\/live-notifications$/.test(url.pathname)) {
        return await handleLiveNotifications(env, request, ctx);
      }
      if (url.pathname === "/api/me/profile" && request.method === "POST") {
        return await handleProfileUpdate(env, request);
      }
      if (url.pathname === "/api/me/avatar" && request.method === "POST") {
        return await handleMyAvatarUpload(env, request);
      }
      if (url.pathname === "/api/me/avatar" && request.method === "DELETE") {
        return await handleMyAvatarDelete(env, request);
      }
      if (url.pathname === "/api/auth/microsoft/start" && request.method === "GET") {
        return await handleMicrosoftStart(env, request);
      }
      if (url.pathname === "/api/auth/microsoft/callback" && request.method === "GET") {
        return await handleMicrosoftCallback(env, request);
      }
      if (url.pathname === "/api/auth/logout" && (request.method === "POST" || request.method === "GET")) {
        return await handleLogout(env, request);
      }
      if (request.method === "GET" && /^\/api\/chat\/[^/]+\/ws$/.test(url.pathname)) {
        return await handleChatWebSocket(env, request);
      }
      if (request.method === "POST" && /^\/api\/chat\/[^/]+\/location\/distance$/.test(url.pathname)) {
        return await handleChatLocationDistance(env, request);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = Number.isInteger(error?.status) ? error.status : 500;
      const payload = { ok: false, error: message };
      if (error?.code) {
        payload.code = error.code;
      }
      if (error?.details) {
        payload.details = error.details;
      }
      return json(payload, { status });
    }

    return json({ ok: false, error: "Not found" }, { status: 404 });
  }
};

export { ChatRoomDO };

async function handleMe(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session) {
    return json({
      ok: true,
      authenticated: false,
      loginUrl: getMicrosoftLoginUrl(request),
      user: null
    });
  }

  return json({
    ok: true,
    authenticated: true,
    loginUrl: getMicrosoftLoginUrl(request),
    user: session.user
  });
}

async function handleMyRoom(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const room = await getUserRoom(db, session.user.id);
  return json({
    ok: true,
    room
  });
}

async function handleMyRoomCreate(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const room = await createUserRoom(db, session.user.id);
  return json({
    ok: true,
    room
  }, { status: 201 });
}

async function handleMyRoomUpdate(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const room = await updateUserRoomSettings(db, session.user.id, payload);
  return json({ ok: true, room });
}

async function handleMyRoomCoverUpload(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const room = await updateUserRoomCover(env, db, request, session.user.id);
  return json({ ok: true, room });
}

async function handleMyRoomCoverDelete(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const room = await removeUserRoomCover(env, db, session.user.id);
  return json({ ok: true, room });
}

async function handleRoomCoverMedia(env, request) {
  if (!env.APP_MEDIA) {
    return new Response("Missing APP_MEDIA binding.", { status: 500 });
  }

  const url = new URL(request.url);
  const objectKey = decodeURIComponent(url.pathname.slice("/media/room-covers/".length)).trim();
  if (!objectKey) {
    return new Response("Missing room cover key.", { status: 400 });
  }

  const object = await env.APP_MEDIA.get(objectKey);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  }

  return new Response(object.body, {
    headers
  });
}

async function handleUserAvatarMedia(env, request) {
  if (!env.APP_MEDIA) {
    return new Response("Missing APP_MEDIA binding.", { status: 500 });
  }

  const url = new URL(request.url);
  const objectKey = decodeURIComponent(url.pathname.slice("/media/user-avatars/".length)).trim();
  if (!objectKey) {
    return new Response("Missing user avatar key.", { status: 400 });
  }

  const object = await env.APP_MEDIA.get(objectKey);
  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  }

  return new Response(object.body, {
    headers
  });
}

async function handleMyAvatarUpload(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const user = await updateUserAvatar(env, db, request, session.user.id);
  return json({ ok: true, user });
}

async function handleMyAvatarDelete(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const user = await removeUserAvatar(env, db, session.user.id);
  return json({ ok: true, user });
}

async function handleRooms(env) {
  const db = getDb(env);
  let result;
  try {
    result = await db.prepare(
      `SELECT
        rooms.id AS room_id,
        rooms.title AS room_title,
        rooms.cover_url AS room_cover_url,
        rooms.welcome_message AS room_welcome_message,
        rooms.updated_at AS room_updated_at,
        rooms.last_started_at AS room_last_started_at,
        users.handle AS host_handle,
        users.display_name AS host_display_name,
        users.primary_email AS host_email,
        users.avatar_url AS host_avatar_url
      FROM moq_rooms AS rooms
      INNER JOIN moq_users AS users
        ON users.id = rooms.host_user_id
      ORDER BY
        rooms.last_started_at IS NULL ASC,
        rooms.last_started_at DESC,
        rooms.updated_at DESC,
        rooms.created_at DESC`
    ).all();
  } catch (error) {
    console.warn("Room last-started sort unavailable; falling back to room metadata order.", error instanceof Error ? error.message : String(error));
    result = await db.prepare(
      `SELECT
        rooms.id AS room_id,
        rooms.title AS room_title,
        rooms.cover_url AS room_cover_url,
        rooms.welcome_message AS room_welcome_message,
        rooms.updated_at AS room_updated_at,
        '' AS room_last_started_at,
        users.handle AS host_handle,
        users.display_name AS host_display_name,
        users.primary_email AS host_email,
        users.avatar_url AS host_avatar_url
      FROM moq_rooms AS rooms
      INNER JOIN moq_users AS users
        ON users.id = rooms.host_user_id
      ORDER BY rooms.updated_at DESC, rooms.created_at DESC`
    ).all();
  }

  const rows = Array.isArray(result?.results) ? result.results : [];

  return json({
    ok: true,
    rooms: rows.map((row) => ({
      id: row.room_id,
      title: row.room_title || "",
      welcomeMessage: row.room_welcome_message || "",
      coverUrl: row.room_cover_url || "",
      updatedAt: row.room_updated_at || "",
      lastStartedAt: row.room_last_started_at || "",
      host: {
        handle: row.host_handle || "",
        displayName: row.host_display_name || "",
        email: row.host_email || "",
        avatarUrl: row.host_avatar_url || ""
      }
    }))
  });
}

function clampFollowsLimit(value) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.min(50, Math.max(1, parsed));
}

function parseFollowsCursor(value) {
  const [createdAt = "", userId = ""] = String(value || "").split("|");
  if (!createdAt || !userId) {
    return null;
  }
  return { createdAt, userId };
}

function buildFollowsCursor(row, userIdColumn) {
  const createdAt = String(row.follow_created_at || "");
  const userId = String(row[userIdColumn] || "");
  return createdAt && userId ? `${createdAt}|${userId}` : "";
}

function buildFollowUserPayload(row, request) {
  return {
    id: row.user_id || "",
    handle: row.user_handle || "",
    displayName: row.user_display_name || "",
    email: row.user_email || "",
    avatarUrl: normalizeMediaUrlForRequest(request, row.user_avatar_url || ""),
    followerCount: Math.max(0, Number(row.user_follower_count || 0)),
    followingCount: Math.max(0, Number(row.user_following_count || 0)),
  };
}

async function handleMyFollows(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "followers" ? "followers" : "following";
  const limit = clampFollowsLimit(url.searchParams.get("limit"));
  const cursor = parseFollowsCursor(url.searchParams.get("cursor"));
  const cursorCreatedAt = cursor?.createdAt || "9999-12-31T23:59:59.999Z";
  const cursorUserId = cursor?.userId || "";
  const userIdColumn = type === "followers" ? "follower_user_id" : "followed_user_id";
  const relationColumn = type === "followers" ? "followed_user_id" : "follower_user_id";

  const result = await db.prepare(
    `SELECT
      follows.${userIdColumn} AS follow_user_id,
      follows.created_at AS follow_created_at,
      users.id AS user_id,
      users.handle AS user_handle,
      users.display_name AS user_display_name,
      users.primary_email AS user_email,
      users.avatar_url AS user_avatar_url,
      users.follower_count AS user_follower_count,
      users.following_count AS user_following_count
    FROM moq_user_follows AS follows
    INNER JOIN moq_users AS users
      ON users.id = follows.${userIdColumn}
    WHERE follows.${relationColumn} = ?
      AND (
        follows.created_at < ?
        OR (follows.created_at = ? AND follows.${userIdColumn} > ?)
      )
    ORDER BY follows.created_at DESC, follows.${userIdColumn} ASC
    LIMIT ?`
  ).bind(session.user.id, cursorCreatedAt, cursorCreatedAt, cursorUserId, limit + 1).all();

  const rows = Array.isArray(result?.results) ? result.results : [];
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;

  return json({
    ok: true,
    type,
    items: pageRows.map((row) => ({
      createdAt: row.follow_created_at || "",
      user: buildFollowUserPayload(row, request),
    })),
    nextCursor: hasMore ? buildFollowsCursor(pageRows[pageRows.length - 1], "follow_user_id") : "",
    hasMore,
  });
}

async function handleRoomResolve(env, request) {
  const db = getDb(env);
  const url = new URL(request.url);
  const rawHandle = (url.searchParams.get("handle") || "").trim().replace(/^@+/, "").toLowerCase();
  if (!rawHandle) {
    return json({ ok: false, error: "Missing handle" }, { status: 400 });
  }

  const row = await db.prepare(
    `SELECT
      rooms.id AS room_id,
      rooms.title AS room_title,
      rooms.cover_url AS room_cover_url,
      rooms.welcome_message AS room_welcome_message,
      rooms.last_location_province AS room_last_location_province,
      rooms.last_location_updated_at AS room_last_location_updated_at,
      users.id AS host_user_id,
      users.handle AS host_handle,
      users.display_name AS host_display_name,
      users.primary_email AS host_email,
      users.avatar_url AS host_avatar_url,
      users.gender AS host_gender,
      users.birth_date AS host_birth_date,
      users.bio AS host_bio,
      users.follower_count AS host_follower_count,
      users.following_count AS host_following_count
    FROM moq_rooms AS rooms
    INNER JOIN moq_users AS users
      ON users.id = rooms.host_user_id
    WHERE lower(users.handle) = ?
    LIMIT 1`
  ).bind(rawHandle).first();

  if (!row?.room_id) {
    return json({ ok: false, error: "Room not found", code: "room_not_found" }, { status: 404 });
  }

  return json({
    ok: true,
    room: {
      id: row.room_id,
      title: row.room_title || "",
      welcomeMessage: row.room_welcome_message || "",
      coverUrl: normalizeMediaUrlForRequest(request, row.room_cover_url || ""),
      lastLocationProvince: row.room_last_location_province || "",
      lastLocationUpdatedAt: row.room_last_location_updated_at || "",
      host: {
        id: row.host_user_id || "",
        handle: row.host_handle || "",
        displayName: row.host_display_name || "",
        email: row.host_email || "",
        avatarUrl: normalizeMediaUrlForRequest(request, row.host_avatar_url || ""),
        gender: row.host_gender || "",
        birthDate: row.host_birth_date || "",
        bio: row.host_bio || "",
        followerCount: Math.max(0, Number(row.host_follower_count || 0)),
        followingCount: Math.max(0, Number(row.host_following_count || 0))
      }
    }
  });
}

async function handleCohostRequest(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const targetHandle = sanitizeCohostHandle(payload.handle);
  if (!targetHandle) {
    return json({ ok: false, error: "Missing handle", code: "missing_handle" }, { status: 400 });
  }

  const requesterRoom = await getUserRoom(db, session.user.id);
  const targetRoom = await getRoomByHostHandle(db, targetHandle);
  if (!targetRoom?.room_id) {
    return json({ ok: false, error: "Room not found", code: "room_not_found" }, { status: 404 });
  }

  if (targetRoom.host_user_id === session.user.id || targetRoom.room_id === requesterRoom.id) {
    return json({ ok: false, error: "Cannot cohost with self", code: "cohost_self" }, { status: 400 });
  }

  const targetState = await getChatRoomState(env, targetRoom.room_id);
  if (!targetState?.stream?.isLive) {
    return json({ ok: false, error: "Room is not live", code: "room_not_live" }, { status: 409 });
  }
  if (targetState.cohost?.invitesAllowed === false) {
    return json({ ok: false, error: "Cohost invites are blocked", code: "cohost_invites_blocked" }, { status: 403 });
  }

  const invite = {
    id: `cohost-${Date.now().toString(36)}-${crypto.randomUUID()}`,
    requesterRoomId: requesterRoom.id,
    targetRoomId: targetRoom.room_id,
    requestedAt: new Date().toISOString(),
    requester: {
      id: session.user.id,
      handle: session.user.handle || "",
      displayName: session.user.displayName || session.user.email || session.user.handle || "",
      avatarUrl: session.user.avatarUrl || ""
    }
  };

  const relayResponse = await postToChatRoom(env, targetRoom.room_id, "/cohost/request", { invite });
  if (!relayResponse.ok) {
    return json({
      ok: false,
      error: relayResponse.error || "Cohost request failed",
      code: relayResponse.code || "cohost_request_failed"
    }, { status: relayResponse.status || 500 });
  }

  return json({
    ok: true,
    invite,
    room: buildCohostRoomPayload(targetRoom, request)
  });
}

async function handleCohostRespond(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const inviteId = String(payload.inviteId || "").trim();
  const requesterRoomId = String(payload.requesterRoomId || "").trim();
  const targetRoomId = String(payload.targetRoomId || "").trim();
  const accepted = Boolean(payload.accepted);
  if (!inviteId || !requesterRoomId || !targetRoomId) {
    return json({ ok: false, error: "Invalid cohost response", code: "invalid_cohost_response" }, { status: 400 });
  }

  const isOwner = await isChatRoomOwner(env, targetRoomId, session.user.id);
  if (!isOwner) {
    return json({ ok: false, error: "Forbidden", code: "forbidden_cohost_response" }, { status: 403 });
  }

  const targetRoom = await getRoomById(db, targetRoomId);
  const requesterRoom = await getRoomById(db, requesterRoomId);
  if (!targetRoom?.room_id || !requesterRoom?.room_id) {
    return json({ ok: false, error: "Room not found", code: "room_not_found" }, { status: 404 });
  }

  const response = {
    id: inviteId,
    accepted,
    respondedAt: new Date().toISOString(),
    target: {
      id: session.user.id,
      handle: session.user.handle || targetRoom.host_handle || "",
      displayName: session.user.displayName || targetRoom.host_display_name || session.user.email || "",
      avatarUrl: session.user.avatarUrl || targetRoom.host_avatar_url || ""
    }
  };

  if (accepted) {
    const targetState = await getChatRoomState(env, targetRoomId);
    const requesterState = await getChatRoomState(env, requesterRoomId);
    if (!targetState?.stream?.isLive || !requesterState?.stream?.isLive) {
      return json({ ok: false, error: "Room is not live", code: "room_not_live" }, { status: 409 });
    }

    const acceptedAt = response.respondedAt;
    const targetActive = buildCohostActive({
      id: inviteId,
      acceptedAt,
      peerRoom: requesterRoom,
      peerState: requesterState,
      request
    });
    const requesterActive = buildCohostActive({
      id: inviteId,
      acceptedAt,
      peerRoom: targetRoom,
      peerState: targetState,
      request
    });

    if (!targetActive || !requesterActive) {
      return json({ ok: false, error: "Room is not live", code: "room_not_live" }, { status: 409 });
    }

    await postToChatRoom(env, targetRoomId, "/cohost/active", { active: targetActive });
    await postToChatRoom(env, requesterRoomId, "/cohost/active", { active: requesterActive });
  }

  const relayResponse = await postToChatRoom(env, requesterRoomId, "/cohost/response", { response });
  if (!relayResponse.ok) {
    return json({
      ok: false,
      error: relayResponse.error || "Cohost response failed",
      code: relayResponse.code || "cohost_response_failed"
    }, { status: relayResponse.status || 500 });
  }

  return json({ ok: true, accepted });
}

async function handleChatLocationDistance(env, request) {
  const roomId = decodeURIComponent(new URL(request.url).pathname.split("/")[3] || "");
  if (!roomId) {
    return json({ ok: false, error: "Room not found", code: "room_not_found" }, { status: 404 });
  }

  const payload = await request.json().catch(() => ({}));
  const response = await postToChatRoom(env, roomId, "/location/distance", payload);
  if (!response.ok) {
    return json({
      ok: false,
      error: response.error || "Location distance failed",
      code: response.code || "location_distance_failed"
    }, { status: response.status || 500 });
  }

  return json({
    ok: true,
    distanceMeters: response.distanceMeters,
    distanceText: response.distanceText || ""
  });
}

function sanitizeCohostHandle(value) {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
}

async function getRoomByHostHandle(db, handle) {
  return await db.prepare(
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
    LIMIT 1`
  ).bind(handle).first();
}

async function getRoomById(db, roomId) {
  return await db.prepare(
    `SELECT
      rooms.id AS room_id,
      rooms.title AS room_title,
      rooms.cover_url AS room_cover_url,
      rooms.welcome_message AS room_welcome_message,
      rooms.live_notification_sent_at AS room_live_notification_sent_at,
      users.id AS host_user_id,
      users.handle AS host_handle,
      users.display_name AS host_display_name,
      users.primary_email AS host_email,
      users.avatar_url AS host_avatar_url
    FROM moq_rooms AS rooms
    INNER JOIN moq_users AS users
      ON users.id = rooms.host_user_id
    WHERE rooms.id = ?
    LIMIT 1`
  ).bind(roomId).first();
}

function buildCohostRoomPayload(row, request) {
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
      avatarUrl: normalizeMediaUrlForRequest(request, row.host_avatar_url || "")
    }
  };
}

function buildCohostActive({ id, acceptedAt, peerRoom, peerState, request }) {
  const stream = peerState?.roomMeta?.stream || {};
  const protocol = stream.protocol === "webrtc" ? "webrtc" : "moq";
  const activeStream = {
    relayUrl: stream.relayUrl || "",
    namespace: stream.namespace || "",
    protocol,
    webRtcUrl: stream.webRtcUrl || ""
  };
  const moqReady = protocol === "moq" && activeStream.relayUrl && activeStream.namespace;
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
      avatarUrl: normalizeMediaUrlForRequest(request, peerRoom.host_avatar_url || "")
    },
    stream: activeStream
  };
}

async function getChatRoomState(env, roomId) {
  const response = await fetchChatRoom(env, roomId, "/state", { method: "GET" });
  if (!response.ok) {
    return null;
  }
  return await response.json().catch(() => null);
}

async function postToChatRoom(env, roomId, pathname, payload) {
  const response = await fetchChatRoom(env, roomId, pathname, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const responsePayload = await response.json().catch(() => ({}));
  return {
    ...responsePayload,
    ok: response.ok && responsePayload.ok !== false,
    status: response.status
  };
}

async function fetchChatRoom(env, roomId, pathname, init) {
  if (!env.CHAT_ROOM) {
    return json({ ok: false, error: "Missing CHAT_ROOM durable object binding", code: "missing_chat_room" }, { status: 500 });
  }

  const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(roomId));
  return await stub.fetch(new Request(`https://chat-room.internal${pathname}`, init));
}

function runAfterResponse(ctx, task) {
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

async function updateFollowCounts(db, {
  followerUserId,
  followedUserId,
  followerDelta,
  followingDelta,
}) {
  if (followerDelta > 0) {
    await db.prepare(
      `UPDATE moq_users
       SET follower_count = follower_count + 1
       WHERE id = ?`
    ).bind(followedUserId).run();
  } else if (followerDelta < 0) {
    await db.prepare(
      `UPDATE moq_users
       SET follower_count = MAX(0, follower_count - 1)
       WHERE id = ?`
    ).bind(followedUserId).run();
  }

  if (followingDelta > 0) {
    await db.prepare(
      `UPDATE moq_users
       SET following_count = following_count + 1
       WHERE id = ?`
    ).bind(followerUserId).run();
  } else if (followingDelta < 0) {
    await db.prepare(
      `UPDATE moq_users
       SET following_count = MAX(0, following_count - 1)
       WHERE id = ?`
    ).bind(followerUserId).run();
  }
}

async function handleUserFollow(env, request, ctx) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const targetUserId = decodeURIComponent(new URL(request.url).pathname.split("/")[3] ?? "").trim();
  if (!targetUserId) {
    return json({ ok: false, error: "Missing target user", code: "missing_target_user" }, { status: 400 });
  }

  if (targetUserId === session.user.id) {
    return json({ ok: true, following: false });
  }

  const targetUser = await db.prepare(
    `SELECT
       id,
       follower_count AS follower_count,
       following_count AS following_count
     FROM moq_users
     WHERE id = ?
     LIMIT 1`
  ).bind(targetUserId).first();
  if (!targetUser?.id) {
    return json({ ok: false, error: "User not found", code: "user_not_found" }, { status: 404 });
  }
  const targetFollowerCount = Math.max(0, Number(targetUser.follower_count || 0));
  const targetFollowingCount = Math.max(0, Number(targetUser.following_count || 0));

  if (request.method === "GET") {
    const row = await db.prepare(
      `SELECT notify_live_started
       FROM moq_user_follows
       WHERE follower_user_id = ? AND followed_user_id = ?
       LIMIT 1`
    ).bind(session.user.id, targetUserId).first();
    return json({
      ok: true,
      following: Boolean(row),
      notifyLiveStarted: Boolean(row && Number(row.notify_live_started) !== 0),
      followerCount: targetFollowerCount,
      followingCount: targetFollowingCount
    });
  }

  if (request.method === "POST") {
    const now = new Date().toISOString();
    const result = await db.prepare(
      `INSERT OR IGNORE INTO moq_user_follows (
        follower_user_id,
        followed_user_id,
        notify_live_started,
        created_at,
        updated_at
      ) VALUES (?, ?, 1, ?, ?)`
    ).bind(session.user.id, targetUserId, now, now).run();
    const inserted = Number(result?.meta?.changes || 0) > 0;
    let followerCount = targetFollowerCount;
    if (inserted) {
      followerCount += 1;
      runAfterResponse(ctx, () => updateFollowCounts(db, {
        followerUserId: session.user.id,
        followedUserId: targetUserId,
        followerDelta: 1,
        followingDelta: 1,
      }));
    }
    return json({
      ok: true,
      following: true,
      notifyLiveStarted: true,
      followerCount,
      followingCount: targetFollowingCount
    });
  }

  if (request.method === "PATCH") {
    const payload = await request.json().catch(() => ({}));
    const notifyLiveStarted = Boolean(payload.notifyLiveStarted);
    const now = new Date().toISOString();
    const result = await db.prepare(
      `UPDATE moq_user_follows
       SET notify_live_started = ?,
           updated_at = ?
       WHERE follower_user_id = ? AND followed_user_id = ?`
    ).bind(notifyLiveStarted ? 1 : 0, now, session.user.id, targetUserId).run();
    if (Number(result?.meta?.changes || 0) <= 0) {
      return json({ ok: false, error: "Follow relationship not found", code: "follow_required" }, { status: 409 });
    }
    return json({
      ok: true,
      following: true,
      notifyLiveStarted,
      followerCount: targetFollowerCount,
      followingCount: targetFollowingCount
    });
  }

  const result = await db.prepare(
    `DELETE FROM moq_user_follows
     WHERE follower_user_id = ? AND followed_user_id = ?`
  ).bind(session.user.id, targetUserId).run();
  const deleted = Number(result?.meta?.changes || 0) > 0;
  let followerCount = targetFollowerCount;
  if (deleted) {
    followerCount = Math.max(0, followerCount - 1);
    runAfterResponse(ctx, () => updateFollowCounts(db, {
      followerUserId: session.user.id,
      followedUserId: targetUserId,
      followerDelta: -1,
      followingDelta: -1,
    }));
  }
  return json({
    ok: true,
    following: false,
    notifyLiveStarted: false,
    followerCount,
    followingCount: targetFollowingCount
  });
}

async function handlePushPublicKey(env) {
  return json({
    ok: true,
    publicKey: String(env.WEB_PUSH_PUBLIC_KEY || "")
  });
}

async function handleMyPushSubscription(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const endpoint = String(payload?.endpoint || "").trim();
  if (!endpoint) {
    return json({ ok: false, error: "Missing endpoint", code: "missing_endpoint" }, { status: 400 });
  }

  if (request.method === "DELETE") {
    await db.prepare(
      `UPDATE moq_push_subscriptions
       SET revoked_at = ?, updated_at = ?
       WHERE user_id = ? AND endpoint = ?`
    ).bind(new Date().toISOString(), new Date().toISOString(), session.user.id, endpoint).run();
    return json({ ok: true });
  }

  const p256dh = String(payload?.keys?.p256dh || "").trim();
  const auth = String(payload?.keys?.auth || "").trim();
  if (!p256dh || !auth) {
    return json({ ok: false, error: "Missing push keys", code: "missing_push_keys" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO moq_push_subscriptions (
      id,
      user_id,
      endpoint,
      p256dh,
      auth,
      user_agent,
      created_at,
      updated_at,
      revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
    ON CONFLICT(endpoint) DO UPDATE SET
      user_id = excluded.user_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      updated_at = excluded.updated_at,
      revoked_at = NULL`
  ).bind(
    id,
    session.user.id,
    endpoint,
    p256dh,
    auth,
    request.headers.get("user-agent") || "",
    now,
    now
  ).run();

  return json({ ok: true });
}

async function handleLiveNotifications(env, request, ctx) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const roomId = decodeURIComponent(new URL(request.url).pathname.split("/")[3] || "");
  if (!roomId) {
    return json({ ok: false, error: "Missing room", code: "missing_room" }, { status: 400 });
  }

  const room = await getRoomById(db, roomId);
  if (!room?.room_id) {
    return json({ ok: false, error: "Room not found", code: "room_not_found" }, { status: 404 });
  }
  if (room.host_user_id !== session.user.id) {
    return json({ ok: false, error: "Forbidden", code: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  const lastSentAt = String(room.room_live_notification_sent_at || "");
  if (lastSentAt && now.getTime() - Date.parse(lastSentAt) < LIVE_NOTIFICATION_COOLDOWN_MS) {
    return json({
      ok: true,
      queued: 0,
      skipped: "cooldown",
      nextAllowedAt: new Date(Date.parse(lastSentAt) + LIVE_NOTIFICATION_COOLDOWN_MS).toISOString()
    });
  }

  const sentAt = now.toISOString();
  await writeLiveNotificationSentAt(db, { roomId, sentAt });

  const result = await db.prepare(
    `SELECT
      subscriptions.endpoint,
      subscriptions.p256dh,
      subscriptions.auth
    FROM moq_user_follows AS follows
    INNER JOIN moq_push_subscriptions AS subscriptions
      ON subscriptions.user_id = follows.follower_user_id
    WHERE follows.followed_user_id = ?
      AND follows.notify_live_started = 1
      AND subscriptions.revoked_at IS NULL`
  ).bind(session.user.id).all();
  const subscriptions = Array.isArray(result?.results) ? result.results : [];

  runAfterResponse(ctx, async () => {
    await sendLiveStartedPushNotifications(env, db, subscriptions, {
      hostDisplayName: room.host_display_name || room.host_handle || "",
      roomHandle: room.host_handle || ""
    });
  });

  return json({ ok: true, queued: subscriptions.length });
}

async function writeLiveNotificationSentAt(db, { roomId, sentAt }) {
  await db.prepare(
    `UPDATE moq_rooms
     SET live_notification_sent_at = ?
     WHERE id = ?`
  ).bind(sentAt, roomId).run();
}

async function sendLiveStartedPushNotifications(env, db, subscriptions, notification = {}) {
  const publicKey = String(env.WEB_PUSH_PUBLIC_KEY || "").trim();
  const privateKey = String(env.WEB_PUSH_PRIVATE_KEY || "").trim();
  if (!publicKey || !privateKey) {
    console.warn("Skipped live push notifications because WEB_PUSH_PUBLIC_KEY or WEB_PUSH_PRIVATE_KEY is missing.");
    return;
  }
  const hostDisplayName = String(notification.hostDisplayName ?? "").trim();
  const notificationPayload = {
    hostDisplayName,
    url: notification.roomHandle ? `/?r=${encodeURIComponent(notification.roomHandle)}` : "/"
  };

  await Promise.allSettled(subscriptions.map(async (subscription) => {
    const response = await sendWebPush(subscription, {
      publicKey,
      privateKey,
      subject: String(env.WEB_PUSH_SUBJECT || "mailto:admin@example.com").trim(),
      payload: notificationPayload
    });
    if (response.status === 404 || response.status === 410) {
      const now = new Date().toISOString();
      await db.prepare(
        `UPDATE moq_push_subscriptions
         SET revoked_at = ?, updated_at = ?
         WHERE endpoint = ?`
      ).bind(now, now, subscription.endpoint).run();
    }
  }));
}

async function sendWebPush(subscription, vapid) {
  const endpoint = String(subscription.endpoint || "");
  const payload = JSON.stringify(vapid.payload || {});
  const audience = new URL(endpoint).origin;
  const jwt = await createVapidJwt({
    audience,
    subject: vapid.subject,
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey
  });

  return await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "120",
      urgency: "normal"
    },
    body: await encryptWebPushPayload(subscription, payload)
  });
}

async function encryptWebPushPayload(subscription, payload) {
  const receiverPublicKey = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const senderKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const senderPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverKey },
    senderKeys.privateKey,
    256
  ));
  const ikm = await hmacSha256(authSecret, sharedSecret);
  const prk = await hmacSha256(salt, ikm);
  const cek = (await hmacSha256(prk, textBytes("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16);
  const nonce = (await hmacSha256(prk, textBytes("Content-Encoding: nonce\0\x01"))).slice(0, 12);
  const content = textBytes(payload);
  const plaintext = concatBytes(content, new Uint8Array([0x02]));
  const key = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    plaintext
  ));
  return concatBytes(
    salt,
    uint32Bytes(4096),
    new Uint8Array([senderPublicKey.length]),
    senderPublicKey,
    ciphertext
  );
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function uint32Bytes(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function concatBytes(...chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

async function createVapidJwt({ audience, subject, publicKey, privateKey }) {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject
  };
  const unsignedToken = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const publicKeyBytes = base64UrlToBytes(publicKey);
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64Url(publicKeyBytes.slice(1, 33)),
      y: bytesToBase64Url(publicKeyBytes.slice(33, 65)),
      d: privateKey,
      ext: true
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  ));
  return `${unsignedToken}.${bytesToBase64Url(signature)}`;
}

function base64UrlJson(value) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlToBytes(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeMediaUrlForRequest(request, value) {
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

async function handleProfileUpdate(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user) {
    return json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return json({ ok: false, error: "Invalid JSON body", code: "invalid_json" }, { status: 400 });
  }

  const user = await updateUserProfile(db, session.user.id, {
    ...(Object.hasOwn(payload, "displayName") ? { displayName: payload.displayName } : {}),
    ...(Object.hasOwn(payload, "handle") ? { handle: payload.handle } : {}),
    ...(Object.hasOwn(payload, "bio") ? { bio: payload.bio } : {})
  });
  return json({
    ok: true,
    user
  });
}

async function handleMicrosoftStart(env, request) {
  const authConfig = getAuthConfig(env);
  const redirectTo = sanitizeRedirectTo(new URL(request.url).searchParams.get("redirect_to") || "/");
  const { payload, cookieValue } = await createMicrosoftOAuthState(authConfig.cookieSecret, redirectTo);
  const authorizationUrl = await buildMicrosoftAuthorizationUrl(request, env, payload);

  return redirect(authorizationUrl, {
    headers: {
      "set-cookie": buildOAuthCookie(cookieValue, shouldUseSecureCookies(request))
    }
  });
}

async function handleMicrosoftCallback(env, request) {
  const authConfig = getAuthConfig(env);
  const db = getDb(env);
  const url = new URL(request.url);
  const cookies = parseCookies(request);
  const oauthState = await readMicrosoftOAuthState(
    cookies[getMicrosoftOAuthCookieName()],
    authConfig.cookieSecret
  );

  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  if (error) {
    const redirectTo = oauthState?.redirectTo ?? "/";
    return redirect(appendAuthError(redirectTo, error), {
      headers: buildCallbackCookieHeaders(request, null, null)
    });
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  if (!oauthState || !code || !returnedState || returnedState !== oauthState.state) {
    const redirectTo = oauthState?.redirectTo ?? "/";
    return redirect(appendAuthError(redirectTo, "state_mismatch"), {
      headers: buildCallbackCookieHeaders(request, null, null)
    });
  }

  try {
    const tokenPayload = await exchangeMicrosoftCode(request, env, code, oauthState.codeVerifier);
    const claims = await verifyMicrosoftIdToken(tokenPayload.id_token, env, oauthState.nonce);
    const authUser = await upsertMicrosoftUser(db, claims);
    const session = await createSession(
      db,
      authUser.userId,
      {
        ip: request.headers.get("CF-Connecting-IP"),
        userAgent: request.headers.get("user-agent")
      },
      authConfig.sessionTtlDays
    );

    const redirectTo = new URL(oauthState.redirectTo, "https://moq.local");
    if (authUser.isNewUser) {
      redirectTo.searchParams.set("auth_new_user", "1");
      redirectTo.searchParams.set("oauth_display_name", authUser.oauthDisplayName || "");
    }

    return redirect(`${redirectTo.pathname}${redirectTo.search}${redirectTo.hash}`, {
      headers: buildCallbackCookieHeaders(request, session.token, session.expiresAt)
    });
  } catch (callbackError) {
    const redirectTo = oauthState.redirectTo ?? "/";
    const errorCode = errorDescription || (callbackError instanceof Error ? callbackError.message : "login_failed");
    return redirect(appendAuthError(redirectTo, slugifyError(errorCode)), {
      headers: buildCallbackCookieHeaders(request, null, null)
    });
  }
}

async function handleLogout(env, request) {
  const db = getDb(env);
  const cookies = parseCookies(request);
  await revokeSession(db, cookies[getSessionCookieName()]);

  return json(
    {
      ok: true
    },
    {
      headers: {
        "set-cookie": createDeleteCookie(getSessionCookieName(), shouldUseSecureCookies(request))
      }
    }
  );
}

function buildOAuthCookie(cookieValue, secure) {
  return [
    `${getMicrosoftOAuthCookieName()}=${cookieValue}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600"
  ].concat(secure ? ["Secure"] : []).join("; ");
}

function buildCallbackCookieHeaders(request, sessionToken, sessionExpiresAt) {
  const secure = shouldUseSecureCookies(request);
  const headers = new Headers();
  headers.append("set-cookie", createDeleteCookie(getMicrosoftOAuthCookieName(), secure));
  if (sessionToken && sessionExpiresAt) {
    headers.append("set-cookie", buildSessionCookie(sessionToken, sessionExpiresAt, secure));
  }
  return headers;
}

function slugifyError(message) {
  return String(message).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "login_failed";
}

async function handleChatWebSocket(env, request) {
  if (!env.CHAT_ROOM) {
    return json({ ok: false, error: "Missing CHAT_ROOM durable object binding" }, { status: 500 });
  }

  const url = new URL(request.url);
  const room = decodeURIComponent(url.pathname.split("/")[3] ?? "").trim();
  const requestedBroadcaster = url.searchParams.get("role") === "broadcaster";
  if (!/^[a-z0-9-]{3,80}$/i.test(room)) {
    return json({ ok: false, error: "Invalid room id" }, { status: 400 });
  }

  const session = await getOptionalSessionUser(env, request);
  const isRoomOwner = session?.user?.id
    ? await isChatRoomOwner(env, room, session.user.id)
    : false;
  const role = requestedBroadcaster && isRoomOwner ? "broadcaster" : "viewer";
  const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(room));
  const headers = new Headers(request.headers);
  headers.set("x-chat-room", room);
  headers.set("x-chat-role", role);
  headers.set("x-chat-room-owner", isRoomOwner ? "1" : "0");
  headers.set("x-chat-read-only", session?.user ? "0" : "1");
  if (session?.user) {
    headers.set("x-chat-user", encodeURIComponent(JSON.stringify(session.user)));
  } else {
    headers.delete("x-chat-user");
  }

  return stub.fetch(new Request(request.url, {
    method: "GET",
    headers
  }));
}

async function getOptionalSessionUser(env, request) {
  try {
    if (!env.APP_DB) {
      return null;
    }
    return await getSessionUser(getDb(env), request);
  } catch {
    return null;
  }
}

async function isChatRoomOwner(env, roomId, userId) {
  if (!env.APP_DB || !roomId || !userId) {
    return false;
  }

  const db = getDb(env);
  const row = await db.prepare(
    `SELECT 1
     FROM moq_rooms
     WHERE id = ? AND host_user_id = ?
     LIMIT 1`
  ).bind(roomId, userId).first();

  return Boolean(row);
}
