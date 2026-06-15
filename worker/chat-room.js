const MAX_MESSAGE_LENGTH = 280;
const MAX_RECENT_MESSAGES = 80;
const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 5_000;
const RATE_LIMIT_MAX_MESSAGES = 4;
const MAX_CHAT_MUTE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ROOM_TITLE_LENGTH = 80;
const DURABLE_OBJECT_FREE_TIER_WRITE_LIMIT_MESSAGE =
  "Exceeded allowed rows written in Durable Objects free tier.";
const STREAM_PROTOCOL_MOQ = "moq";
const STREAM_PROTOCOL_WEBRTC = "webrtc";
const COHOST_INVITE_TTL_MS = 60_000;
const BIG_DATA_CLOUD_REVERSE_GEOCODE_URL =
  "https://api-bdc.net/data/reverse-geocode";
const BIG_DATA_CLOUD_FREE_REVERSE_GEOCODE_URL =
  "https://api-bdc.net/data/reverse-geocode-client";
const BIG_DATA_CLOUD_TIMEOUT_MS = 3_000;

export class ChatRoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.recentMessages = [];
    this.roomState = getDefaultRoomState();
    this.ready = this.ctx.blockConcurrencyWhile(async () => {
      this.recentMessages =
        (await this.ctx.storage.get("recentMessages")) ?? [];
      this.roomState = normalizeRoomState(
        (await this.ctx.storage.get("roomState")) ?? null,
      );
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
      console.warn(
        "Skipped pruning chat messages because Durable Object write quota was exceeded.",
      );
    }
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname.endsWith("/state")) {
      return json({
        ok: true,
        stream: this.roomState.stream,
        roomMeta: this.roomState.roomMeta,
        location: getPublicRoomLocation(this.roomState.location),
        cohost: this.roomState.cohost,
      });
    }

    if (request.method === "POST" && url.pathname.endsWith("/cohost/request")) {
      return await this.handleCohostInviteRequest(request);
    }

    if (
      request.method === "POST" &&
      url.pathname.endsWith("/cohost/response")
    ) {
      return await this.handleCohostInviteResponse(request);
    }

    if (request.method === "POST" && url.pathname.endsWith("/cohost/active")) {
      return await this.handleCohostActiveUpdate(request);
    }

    if (
      request.method === "POST" &&
      url.pathname.endsWith("/location/distance")
    ) {
      return await this.handleLocationDistance(request);
    }

    if (!url.pathname.endsWith("/ws")) {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const room = request.headers.get("x-chat-room") ?? "";
    const role =
      request.headers.get("x-chat-role") === "broadcaster"
        ? "broadcaster"
        : "viewer";
    const isRoomOwner = request.headers.get("x-chat-room-owner") === "1";
    const readOnly = request.headers.get("x-chat-read-only") !== "0";
    const user = parseUserHeader(request.headers.get("x-chat-user"));
    const canControlBroadcast =
      role === "broadcaster" &&
      isRoomOwner &&
      Boolean(user?.id) &&
      !this.hasActiveBroadcastController(user.id);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      room,
      role,
      isRoomOwner,
      canControlBroadcast,
      readOnly,
      user,
      connectedAt: Date.now(),
      sentAt: [],
    });

    this.send(server, {
      type: "chat.snapshot",
      room,
      readOnly,
      canControlBroadcast,
      ...this.getPresenceSnapshot(),
      messages: this.recentMessages,
      stream: this.roomState.stream,
      roomMeta: this.roomState.roomMeta,
      location: getPublicRoomLocation(this.roomState.location),
      cohost: this.roomState.cohost,
      moderation: getPublicModerationState(
        this.roomState.moderation,
        Date.now(),
        this.roomState.stream.isLive,
        canControlBroadcast,
      ),
      chatMute: getPublicChatMute(
        getActiveChatMute(
          this.roomState.moderation,
          user?.id,
          Date.now(),
          this.roomState.stream.isLive,
        ),
      ),
    });
    this.broadcastPresence();

    return new Response(null, {
      status: 101,
      webSocket: client,
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
      payload = JSON.parse(
        typeof rawData === "string"
          ? rawData
          : new TextDecoder().decode(rawData),
      );
    } catch {
      this.sendError(ws, "invalid_json");
      return;
    }

    if (payload?.type === "message.send") {
      await this.handleMessageSend(ws, session, payload);
      return;
    }

    if (payload?.type === "message.retract") {
      await this.handleMessageRetract(ws, session, payload);
      return;
    }

    if (payload?.type === "message.mute") {
      await this.handleMessageMute(ws, session, payload);
      return;
    }

    if (payload?.type === "message.unmute") {
      await this.handleMessageUnmute(ws, session, payload);
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

    if (payload?.type === "room.location.updated") {
      await this.handleRoomLocationUpdated(ws, session, payload);
      return;
    }

    if (payload?.type === "cohost.invites.set_allowed") {
      await this.handleCohostInvitesAllowed(ws, session, payload);
      return;
    }

    if (payload?.type === "cohost.active.clear") {
      await this.handleCohostActiveClear(ws, session);
      return;
    }

    if (payload?.type === "broadcast.control.check") {
      this.handleBroadcastControlCheck(ws, session, payload);
      return;
    }

    if (payload?.type === "broadcast.control.release") {
      this.handleBroadcastControlRelease(ws, session);
      return;
    }

    this.sendError(ws, "unsupported_event", {
      eventType: typeof payload?.type === "string" ? payload.type : "",
    });
  }

  async webSocketClose(ws, code, reason) {
    ws.close(code, reason);
    this.refreshBroadcastControlState({ excludeSocket: ws });
    this.broadcastPresence();
  }

  async webSocketError(ws) {
    try {
      ws.close(1011, "chat_error");
    } catch {
      return;
    } finally {
      this.refreshBroadcastControlState({ excludeSocket: ws });
      this.broadcastPresence();
    }
  }

  refreshBroadcastControlState({ excludeSocket = null } = {}) {
    const broadcasterGroups = new Map();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === excludeSocket) {
        continue;
      }
      if (typeof socket.readyState === "number" && socket.readyState !== 1) {
        continue;
      }
      const session = normalizeAttachment(socket.deserializeAttachment());
      if (
        !session?.isRoomOwner ||
        session.role !== "broadcaster" ||
        !session.user?.id
      ) {
        continue;
      }
      const group = broadcasterGroups.get(session.user.id) ?? [];
      group.push({ socket, session });
      broadcasterGroups.set(session.user.id, group);
    }

    for (const group of broadcasterGroups.values()) {
      const activeController =
        group.find(({ session }) => session.canControlBroadcast) ??
        group
          .slice()
          .sort(
            (left, right) =>
              left.session.connectedAt - right.session.connectedAt,
          )[0];
      for (const entry of group) {
        const canControlBroadcast = entry === activeController;
        if (entry.session.canControlBroadcast === canControlBroadcast) {
          continue;
        }
        const nextSession = {
          ...entry.session,
          canControlBroadcast,
        };
        entry.socket.serializeAttachment(nextSession);
        this.send(entry.socket, {
          type: "broadcast.control.changed",
          canControlBroadcast,
          moderation: getPublicModerationState(
            this.roomState.moderation,
            Date.now(),
            this.roomState.stream.isLive,
            canControlBroadcast,
          ),
        });
      }
    }
  }

  broadcastPresence() {
    this.broadcast({
      type: "presence.snapshot",
      ...this.getPresenceSnapshot(),
    });
  }

  getPresenceSnapshot() {
    const loggedInViewersById = new Map();
    let anonymousViewerCount = 0;

    for (const socket of this.ctx.getWebSockets()) {
      const session = normalizeAttachment(socket.deserializeAttachment());
      if (!session || session.role === "broadcaster") {
        continue;
      }

      if (!session.user?.id) {
        anonymousViewerCount += 1;
        continue;
      }

      if (loggedInViewersById.has(session.user.id)) {
        continue;
      }

      loggedInViewersById.set(session.user.id, {
        id: session.user.id,
        displayName: session.user.displayName || "已登录用户",
        avatarUrl: session.user.avatarUrl || "",
      });
    }

    const loggedInViewers = Array.from(loggedInViewersById.values()).sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName, "zh-Hans-CN"),
    );

    return {
      onlineCount: anonymousViewerCount + loggedInViewers.length,
      loggedInViewers,
    };
  }

  hasActiveBroadcastController(userId) {
    for (const socket of this.ctx.getWebSockets()) {
      const session = normalizeAttachment(socket.deserializeAttachment());
      if (
        session?.role === "broadcaster" &&
        session.canControlBroadcast &&
        (!userId || session.user?.id === userId)
      ) {
        return true;
      }
    }
    return false;
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
      code,
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

    const activeMute = getActiveChatMute(
      this.roomState.moderation,
      session.user.id,
      Date.now(),
      this.roomState.stream.isLive,
    );
    if (activeMute) {
      this.sendError(ws, "chat_muted", {
        expiresAt: activeMute.expiresAt,
        untilStreamEnds: activeMute.untilStreamEnds,
      });
      return;
    }

    const text = sanitizeMessage(payload.text);
    if (!text) {
      this.sendError(ws, "empty_message");
      return;
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
      this.sendError(ws, "message_too_long", {
        maxLength: MAX_MESSAGE_LENGTH,
      });
      return;
    }

    const now = Date.now();
    const sentAt = Array.isArray(session.sentAt)
      ? session.sentAt.filter(
          (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
        )
      : [];

    if (sentAt.length >= RATE_LIMIT_MAX_MESSAGES) {
      this.sendError(ws, "rate_limited");
      return;
    }

    sentAt.push(now);
    ws.serializeAttachment({
      ...session,
      sentAt,
    });

    const message = {
      id: crypto.randomUUID(),
      room: session.room,
      text,
      sentAt: new Date(now).toISOString(),
      user: {
        id: session.user.id,
        displayName:
          session.user.displayName || session.user.email || "匿名用户",
        avatarUrl: session.user.avatarUrl || "",
        email: session.user.email || "",
      },
    };

    const nextMessages = this.recentMessages
      .concat(message)
      .slice(-MAX_RECENT_MESSAGES);
    const persisted = await this.persistStorageOrNotify(
      ws,
      "recentMessages",
      nextMessages,
    );
    if (!persisted) {
      return;
    }
    this.recentMessages = nextMessages;

    this.broadcast({
      type: "message.created",
      message,
    });
  }

  async handleMessageRetract(ws, session, payload) {
    if (!session.isRoomOwner || !session.canControlBroadcast) {
      this.sendError(ws, "forbidden_message_retract");
      return;
    }

    const messageId =
      typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    if (!messageId) {
      this.sendError(ws, "message_missing");
      return;
    }

    const nextMessages = this.recentMessages.filter(
      (message) => message.id !== messageId,
    );
    if (nextMessages.length === this.recentMessages.length) {
      return;
    }

    const persisted = await this.persistStorageOrNotify(
      ws,
      "recentMessages",
      nextMessages,
    );
    if (!persisted) {
      return;
    }
    this.recentMessages = nextMessages;

    this.broadcast({
      type: "message.retracted",
      messageId,
    });
  }

  async handleMessageMute(ws, session, payload) {
    if (!session.isRoomOwner || !session.canControlBroadcast) {
      this.sendError(ws, "forbidden_message_mute");
      return;
    }

    const messageId =
      typeof payload.messageId === "string" ? payload.messageId.trim() : "";
    if (!messageId) {
      this.sendError(ws, "message_missing");
      return;
    }

    const targetMessage = this.recentMessages.find(
      (message) => message.id === messageId,
    );
    if (!targetMessage) {
      this.sendError(ws, "message_missing");
      return;
    }

    const targetUserId = String(targetMessage.user?.id || "").trim();
    if (!targetUserId || targetUserId === session.user?.id) {
      this.sendError(ws, "invalid_message_mute_target");
      return;
    }

    const untilStreamEnds = payload.untilStreamEnds === true;
    const durationMs = untilStreamEnds
      ? null
      : sanitizeMuteDurationMs(payload.durationMs);
    if (!untilStreamEnds && durationMs === null) {
      this.sendError(ws, "invalid_mute_duration");
      return;
    }

    const now = Date.now();
    const mutedAt = new Date(now).toISOString();
    const mute = {
      userId: targetUserId,
      displayName: sanitizeMuteDisplayName(
        targetMessage.user?.displayName || targetMessage.user?.email || "用户",
      ),
      mutedAt,
      expiresAt: untilStreamEnds
        ? null
        : new Date(now + durationMs).toISOString(),
      untilStreamEnds,
    };
    const currentModeration = normalizeModerationState(
      this.roomState.moderation,
      now,
      this.roomState.stream.isLive,
    );
    const nextModeration = {
      ...currentModeration,
      mutedUsers: currentModeration.mutedUsers
        .filter((entry) => entry.userId !== targetUserId)
        .concat(mute),
    };
    const nextRoomState = {
      ...this.roomState,
      moderation: nextModeration,
    };
    const persisted = await this.persistStorageOrNotify(
      ws,
      "roomState",
      nextRoomState,
    );
    if (!persisted) {
      return;
    }
    this.roomState = nextRoomState;

    if (payload.retractMessage === true) {
      const nextMessages = this.recentMessages.filter(
        (message) => message.id !== messageId,
      );
      if (nextMessages.length !== this.recentMessages.length) {
        const messagesPersisted = await this.persistStorageOrNotify(
          ws,
          "recentMessages",
          nextMessages,
        );
        if (!messagesPersisted) {
          return;
        }
        this.recentMessages = nextMessages;
        this.broadcast({
          type: "message.retracted",
          messageId,
        });
      }
    }

    this.sendModerationEvent({
      type: "message.muted",
      id: `mute-${Date.now().toString(36)}-${crypto.randomUUID()}`,
      mute: getPublicChatMute(mute),
      moderation: getPublicModerationState(
        this.roomState.moderation,
        Date.now(),
        this.roomState.stream.isLive,
        true,
      ),
    });
  }

  async handleMessageUnmute(ws, session, payload) {
    if (!session.isRoomOwner || !session.canControlBroadcast) {
      this.sendError(ws, "forbidden_message_mute");
      return;
    }

    const targetUserId = String(payload.userId || "").trim();
    if (!targetUserId) {
      this.sendError(ws, "invalid_message_mute_target");
      return;
    }

    const currentModeration = normalizeModerationState(
      this.roomState.moderation,
      Date.now(),
      this.roomState.stream.isLive,
    );
    const removedMute =
      currentModeration.mutedUsers.find(
        (entry) => entry.userId === targetUserId,
      ) || null;
    const nextMutedUsers = currentModeration.mutedUsers.filter(
      (entry) => entry.userId !== targetUserId,
    );
    if (nextMutedUsers.length === currentModeration.mutedUsers.length) {
      return;
    }

    const nextRoomState = {
      ...this.roomState,
      moderation: {
        ...currentModeration,
        mutedUsers: nextMutedUsers,
      },
    };
    const persisted = await this.persistStorageOrNotify(
      ws,
      "roomState",
      nextRoomState,
    );
    if (!persisted) {
      return;
    }
    this.roomState = nextRoomState;

    this.sendModerationEvent({
      type: "message.unmuted",
      id: `unmute-${Date.now().toString(36)}-${crypto.randomUUID()}`,
      userId: targetUserId,
      mute: getPublicChatMute(removedMute),
      moderation: getPublicModerationState(
        this.roomState.moderation,
        Date.now(),
        this.roomState.stream.isLive,
        true,
      ),
    });
  }

  sendModerationEvent(payload) {
    const targetUserId = String(payload?.mute?.userId || payload?.userId || "");
    for (const socket of this.ctx.getWebSockets()) {
      const session = normalizeAttachment(socket.deserializeAttachment());
      const isController =
        session?.isRoomOwner &&
        session.role === "broadcaster" &&
        session.canControlBroadcast;
      const isTarget = targetUserId && session?.user?.id === targetUserId;
      if (!isController && !isTarget) {
        continue;
      }
      if (isController) {
        this.send(socket, payload);
      } else {
        const targetPayload = { ...payload };
        delete targetPayload.moderation;
        this.send(socket, targetPayload);
      }
    }
  }

  async handleStreamStarted(ws, session, payload) {
    if (!session.isRoomOwner || !session.canControlBroadcast) {
      this.sendError(ws, "forbidden_stream_update");
      return;
    }

    const nextStream = {
      isLive: true,
      protocol: sanitizeStreamProtocol(payload.stream?.protocol),
      startedAt:
        sanitizeIsoTimestamp(payload.stream?.startedAt) ??
        new Date().toISOString(),
    };
    if (this.roomState.stream.isLive) {
      return;
    }

    const nextRoomState = {
      ...this.roomState,
      stream: nextStream,
      location: getDefaultRoomLocation(),
      cohost: {
        ...this.roomState.cohost,
        invitesAllowed: true,
        active: null,
      },
    };
    const persisted = await this.persistStorageOrNotify(
      ws,
      "roomState",
      nextRoomState,
    );
    if (!persisted) {
      return;
    }
    this.roomState = nextRoomState;
    await this.writeRoomLastStartedAt(session.room, nextStream.startedAt);
    this.broadcast({
      type: "stream.started",
      stream: nextStream,
    });
    this.broadcast({
      type: "room.location.updated",
      location: getPublicRoomLocation(nextRoomState.location),
    });
    this.broadcast({
      type: "cohost.invites.changed",
      invitesAllowed: nextRoomState.cohost.invitesAllowed,
    });
    this.broadcast({
      type: "cohost.active.changed",
      active: nextRoomState.cohost.active,
    });
  }

  async handleStreamStopped(ws, session) {
    if (!session.isRoomOwner || !session.canControlBroadcast) {
      this.sendError(ws, "forbidden_stream_update");
      return;
    }

    if (!this.roomState.stream.isLive) {
      return;
    }

    const previousActive = this.roomState.cohost.active;
    const previousLocation = this.roomState.location;
    const nextRoomState = {
      ...this.roomState,
      stream: getDefaultRoomState().stream,
      location: getDefaultRoomLocation(),
      cohost: {
        ...this.roomState.cohost,
        active: null,
      },
      moderation: clearStreamScopedMutes(this.roomState.moderation),
    };
    const persisted = await this.persistStorageOrNotify(
      ws,
      "roomState",
      nextRoomState,
    );
    if (!persisted) {
      return;
    }
    this.roomState = nextRoomState;
    await this.writeUserLastLocation(session.user?.id, previousLocation);
    this.broadcast({
      type: "stream.stopped",
      stream: this.roomState.stream,
    });
    this.broadcast({
      type: "room.location.updated",
      location: getPublicRoomLocation(this.roomState.location),
    });
    this.broadcast({
      type: "cohost.active.changed",
      active: null,
    });
    await this.clearPeerCohostActive(previousActive);
  }

  async handleRoomUpdated(ws, session, payload) {
    if (!session.isRoomOwner || !session.canControlBroadcast) {
      this.sendError(ws, "forbidden_room_update");
      return;
    }

    const nextRoomMeta = {
      title: sanitizeRoomTitle(payload.roomMeta?.title),
      stream: {
        relayUrl: sanitizeUrl(payload.roomMeta?.stream?.relayUrl),
        namespace: sanitizeNamespace(payload.roomMeta?.stream?.namespace),
        protocol: sanitizeStreamProtocol(payload.roomMeta?.stream?.protocol),
        webRtcUrl: sanitizeUrl(payload.roomMeta?.stream?.webRtcUrl),
      },
    };
    if (areRoomMetaEqual(this.roomState.roomMeta, nextRoomMeta)) {
      return;
    }

    const nextRoomState = {
      ...this.roomState,
      roomMeta: nextRoomMeta,
    };
    const persisted = await this.persistStorageOrNotify(
      ws,
      "roomState",
      nextRoomState,
    );
    if (!persisted) {
      return;
    }
    this.roomState = nextRoomState;
    this.broadcast({
      type: "room.updated",
      roomMeta: nextRoomMeta,
    });
  }

  async handleRoomLocationUpdated(ws, session, payload) {
    if (!session.isRoomOwner || !session.canControlBroadcast) {
      this.sendError(ws, "forbidden_room_location_update");
      return;
    }

    let nextLocation = normalizeRoomLocationInput(payload.location);
    if (nextLocation.enabled) {
      nextLocation = applyStoredRoomLocationResolution(
        nextLocation,
        this.roomState.location,
      );
      if (this.roomState.stream.isLive && !nextLocation.geocodingAttempted) {
        const resolvedAt = new Date().toISOString();
        nextLocation = {
          ...nextLocation,
          province: await reverseGeocodeProvince(
            nextLocation.latitude,
            nextLocation.longitude,
            this.env,
          ),
          provinceResolvedAt: resolvedAt,
          geocodingAttempted: true,
        };
      }
    }
    if (areRoomLocationsEqual(this.roomState.location, nextLocation)) {
      return;
    }

    const nextRoomState = {
      ...this.roomState,
      location: nextLocation,
    };
    const persisted = await this.persistStorageOrNotify(
      ws,
      "roomState",
      nextRoomState,
    );
    if (!persisted) {
      return;
    }
    this.roomState = nextRoomState;
    await this.writeUserLastLocation(session.user?.id, nextLocation);
    this.broadcast({
      type: "room.location.updated",
      location: getPublicRoomLocation(nextLocation),
    });
  }

  async writeUserLastLocation(userId, location) {
    if (!userId || !this.env?.APP_DB) {
      return;
    }

    const normalized = normalizeRoomLocation(location);
    const province = normalized.enabled
      ? sanitizeLocationProvince(normalized.province)
      : "";
    if (!normalized.enabled || !province) {
      return;
    }

    const updatedAt =
      sanitizeIsoTimestamp(normalized.provinceResolvedAt) ||
      sanitizeIsoTimestamp(normalized.updatedAt) ||
      new Date().toISOString();

    try {
      await this.env.APP_DB.prepare(
        `UPDATE moq_users
         SET last_location_province = ?, last_location_updated_at = ?
         WHERE id = ?`,
      )
        .bind(province || null, updatedAt, userId)
        .run();
    } catch (error) {
      console.warn(
        "Failed to persist user last location",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async writeRoomLastStartedAt(roomId, startedAt) {
    if (!roomId || !this.env?.APP_DB) {
      return;
    }

    const normalizedStartedAt =
      sanitizeIsoTimestamp(startedAt) || new Date().toISOString();
    try {
      await this.env.APP_DB.prepare(
        `UPDATE moq_rooms
         SET last_started_at = ?
         WHERE id = ?`,
      )
        .bind(normalizedStartedAt, roomId)
        .run();
    } catch (error) {
      console.warn(
        "Failed to persist room live start",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async handleLocationDistance(request) {
    const hostLocation = normalizeRoomLocation(this.roomState.location);
    if (!hostLocation.enabled) {
      return json(
        {
          ok: false,
          error: "Location unavailable",
          code: "location_unavailable",
        },
        { status: 404 },
      );
    }
    if (!this.roomState.stream.isLive) {
      return json(
        {
          ok: false,
          error: "Distance unavailable",
          code: "distance_unavailable",
        },
        { status: 409 },
      );
    }

    const payload = await request.json().catch(() => null);
    const viewerLatitude = sanitizeCoordinate(payload?.latitude, -90, 90);
    const viewerLongitude = sanitizeCoordinate(payload?.longitude, -180, 180);
    if (viewerLatitude === null || viewerLongitude === null) {
      return json(
        { ok: false, error: "Invalid location", code: "invalid_location" },
        { status: 400 },
      );
    }

    const distanceMeters = calculateDistanceMeters(
      {
        latitude: hostLocation.latitude,
        longitude: hostLocation.longitude,
      },
      {
        latitude: viewerLatitude,
        longitude: viewerLongitude,
      },
    );

    return json({
      ok: true,
      distanceMeters,
      distanceText: formatDistanceText(distanceMeters),
    });
  }

  async handleCohostInvitesAllowed(ws, session, payload) {
    if (!session.isRoomOwner || !session.canControlBroadcast) {
      this.sendError(ws, "forbidden_cohost_update");
      return;
    }

    const nextCohost = {
      ...this.roomState.cohost,
      invitesAllowed: payload.invitesAllowed !== false,
    };
    if (this.roomState.cohost.invitesAllowed === nextCohost.invitesAllowed) {
      return;
    }

    const nextRoomState = {
      ...this.roomState,
      cohost: nextCohost,
    };
    const persisted = await this.persistStorageOrNotify(
      ws,
      "roomState",
      nextRoomState,
    );
    if (!persisted) {
      return;
    }
    this.roomState = nextRoomState;
    this.broadcast({
      type: "cohost.invites.changed",
      invitesAllowed: nextCohost.invitesAllowed,
    });
  }

  async handleCohostActiveClear(ws, session) {
    if (!session.isRoomOwner || !session.canControlBroadcast) {
      this.sendError(ws, "forbidden_cohost_update");
      return;
    }

    const previousActive = this.roomState.cohost.active;
    if (!previousActive) {
      return;
    }

    const nextRoomState = {
      ...this.roomState,
      cohost: {
        ...this.roomState.cohost,
        active: null,
      },
    };
    const persisted = await this.persistStorageOrNotify(
      ws,
      "roomState",
      nextRoomState,
    );
    if (!persisted) {
      return;
    }

    this.roomState = nextRoomState;
    this.broadcast({
      type: "cohost.active.changed",
      active: null,
    });
    await this.clearPeerCohostActive(previousActive);
  }

  async handleCohostInviteRequest(request) {
    const payload = await request.json().catch(() => ({}));
    const invite = normalizeCohostInvite(payload.invite);
    if (!invite) {
      return json(
        {
          ok: false,
          error: "Invalid cohost invite",
          code: "invalid_cohost_invite",
        },
        { status: 400 },
      );
    }

    if (!this.roomState.stream.isLive || !this.hasActiveBroadcastController()) {
      return json(
        { ok: false, error: "Room is not live", code: "room_not_live" },
        { status: 409 },
      );
    }

    if (this.roomState.cohost.invitesAllowed === false) {
      return json(
        {
          ok: false,
          error: "Cohost invites are blocked",
          code: "cohost_invites_blocked",
        },
        { status: 403 },
      );
    }

    let delivered = 0;
    for (const socket of this.ctx.getWebSockets()) {
      const session = normalizeAttachment(socket.deserializeAttachment());
      if (
        !session?.isRoomOwner ||
        session.role !== "broadcaster" ||
        !session.canControlBroadcast
      ) {
        continue;
      }
      this.send(socket, {
        type: "cohost.invite.received",
        invite,
      });
      delivered += 1;
    }

    if (delivered === 0) {
      return json(
        { ok: false, error: "Room is not live", code: "room_not_live" },
        { status: 409 },
      );
    }

    return json({ ok: true, delivered });
  }

  async handleCohostInviteResponse(request) {
    const payload = await request.json().catch(() => ({}));
    const response = normalizeCohostInviteResponse(payload.response);
    if (!response) {
      return json(
        {
          ok: false,
          error: "Invalid cohost response",
          code: "invalid_cohost_response",
        },
        { status: 400 },
      );
    }

    this.broadcast({
      type: "cohost.invite.responded",
      response,
    });
    return json({ ok: true });
  }

  async handleCohostActiveUpdate(request) {
    const payload = await request.json().catch(() => ({}));
    const active = normalizeCohostActive(payload.active);
    const nextCohost = {
      ...this.roomState.cohost,
      active,
    };
    const nextRoomState = {
      ...this.roomState,
      cohost: nextCohost,
    };
    this.roomState = nextRoomState;
    await this.ctx.storage.put("roomState", nextRoomState);
    this.broadcast({
      type: "cohost.active.changed",
      active,
    });
    return json({ ok: true });
  }

  async clearPeerCohostActive(active) {
    if (!active?.peerRoomId || !this.env?.CHAT_ROOM) {
      return;
    }

    try {
      const stub = this.env.CHAT_ROOM.get(
        this.env.CHAT_ROOM.idFromName(active.peerRoomId),
      );
      await stub.fetch(
        new Request("https://chat-room.internal/cohost/active", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ active: null }),
        }),
      );
    } catch (error) {
      console.warn(
        "Failed to clear peer cohost state",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  handleBroadcastControlCheck(ws, session, payload) {
    const requestId = sanitizeRequestId(payload?.requestId);
    const canControlBroadcast =
      session.isRoomOwner &&
      session.role === "broadcaster" &&
      session.canControlBroadcast;

    this.send(ws, {
      type: "broadcast.control.checked",
      requestId,
      canControlBroadcast,
    });

    if (!canControlBroadcast) {
      this.sendError(ws, "broadcast_control_read_only", { requestId });
    }
  }

  handleBroadcastControlRelease(ws, session) {
    if (
      !session.isRoomOwner ||
      session.role !== "broadcaster" ||
      !session.user?.id
    ) {
      return;
    }

    const hadControl = session.canControlBroadcast;
    ws.serializeAttachment({
      ...session,
      canControlBroadcast: false,
    });

    if (hadControl) {
      this.send(ws, {
        type: "broadcast.control.changed",
        canControlBroadcast: false,
      });
    }
    try {
      ws.close(1000, "broadcast_control_released");
    } catch {
      // Ignore close failures on already-closing sockets.
    }
    this.refreshBroadcastControlState({ excludeSocket: ws });
    this.broadcastPresence();
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
      console.warn(
        `Skipped Durable Object write for ${key} because free tier row quota was exceeded.`,
      );
      return false;
    }
  }
}

function json(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), {
    ...init,
    headers,
  });
}

function getDefaultRoomState() {
  return {
    stream: {
      isLive: false,
      protocol: STREAM_PROTOCOL_MOQ,
      startedAt: null,
    },
    roomMeta: {
      title: "",
      stream: {
        relayUrl: "",
        namespace: "",
        protocol: STREAM_PROTOCOL_MOQ,
        webRtcUrl: "",
      },
    },
    location: getDefaultRoomLocation(),
    cohost: getDefaultCohostState(),
    moderation: getDefaultModerationState(),
  };
}

function normalizeRoomState(roomState) {
  return {
    stream: {
      isLive: Boolean(roomState?.stream?.isLive),
      protocol: sanitizeStreamProtocol(roomState?.stream?.protocol),
      startedAt: sanitizeIsoTimestamp(roomState?.stream?.startedAt),
    },
    roomMeta: {
      title: sanitizeRoomTitle(roomState?.roomMeta?.title),
      stream: {
        relayUrl: sanitizeUrl(roomState?.roomMeta?.stream?.relayUrl),
        namespace: sanitizeNamespace(roomState?.roomMeta?.stream?.namespace),
        protocol: sanitizeStreamProtocol(roomState?.roomMeta?.stream?.protocol),
        webRtcUrl: sanitizeUrl(roomState?.roomMeta?.stream?.webRtcUrl),
      },
    },
    location: normalizeRoomLocation(roomState?.location),
    cohost: normalizeCohostState(roomState?.cohost),
    moderation: normalizeModerationState(
      roomState?.moderation,
      Date.now(),
      Boolean(roomState?.stream?.isLive),
    ),
  };
}

function getDefaultModerationState() {
  return {
    mutedUsers: [],
  };
}

function normalizeModerationState(
  moderation,
  now = Date.now(),
  streamLive = false,
) {
  const mutedUsers = Array.isArray(moderation?.mutedUsers)
    ? moderation.mutedUsers
        .map((entry) => normalizeChatMute(entry))
        .filter((entry) => entry && isChatMuteActive(entry, now, streamLive))
    : [];

  return {
    mutedUsers,
  };
}

function normalizeChatMute(entry) {
  const userId = String(entry?.userId || "").trim();
  if (!userId) {
    return null;
  }

  const untilStreamEnds = entry?.untilStreamEnds === true;
  const expiresAt = untilStreamEnds
    ? null
    : sanitizeIsoTimestamp(entry?.expiresAt);
  if (!untilStreamEnds && !expiresAt) {
    return null;
  }

  return {
    userId,
    displayName: sanitizeMuteDisplayName(entry?.displayName),
    mutedAt: sanitizeIsoTimestamp(entry?.mutedAt) || new Date().toISOString(),
    expiresAt,
    untilStreamEnds,
  };
}

function getActiveChatMute(
  moderation,
  userId,
  now = Date.now(),
  streamLive = false,
) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return null;
  }
  const state = normalizeModerationState(moderation, now, streamLive);
  return (
    state.mutedUsers.find((entry) => entry.userId === normalizedUserId) || null
  );
}

function isChatMuteActive(mute, now = Date.now(), streamLive = false) {
  if (!mute) {
    return false;
  }
  if (mute.untilStreamEnds) {
    return streamLive;
  }
  const expiresAt = Date.parse(mute.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function getPublicChatMute(mute) {
  if (!mute) {
    return null;
  }
  return {
    userId: mute.userId,
    displayName: mute.displayName,
    expiresAt: mute.expiresAt,
    untilStreamEnds: mute.untilStreamEnds,
  };
}

function getPublicModerationState(
  moderation,
  now = Date.now(),
  streamLive = false,
  canView = false,
) {
  if (!canView) {
    return {
      mutedUsers: [],
    };
  }
  const state = normalizeModerationState(moderation, now, streamLive);
  return {
    mutedUsers: state.mutedUsers
      .map((entry) => getPublicChatMute(entry))
      .filter(Boolean)
      .sort((left, right) => {
        const leftTime = left.untilStreamEnds
          ? Number.MAX_SAFE_INTEGER
          : Date.parse(left.expiresAt);
        const rightTime = right.untilStreamEnds
          ? Number.MAX_SAFE_INTEGER
          : Date.parse(right.expiresAt);
        return (
          leftTime - rightTime ||
          left.displayName.localeCompare(right.displayName, "zh-Hans-CN")
        );
      }),
  };
}

function clearStreamScopedMutes(moderation) {
  const state = normalizeModerationState(moderation, Date.now(), true);
  return {
    mutedUsers: state.mutedUsers.filter((entry) => !entry.untilStreamEnds),
  };
}

function getDefaultCohostState() {
  return {
    invitesAllowed: true,
    active: null,
  };
}

function normalizeCohostState(cohost) {
  return {
    invitesAllowed: cohost?.invitesAllowed === false ? false : true,
    active: normalizeCohostActive(cohost?.active),
  };
}

function getDefaultRoomLocation() {
  return {
    enabled: false,
    latitude: null,
    longitude: null,
    accuracy: null,
    updatedAt: null,
    province: "",
    provinceResolvedAt: null,
    geocodingAttempted: false,
  };
}

function normalizeRoomLocation(location) {
  if (!location?.enabled) {
    return getDefaultRoomLocation();
  }

  const latitude = sanitizeCoordinate(location.latitude, -90, 90);
  const longitude = sanitizeCoordinate(location.longitude, -180, 180);
  if (latitude === null || longitude === null) {
    return getDefaultRoomLocation();
  }

  return {
    enabled: true,
    latitude,
    longitude,
    accuracy: sanitizeAccuracy(location.accuracy),
    updatedAt:
      sanitizeIsoTimestamp(location.updatedAt) ?? new Date().toISOString(),
    province: sanitizeLocationProvince(location.province),
    provinceResolvedAt: sanitizeIsoTimestamp(location.provinceResolvedAt),
    geocodingAttempted: location.geocodingAttempted === true,
  };
}

function normalizeRoomLocationInput(location) {
  const normalized = normalizeRoomLocation(location);
  return normalized.enabled
    ? {
        ...normalized,
        province: "",
        provinceResolvedAt: null,
        geocodingAttempted: false,
      }
    : normalized;
}

function applyStoredRoomLocationResolution(nextLocation, currentLocation) {
  if (
    !nextLocation.enabled ||
    !currentLocation?.enabled ||
    currentLocation.geocodingAttempted !== true
  ) {
    return nextLocation;
  }

  return {
    ...nextLocation,
    province: sanitizeLocationProvince(currentLocation.province),
    provinceResolvedAt: sanitizeIsoTimestamp(
      currentLocation.provinceResolvedAt,
    ),
    geocodingAttempted: true,
  };
}

function getPublicRoomLocation(location) {
  const normalized = normalizeRoomLocation(location);
  return {
    hasLocation: normalized.enabled,
    province: normalized.enabled ? normalized.province : "",
    updatedAt: normalized.enabled ? normalized.updatedAt : null,
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
    canControlBroadcast: attachment.canControlBroadcast === true,
    readOnly: attachment.readOnly !== false ? true : false,
    user:
      attachment.user && typeof attachment.user === "object"
        ? attachment.user
        : null,
    connectedAt: Number.isFinite(attachment.connectedAt)
      ? attachment.connectedAt
      : 0,
    sentAt: Array.isArray(attachment.sentAt)
      ? attachment.sentAt.filter((value) => typeof value === "number")
      : [],
  };
}

function sanitizeRequestId(value) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function sanitizeInviteId(value) {
  return String(value ?? "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 96);
}

function sanitizeHandle(value) {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24);
}

function sanitizeDisplayName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 48);
}

function normalizeCohostUser(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const handle = sanitizeHandle(value.handle);
  if (!handle) {
    return null;
  }

  return {
    id: String(value.id ?? "")
      .trim()
      .slice(0, 128),
    handle,
    displayName: sanitizeDisplayName(value.displayName),
    avatarUrl: sanitizeUrl(value.avatarUrl),
  };
}

function normalizeCohostStream(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const protocol = sanitizeStreamProtocol(value.protocol);
  const relayUrl = sanitizeUrl(value.relayUrl);
  const namespace = sanitizeNamespace(value.namespace);
  const webRtcUrl = sanitizeUrl(value.webRtcUrl);
  const moqReady = protocol === STREAM_PROTOCOL_MOQ && relayUrl && namespace;
  const webRtcReady = protocol === STREAM_PROTOCOL_WEBRTC && webRtcUrl;
  if (!moqReady && !webRtcReady) {
    return null;
  }

  return {
    relayUrl,
    namespace,
    protocol,
    webRtcUrl,
  };
}

function normalizeCohostInvite(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = sanitizeInviteId(value.id);
  const requesterRoomId = sanitizeNamespace(value.requesterRoomId);
  const targetRoomId = sanitizeNamespace(value.targetRoomId);
  const requester = normalizeCohostUser(value.requester);
  const requestedAt =
    sanitizeIsoTimestamp(value.requestedAt) ?? new Date().toISOString();
  if (!id || !requesterRoomId || !targetRoomId || !requester) {
    return null;
  }

  if (Date.now() - Date.parse(requestedAt) > COHOST_INVITE_TTL_MS) {
    return null;
  }

  return {
    id,
    requesterRoomId,
    targetRoomId,
    requestedAt,
    requester,
  };
}

function normalizeCohostInviteResponse(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = sanitizeInviteId(value.id);
  const target = normalizeCohostUser(value.target);
  if (!id || !target) {
    return null;
  }

  return {
    id,
    accepted: Boolean(value.accepted),
    respondedAt:
      sanitizeIsoTimestamp(value.respondedAt) ?? new Date().toISOString(),
    target,
  };
}

function normalizeCohostActive(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const peerRoomId = sanitizeNamespace(value.peerRoomId);
  const peer = normalizeCohostUser(value.peer);
  const stream = normalizeCohostStream(value.stream);
  if (!peerRoomId || !peer || !stream) {
    return null;
  }

  return {
    id: sanitizeInviteId(value.id) || `cohost-${Date.now().toString(36)}`,
    peerRoomId,
    acceptedAt:
      sanitizeIsoTimestamp(value.acceptedAt) ?? new Date().toISOString(),
    peer,
    stream,
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
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeRoomTitle(value) {
  const title = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
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
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function sanitizeNamespace(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 128);
}

function sanitizeStreamProtocol(value) {
  return value === STREAM_PROTOCOL_WEBRTC
    ? STREAM_PROTOCOL_WEBRTC
    : STREAM_PROTOCOL_MOQ;
}

function sanitizeCoordinate(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    return null;
  }
  return Math.round(number * 1_000_000) / 1_000_000;
}

function sanitizeAccuracy(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }
  return Math.round(number);
}

function sanitizeLocationProvince(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function sanitizeMuteDisplayName(value) {
  return (
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "用户"
  );
}

function sanitizeMuteDurationMs(value) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs)) {
    return null;
  }
  const normalized = Math.round(durationMs);
  if (normalized < 60_000 || normalized > MAX_CHAT_MUTE_DURATION_MS) {
    return null;
  }
  return normalized;
}

function calculateDistanceMeters(left, right) {
  const earthRadiusMeters = 6_371_000;
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const sinLatitude = Math.sin(deltaLatitude / 2);
  const sinLongitude = Math.sin(deltaLongitude / 2);
  const rawValue =
    sinLatitude * sinLatitude +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      sinLongitude *
      sinLongitude;
  const value = Math.min(1, Math.max(0, rawValue));
  return Math.max(
    0,
    Math.round(
      earthRadiusMeters *
        2 *
        Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)),
    ),
  );
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function formatDistanceText(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "";
  }

  if (distanceMeters < 100) {
    return "<100 m";
  }

  if (distanceMeters < 1_000) {
    return `${Math.round(distanceMeters / 10) * 10} m`;
  }

  if (distanceMeters < 100_000) {
    const kilometers = distanceMeters / 1_000;
    return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km`;
  }

  return `${Math.round(distanceMeters / 1_000)} km`;
}

async function reverseGeocodeProvince(latitude, longitude, env) {
  const bigDataCloudApiKey = String(env?.BIGDATACLOUD_API_KEY ?? "").trim();
  if (bigDataCloudApiKey) {
    const authenticatedProvince = await reverseGeocodeProvinceWithBigDataCloud(
      latitude,
      longitude,
      BIG_DATA_CLOUD_REVERSE_GEOCODE_URL,
      bigDataCloudApiKey,
    );
    if (authenticatedProvince) {
      return authenticatedProvince;
    }
  }

  return reverseGeocodeProvinceWithBigDataCloud(
    latitude,
    longitude,
    BIG_DATA_CLOUD_FREE_REVERSE_GEOCODE_URL,
  );
}

async function reverseGeocodeProvinceWithBigDataCloud(
  latitude,
  longitude,
  endpoint,
  apiKey = "",
) {
  const url = new URL(endpoint);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("localityLanguage", "zh");
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, BIG_DATA_CLOUD_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return "";
    }

    const payload = await response.json().catch(() => null);
    return sanitizeLocationProvince(
      payload?.principalSubdivision ||
        payload?.city ||
        payload?.countryName ||
        "",
    );
  } catch (error) {
    console.warn(
      "BigDataCloud reverse geocode failed",
      error instanceof Error ? error.message : String(error),
    );
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

function areRoomMetaEqual(left, right) {
  return (
    String(left?.title ?? "") === String(right?.title ?? "") &&
    String(left?.stream?.relayUrl ?? "") ===
      String(right?.stream?.relayUrl ?? "") &&
    String(left?.stream?.namespace ?? "") ===
      String(right?.stream?.namespace ?? "") &&
    String(left?.stream?.protocol ?? STREAM_PROTOCOL_MOQ) ===
      String(right?.stream?.protocol ?? STREAM_PROTOCOL_MOQ) &&
    String(left?.stream?.webRtcUrl ?? "") ===
      String(right?.stream?.webRtcUrl ?? "")
  );
}

function areRoomLocationsEqual(left, right) {
  return (
    Boolean(left?.enabled) === Boolean(right?.enabled) &&
    Number(left?.latitude) === Number(right?.latitude) &&
    Number(left?.longitude) === Number(right?.longitude) &&
    Number(left?.accuracy) === Number(right?.accuracy) &&
    String(left?.updatedAt ?? "") === String(right?.updatedAt ?? "") &&
    String(left?.province ?? "") === String(right?.province ?? "") &&
    String(left?.provinceResolvedAt ?? "") ===
      String(right?.provinceResolvedAt ?? "") &&
    Boolean(left?.geocodingAttempted) === Boolean(right?.geocodingAttempted)
  );
}

function isMessageFresh(message, now) {
  if (!message || typeof message !== "object") {
    return false;
  }

  const sentAt = Date.parse(message.sentAt);
  return Number.isFinite(sentAt) && now - sentAt < MESSAGE_TTL_MS;
}

function isDurableObjectWriteLimitError(error) {
  return (
    error instanceof Error ? error.message : String(error ?? "")
  ).includes(DURABLE_OBJECT_FREE_TIER_WRITE_LIMIT_MESSAGE);
}
