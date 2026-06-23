import {
  getPublicWebRtcProxySession,
  getWebRtcProxySessionStorageKey,
  isValidWebRtcProxySessionId,
  json,
  normalizeWebRtcProxySession,
} from "./utils.js";

export async function handleWebRtcProxySessionRegister(room, request) {
  const payload = await request.json().catch(() => ({}));
  const session = normalizeWebRtcProxySession(payload.session);
  if (!session) {
    return json({
      ok: false,
      error: "Invalid WebRTC proxy session",
      code: "invalid_webrtc_proxy_session",
    }, { status: 400 });
  }

  await room.ctx.storage.put(
    getWebRtcProxySessionStorageKey(session.id),
    session,
  );
  return json({ ok: true, session: getPublicWebRtcProxySession(session) });
}

export async function handleWebRtcProxySessionResource(room, request) {
  const url = new URL(request.url);
  const sessionId = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!isValidWebRtcProxySessionId(sessionId)) {
    return json({
      ok: false,
      error: "Invalid WebRTC proxy session",
      code: "invalid_webrtc_proxy_session",
    }, { status: 400 });
  }

  const storageKey = getWebRtcProxySessionStorageKey(sessionId);
  const session = normalizeWebRtcProxySession(
    await room.ctx.storage.get(storageKey),
  );
  if (!session) {
    return json({
      ok: false,
      error: "WebRTC proxy session not found",
      code: "webrtc_proxy_session_not_found",
    }, { status: 404 });
  }

  if (session.expiresAt <= Date.now()) {
    await room.ctx.storage.delete(storageKey);
    return json({
      ok: false,
      error: "WebRTC proxy session expired",
      code: "webrtc_proxy_session_expired",
    }, { status: 410 });
  }

  if (request.method === "PATCH") {
    const payload = await request.json().catch(() => ({}));
    const nextExpiresAt = Number(payload.expiresAt || 0);
    if (!Number.isFinite(nextExpiresAt) || nextExpiresAt <= Date.now()) {
      return json({
        ok: false,
        error: "Invalid WebRTC proxy session renewal",
        code: "invalid_webrtc_proxy_session_renewal",
      }, { status: 400 });
    }
    const nextSession = {
      ...session,
      expiresAt: nextExpiresAt,
    };
    await room.ctx.storage.put(storageKey, nextSession);
    return json({
      ok: true,
      session: getPublicWebRtcProxySession(nextSession),
    });
  }

  if (request.method === "DELETE") {
    await room.ctx.storage.delete(storageKey);
  }

  return json({
    ok: true,
    session: getPublicWebRtcProxySession(session),
  });
}
