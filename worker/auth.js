const textEncoder = new TextEncoder();

const SESSION_COOKIE_NAME = "moq_session";
const MICROSOFT_OAUTH_COOKIE_NAME = "moq_oauth_microsoft";
const DEFAULT_SESSION_TTL_DAYS = 30;
const MICROSOFT_OPENID_CONFIG_URL = "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration";
const NICKNAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const HANDLE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_NICKNAME_LENGTH = 2;
const MAX_NICKNAME_LENGTH = 32;
const MIN_HANDLE_LENGTH = 6;
const MAX_HANDLE_LENGTH = 24;
const DEFAULT_HANDLE_PREFIX = "pid_";
const DEFAULT_HANDLE_SUFFIX_LENGTH = 8;
const HANDLE_PATTERN = /^(?!\d+$)[a-z0-9](?:[a-z0-9_]{4,22}[a-z0-9])?$/;
const DEFAULT_HANDLE_PATTERN = /^pid_[a-z0-9]{8}$/;
const HANDLE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const TABLES = {
  users: "moq_users",
  rooms: "moq_rooms",
  userIdentities: "moq_user_identities",
  sessions: "moq_sessions"
};

let openIdConfigCache = null;
let jwksCache = null;

export function json(data, init = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "no-store");
  }
  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

export function redirect(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("location", url);
  if (!headers.has("cache-control")) {
    headers.set("cache-control", "no-store");
  }
  return new Response(null, {
    ...init,
    status: init.status ?? 302,
    headers
  });
}

export function getDb(env) {
  const db = env.APP_DB;
  if (!db) {
    throw new Error("Missing D1 binding. Set APP_DB.");
  }
  return db;
}

export function getAuthConfig(env) {
  const clientId = env.MICROSOFT_CLIENT_ID;
  const clientSecret = env.MICROSOFT_CLIENT_SECRET;
  const cookieSecret = env.AUTH_COOKIE_SECRET;

  if (!clientId || !clientSecret || !cookieSecret) {
    throw new Error("Missing auth configuration. Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and AUTH_COOKIE_SECRET.");
  }

  return {
    clientId,
    clientSecret,
    cookieSecret,
    sessionTtlDays: Number.parseInt(env.AUTH_SESSION_TTL_DAYS ?? `${DEFAULT_SESSION_TTL_DAYS}`, 10) || DEFAULT_SESSION_TTL_DAYS
  };
}

export function getMicrosoftCallbackUrl(request) {
  const url = new URL(request.url);
  return `${url.origin}/api/auth/microsoft/callback`;
}

export function getMicrosoftLoginUrl(request) {
  const url = new URL(request.url);
  return `${url.origin}/api/auth/microsoft/start`;
}

export function sanitizeRedirectTo(value) {
  if (!value || typeof value !== "string") {
    return "/";
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export function parseCookies(request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return {};
  }

  const cookies = {};
  for (const chunk of cookieHeader.split(/;\s*/)) {
    const separatorIndex = chunk.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const name = chunk.slice(0, separatorIndex).trim();
    const value = chunk.slice(separatorIndex + 1).trim();
    cookies[name] = value;
  }
  return cookies;
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  return parts.join("; ");
}

export function createDeleteCookie(name, secure = true) {
  return serializeCookie(name, "", {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
    maxAge: 0,
    expires: new Date(0)
  });
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function getMicrosoftOAuthCookieName() {
  return MICROSOFT_OAUTH_COOKIE_NAME;
}

export function appendAuthError(redirectTo, errorCode) {
  const base = sanitizeRedirectTo(redirectTo);
  const url = new URL(base, "https://moq.local");
  url.searchParams.set("auth_error", errorCode);
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function createMicrosoftOAuthState(secret, redirectTo) {
  const payload = {
    state: randomToken(18),
    nonce: randomToken(18),
    codeVerifier: randomToken(48),
    redirectTo: sanitizeRedirectTo(redirectTo),
    expiresAt: Date.now() + 10 * 60 * 1000
  };

  return {
    payload,
    cookieValue: await signPayload(payload, secret)
  };
}

export async function readMicrosoftOAuthState(cookieValue, secret) {
  if (!cookieValue) {
    return null;
  }
  const payload = await verifySignedPayload(cookieValue, secret);
  if (!payload || typeof payload !== "object") {
    return null;
  }
  if (typeof payload.expiresAt !== "number" || payload.expiresAt < Date.now()) {
    return null;
  }
  return payload;
}

export async function createSession(db, userId, metadata, sessionTtlDays) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + sessionTtlDays * 24 * 60 * 60 * 1000).toISOString();

  await db.prepare(
    `INSERT INTO ${TABLES.sessions} (
      id,
      user_id,
      session_token_hash,
      expires_at,
      created_at,
      last_seen_at,
      ip,
      user_agent,
      revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).bind(
    id,
    userId,
    tokenHash,
    expiresAt,
    createdAt,
    createdAt,
    metadata.ip ?? null,
    metadata.userAgent ?? null
  ).run();

  return {
    token,
    expiresAt
  };
}

export async function revokeSession(db, sessionToken) {
  if (!sessionToken) {
    return;
  }

  const sessionTokenHash = await sha256Hex(sessionToken);
  await db.prepare(
    `UPDATE ${TABLES.sessions}
     SET revoked_at = ?, last_seen_at = ?
     WHERE session_token_hash = ? AND revoked_at IS NULL`
  ).bind(
    new Date().toISOString(),
    new Date().toISOString(),
    sessionTokenHash
  ).run();
}

export async function getSessionUser(db, request) {
  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) {
    return null;
  }

  const sessionTokenHash = await sha256Hex(sessionToken);
  const now = new Date().toISOString();
  const row = await db.prepare(
    `SELECT
      sessions.id AS session_id,
      sessions.user_id AS user_id,
      users.handle AS handle,
      users.handle_changed_at AS handle_changed_at,
      users.display_name AS display_name,
      users.display_name_changed_at AS display_name_changed_at,
      sessions.expires_at AS session_expires_at,
      users.primary_email AS primary_email,
      users.avatar_url AS avatar_url
    FROM ${TABLES.sessions} AS sessions
    INNER JOIN ${TABLES.users} AS users ON users.id = sessions.user_id
    WHERE sessions.session_token_hash = ?
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > ?
    LIMIT 1`
  ).bind(sessionTokenHash, now).first();

  if (!row) {
    return null;
  }

  const handle = await ensureUserHandle(db, row.user_id, row.handle);
  await ensureUserRoom(db, row.user_id);
  await db.prepare(`UPDATE ${TABLES.sessions} SET last_seen_at = ? WHERE id = ?`).bind(now, row.session_id).run();

  return {
    token: sessionToken,
    user: buildUserPayload({
      ...row,
      handle
    })
  };
}

export async function exchangeMicrosoftCode(request, env, code, codeVerifier) {
  const authConfig = getAuthConfig(env);
  const openIdConfig = await getMicrosoftOpenIdConfig();
  const form = new URLSearchParams();
  form.set("client_id", authConfig.clientId);
  form.set("client_secret", authConfig.clientSecret);
  form.set("grant_type", "authorization_code");
  form.set("code", code);
  form.set("redirect_uri", getMicrosoftCallbackUrl(request));
  form.set("code_verifier", codeVerifier);

  const response = await fetch(openIdConfig.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Microsoft token exchange failed");
  }

  if (!payload.id_token) {
    throw new Error("Microsoft token response did not include id_token");
  }

  return payload;
}

export async function verifyMicrosoftIdToken(idToken, env, expectedNonce) {
  const authConfig = getAuthConfig(env);
  const [rawHeader, rawPayload, rawSignature] = idToken.split(".");
  if (!rawHeader || !rawPayload || !rawSignature) {
    throw new Error("Invalid id_token format");
  }

  const header = decodeJsonSegment(rawHeader);
  const payload = decodeJsonSegment(rawPayload);
  const signature = base64UrlToUint8Array(rawSignature);
  const signedContent = textEncoder.encode(`${rawHeader}.${rawPayload}`);

  if (header.alg !== "RS256") {
    throw new Error(`Unsupported Microsoft token alg: ${header.alg}`);
  }

  const jwk = await getMicrosoftJwk(header.kid);
  if (!jwk) {
    throw new Error("Unable to find matching Microsoft signing key");
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["verify"]
  );

  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    signedContent
  );

  if (!verified) {
    throw new Error("Microsoft id_token signature verification failed");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
    throw new Error("Microsoft id_token is expired");
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds + 60) {
    throw new Error("Microsoft id_token is not yet valid");
  }

  const audience = payload.aud;
  const audienceMatches = Array.isArray(audience)
    ? audience.includes(authConfig.clientId)
    : audience === authConfig.clientId;
  if (!audienceMatches) {
    throw new Error("Microsoft id_token audience mismatch");
  }

  if (payload.nonce !== expectedNonce) {
    throw new Error("Microsoft id_token nonce mismatch");
  }

  if (!isValidMicrosoftIssuer(payload.iss)) {
    throw new Error("Microsoft id_token issuer mismatch");
  }

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Microsoft id_token missing subject");
  }

  return payload;
}

export async function upsertMicrosoftUser(db, claims) {
  const now = new Date().toISOString();
  const displayName = claims.name || claims.preferred_username || claims.email || claims.sub;
  const email = claims.email || claims.preferred_username || null;
  const profile = JSON.stringify({
    sub: claims.sub,
    oid: claims.oid ?? null,
    tid: claims.tid ?? null,
    preferred_username: claims.preferred_username ?? null,
    email
  });

  const existingIdentity = await db.prepare(
    `SELECT user_id
     FROM ${TABLES.userIdentities}
     WHERE provider = ? AND provider_subject = ?
     LIMIT 1`
  ).bind("microsoft", claims.sub).first();

  if (existingIdentity) {
    await db.batch([
      db.prepare(
        `UPDATE ${TABLES.users}
         SET primary_email = ?, updated_at = ?, last_login_at = ?
         WHERE id = ?`
      ).bind(email, now, now, existingIdentity.user_id),
      db.prepare(
        `UPDATE ${TABLES.userIdentities}
         SET tenant_id = ?, provider_oid = ?, email = ?, raw_profile_json = ?, updated_at = ?
         WHERE provider = ? AND provider_subject = ?`
      ).bind(claims.tid ?? null, claims.oid ?? null, email, profile, now, "microsoft", claims.sub)
    ]);

    await ensureUserHandle(db, existingIdentity.user_id);
    await ensureUserRoom(db, existingIdentity.user_id);
    return existingIdentity.user_id;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userId = crypto.randomUUID();
    const identityId = crypto.randomUUID();
    const handle = await generateAvailableDefaultHandle(db);

    try {
      await db.batch([
        db.prepare(
          `INSERT INTO ${TABLES.users} (
            id,
            handle,
            handle_changed_at,
            display_name,
            display_name_changed_at,
            avatar_url,
            primary_email,
            created_at,
            updated_at,
            last_login_at
          ) VALUES (?, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?)`
        ).bind(userId, handle, displayName, email, now, now, now),
        db.prepare(
          `INSERT INTO ${TABLES.rooms} (
            id,
            host_user_id,
            title,
            cover_url,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(),
          userId,
          "",
          "",
          now,
          now
        ),
        db.prepare(
          `INSERT INTO ${TABLES.userIdentities} (
            id,
            user_id,
            provider,
            provider_subject,
            tenant_id,
            provider_oid,
            email,
            raw_profile_json,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          identityId,
          userId,
          "microsoft",
          claims.sub,
          claims.tid ?? null,
          claims.oid ?? null,
          email,
          profile,
          now,
          now
        )
      ]);

      return userId;
    } catch (error) {
      if (String(error?.message || error).toLowerCase().includes("handle")) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Failed to allocate unique handle");
}

export async function updateUserProfile(db, userId, nextProfile = {}) {
  const currentUser = await getUserRowById(db, userId);

  if (!currentUser) {
    throw createHttpError(404, "User not found", "user_not_found");
  }

  const hasDisplayNameUpdate = Object.hasOwn(nextProfile, "displayName");
  const hasHandleUpdate = Object.hasOwn(nextProfile, "handle");

  if (!hasDisplayNameUpdate && !hasHandleUpdate) {
    throw createHttpError(400, "No profile fields provided", "invalid_profile_update");
  }

  let nextDisplayName = currentUser.display_name;
  let nextDisplayNameChangedAt = currentUser.display_name_changed_at;
  let nextHandle = currentUser.handle;
  let nextHandleChangedAt = currentUser.handle_changed_at;
  let changed = false;

  if (hasDisplayNameUpdate) {
    const displayName = sanitizeDisplayName(nextProfile.displayName);
    const normalizedCurrentDisplayName = normalizeDisplayName(currentUser.display_name || "");
    if (normalizedCurrentDisplayName !== displayName.normalized) {
      const nextChangeAt = getDisplayNameNextChangeAt(currentUser.display_name_changed_at);
      if (nextChangeAt && Date.parse(nextChangeAt) > Date.now()) {
        throw createHttpError(
          429,
          "显示名 7 天内只能修改一次",
          "display_name_change_cooldown",
          { nextDisplayNameChangeAt: nextChangeAt }
        );
      }

      const existingUser = await db.prepare(
        `SELECT id
         FROM ${TABLES.users}
         WHERE id <> ?
           AND display_name IS NOT NULL
           AND lower(trim(display_name)) = ?
         LIMIT 1`
      ).bind(userId, displayName.normalized).first();

      if (existingUser) {
        throw createHttpError(409, "显示名已被占用", "display_name_taken");
      }

      nextDisplayName = displayName.value;
      nextDisplayNameChangedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (hasHandleUpdate) {
    const handle = sanitizeHandle(nextProfile.handle);
    if ((currentUser.handle || "") !== handle) {
      if (!isDefaultGeneratedHandle(currentUser.handle)) {
        const nextHandleChangeAt = getHandleNextChangeAt(currentUser.handle_changed_at);
        if (nextHandleChangeAt && Date.parse(nextHandleChangeAt) > Date.now()) {
          throw createHttpError(
            429,
            "自定义 Handle 30 天内只能修改一次",
            "handle_change_cooldown",
            { nextHandleChangeAt }
          );
        }
      }

      const existingUser = await db.prepare(
        `SELECT id
         FROM ${TABLES.users}
         WHERE id <> ?
           AND handle = ?
         LIMIT 1`
      ).bind(userId, handle).first();

      if (existingUser) {
        throw createHttpError(409, "Handle 已被占用", "handle_taken");
      }

      nextHandle = handle;
      nextHandleChangedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (!changed) {
    return buildUserPayload(currentUser);
  }

  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE ${TABLES.users}
     SET handle = ?, handle_changed_at = ?, display_name = ?, display_name_changed_at = ?, updated_at = ?
     WHERE id = ?`
  ).bind(nextHandle, nextHandleChangedAt, nextDisplayName, nextDisplayNameChangedAt, now, userId).run();

  const updatedUser = await getUserRowById(db, userId);
  if (!updatedUser) {
    throw createHttpError(404, "User not found", "user_not_found");
  }

  return buildUserPayload(updatedUser);
}

export function buildSessionCookie(token, expiresAt, secure = true) {
  const expires = new Date(expiresAt);
  const maxAge = Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000));
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
    expires,
    maxAge
  });
}

export function shouldUseSecureCookies(request) {
  const url = new URL(request.url);
  return url.protocol === "https:";
}

function randomToken(bytes) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return uint8ArrayToBase64Url(value);
}

function buildUserPayload(row) {
  const effectiveDisplayName = row.display_name || row.primary_email || "匿名用户";
  return {
    id: row.user_id,
    handle: row.handle || "",
    handleChangedAt: row.handle_changed_at,
    nextHandleChangeAt: getHandleNextChangeAt(row.handle_changed_at),
    displayName: effectiveDisplayName,
    displayNameChangedAt: row.display_name_changed_at,
    nextDisplayNameChangeAt: getDisplayNameNextChangeAt(row.display_name_changed_at),
    email: row.primary_email,
    avatarUrl: row.avatar_url
  };
}

async function getUserRowById(db, userId) {
  return db.prepare(
    `SELECT
      id AS user_id,
      handle,
      handle_changed_at,
      display_name,
      display_name_changed_at,
      primary_email,
      avatar_url
     FROM ${TABLES.users}
     WHERE id = ?
     LIMIT 1`
  ).bind(userId).first();
}

function sanitizeDisplayName(value) {
  if (typeof value !== "string") {
    throw createHttpError(400, "显示名不能为空", "invalid_display_name");
  }

  const displayName = value.trim().replace(/\s+/g, " ");
  const length = Array.from(displayName).length;
  if (!displayName) {
    throw createHttpError(400, "显示名不能为空", "invalid_display_name");
  }
  if (length < MIN_NICKNAME_LENGTH || length > MAX_NICKNAME_LENGTH) {
    throw createHttpError(400, `显示名长度需在 ${MIN_NICKNAME_LENGTH}-${MAX_NICKNAME_LENGTH} 个字符之间`, "invalid_display_name");
  }

  return {
    value: displayName,
    normalized: normalizeDisplayName(displayName)
  };
}

function sanitizeHandle(value) {
  if (typeof value !== "string") {
    throw createHttpError(400, "Handle 不能为空", "invalid_handle");
  }

  const handle = value.trim();
  if (!HANDLE_PATTERN.test(handle)) {
    throw createHttpError(
      400,
      `Handle 只能包含小写字母、数字、下划线，长度需在 ${MIN_HANDLE_LENGTH}-${MAX_HANDLE_LENGTH} 个字符之间，不能为纯数字，且不能以下划线开头或结尾`,
      "invalid_handle"
    );
  }

  return handle;
}

function isDefaultGeneratedHandle(value) {
  return typeof value === "string" && DEFAULT_HANDLE_PATTERN.test(value);
}

function normalizeDisplayName(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

async function ensureUserHandle(db, userId, currentHandle = undefined) {
  if (currentHandle) {
    return currentHandle;
  }

  if (currentHandle === undefined) {
    const row = await db.prepare(
      `SELECT handle
       FROM ${TABLES.users}
       WHERE id = ?
       LIMIT 1`
    ).bind(userId).first();
    if (row?.handle) {
      return row.handle;
    }
  }

  const handle = await generateAvailableDefaultHandle(db);
  await db.prepare(
    `UPDATE ${TABLES.users}
     SET handle = ?, updated_at = ?
     WHERE id = ? AND (handle IS NULL OR handle = '')`
  ).bind(handle, new Date().toISOString(), userId).run();

  const updatedRow = await db.prepare(
    `SELECT handle
     FROM ${TABLES.users}
     WHERE id = ?
     LIMIT 1`
  ).bind(userId).first();

  if (!updatedRow?.handle) {
    throw new Error("Failed to persist user handle");
  }

  return updatedRow.handle;
}

function getHandleNextChangeAt(changedAt) {
  if (!changedAt) {
    return null;
  }

  const changedAtMs = Date.parse(changedAt);
  if (!Number.isFinite(changedAtMs)) {
    return null;
  }

  return new Date(changedAtMs + HANDLE_CHANGE_COOLDOWN_MS).toISOString();
}

async function generateAvailableDefaultHandle(db) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const handle = `${DEFAULT_HANDLE_PREFIX}${randomHandleSuffix(DEFAULT_HANDLE_SUFFIX_LENGTH)}`;
    const existingUser = await db.prepare(
      `SELECT id
       FROM ${TABLES.users}
       WHERE handle = ?
       LIMIT 1`
    ).bind(handle).first();
    if (!existingUser) {
      return handle;
    }
  }

  throw new Error("Failed to generate unique handle");
}

function randomHandleSuffix(length) {
  let result = "";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  for (const value of values) {
    result += HANDLE_ALPHABET[value % HANDLE_ALPHABET.length];
  }
  return result;
}

async function ensureUserRoom(db, userId) {
  const existingRoom = await db.prepare(
    `SELECT id
     FROM ${TABLES.rooms}
     WHERE host_user_id = ?
     LIMIT 1`
  ).bind(userId).first();

  if (existingRoom?.id) {
    return existingRoom.id;
  }

  const now = new Date().toISOString();
  const roomId = crypto.randomUUID();
  await db.prepare(
    `INSERT OR IGNORE INTO ${TABLES.rooms} (
      id,
      host_user_id,
      title,
      cover_url,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(roomId, userId, "", "", now, now).run();

  const room = await db.prepare(
    `SELECT id
     FROM ${TABLES.rooms}
     WHERE host_user_id = ?
     LIMIT 1`
  ).bind(userId).first();

  if (!room?.id) {
    throw new Error("Failed to ensure user room");
  }

  return room.id;
}

export { ensureUserRoom };

function getDisplayNameNextChangeAt(changedAt) {
  if (!changedAt) {
    return null;
  }

  const changedAtMs = Date.parse(changedAt);
  if (!Number.isFinite(changedAtMs)) {
    return null;
  }

  return new Date(changedAtMs + NICKNAME_CHANGE_COOLDOWN_MS).toISOString();
}

function createHttpError(status, message, code, details = undefined) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(input));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256Base64Url(input) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(input));
  return uint8ArrayToBase64Url(new Uint8Array(digest));
}

async function signPayload(payload, secret) {
  const body = uint8ArrayToBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signature = await hmacSha256Base64Url(secret, body);
  return `${body}.${signature}`;
}

async function verifySignedPayload(value, secret) {
  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex < 0) {
    return null;
  }
  const body = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expectedSignature = await hmacSha256Base64Url(secret, body);
  if (signature !== expectedSignature) {
    return null;
  }
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(body)));
  } catch {
    return null;
  }
}

async function hmacSha256Base64Url(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return uint8ArrayToBase64Url(new Uint8Array(signature));
}

function decodeJsonSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(segment)));
}

function base64UrlToUint8Array(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
  const binary = atob(padded);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

function uint8ArrayToBase64Url(value) {
  let binary = "";
  for (const item of value) {
    binary += String.fromCharCode(item);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getMicrosoftOpenIdConfig() {
  if (openIdConfigCache && openIdConfigCache.expiresAt > Date.now()) {
    return openIdConfigCache.value;
  }

  const response = await fetch(MICROSOFT_OPENID_CONFIG_URL, {
    headers: {
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error("Failed to load Microsoft OpenID configuration");
  }

  const value = await response.json();
  openIdConfigCache = {
    value,
    expiresAt: Date.now() + 60 * 60 * 1000
  };
  return value;
}

async function getMicrosoftJwk(keyId) {
  if (!jwksCache || jwksCache.expiresAt <= Date.now()) {
    const openIdConfig = await getMicrosoftOpenIdConfig();
    const response = await fetch(openIdConfig.jwks_uri, {
      headers: {
        accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error("Failed to load Microsoft signing keys");
    }
    const payload = await response.json();
    jwksCache = {
      keys: payload.keys ?? [],
      expiresAt: Date.now() + 60 * 60 * 1000
    };
  }

  return jwksCache.keys.find((entry) => entry.kid === keyId) ?? null;
}

function isValidMicrosoftIssuer(issuer) {
  if (typeof issuer !== "string") {
    return false;
  }

  try {
    const url = new URL(issuer);
    return url.hostname === "login.microsoftonline.com" && url.pathname.endsWith("/v2.0");
  } catch {
    return false;
  }
}

export async function buildMicrosoftAuthorizationUrl(request, env, statePayload) {
  const authConfig = getAuthConfig(env);
  const openIdConfig = await getMicrosoftOpenIdConfig();
  const url = new URL(openIdConfig.authorization_endpoint);
  url.searchParams.set("client_id", authConfig.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getMicrosoftCallbackUrl(request));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", statePayload.state);
  url.searchParams.set("nonce", statePayload.nonce);
  url.searchParams.set("code_challenge", await sha256Base64Url(statePayload.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}
