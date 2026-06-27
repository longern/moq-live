import {
  getDb,
  getSessionUser,
  json,
} from "../auth.js";
import { isSuperAdminUser } from "./shared.js";

const ADMIN_USERS_MAX_LIMIT = 50;
const ADMIN_USERS_DEFAULT_LIMIT = 20;

export async function handleAdminUsers(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }
  if (!isSuperAdminUser(env, session.user)) {
    return json(
      { ok: false, error: "Forbidden", code: "forbidden" },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const limit = Math.min(
    ADMIN_USERS_MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") || ADMIN_USERS_DEFAULT_LIMIT) || ADMIN_USERS_DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0);
  const fetchLimit = limit + 1;

  const usersResult = await db
    .prepare(
      `SELECT
        id,
        handle,
        display_name AS displayName,
        primary_email AS email,
        avatar_url AS avatarUrl,
        follower_count AS followerCount,
        following_count AS followingCount,
        created_at AS createdAt,
        updated_at AS updatedAt,
        last_login_at AS lastLoginAt
      FROM moq_users
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    )
    .bind(fetchLimit, offset)
    .all();
  const rows = Array.isArray(usersResult?.results) ? usersResult.results : [];

  return json({
    ok: true,
    users: rows.slice(0, limit),
    pagination: {
      hasNext: rows.length > limit,
      limit,
      offset,
    },
  });
}
