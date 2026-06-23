const textEncoder = new TextEncoder();

const SESSION_COOKIE_NAME = "moq_session";
const NICKNAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const HANDLE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_NICKNAME_LENGTH = 2;
const MAX_NICKNAME_LENGTH = 32;
const DEFAULT_HANDLE_PREFIX = "pid_";
const DEFAULT_HANDLE_SUFFIX_LENGTH = 8;
const HANDLE_PATTERN = /^(?!\d+$)[a-z0-9](?:[a-z0-9_]{4,22}[a-z0-9])?$/;
const DEFAULT_HANDLE_PATTERN = /^pid_[a-z0-9]{8}$/;
const HANDLE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const MAX_ROOM_COVER_BYTES = 5 * 1024 * 1024;
const MAX_ROOM_TITLE_LENGTH = 80;
const MAX_ROOM_WELCOME_MESSAGE_LENGTH = 160;
const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";
const MAX_BIO_LENGTH = 160;
const MAX_PROFILE_AGE = 130;
const ROOM_COVER_TYPES = {
  "image/avif": "avif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const USER_AVATAR_TYPES = ROOM_COVER_TYPES;
const TABLES = {
  users: "moq_users",
  rooms: "moq_rooms",
  userIdentities: "moq_user_identities",
  sessions: "moq_sessions",
};

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
    headers,
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
    headers,
  });
}

export function getDb(env) {
  const db = env.APP_DB;
  if (!db) {
    throw new Error("Missing D1 binding. Set APP_DB.");
  }
  return db;
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
    expires: new Date(0),
  });
}

export function getSessionCookieName() {
  return SESSION_COOKIE_NAME;
}

export function appendAuthError(redirectTo, errorCode) {
  const base = sanitizeRedirectTo(redirectTo);
  const url = new URL(base, "https://moq.local");
  url.searchParams.set("auth_error", errorCode);
  return `${url.pathname}${url.search}${url.hash}`;
}

export async function createSession(db, userId, metadata, sessionTtlDays) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + sessionTtlDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  await db
    .prepare(
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      userId,
      tokenHash,
      expiresAt,
      createdAt,
      createdAt,
      metadata.ip ?? null,
      metadata.userAgent ?? null,
    )
    .run();

  return {
    token,
    expiresAt,
  };
}

export async function revokeSession(db, sessionToken) {
  if (!sessionToken) {
    return;
  }

  const sessionTokenHash = await sha256Hex(sessionToken);
  await db
    .prepare(
      `UPDATE ${TABLES.sessions}
     SET revoked_at = ?, last_seen_at = ?
     WHERE session_token_hash = ? AND revoked_at IS NULL`,
    )
    .bind(new Date().toISOString(), new Date().toISOString(), sessionTokenHash)
    .run();
}

export async function getSessionUser(db, request) {
  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  if (!sessionToken) {
    return null;
  }

  const sessionTokenHash = await sha256Hex(sessionToken);
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `SELECT
      sessions.id AS session_id,
      sessions.user_id AS user_id,
      users.handle AS handle,
      users.handle_changed_at AS handle_changed_at,
      users.display_name AS display_name,
      users.display_name_changed_at AS display_name_changed_at,
      sessions.expires_at AS session_expires_at,
      users.primary_email AS primary_email,
      users.avatar_url AS avatar_url,
      users.gender AS gender,
      users.birth_date AS birth_date,
      users.bio AS bio,
      users.last_location_province AS location_province,
      users.last_location_updated_at AS location_updated_at,
      users.follower_count AS follower_count,
      users.following_count AS following_count
    FROM ${TABLES.sessions} AS sessions
    INNER JOIN ${TABLES.users} AS users ON users.id = sessions.user_id
    WHERE sessions.session_token_hash = ?
      AND sessions.revoked_at IS NULL
      AND sessions.expires_at > ?
    LIMIT 1`,
    )
    .bind(sessionTokenHash, now)
    .first();

  if (!row) {
    return null;
  }

  const handle = await ensureUserHandle(db, row.user_id, row.handle);
  await db
    .prepare(`UPDATE ${TABLES.sessions} SET last_seen_at = ? WHERE id = ?`)
    .bind(now, row.session_id)
    .run();

  return {
    token: sessionToken,
    user: buildUserPayload({
      ...row,
      handle,
    }),
  };
}

export async function upsertOAuthUser(db, identity) {
  const provider = String(identity.provider || "").trim();
  const subject = String(identity.subject || "").trim();
  if (!provider || !subject) {
    throw new Error("OAuth identity missing provider or subject");
  }

  const now = new Date().toISOString();
  const displayName = String(identity.displayName || identity.email || subject).trim();
  const email = identity.email || null;
  const avatarUrl = identity.avatarUrl || null;
  const profile = JSON.stringify(identity.rawProfile ?? {});

  const existingIdentity = await db
    .prepare(
      `SELECT user_id
     FROM ${TABLES.userIdentities}
     WHERE provider = ? AND provider_subject = ?
     LIMIT 1`,
    )
    .bind(provider, subject)
    .first();

  if (existingIdentity) {
    await db.batch([
      db
        .prepare(
          `UPDATE ${TABLES.users}
         SET primary_email = ?, updated_at = ?, last_login_at = ?
         WHERE id = ?`,
        )
        .bind(email, now, now, existingIdentity.user_id),
      db
        .prepare(
          `UPDATE ${TABLES.userIdentities}
         SET tenant_id = ?, provider_oid = ?, email = ?, raw_profile_json = ?, updated_at = ?
         WHERE provider = ? AND provider_subject = ?`,
        )
        .bind(
          identity.tenantId ?? null,
          identity.providerOid ?? null,
          email,
          profile,
          now,
          provider,
          subject,
        ),
    ]);

    await ensureUserHandle(db, existingIdentity.user_id);
    return {
      userId: existingIdentity.user_id,
      isNewUser: false,
      oauthDisplayName: displayName,
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const userId = crypto.randomUUID();
    const identityId = crypto.randomUUID();
    const handle = await generateAvailableDefaultHandle(db);

    try {
      await db.batch([
        db
          .prepare(
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
          ) VALUES (?, ?, NULL, ?, NULL, ?, ?, ?, ?, ?)`,
          )
          .bind(userId, handle, displayName, avatarUrl, email, now, now, now),
        db
          .prepare(
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            identityId,
            userId,
            provider,
            subject,
            identity.tenantId ?? null,
            identity.providerOid ?? null,
            email,
            profile,
            now,
            now,
          ),
      ]);

      return {
        userId,
        isNewUser: true,
        oauthDisplayName: displayName,
      };
    } catch (error) {
      if (
        String(error?.message || error)
          .toLowerCase()
          .includes("handle")
      ) {
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
  const hasBioUpdate = Object.hasOwn(nextProfile, "bio");
  const hasGenderUpdate = Object.hasOwn(nextProfile, "gender");
  const hasBirthDateUpdate = Object.hasOwn(nextProfile, "birthDate");

  if (!hasDisplayNameUpdate && !hasHandleUpdate && !hasBioUpdate && !hasGenderUpdate && !hasBirthDateUpdate) {
    throw createHttpError(
      400,
      "No profile fields provided",
      "invalid_profile_update",
    );
  }

  let nextDisplayName = currentUser.display_name;
  let nextDisplayNameChangedAt = currentUser.display_name_changed_at;
  let nextHandle = currentUser.handle;
  let nextHandleChangedAt = currentUser.handle_changed_at;
  let nextBio = currentUser.bio || "";
  let nextGender = currentUser.gender || "";
  let nextBirthDate = currentUser.birth_date || "";
  let changed = false;

  if (hasDisplayNameUpdate) {
    const displayName = sanitizeDisplayName(nextProfile.displayName);
    const normalizedCurrentDisplayName = normalizeDisplayName(
      currentUser.display_name || "",
    );
    if (normalizedCurrentDisplayName !== displayName.normalized) {
      const nextChangeAt = getDisplayNameNextChangeAt(
        currentUser.display_name_changed_at,
      );
      if (nextChangeAt && Date.parse(nextChangeAt) > Date.now()) {
        throw createHttpError(
          429,
          "display_name_change_cooldown",
          "display_name_change_cooldown",
          { nextDisplayNameChangeAt: nextChangeAt },
        );
      }

      const existingUser = await db
        .prepare(
          `SELECT id
         FROM ${TABLES.users}
         WHERE id <> ?
           AND display_name IS NOT NULL
           AND lower(trim(display_name)) = ?
         LIMIT 1`,
        )
        .bind(userId, displayName.normalized)
        .first();

      if (existingUser) {
        throw createHttpError(409, "display_name_taken", "display_name_taken");
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
        const nextHandleChangeAt = getHandleNextChangeAt(
          currentUser.handle_changed_at,
        );
        if (nextHandleChangeAt && Date.parse(nextHandleChangeAt) > Date.now()) {
          throw createHttpError(
            429,
            "handle_change_cooldown",
            "handle_change_cooldown",
            { nextHandleChangeAt },
          );
        }
      }

      const existingUser = await db
        .prepare(
          `SELECT id
         FROM ${TABLES.users}
         WHERE id <> ?
           AND handle = ?
         LIMIT 1`,
        )
        .bind(userId, handle)
        .first();

      if (existingUser) {
        throw createHttpError(409, "handle_taken", "handle_taken");
      }

      nextHandle = handle;
      nextHandleChangedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (hasBioUpdate) {
    const bio = sanitizeBio(nextProfile.bio);
    if ((currentUser.bio || "") !== bio) {
      nextBio = bio;
      changed = true;
    }
  }

  if (hasBirthDateUpdate) {
    const birthDate = sanitizeBirthDate(nextProfile.birthDate);
    if ((currentUser.birth_date || "") !== birthDate) {
      nextBirthDate = birthDate;
      changed = true;
    }
  }

  if (hasGenderUpdate) {
    const gender = sanitizeGender(nextProfile.gender);
    if ((currentUser.gender || "") !== gender) {
      nextGender = gender;
      changed = true;
    }
  }

  if (!changed) {
    return buildUserPayload(currentUser);
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE ${TABLES.users}
     SET handle = ?, handle_changed_at = ?, display_name = ?, display_name_changed_at = ?, bio = ?, gender = ?, birth_date = ?, updated_at = ?
     WHERE id = ?`,
    )
    .bind(
      nextHandle,
      nextHandleChangedAt,
      nextDisplayName,
      nextDisplayNameChangedAt,
      nextBio,
      nextGender,
      nextBirthDate,
      now,
      userId,
    )
    .run();

  const updatedUser = await getUserRowById(db, userId);
  if (!updatedUser) {
    throw createHttpError(404, "User not found", "user_not_found");
  }

  return buildUserPayload(updatedUser);
}

export async function updateUserAvatar(env, db, request, userId) {
  const bucket = getMediaBucket(env);
  const currentUser = await getUserRowById(db, userId);

  if (!currentUser) {
    throw createHttpError(404, "User not found", "user_not_found");
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("avatar");

  if (!(file instanceof File)) {
    throw createHttpError(400, "missing_avatar_file", "missing_avatar_file");
  }

  const contentType = String(file.type || "").toLowerCase();
  const extension = USER_AVATAR_TYPES[contentType];
  if (!extension) {
    throw createHttpError(400, "invalid_avatar_type", "invalid_avatar_type");
  }

  if (!file.size) {
    throw createHttpError(400, "empty_avatar_file", "empty_avatar_file");
  }

  if (file.size > MAX_ROOM_COVER_BYTES) {
    throw createHttpError(
      413,
      "avatar_file_too_large",
      "avatar_file_too_large",
    );
  }

  const objectKey = buildUserAvatarObjectKey(userId, extension);
  const avatarUrl = buildUserAvatarUrl(request, objectKey);
  const previousObjectKey = getMediaObjectKeyFromUrl(
    currentUser.avatar_url,
    request.url,
    "/media/user-avatars/",
  );
  const body = await file.arrayBuffer();

  await bucket.put(objectKey, body, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      userId,
      uploadedBy: userId,
    },
  });

  try {
    await db
      .prepare(
        `UPDATE ${TABLES.users}
       SET avatar_url = ?, updated_at = ?
       WHERE id = ?`,
      )
      .bind(avatarUrl, new Date().toISOString(), userId)
      .run();
  } catch (error) {
    await bucket.delete(objectKey).catch(() => {});
    throw error;
  }

  if (previousObjectKey && previousObjectKey !== objectKey) {
    await bucket.delete(previousObjectKey).catch(() => {});
  }

  const updatedUser = await getUserRowById(db, userId);
  if (!updatedUser) {
    throw createHttpError(404, "User not found", "user_not_found");
  }

  return buildUserPayload(updatedUser);
}

export async function removeUserAvatar(env, db, userId) {
  const bucket = getMediaBucket(env);
  const currentUser = await getUserRowById(db, userId);

  if (!currentUser) {
    throw createHttpError(404, "User not found", "user_not_found");
  }

  const previousObjectKey = getMediaObjectKeyFromUrl(
    currentUser.avatar_url,
    "https://moq.local/",
    "/media/user-avatars/",
  );
  await db
    .prepare(
      `UPDATE ${TABLES.users}
     SET avatar_url = NULL, updated_at = ?
     WHERE id = ?`,
    )
    .bind(new Date().toISOString(), userId)
    .run();

  if (previousObjectKey) {
    await bucket.delete(previousObjectKey).catch(() => {});
  }

  const updatedUser = await getUserRowById(db, userId);
  if (!updatedUser) {
    throw createHttpError(404, "User not found", "user_not_found");
  }

  return buildUserPayload(updatedUser);
}

export function buildSessionCookie(token, expiresAt, secure = true) {
  const expires = new Date(expiresAt);
  const maxAge = Math.max(
    0,
    Math.floor((expires.getTime() - Date.now()) / 1000),
  );
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
    expires,
    maxAge,
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
  const effectiveDisplayName =
    row.display_name || row.primary_email || "匿名用户";
  return {
    id: row.user_id,
    handle: row.handle || "",
    handleChangedAt: row.handle_changed_at,
    nextHandleChangeAt: getHandleNextChangeAt(row.handle_changed_at),
    displayName: effectiveDisplayName,
    displayNameChangedAt: row.display_name_changed_at,
    nextDisplayNameChangeAt: getDisplayNameNextChangeAt(
      row.display_name_changed_at,
    ),
    email: row.primary_email,
    avatarUrl: row.avatar_url,
    gender: row.gender || "",
    birthDate: row.birth_date || "",
    bio: row.bio || "",
    locationProvince: row.location_province || "",
    lastLocationProvince: row.location_province || "",
    lastLocationUpdatedAt: row.location_updated_at || "",
    followerCount: Math.max(0, Number(row.follower_count || 0)),
    followingCount: Math.max(0, Number(row.following_count || 0)),
  };
}

async function getUserRowById(db, userId) {
  return db
    .prepare(
      `SELECT
      users.id AS user_id,
      users.handle AS handle,
      users.handle_changed_at AS handle_changed_at,
      users.display_name AS display_name,
      users.display_name_changed_at AS display_name_changed_at,
      users.primary_email AS primary_email,
      users.avatar_url AS avatar_url,
      users.gender AS gender,
      users.birth_date AS birth_date,
      users.bio AS bio,
      users.last_location_province AS location_province,
      users.last_location_updated_at AS location_updated_at,
      users.follower_count AS follower_count,
      users.following_count AS following_count
     FROM ${TABLES.users} AS users
     WHERE users.id = ?
     LIMIT 1`,
    )
    .bind(userId)
    .first();
}

async function getRoomRowByHostUserId(db, userId) {
  return db
    .prepare(
      `SELECT
      id,
      host_user_id,
      title,
      welcome_message,
      cover_url,
      cloudflare_live_input_identifier,
      web_rtc_publish_url,
      web_rtc_playback_url,
      created_at,
      updated_at
     FROM ${TABLES.rooms}
     WHERE host_user_id = ?
     LIMIT 1`,
    )
    .bind(userId)
    .first();
}

async function requireUserRoomRow(db, userId) {
  const room = await getRoomRowByHostUserId(db, userId);
  if (!room?.id) {
    throw createHttpError(404, "Room not found", "room_not_found");
  }
  return room;
}

function buildRoomPayload(row) {
  return {
    id: row.id,
    title: row.title || "",
    welcomeMessage: row.welcome_message || "",
    coverUrl: row.cover_url || "",
    cloudflareLiveIdentifier: row.cloudflare_live_input_identifier || "",
    webRtcPublishUrl: row.web_rtc_publish_url || "",
    webRtcPlaybackUrl: row.web_rtc_playback_url || "",
    updatedAt: row.updated_at || "",
  };
}

function sanitizeDisplayName(value) {
  if (typeof value !== "string") {
    throw createHttpError(400, "invalid_display_name", "invalid_display_name");
  }

  const displayName = value.trim().replace(/\s+/g, " ");
  const length = Array.from(displayName).length;
  if (!displayName) {
    throw createHttpError(400, "invalid_display_name", "invalid_display_name");
  }
  if (length < MIN_NICKNAME_LENGTH || length > MAX_NICKNAME_LENGTH) {
    throw createHttpError(400, "invalid_display_name", "invalid_display_name");
  }

  return {
    value: displayName,
    normalized: normalizeDisplayName(displayName),
  };
}

function sanitizeBio(value) {
  if (typeof value !== "string") {
    throw createHttpError(400, "invalid_bio", "invalid_bio");
  }

  const bio = value
    .trim()
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  if (Array.from(bio).length > MAX_BIO_LENGTH) {
    throw createHttpError(400, "invalid_bio", "invalid_bio");
  }

  return bio;
}

function sanitizeGender(value) {
  if (typeof value !== "string") {
    throw createHttpError(400, "invalid_gender", "invalid_gender");
  }

  const gender = value.trim().toLowerCase();
  if (!gender) {
    return "";
  }
  if (!["male", "female", "other"].includes(gender)) {
    throw createHttpError(400, "invalid_gender", "invalid_gender");
  }
  return gender;
}

function sanitizeBirthDate(value) {
  if (typeof value !== "string") {
    throw createHttpError(400, "invalid_birth_date", "invalid_birth_date");
  }

  const birthDate = value.trim();
  if (!birthDate) {
    return "";
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) {
    throw createHttpError(400, "invalid_birth_date", "invalid_birth_date");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    throw createHttpError(400, "invalid_birth_date", "invalid_birth_date");
  }

  const today = new Date();
  const minYear = today.getFullYear() - MAX_PROFILE_AGE;
  const minDate = new Date(minYear, today.getMonth(), today.getDate());
  if (date > today || date < minDate) {
    throw createHttpError(400, "invalid_birth_date", "invalid_birth_date");
  }

  return birthDate;
}

function sanitizeRoomTitle(value) {
  if (typeof value !== "string") {
    throw createHttpError(400, "invalid_room_title", "invalid_room_title");
  }

  const title = value.trim().replace(/\s+/g, " ");
  if (Array.from(title).length > MAX_ROOM_TITLE_LENGTH) {
    throw createHttpError(400, "invalid_room_title", "invalid_room_title");
  }

  return title;
}

function sanitizeRoomWelcomeMessage(value) {
  if (typeof value !== "string") {
    throw createHttpError(
      400,
      "invalid_room_welcome_message",
      "invalid_room_welcome_message",
    );
  }

  const welcomeMessage = value.trim().replace(/\s+/g, " ");
  if (Array.from(welcomeMessage).length > MAX_ROOM_WELCOME_MESSAGE_LENGTH) {
    throw createHttpError(
      400,
      "invalid_room_welcome_message",
      "invalid_room_welcome_message",
    );
  }

  return welcomeMessage;
}

function sanitizeHandle(value) {
  if (typeof value !== "string") {
    throw createHttpError(400, "invalid_handle", "invalid_handle");
  }

  const handle = value.trim();
  if (!HANDLE_PATTERN.test(handle)) {
    throw createHttpError(400, "invalid_handle", "invalid_handle");
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
    const row = await db
      .prepare(
        `SELECT handle
       FROM ${TABLES.users}
       WHERE id = ?
       LIMIT 1`,
      )
      .bind(userId)
      .first();
    if (row?.handle) {
      return row.handle;
    }
  }

  const handle = await generateAvailableDefaultHandle(db);
  await db
    .prepare(
      `UPDATE ${TABLES.users}
     SET handle = ?, updated_at = ?
     WHERE id = ? AND (handle IS NULL OR handle = '')`,
    )
    .bind(handle, new Date().toISOString(), userId)
    .run();

  const updatedRow = await db
    .prepare(
      `SELECT handle
     FROM ${TABLES.users}
     WHERE id = ?
     LIMIT 1`,
    )
    .bind(userId)
    .first();

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
    const existingUser = await db
      .prepare(
        `SELECT id
       FROM ${TABLES.users}
       WHERE handle = ?
       LIMIT 1`,
      )
      .bind(handle)
      .first();
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
  const existingRoom = await db
    .prepare(
      `SELECT id
     FROM ${TABLES.rooms}
     WHERE host_user_id = ?
     LIMIT 1`,
    )
    .bind(userId)
    .first();

  if (existingRoom?.id) {
    return existingRoom.id;
  }

  const now = new Date().toISOString();
  const roomId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT OR IGNORE INTO ${TABLES.rooms} (
      id,
      host_user_id,
      title,
      cover_url,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(roomId, userId, "", "", now, now)
    .run();

  const room = await db
    .prepare(
      `SELECT id
     FROM ${TABLES.rooms}
     WHERE host_user_id = ?
     LIMIT 1`,
    )
    .bind(userId)
    .first();

  if (!room?.id) {
    throw new Error("Failed to ensure user room");
  }

  return room.id;
}

export { ensureUserRoom };

function getCloudflareStreamConfig(env) {
  const apiToken = String(env?.CLOUDFLARE_API_TOKEN || "").trim();
  const accountId = String(env?.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (!apiToken || !accountId) {
    return null;
  }
  return { apiToken, accountId };
}

async function createCloudflareLiveInput(env, roomId, userId) {
  const config = getCloudflareStreamConfig(env);
  if (!config) {
    return null;
  }

  const response = await fetch(
    `${CLOUDFLARE_API_BASE_URL}/accounts/${encodeURIComponent(config.accountId)}/stream/live_inputs`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        enabled: true,
        meta: {
          roomId,
          userId,
        },
        recording: {
          mode: "off",
        },
      }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    const message =
      payload?.errors?.[0]?.message ||
      payload?.messages?.[0]?.message ||
      `Cloudflare Stream live input creation failed with ${response.status}`;
    throw new Error(message);
  }

  const result = payload?.result || {};
  const identifier = String(result.uid || result.id || "").trim();
  const publishUrl = String(result.webRTC?.url || "").trim();
  const playbackUrl = String(result.webRTCPlayback?.url || "").trim();
  if (!identifier || !publishUrl || !playbackUrl) {
    throw new Error(
      "Cloudflare Stream live input response missing WebRTC URLs",
    );
  }

  return {
    identifier,
    publishUrl,
    playbackUrl,
  };
}

async function ensureRoomCloudflareLiveInput(env, db, room) {
  if (!room?.id || room.cloudflare_live_input_identifier) {
    return;
  }

  let liveInput;
  try {
    liveInput = await createCloudflareLiveInput(
      env,
      room.id,
      room.host_user_id,
    );
  } catch (error) {
    console.warn(
      "Cloudflare Stream live input provisioning skipped:",
      error instanceof Error ? error.message : String(error),
    );
    return;
  }

  if (!liveInput) {
    return;
  }

  await db
    .prepare(
      `UPDATE ${TABLES.rooms}
       SET cloudflare_live_input_identifier = ?,
           web_rtc_publish_url = ?,
           web_rtc_playback_url = ?,
           updated_at = ?
       WHERE id = ?
         AND host_user_id = ?
         AND (cloudflare_live_input_identifier IS NULL OR cloudflare_live_input_identifier = '')`,
    )
    .bind(
      liveInput.identifier,
      liveInput.publishUrl,
      liveInput.playbackUrl,
      new Date().toISOString(),
      room.id,
      room.host_user_id,
    )
    .run();
}

export async function getUserRoom(db, userId) {
  const room = await requireUserRoomRow(db, userId);
  return buildRoomPayload(room);
}

export async function createUserRoom(env, db, userId) {
  const roomId = await ensureUserRoom(db, userId);
  let room = await getRoomRowByHostUserId(db, userId);
  if (!room?.id || room.id !== roomId) {
    throw new Error("Failed to create user room");
  }
  await ensureRoomCloudflareLiveInput(env, db, room);
  room = await getRoomRowByHostUserId(db, userId);
  return buildRoomPayload(room);
}

export async function updateUserRoomTitle(db, userId, rawTitle) {
  const currentRoom = await requireUserRoomRow(db, userId);
  const title = sanitizeRoomTitle(rawTitle);
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE ${TABLES.rooms}
       SET title = ?, updated_at = ?
       WHERE id = ? AND host_user_id = ?`,
    )
    .bind(title, now, currentRoom.id, userId)
    .run();

  return buildRoomPayload({
    ...currentRoom,
    title,
    updated_at: now,
  });
}

export async function updateUserRoomSettings(db, userId, payload = {}) {
  const currentRoom = await requireUserRoomRow(db, userId);
  const roomPatch = payload && typeof payload === "object" ? payload : {};
  const nextTitle = Object.hasOwn(roomPatch, "title")
    ? sanitizeRoomTitle(roomPatch.title)
    : currentRoom.title || "";
  const nextWelcomeMessage = Object.hasOwn(roomPatch, "welcomeMessage")
    ? sanitizeRoomWelcomeMessage(roomPatch.welcomeMessage)
    : currentRoom.welcome_message || "";
  const now = new Date().toISOString();

  await db
    .prepare(
      `UPDATE ${TABLES.rooms}
       SET title = ?, welcome_message = ?, updated_at = ?
       WHERE id = ? AND host_user_id = ?`,
    )
    .bind(nextTitle, nextWelcomeMessage, now, currentRoom.id, userId)
    .run();

  return buildRoomPayload({
    ...currentRoom,
    title: nextTitle,
    welcome_message: nextWelcomeMessage,
    updated_at: now,
  });
}

export async function updateUserRoomCover(env, db, request, userId) {
  const bucket = getMediaBucket(env);
  const currentRoom = await requireUserRoomRow(db, userId);
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("cover");

  if (!(file instanceof File)) {
    throw createHttpError(400, "missing_cover_file", "missing_cover_file");
  }

  const contentType = String(file.type || "").toLowerCase();
  const extension = ROOM_COVER_TYPES[contentType];
  if (!extension) {
    throw createHttpError(400, "invalid_cover_type", "invalid_cover_type");
  }

  if (!file.size) {
    throw createHttpError(400, "empty_cover_file", "empty_cover_file");
  }

  if (file.size > MAX_ROOM_COVER_BYTES) {
    throw createHttpError(413, "cover_file_too_large", "cover_file_too_large");
  }

  const objectKey = buildRoomCoverObjectKey(currentRoom.id, extension);
  const coverUrl = buildRoomCoverUrl(request, objectKey);
  const previousObjectKey = getMediaObjectKeyFromUrl(
    currentRoom.cover_url,
    request.url,
    "/media/room-covers/",
  );
  const body = await file.arrayBuffer();

  await bucket.put(objectKey, body, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: {
      roomId: currentRoom.id,
      uploadedBy: userId,
    },
  });

  try {
    await db
      .prepare(
        `UPDATE ${TABLES.rooms}
       SET cover_url = ?, updated_at = ?
       WHERE id = ?`,
      )
      .bind(coverUrl, new Date().toISOString(), currentRoom.id)
      .run();
  } catch (error) {
    await bucket.delete(objectKey).catch(() => {});
    throw error;
  }

  if (previousObjectKey && previousObjectKey !== objectKey) {
    await bucket.delete(previousObjectKey).catch(() => {});
  }

  const updatedRoom = await requireUserRoomRow(db, userId);
  return buildRoomPayload(updatedRoom);
}

export async function removeUserRoomCover(env, db, userId) {
  const bucket = getMediaBucket(env);
  const currentRoom = await requireUserRoomRow(db, userId);
  const previousObjectKey = getMediaObjectKeyFromUrl(
    currentRoom.cover_url,
    "https://moq.local/",
    "/media/room-covers/",
  );

  await db
    .prepare(
      `UPDATE ${TABLES.rooms}
     SET cover_url = '', updated_at = ?
     WHERE id = ?`,
    )
    .bind(new Date().toISOString(), currentRoom.id)
    .run();

  if (previousObjectKey) {
    await bucket.delete(previousObjectKey).catch(() => {});
  }

  const updatedRoom = await requireUserRoomRow(db, userId);
  return buildRoomPayload(updatedRoom);
}

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
  const error = new Error(code || message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
}

function getMediaBucket(env) {
  if (!env.APP_MEDIA) {
    throw createHttpError(
      500,
      "Missing APP_MEDIA binding",
      "missing_app_media_binding",
    );
  }

  return env.APP_MEDIA;
}

function buildRoomCoverObjectKey(roomId, extension) {
  return `rooms/${roomId}/cover/${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

function buildRoomCoverUrl(request, objectKey) {
  const url = new URL(request.url);
  return `${url.origin}/media/room-covers/${encodeURIComponent(objectKey)}`;
}

function buildUserAvatarObjectKey(userId, extension) {
  return `users/${userId}/avatar/${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

function buildUserAvatarUrl(request, objectKey) {
  const url = new URL(request.url);
  return `${url.origin}/media/user-avatars/${encodeURIComponent(objectKey)}`;
}

function getMediaObjectKeyFromUrl(mediaUrl, fallbackBase, prefix) {
  if (!mediaUrl) {
    return "";
  }

  try {
    const url = new URL(mediaUrl, fallbackBase);
    if (!url.pathname.startsWith(prefix)) {
      return "";
    }
    return decodeURIComponent(url.pathname.slice(prefix.length)).trim();
  } catch {
    return "";
  }
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function uint8ArrayToBase64Url(value) {
  let binary = "";
  for (const item of value) {
    binary += String.fromCharCode(item);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
