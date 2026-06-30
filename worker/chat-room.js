import {
  getActiveChatMute,
  getDefaultRoomState,
  getPublicAudienceCallState,
  getPublicChatMute,
  getPublicModerationState,
  getPublicRoomLocation,
  isDurableObjectWriteLimitError,
  json,
  normalizeAttachment,
  normalizeRoomState,
  parseUserHeader,
} from "./chat-room/utils.js";

import * as chatHandlers from "./chat-room/chat.js";
import * as streamroomHandlers from "./chat-room/stream-room.js";
import * as cohostHandlers from "./chat-room/cohost.js";
import * as audiencecallHandlers from "./chat-room/audience-call.js";
import * as webrtcproxyHandlers from "./chat-room/webrtc-proxy.js";
import * as broadcastcontrolHandlers from "./chat-room/broadcast-control.js";

export class ChatRoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.recentMessages = [];
    this.roomState = getDefaultRoomState();
    this.audienceCallSpeakingUserIds = [];
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
      await chatHandlers.persistPrunedMessages(this);
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
        audienceCall: getPublicAudienceCallState(
          this.roomState.audienceCall,
          false,
          this.audienceCallSpeakingUserIds,
        ),
      });
    }

    if (request.method === "POST" && url.pathname.endsWith("/cohost/request")) {
      return await cohostHandlers.handleCohostInviteRequest(this, request);
    }

    if (
      request.method === "POST" &&
      url.pathname.endsWith("/cohost/response")
    ) {
      return await cohostHandlers.handleCohostInviteResponse(this, request);
    }

    if (request.method === "POST" && url.pathname.endsWith("/cohost/active")) {
      return await cohostHandlers.handleCohostActiveUpdate(this, request);
    }

    if (
      request.method === "POST" &&
      url.pathname.endsWith("/webrtc/proxy-sessions")
    ) {
      return await webrtcproxyHandlers.handleWebRtcProxySessionRegister(this, request);
    }

    if (
      ["GET", "PATCH", "DELETE"].includes(request.method) &&
      /\/webrtc\/proxy-sessions\/[^/]+$/.test(url.pathname)
    ) {
      return await webrtcproxyHandlers.handleWebRtcProxySessionResource(this, request);
    }

    if (
      request.method === "POST" &&
      url.pathname.endsWith("/location/distance")
    ) {
      return await streamroomHandlers.handleLocationDistance(this, request);
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
      audienceCall: getPublicAudienceCallState(
        this.roomState.audienceCall,
        canControlBroadcast,
        this.audienceCallSpeakingUserIds,
      ),
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
    chatHandlers.pruneRecentMessages(this);
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
      await chatHandlers.handleMessageSend(this, ws, session, payload);
      return;
    }

    if (payload?.type === "message.retract") {
      await chatHandlers.handleMessageRetract(this, ws, session, payload);
      return;
    }

    if (payload?.type === "message.mute") {
      await chatHandlers.handleMessageMute(this, ws, session, payload);
      return;
    }

    if (payload?.type === "message.unmute") {
      await chatHandlers.handleMessageUnmute(this, ws, session, payload);
      return;
    }

    if (payload?.type === "stream.started") {
      await streamroomHandlers.handleStreamStarted(this, ws, session, payload);
      return;
    }

    if (payload?.type === "stream.stopped") {
      await streamroomHandlers.handleStreamStopped(this, ws, session);
      return;
    }

    if (payload?.type === "room.updated") {
      await streamroomHandlers.handleRoomUpdated(this, ws, session, payload);
      return;
    }

    if (payload?.type === "room.location.updated") {
      await streamroomHandlers.handleRoomLocationUpdated(this, ws, session, payload);
      return;
    }

    if (payload?.type === "cohost.invites.set_allowed") {
      await cohostHandlers.handleCohostInvitesAllowed(this, ws, session, payload);
      return;
    }

    if (payload?.type === "cohost.active.clear") {
      await cohostHandlers.handleCohostActiveClear(this, ws, session);
      return;
    }

    if (payload?.type === "audience_call.set_enabled") {
      await audiencecallHandlers.handleAudienceCallEnabledUpdate(this, ws, session, payload);
      return;
    }

    if (payload?.type === "audience_call.request") {
      await audiencecallHandlers.handleAudienceCallRequest(this, ws, session);
      return;
    }

    if (payload?.type === "audience_call.request.cancel") {
      await audiencecallHandlers.handleAudienceCallRequestCancel(this, ws, session);
      return;
    }

    if (payload?.type === "audience_call.respond") {
      await audiencecallHandlers.handleAudienceCallRespond(this, ws, session, payload);
      return;
    }

    if (payload?.type === "audience_call.invite") {
      await audiencecallHandlers.handleAudienceCallInvite(this, ws, session, payload);
      return;
    }

    if (payload?.type === "audience_call.invite.respond") {
      await audiencecallHandlers.handleAudienceCallInviteRespond(this, ws, session, payload);
      return;
    }

    if (payload?.type === "audience_call.viewer_ready") {
      audiencecallHandlers.handleAudienceCallViewerReady(this, ws, session, payload);
      return;
    }

    if (payload?.type === "audience_call.viewer_failed") {
      audiencecallHandlers.handleAudienceCallViewerFailed(this, ws, session, payload);
      return;
    }

    if (payload?.type === "audience_call.viewer_leave") {
      audiencecallHandlers.handleAudienceCallViewerLeave(this, ws, session);
      return;
    }

    if (payload?.type === "audience_call.active.remove") {
      await audiencecallHandlers.handleAudienceCallActiveRemove(this, ws, session, payload);
      return;
    }

    if (payload?.type === "audience_call.speaking") {
      audiencecallHandlers.handleAudienceCallSpeakingUpdate(this, ws, session, payload);
      return;
    }

    if (payload?.type === "broadcast.control.check") {
      broadcastcontrolHandlers.handleBroadcastControlCheck(this, ws, session, payload);
      return;
    }

    if (payload?.type === "broadcast.control.release") {
      broadcastcontrolHandlers.handleBroadcastControlRelease(this, ws, session);
      return;
    }

    if (payload?.type === "presence.leave") {
      this.refreshBroadcastControlState({ excludeSocket: ws });
      this.broadcastPresence({ excludeSocket: ws });
      ws.close(1000, "presence_leave");
      return;
    }

    this.sendError(ws, "unsupported_event", {
      eventType: typeof payload?.type === "string" ? payload.type : "",
    });
  }

  async webSocketClose(ws, code, reason) {
    ws.close(code, reason);
    this.refreshBroadcastControlState({ excludeSocket: ws });
    this.broadcastPresence({ excludeSocket: ws });
  }

  async webSocketError(ws) {
    try {
      ws.close(1011, "chat_error");
    } catch {
      return;
    } finally {
      this.refreshBroadcastControlState({ excludeSocket: ws });
      this.broadcastPresence({ excludeSocket: ws });
    }
  }

  getActiveSockets({ excludeSocket = null } = {}) {
    return this.ctx.getWebSockets().filter((socket) => {
      if (socket === excludeSocket) {
        return false;
      }
      return typeof socket.readyState !== "number" || socket.readyState === 1;
    });
  }

  getActiveSessions(options = {}) {
    return this.getActiveSockets(options)
      .map((socket) => ({
        socket,
        session: normalizeAttachment(socket.deserializeAttachment()),
      }))
      .filter(({ session }) => Boolean(session));
  }

  refreshBroadcastControlState({ excludeSocket = null } = {}) {
    const broadcasterGroups = new Map();
    for (const { socket, session } of this.getActiveSessions({ excludeSocket })) {
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

  broadcastPresence(options = {}) {
    this.broadcast({
      type: "presence.snapshot",
      ...this.getPresenceSnapshot(options),
    }, options);
  }

  getPresenceSnapshot(options = {}) {
    const loggedInViewersById = new Map();
    let anonymousViewerCount = 0;
    const now = Date.now();

    for (const { session } of this.getActiveSessions(options)) {
      if (session.role === "broadcaster") {
        continue;
      }

      if (!session.user?.id) {
        anonymousViewerCount += 1;
        continue;
      }

      const watchDurationMs = Math.max(0, now - (Number(session.connectedAt) || now));
      const existingViewer = loggedInViewersById.get(session.user.id);
      if (existingViewer && existingViewer.watchDurationMs >= watchDurationMs) {
        continue;
      }

      loggedInViewersById.set(session.user.id, {
        id: session.user.id,
        handle: session.user.handle || "",
        displayName: session.user.displayName || "已登录用户",
        avatarUrl: session.user.avatarUrl || "",
        watchDurationMs,
      });
    }

    const loggedInViewers = Array.from(loggedInViewersById.values()).sort(
      (left, right) =>
        right.watchDurationMs - left.watchDurationMs ||
        left.displayName.localeCompare(right.displayName, "zh-Hans-CN"),
    ).slice(0, 100);

    return {
      onlineCount: anonymousViewerCount + loggedInViewers.length,
      loggedInViewers,
    };
  }

  hasActiveBroadcastController(userId) {
    for (const { session } of this.getActiveSessions()) {
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

  broadcast(payload, options = {}) {
    const serialized = JSON.stringify(payload);
    for (const socket of this.getActiveSockets(options)) {
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
}
