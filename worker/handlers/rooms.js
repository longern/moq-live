import {
  getDb,
  getSessionUser,
  json,
} from "../auth.js";
import {
  normalizeMediaUrlForRequest
} from "./shared.js";

export async function handleRooms(env) {
  const db = getDb(env);
  let result;
  try {
    result = await db
      .prepare(
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
        rooms.created_at DESC`,
      )
      .all();
  } catch (error) {
    console.warn(
      "Room last-started sort unavailable; falling back to room metadata order.",
      error instanceof Error ? error.message : String(error),
    );
    result = await db
      .prepare(
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
      ORDER BY rooms.updated_at DESC, rooms.created_at DESC`,
      )
      .all();
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
        avatarUrl: row.host_avatar_url || "",
      },
    })),
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

export async function handleMyFollows(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const type =
    url.searchParams.get("type") === "followers" ? "followers" : "following";
  const limit = clampFollowsLimit(url.searchParams.get("limit"));
  const cursor = parseFollowsCursor(url.searchParams.get("cursor"));
  const cursorCreatedAt = cursor?.createdAt || "9999-12-31T23:59:59.999Z";
  const cursorUserId = cursor?.userId || "";
  const userIdColumn =
    type === "followers" ? "follower_user_id" : "followed_user_id";
  const relationColumn =
    type === "followers" ? "followed_user_id" : "follower_user_id";

  const result = await db
    .prepare(
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
    LIMIT ?`,
    )
    .bind(
      session.user.id,
      cursorCreatedAt,
      cursorCreatedAt,
      cursorUserId,
      limit + 1,
    )
    .all();

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
    nextCursor: hasMore
      ? buildFollowsCursor(pageRows[pageRows.length - 1], "follow_user_id")
      : "",
    hasMore,
  });
}

export async function handleUserProfile(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const targetUserId = decodeURIComponent(
    new URL(request.url).pathname.split("/")[3] ?? "",
  ).trim();
  if (!targetUserId) {
    return json(
      { ok: false, error: "Missing target user", code: "missing_target_user" },
      { status: 400 },
    );
  }

  const row = await db
    .prepare(
      `SELECT
      id AS user_id,
      handle AS user_handle,
      display_name AS user_display_name,
      primary_email AS user_email,
      avatar_url AS user_avatar_url,
      gender AS user_gender,
      birth_date AS user_birth_date,
      bio AS user_bio,
      last_location_province AS user_last_location_province,
      last_location_updated_at AS user_last_location_updated_at,
      follower_count AS user_follower_count,
      following_count AS user_following_count
     FROM moq_users
     WHERE id = ?
     LIMIT 1`,
    )
    .bind(targetUserId)
    .first();

  if (!row?.user_id) {
    return json(
      { ok: false, error: "User not found", code: "user_not_found" },
      { status: 404 },
    );
  }

  return json({
    ok: true,
    user: {
      ...buildFollowUserPayload(row, request),
      gender: row.user_gender || "",
      birthDate: row.user_birth_date || "",
      bio: row.user_bio || "",
      locationProvince: row.user_last_location_province || "",
      lastLocationUpdatedAt: row.user_last_location_updated_at || "",
    },
  });
}

export async function handleRoomResolve(env, request) {
  const db = getDb(env);
  const url = new URL(request.url);
  const rawHandle = (url.searchParams.get("handle") || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();
  if (!rawHandle) {
    return json({ ok: false, error: "Missing handle" }, { status: 400 });
  }

  const row = await db
    .prepare(
      `SELECT
      rooms.id AS room_id,
      rooms.title AS room_title,
      rooms.cover_url AS room_cover_url,
      rooms.welcome_message AS room_welcome_message,
      users.last_location_province AS room_last_location_province,
      users.last_location_updated_at AS room_last_location_updated_at,
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
    LIMIT 1`,
    )
    .bind(rawHandle)
    .first();

  if (!row?.room_id) {
    return json(
      { ok: false, error: "Room not found", code: "room_not_found" },
      { status: 404 },
    );
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
        avatarUrl: normalizeMediaUrlForRequest(
          request,
          row.host_avatar_url || "",
        ),
        gender: row.host_gender || "",
        birthDate: row.host_birth_date || "",
        bio: row.host_bio || "",
        followerCount: Math.max(0, Number(row.host_follower_count || 0)),
        followingCount: Math.max(0, Number(row.host_following_count || 0)),
      },
    },
  });
}
