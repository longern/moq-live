const MAX_MESSAGE_LENGTH = 280;
const MAX_RECENT_MESSAGES = 80;
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 5_000;
const RATE_LIMIT_MAX_MESSAGES = 4;

export class ChatRoomDO {
  constructor(ctx) {
    this.ctx = ctx;
    this.recentMessages = [];
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.recentMessages = (await this.ctx.storage.get("recentMessages")) ?? [];
    });
  }

  async fetch(request) {
    await this.ready;
    await this.persistPrunedMessages();
    const url = new URL(request.url);

    if (!url.pathname.endsWith("/ws")) {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const room = request.headers.get("x-chat-room") ?? "";
    const readOnly = request.headers.get("x-chat-read-only") !== "0";
    const user = parseUserHeader(request.headers.get("x-chat-user"));
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      room,
      readOnly,
      user,
      sentAt: []
    });

    this.send(server, {
      type: "chat.snapshot",
      room,
      readOnly,
      onlineCount: this.ctx.getWebSockets().length,
      messages: this.recentMessages
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
      this.send(ws, {
        type: "error",
        code: "session_missing",
        message: "聊天室会话不存在"
      });
      return;
    }

    let payload = null;
    try {
      payload = JSON.parse(typeof rawData === "string" ? rawData : new TextDecoder().decode(rawData));
    } catch {
      this.send(ws, {
        type: "error",
        code: "invalid_json",
        message: "消息格式无效"
      });
      return;
    }

    if (payload?.type !== "message.send") {
      this.send(ws, {
        type: "error",
        code: "unsupported_event",
        message: "不支持的事件类型"
      });
      return;
    }

    if (session.readOnly || !session.user?.id) {
      this.send(ws, {
        type: "error",
        code: "auth_required",
        message: "登录后才可发言"
      });
      return;
    }

    const text = sanitizeMessage(payload.text);
    if (!text) {
      this.send(ws, {
        type: "error",
        code: "empty_message",
        message: "消息不能为空"
      });
      return;
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
      this.send(ws, {
        type: "error",
        code: "message_too_long",
        message: `单条消息最多 ${MAX_MESSAGE_LENGTH} 字`
      });
      return;
    }

    const now = Date.now();
    const sentAt = Array.isArray(session.sentAt)
      ? session.sentAt.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS)
      : [];

    if (sentAt.length >= RATE_LIMIT_MAX_MESSAGES) {
      this.send(ws, {
        type: "error",
        code: "rate_limited",
        message: "发送过快，请稍后再试"
      });
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

    this.recentMessages.push(message);
    if (this.recentMessages.length > MAX_RECENT_MESSAGES) {
      this.recentMessages.splice(0, this.recentMessages.length - MAX_RECENT_MESSAGES);
    }
    await this.ctx.storage.put("recentMessages", this.recentMessages);

    this.broadcast({
      type: "message.created",
      message
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
      onlineCount: this.ctx.getWebSockets().length
    });
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
}

function normalizeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }

  return {
    room: typeof attachment.room === "string" ? attachment.room : "",
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

function isMessageFresh(message, now) {
  if (!message || typeof message !== "object") {
    return false;
  }

  const sentAt = Date.parse(message.sentAt);
  return Number.isFinite(sentAt) && now - sentAt < MESSAGE_TTL_MS;
}
