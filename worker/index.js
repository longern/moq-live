import {
  appendAuthError,
  buildMicrosoftAuthorizationUrl,
  buildSessionCookie,
  createDeleteCookie,
  createMicrosoftOAuthState,
  createSession,
  exchangeMicrosoftCode,
  getAuthConfig,
  getDb,
  getMicrosoftLoginUrl,
  getMicrosoftOAuthCookieName,
  getSessionCookieName,
  ensureUserRoom,
  getSessionUser,
  json,
  parseCookies,
  readMicrosoftOAuthState,
  redirect,
  revokeSession,
  sanitizeRedirectTo,
  shouldUseSecureCookies,
  updateUserProfile,
  upsertMicrosoftUser,
  verifyMicrosoftIdToken
} from "./auth.js";
import { ChatRoomDO } from "./chat-room.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
      if (url.pathname === "/api/rooms" && request.method === "GET") {
        return await handleRooms(env);
      }
      if (url.pathname === "/api/rooms/resolve" && request.method === "GET") {
        return await handleRoomResolve(env, request);
      }
      if (url.pathname === "/api/me/profile" && request.method === "POST") {
        return await handleProfileUpdate(env, request);
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

  const roomId = await ensureUserRoom(db, session.user.id);
  return json({
    ok: true,
    room: {
      id: roomId
    }
  });
}

async function handleRooms(env) {
  const db = getDb(env);
  const result = await db.prepare(
    `SELECT
      rooms.id AS room_id,
      rooms.title AS room_title,
      rooms.cover_url AS room_cover_url,
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
      users.handle AS host_handle,
      users.display_name AS host_display_name,
      users.primary_email AS host_email
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
      host: {
        handle: row.host_handle || "",
        displayName: row.host_display_name || "",
        email: row.host_email || ""
      }
    }
  });
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
  const role = url.searchParams.get("role") === "broadcaster" ? "broadcaster" : "viewer";
  if (!/^[a-z0-9-]{3,80}$/i.test(room)) {
    return json({ ok: false, error: "Invalid room id" }, { status: 400 });
  }

  const session = await getOptionalSessionUser(env, request);
  const stub = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(room));
  const headers = new Headers(request.headers);
  headers.set("x-chat-room", room);
  headers.set("x-chat-role", role);
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
