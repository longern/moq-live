const MAX_MESSAGE_LENGTH = 280;
const MAX_RECENT_MESSAGES = 80;
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 5_000;
const RATE_LIMIT_MAX_MESSAGES = 4;
const MAX_ROOM_TITLE_LENGTH = 80;
const DURABLE_OBJECT_FREE_TIER_WRITE_LIMIT_MESSAGE = "Exceeded allowed rows written in Durable Objects free tier.";

export class ChatRoomDO {
  constructor(ctx) {
    this.ctx = ctx;
    this.recentMessages = [];
    this.roomState = getDefaultRoomState();
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.recentMessages = (await this.ctx.storage.get("recentMessages")) ?? [];
      this.roomState = normalizeRoomState((await this.ctx.storage.get("roomState")) ?? null);
    });
  }

  async fetch(request) {
    await this.ready;
    try {
      await this.persistPrunedMessages();
    } catch (error) {
      if (!isDurableObjectWriteLimitError(error)) {
        throw error;
      }
      console.warn("Skipped pruning chat messages because Durable Object write quota was exceeded.");
    }
    const url = new URL(request.url);

    if (!url.pathname.endsWith("/ws")) {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const room = request.headers.get("x-chat-room") ?? "";
    const role = request.headers.get("x-chat-role") === "broadcaster" ? "broadcaster" : "viewer";
    const isRoomOwner = request.headers.get("x-chat-room-owner") === "1";
    const readOnly = request.headers.get("x-chat-read-only") !== "0";
    const user = parseUserHeader(request.headers.get("x-chat-user"));
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      room,
      role,
      isRoomOwner,
      readOnly,
      user,
      sentAt: []
    });

    this.send(server, {
      type: "chat.snapshot",
      room,
      readOnly,
      onlineCount: this.getAudienceCount(),
      messages: this.recentMessages,
      stream: this.roomState.stream,
      roomMeta: this.roomState.roomMeta
    });
    this.broadcastPresence();

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(ws, rawData) {
    await this.ready;
    this.pruneRecentMessages();
    const session = normalizeAttachment(ws.deserializeAttachment());
    if (!session) {
      this.sendError(ws, "session_missing");
      return;
    }

    let payload = null;
    try {
      payload = JSON.parse(typeof rawData === "string" ? rawData : new TextDecoder().decode(rawData));
    } catch {
      this.sendError(ws, "invalid_json");
      return;
    }

    if (payload?.type === "message.send") {
      await this.handleMessageSend(ws, session, payload);
      return;
    }

    if (payload?.type === "stream.started") {
      await this.handleStreamStarted(ws, session, payload);
      return;
    }

    if (payload?.type === "stream.stopped") {
      await this.handleStreamStopped(ws, session);
      return;
    }

    if (payload?.type === "room.updated") {
      await this.handleRoomUpdated(ws, session, payload);
      return;
    }

    this.sendError(ws, "unsupported_event", {
      eventType: typeof payload?.type === "string" ? payload.type : ""
    });
  }

  async webSocketClose(ws, code, reason) {
    ws.close(code, reason);
    this.broadcastPresence();
  }

  async webSocketError(ws) {
    try {
      ws.close(1011, "chat_error");
    } catch {
      return;
    } finally {
      this.broadcastPresence();
    }
  }

  broadcastPresence() {
    this.broadcast({
      type: "presence.snapshot",
      onlineCount: this.getAudienceCount()
    });
  }

  getAudienceCount() {
    return this.ctx.getWebSockets().reduce((count, socket) => {
      const session = normalizeAttachment(socket.deserializeAttachment());
      return session?.role === "broadcaster" ? count : count + 1;
    }, 0);
  }

  broadcast(payload) {
    const serialized = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(serialized);
      } catch {
        try {
          socket.close(1011, "broadcast_failed");
        } catch {
          // Ignore close failures on broken sockets.
        }
      }
    }
  }

  send(socket, payload) {
    socket.send(JSON.stringify(payload));
  }

  sendError(socket, code, details = undefined) {
    const payload = {
      type: "error",
      code
    };
    if (details !== undefined) {
      payload.details = details;
    }
    this.send(socket, payload);
  }

  pruneRecentMessages(now = Date.now()) {
    const nextMessages = this.recentMessages
      .filter((message) => isMessageFresh(message, now))
      .slice(-MAX_RECENT_MESSAGES);

    if (nextMessages.length === this.recentMessages.length) {
      return false;
    }

    this.recentMessages = nextMessages;
    return true;
  }

  async persistPrunedMessages(now = Date.now()) {
    if (!this.pruneRecentMessages(now)) {
      return;
    }
    await this.ctx.storage.put("recentMessages", this.recentMessages);
  }

  async handleMessageSend(ws, session, payload) {
    if (session.readOnly || !session.user?.id) {
      this.sendError(ws, "auth_required");
      return;
    }

    const text = sanitizeMessage(payload.text);
    if (!text) {
      this.sendError(ws, "empty_message");
      return;
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
      this.sendError(ws, "message_too_long", {
        maxLength: MAX_MESSAGE_LENGTH
      });
      return;
    }

    const now = Date.now();
    const sentAt = Array.isArray(session.sentAt)
      ? session.sentAt.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS)
      : [];

    if (sentAt.length >= RATE_LIMIT_MAX_MESSAGES) {
      this.sendError(ws, "rate_limited");
      return;
    }

    sentAt.push(now);
    ws.serializeAttachment({
      ...session,
      sentAt
    });

    const message = {
      id: crypto.randomUUID(),
      room: session.room,
      text,
      sentAt: new Date(now).toISOString(),
      user: {
        id: session.user.id,
        displayName: session.user.displayName || session.user.email || "匿名用户",
        avatarUrl: session.user.avatarUrl || "",
        email: session.user.email || ""
      }
    };

    const nextMessages = this.recentMessages.concat(message).slice(-MAX_RECENT_MESSAGES);
    const persisted = await this.persistStorageOrNotify(ws, "recentMessages", nextMessages);
    if (!persisted) {
      return;
    }
    this.recentMessages = nextMessages;

    this.broadcast({
      type: "message.created",
      message
    });
  }

  async handleStreamStarted(ws, session, payload) {
    if (!session.isRoomOwner) {
      this.sendError(ws, "forbidden_stream_update");
      return;
    }

    const nextStream = {
      isLive: true,
      startedAt: sanitizeIsoTimestamp(payload.stream?.startedAt) ?? new Date().toISOString()
    };
    const nextRoomState = {
      ...this.roomState,
      stream: nextStream
    };
    const persisted = await this.persistStorageOrNotify(ws, "roomState", nextRoomState);
    if (!persisted) {
      return;
    }
    this.roomState = nextRoomState;
    this.broadcast({
      type: "stream.started",
      stream: nextStream
    });
  }

  async handleStreamStopped(ws, session) {
    if (!session.isRoomOwner) {
      this.sendError(ws, "forbidden_stream_update");
      return;
    }

    const nextRoomState = {
      ...this.roomState,
      stream: getDefaultRoomState().stream
    };
    const persisted = await this.persistStorageOrNotify(ws, "roomState", nextRoomState);
    if (!persisted) {
      return;
    }
    this.roomState = nextRoomState;
    this.broadcast({
      type: "stream.stopped",
      stream: this.roomState.stream
    });
  }

  async handleRoomUpdated(ws, session, payload) {
    if (!session.isRoomOwner) {
      this.sendError(ws, "forbidden_room_update");
      return;
    }

    const nextRoomMeta = {
      title: sanitizeRoomTitle(payload.roomMeta?.title),
      stream: {
        relayUrl: sanitizeUrl(payload.roomMeta?.stream?.relayUrl),
        namespace: sanitizeNamespace(payload.roomMeta?.stream?.namespace)
      },
      host: {
        id: sanitizeEntityId(payload.roomMeta?.host?.id),
        displayName: sanitizeRoomTitle(payload.roomMeta?.host?.displayName),
        avatarUrl: sanitizeUrl(payload.roomMeta?.host?.avatarUrl)
      }
    };
    const nextRoomState = {
      ...this.roomState,
      roomMeta: nextRoomMeta
    };
    const persisted = await this.persistStorageOrNotify(ws, "roomState", nextRoomState);
    if (!persisted) {
      return;
    }
    this.roomState = nextRoomState;
    this.broadcast({
      type: "room.updated",
      roomMeta: nextRoomMeta
    });
  }

  async persistStorageOrNotify(ws, key, value) {
    try {
      await this.ctx.storage.put(key, value);
      return true;
    } catch (error) {
      if (!isDurableObjectWriteLimitError(error)) {
        throw error;
      }

      this.sendError(ws, "storage_write_limited");
      console.warn(`Skipped Durable Object write for ${key} because free tier row quota was exceeded.`);
      return false;
    }
  }
}

function getDefaultRoomState() {
  return {
    stream: {
      isLive: false,
      startedAt: null
    },
    roomMeta: {
      title: "",
      stream: {
        relayUrl: "",
        namespace: ""
      },
      host: {
        id: "",
        displayName: "",
        avatarUrl: ""
      }
    }
  };
}

function normalizeRoomState(roomState) {
  return {
    stream: {
      isLive: Boolean(roomState?.stream?.isLive),
      startedAt: sanitizeIsoTimestamp(roomState?.stream?.startedAt)
    },
    roomMeta: {
      title: sanitizeRoomTitle(roomState?.roomMeta?.title),
      stream: {
        relayUrl: sanitizeUrl(roomState?.roomMeta?.stream?.relayUrl),
        namespace: sanitizeNamespace(roomState?.roomMeta?.stream?.namespace)
      },
      host: {
        id: sanitizeEntityId(roomState?.roomMeta?.host?.id),
        displayName: sanitizeRoomTitle(roomState?.roomMeta?.host?.displayName),
        avatarUrl: sanitizeUrl(roomState?.roomMeta?.host?.avatarUrl)
      }
    }
  };
}

function normalizeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }

  return {
    room: typeof attachment.room === "string" ? attachment.room : "",
    role: attachment.role === "broadcaster" ? "broadcaster" : "viewer",
    isRoomOwner: attachment.isRoomOwner === true,
    readOnly: attachment.readOnly !== false ? true : false,
    user: attachment.user && typeof attachment.user === "object" ? attachment.user : null,
    sentAt: Array.isArray(attachment.sentAt) ? attachment.sentAt.filter((value) => typeof value === "number") : []
  };
}

function parseUserHeader(headerValue) {
  if (!headerValue) {
    return null;
  }

  try {
    return JSON.parse(decodeURIComponent(headerValue));
  } catch {
    return null;
  }
}

function sanitizeMessage(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function sanitizeRoomTitle(value) {
  const title = String(value ?? "").trim().replace(/\s+/g, " ");
  return title.slice(0, MAX_ROOM_TITLE_LENGTH);
}

function sanitizeIsoTimestamp(value) {
  if (typeof value !== "string") {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function sanitizeEntityId(value) {
  return String(value ?? "").trim().slice(0, 128);
}

function sanitizeUrl(value) {
  const nextValue = String(value ?? "").trim();
  if (!nextValue) {
    return "";
  }

  if (nextValue.startsWith("data:image/")) {
    return nextValue;
  }

  try {
    const url = new URL(nextValue);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function sanitizeNamespace(value) {
  return String(value ?? "").trim().slice(0, 128);
}

function isMessageFresh(message, now) {
  if (!message || typeof message !== "object") {
    return false;
  }

  const sentAt = Date.parse(message.sentAt);
  return Number.isFinite(sentAt) && now - sentAt < MESSAGE_TTL_MS;
}

function isDurableObjectWriteLimitError(error) {
  return (error instanceof Error ? error.message : String(error ?? "")).includes(
    DURABLE_OBJECT_FREE_TIER_WRITE_LIMIT_MESSAGE
  );
}
