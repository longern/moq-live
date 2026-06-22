import {
  getDb,
  getSessionUser,
  json,
} from "../auth.js";
import {
  runAfterResponse,
  updateFollowCounts
} from "./shared.js";

export async function handleUserFollow(env, request, ctx) {
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

  if (targetUserId === session.user.id) {
    return json({ ok: true, following: false });
  }

  const targetUser = await db
    .prepare(
      `SELECT
       id,
       follower_count AS follower_count,
       following_count AS following_count
     FROM moq_users
     WHERE id = ?
     LIMIT 1`,
    )
    .bind(targetUserId)
    .first();
  if (!targetUser?.id) {
    return json(
      { ok: false, error: "User not found", code: "user_not_found" },
      { status: 404 },
    );
  }
  const targetFollowerCount = Math.max(
    0,
    Number(targetUser.follower_count || 0),
  );
  const targetFollowingCount = Math.max(
    0,
    Number(targetUser.following_count || 0),
  );

  if (request.method === "GET") {
    const row = await db
      .prepare(
        `SELECT notify_live_started
       FROM moq_user_follows
       WHERE follower_user_id = ? AND followed_user_id = ?
       LIMIT 1`,
      )
      .bind(session.user.id, targetUserId)
      .first();
    return json({
      ok: true,
      following: Boolean(row),
      notifyLiveStarted: Boolean(row && Number(row.notify_live_started) !== 0),
      followerCount: targetFollowerCount,
      followingCount: targetFollowingCount,
    });
  }

  if (request.method === "POST") {
    const now = new Date().toISOString();
    const result = await db
      .prepare(
        `INSERT OR IGNORE INTO moq_user_follows (
        follower_user_id,
        followed_user_id,
        notify_live_started,
        created_at,
        updated_at
      ) VALUES (?, ?, 1, ?, ?)`,
      )
      .bind(session.user.id, targetUserId, now, now)
      .run();
    const inserted = Number(result?.meta?.changes || 0) > 0;
    let followerCount = targetFollowerCount;
    if (inserted) {
      followerCount += 1;
      runAfterResponse(ctx, () =>
        updateFollowCounts(db, {
          followerUserId: session.user.id,
          followedUserId: targetUserId,
          followerDelta: 1,
          followingDelta: 1,
        }),
      );
    }
    return json({
      ok: true,
      following: true,
      notifyLiveStarted: true,
      followerCount,
      followingCount: targetFollowingCount,
    });
  }

  if (request.method === "PATCH") {
    const payload = await request.json().catch(() => ({}));
    const notifyLiveStarted = Boolean(payload.notifyLiveStarted);
    const now = new Date().toISOString();
    const result = await db
      .prepare(
        `UPDATE moq_user_follows
       SET notify_live_started = ?,
           updated_at = ?
       WHERE follower_user_id = ? AND followed_user_id = ?`,
      )
      .bind(notifyLiveStarted ? 1 : 0, now, session.user.id, targetUserId)
      .run();
    if (Number(result?.meta?.changes || 0) <= 0) {
      return json(
        {
          ok: false,
          error: "Follow relationship not found",
          code: "follow_required",
        },
        { status: 409 },
      );
    }
    return json({
      ok: true,
      following: true,
      notifyLiveStarted,
      followerCount: targetFollowerCount,
      followingCount: targetFollowingCount,
    });
  }

  const result = await db
    .prepare(
      `DELETE FROM moq_user_follows
     WHERE follower_user_id = ? AND followed_user_id = ?`,
    )
    .bind(session.user.id, targetUserId)
    .run();
  const deleted = Number(result?.meta?.changes || 0) > 0;
  let followerCount = targetFollowerCount;
  if (deleted) {
    followerCount = Math.max(0, followerCount - 1);
    runAfterResponse(ctx, () =>
      updateFollowCounts(db, {
        followerUserId: session.user.id,
        followedUserId: targetUserId,
        followerDelta: -1,
        followingDelta: -1,
      }),
    );
  }
  return json({
    ok: true,
    following: false,
    notifyLiveStarted: false,
    followerCount,
    followingCount: targetFollowingCount,
  });
}
