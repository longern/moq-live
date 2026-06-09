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
      if (/^\/api\/users\/[^/]+\/follow$/.test(url.pathname) && ["GET", "POST", "DELETE"].includes(request.method)) {
        return await handleUserFollow(env, request, ctx);
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
  const result = await db.prepare(
    `SELECT
      rooms.id AS room_id,
      rooms.title AS room_title,
      rooms.cover_url AS room_cover_url,
      rooms.welcome_message AS room_welcome_message,
      rooms.updated_at AS room_updated_at,
      users.handle AS host_handle,
      users.display_name AS host_display_name,
      users.primary_email AS host_email,
      users.avatar_url AS host_avatar_url
    FROM moq_rooms AS rooms
    INNER JOIN moq_users AS users
      ON users.id = rooms.host_user_id
    ORDER BY rooms.updated_at DESC, rooms.created_at DESC`
  ).all();

  const rows = Array.isArray(result?.results) ? result.results : [];

  return json({
    ok: true,
    rooms: rows.map((row) => ({
      id: row.room_id,
      title: row.room_title || "",
      welcomeMessage: row.room_welcome_message || "",
      coverUrl: row.room_cover_url || "",
      updatedAt: row.room_updated_at || "",
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
      users.id AS host_user_id,
      users.handle AS host_handle,
      users.display_name AS host_display_name,
      users.primary_email AS host_email,
      users.avatar_url AS host_avatar_url,
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
      host: {
        id: row.host_user_id || "",
        handle: row.host_handle || "",
        displayName: row.host_display_name || "",
        email: row.host_email || "",
        avatarUrl: normalizeMediaUrlForRequest(request, row.host_avatar_url || ""),
        followerCount: Math.max(0, Number(row.host_follower_count || 0)),
        followingCount: Math.max(0, Number(row.host_following_count || 0))
      }
    }
  });
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
      `SELECT 1
       FROM moq_user_follows
       WHERE follower_user_id = ? AND followed_user_id = ?
       LIMIT 1`
    ).bind(session.user.id, targetUserId).first();
    return json({
      ok: true,
      following: Boolean(row),
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
      followerCount,
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
    followerCount,
    followingCount: targetFollowingCount
  });
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
    ...(Object.hasOwn(payload, "handle") ? { handle: payload.handle } : {})
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
    const userId = await upsertMicrosoftUser(db, claims);
    const session = await createSession(
      db,
      userId,
      {
        ip: request.headers.get("CF-Connecting-IP"),
        userAgent: request.headers.get("user-agent")
      },
      authConfig.sessionTtlDays
    );

    return redirect(oauthState.redirectTo, {
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
