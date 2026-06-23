import {
  createUserRoom,
  getConfiguredAuthProviders,
  getDb,
  getMicrosoftLoginUrl,
  getUserRoom,
  getSessionUser,
  json,
  removeUserAvatar,
  removeUserRoomCover,
  updateUserAvatar,
  updateUserRoomCover,
  updateUserRoomSettings,
} from "../auth.js";
import {
  withSuperAdminFlag
} from "./shared.js";

export async function handleMe(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  const authProviders = getConfiguredAuthProviders(env, request);
  const loginUrl = authProviders[0]?.startUrl ?? getMicrosoftLoginUrl(request);

  if (!session) {
    return json({
      ok: true,
      authenticated: false,
      loginUrl,
      authProviders,
      user: null,
    });
  }

  return json({
    ok: true,
    authenticated: true,
    loginUrl,
    authProviders,
    user: withSuperAdminFlag(env, session.user),
  });
}

export async function handleMyRoom(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const room = await getUserRoom(db, session.user.id);
  return json({
    ok: true,
    room,
  });
}

export async function handleMyRoomCreate(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const room = await createUserRoom(env, db, session.user.id);
  return json(
    {
      ok: true,
      room,
    },
    { status: 201 },
  );
}

export async function handleMyRoomUpdate(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const room = await updateUserRoomSettings(db, session.user.id, payload);
  return json({ ok: true, room });
}

export async function handleMyRoomCoverUpload(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const room = await updateUserRoomCover(env, db, request, session.user.id);
  return json({ ok: true, room });
}

export async function handleMyRoomCoverDelete(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const room = await removeUserRoomCover(env, db, session.user.id);
  return json({ ok: true, room });
}

export async function handleRoomCoverMedia(env, request) {
  if (!env.APP_MEDIA) {
    return new Response("Missing APP_MEDIA binding.", { status: 500 });
  }

  const url = new URL(request.url);
  const objectKey = decodeURIComponent(
    url.pathname.slice("/media/room-covers/".length),
  ).trim();
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
    headers,
  });
}

export async function handleUserAvatarMedia(env, request) {
  if (!env.APP_MEDIA) {
    return new Response("Missing APP_MEDIA binding.", { status: 500 });
  }

  const url = new URL(request.url);
  const objectKey = decodeURIComponent(
    url.pathname.slice("/media/user-avatars/".length),
  ).trim();
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
    headers,
  });
}

export async function handleMyAvatarUpload(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const user = await updateUserAvatar(env, db, request, session.user.id);
  return json({ ok: true, user: withSuperAdminFlag(env, user) });
}

export async function handleMyAvatarDelete(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);

  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const user = await removeUserAvatar(env, db, session.user.id);
  return json({ ok: true, user: withSuperAdminFlag(env, user) });
}
