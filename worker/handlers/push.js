import {
  getDb,
  getSessionUser,
  json,
} from "../auth.js";
import {
  getRoomById,
  runAfterResponse
} from "./shared.js";

const LIVE_NOTIFICATION_COOLDOWN_MS = 10 * 60 * 1000;
const HANDLE_PATH_PATTERN = /^(?!\d+$)[a-z0-9](?:[a-z0-9_]{4,22}[a-z0-9])?$/;

function buildWatchPath(roomHandle) {
  const normalizedHandle = String(roomHandle || "").trim();
  if (!normalizedHandle) {
    return "/";
  }
  if (HANDLE_PATH_PATTERN.test(normalizedHandle)) {
    return `/${encodeURIComponent(normalizedHandle)}`;
  }
  return `/?r=${encodeURIComponent(normalizedHandle)}`;
}

export async function handlePushPublicKey(env) {
  return json({
    ok: true,
    publicKey: String(env.WEB_PUSH_PUBLIC_KEY || ""),
  });
}

export async function handleMyPushSubscription(env, request) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const endpoint = String(payload?.endpoint || "").trim();
  if (!endpoint) {
    return json(
      { ok: false, error: "Missing endpoint", code: "missing_endpoint" },
      { status: 400 },
    );
  }

  if (request.method === "DELETE") {
    await db
      .prepare(
        `UPDATE moq_push_subscriptions
       SET revoked_at = ?, updated_at = ?
       WHERE user_id = ? AND endpoint = ?`,
      )
      .bind(
        new Date().toISOString(),
        new Date().toISOString(),
        session.user.id,
        endpoint,
      )
      .run();
    return json({ ok: true });
  }

  const p256dh = String(payload?.keys?.p256dh || "").trim();
  const auth = String(payload?.keys?.auth || "").trim();
  if (!p256dh || !auth) {
    return json(
      { ok: false, error: "Missing push keys", code: "missing_push_keys" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db
    .prepare(
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
      revoked_at = NULL`,
    )
    .bind(
      id,
      session.user.id,
      endpoint,
      p256dh,
      auth,
      request.headers.get("user-agent") || "",
      now,
      now,
    )
    .run();

  return json({ ok: true });
}

export async function handleLiveNotifications(env, request, ctx) {
  const db = getDb(env);
  const session = await getSessionUser(db, request);
  if (!session?.user?.id) {
    return json(
      { ok: false, error: "Unauthorized", code: "unauthorized" },
      { status: 401 },
    );
  }

  const roomId = decodeURIComponent(
    new URL(request.url).pathname.split("/")[3] || "",
  );
  if (!roomId) {
    return json(
      { ok: false, error: "Missing room", code: "missing_room" },
      { status: 400 },
    );
  }

  const room = await getRoomById(db, roomId);
  if (!room?.room_id) {
    return json(
      { ok: false, error: "Room not found", code: "room_not_found" },
      { status: 404 },
    );
  }
  if (room.host_user_id !== session.user.id) {
    return json(
      { ok: false, error: "Forbidden", code: "forbidden" },
      { status: 403 },
    );
  }

  const now = new Date();
  const lastSentAt = String(room.room_live_notification_sent_at || "");
  if (
    lastSentAt &&
    now.getTime() - Date.parse(lastSentAt) < LIVE_NOTIFICATION_COOLDOWN_MS
  ) {
    return json({
      ok: true,
      queued: 0,
      skipped: "cooldown",
      nextAllowedAt: new Date(
        Date.parse(lastSentAt) + LIVE_NOTIFICATION_COOLDOWN_MS,
      ).toISOString(),
    });
  }

  const sentAt = now.toISOString();
  await writeLiveNotificationSentAt(db, { roomId, sentAt });

  const result = await db
    .prepare(
      `SELECT
      subscriptions.endpoint,
      subscriptions.p256dh,
      subscriptions.auth
    FROM moq_user_follows AS follows
    INNER JOIN moq_push_subscriptions AS subscriptions
      ON subscriptions.user_id = follows.follower_user_id
    WHERE follows.followed_user_id = ?
      AND follows.notify_live_started = 1
      AND subscriptions.revoked_at IS NULL`,
    )
    .bind(session.user.id)
    .all();
  const subscriptions = Array.isArray(result?.results) ? result.results : [];

  runAfterResponse(ctx, async () => {
    await sendLiveStartedPushNotifications(env, db, subscriptions, {
      hostDisplayName: room.host_display_name || room.host_handle || "",
      roomHandle: room.host_handle || "",
    });
  });

  return json({ ok: true, queued: subscriptions.length });
}

async function writeLiveNotificationSentAt(db, { roomId, sentAt }) {
  await db
    .prepare(
      `UPDATE moq_rooms
     SET live_notification_sent_at = ?
     WHERE id = ?`,
    )
    .bind(sentAt, roomId)
    .run();
}

async function sendLiveStartedPushNotifications(
  env,
  db,
  subscriptions,
  notification = {},
) {
  const publicKey = String(env.WEB_PUSH_PUBLIC_KEY || "").trim();
  const privateKey = String(env.WEB_PUSH_PRIVATE_KEY || "").trim();
  if (!publicKey || !privateKey) {
    console.warn(
      "Skipped live push notifications because WEB_PUSH_PUBLIC_KEY or WEB_PUSH_PRIVATE_KEY is missing.",
    );
    return;
  }
  const hostDisplayName = String(notification.hostDisplayName ?? "").trim();
  const notificationPayload = {
    hostDisplayName,
    url: buildWatchPath(notification.roomHandle),
  };

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      const response = await sendWebPush(subscription, {
        publicKey,
        privateKey,
        subject: String(
          env.WEB_PUSH_SUBJECT || "mailto:admin@example.com",
        ).trim(),
        payload: notificationPayload,
      });
      if (response.status === 404 || response.status === 410) {
        const now = new Date().toISOString();
        await db
          .prepare(
            `UPDATE moq_push_subscriptions
         SET revoked_at = ?, updated_at = ?
         WHERE endpoint = ?`,
          )
          .bind(now, now, subscription.endpoint)
          .run();
      }
    }),
  );
}

async function sendWebPush(subscription, vapid) {
  const endpoint = String(subscription.endpoint || "");
  const payload = JSON.stringify(vapid.payload || {});
  const audience = new URL(endpoint).origin;
  const jwt = await createVapidJwt({
    audience,
    subject: vapid.subject,
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  });

  return await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "120",
      urgency: "normal",
    },
    body: await encryptWebPushPayload(subscription, payload),
  });
}

async function encryptWebPushPayload(subscription, payload) {
  const receiverPublicKey = base64UrlToBytes(subscription.p256dh);
  const authSecret = base64UrlToBytes(subscription.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const senderKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const senderPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", senderKeys.publicKey),
  );
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPublicKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: receiverKey },
      senderKeys.privateKey,
      256,
    ),
  );
  const ikm = await hmacSha256(authSecret, sharedSecret);
  const prk = await hmacSha256(salt, ikm);
  const cek = (
    await hmacSha256(prk, textBytes("Content-Encoding: aes128gcm\0\x01"))
  ).slice(0, 16);
  const nonce = (
    await hmacSha256(prk, textBytes("Content-Encoding: nonce\0\x01"))
  ).slice(0, 12);
  const content = textBytes(payload);
  const plaintext = concatBytes(content, new Uint8Array([0x02]));
  const key = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, tagLength: 128 },
      key,
      plaintext,
    ),
  );
  return concatBytes(
    salt,
    uint32Bytes(4096),
    new Uint8Array([senderPublicKey.length]),
    senderPublicKey,
    ciphertext,
  );
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
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
    sub: subject,
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
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      cryptoKey,
      new TextEncoder().encode(unsignedToken),
    ),
  );
  return `${unsignedToken}.${bytesToBase64Url(signature)}`;
}

function base64UrlJson(value) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlToBytes(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
