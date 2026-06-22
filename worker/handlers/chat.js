import {
  json,
} from "../auth.js";
import {
  getOptionalSessionUser,
  isChatRoomOwner,
  postToChatRoom,
} from "./shared.js";

export async function handleChatLocationDistance(env, request) {
  const roomId = decodeURIComponent(
    new URL(request.url).pathname.split("/")[3] || "",
  );
  if (!roomId) {
    return json(
      { ok: false, error: "Room not found", code: "room_not_found" },
      { status: 404 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const response = await postToChatRoom(
    env,
    roomId,
    "/location/distance",
    payload,
  );
  if (!response.ok) {
    return json(
      {
        ok: false,
        error: response.error || "Location distance failed",
        code: response.code || "location_distance_failed",
      },
      { status: response.status || 500 },
    );
  }

  return json({
    ok: true,
    distanceMeters: response.distanceMeters,
    distanceText: response.distanceText || "",
  });
}


export async function handleChatWebSocket(env, request) {
  if (!env.CHAT_ROOM) {
    return json(
      { ok: false, error: "Missing CHAT_ROOM durable object binding" },
      { status: 500 },
    );
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
    headers.set(
      "x-chat-user",
      encodeURIComponent(JSON.stringify(session.user)),
    );
  } else {
    headers.delete("x-chat-user");
  }

  return stub.fetch(
    new Request(request.url, {
      method: "GET",
      headers,
    }),
  );
}
