import { useEffect, useRef, useState } from "react";
import { createAppError } from "../lib/appErrors.js";
import { getChatErrorMessage } from "../lib/chatErrors.js";
import {
  DEFAULT_STREAM_PROTOCOL,
  normalizeStreamProtocol,
} from "../lib/streamProtocol.js";

const RECONNECT_DELAYS_MS = [
  1_000,
  2_000,
  3_000,
  15_000,
  30_000,
  60_000
];
const MAX_RECONNECT_ATTEMPTS = RECONNECT_DELAYS_MS.length;
const CONNECTION_WINDOW_MS = 5 * 60_000;
const MAX_CONNECTIONS_PER_WINDOW = 20;
const BROADCAST_CONTROL_CHECK_TIMEOUT_MS = 4_000;
const PAGE_RESTORE_SILENT_RECONNECT_WINDOW_MS = 4_000;

function upsertMessages(currentMessages, incomingMessages) {
  const deduped = new Map(currentMessages.map((message) => [message.id, message]));
  for (const message of incomingMessages) {
    deduped.set(message.id, message);
  }
  return Array.from(deduped.values()).sort((left, right) => {
    if (left.sentAt === right.sentAt) {
      return left.id.localeCompare(right.id);
    }
    return left.sentAt.localeCompare(right.sentAt);
  });
}

function getDefaultStreamState() {
  return {
    isLive: false,
    protocol: DEFAULT_STREAM_PROTOCOL,
    startedAt: null
  };
}

function getDefaultRoomMeta() {
  return {
    title: "",
    stream: {
      relayUrl: "",
      namespace: "",
      protocol: DEFAULT_STREAM_PROTOCOL,
      webRtcUrl: ""
    }
  };
}

function getDefaultRoomLocation() {
  return {
    hasLocation: false,
    province: "",
    updatedAt: null
  };
}

function getDefaultCohostState() {
  return {
    invitesAllowed: true,
    active: null
  };
}

function normalizeRoomLocation(value) {
  if (!value || typeof value !== "object") {
    return getDefaultRoomLocation();
  }

  return {
    hasLocation: value.hasLocation === true,
    province: String(value.province ?? "").trim(),
    updatedAt: String(value.updatedAt ?? "").trim() || null
  };
}

function normalizeLoggedInViewers(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((viewer) => ({
      id: String(viewer?.id ?? "").trim(),
      displayName: String(viewer?.displayName ?? "").trim(),
      avatarUrl: String(viewer?.avatarUrl ?? "").trim()
    }))
    .filter((viewer) => viewer.id)
    .slice(0, 100);
}

function normalizeCohostInvite(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = String(value.id ?? "").trim();
  const requesterRoomId = String(value.requesterRoomId ?? "").trim();
  const requesterHandle = String(value.requester?.handle ?? "").trim();
  if (!id || !requesterRoomId || !requesterHandle) {
    return null;
  }

  return {
    id,
    requesterRoomId,
    targetRoomId: String(value.targetRoomId ?? "").trim(),
    requestedAt: String(value.requestedAt ?? "").trim(),
    requester: {
      id: String(value.requester?.id ?? "").trim(),
      handle: requesterHandle,
      displayName: String(value.requester?.displayName ?? "").trim(),
      avatarUrl: String(value.requester?.avatarUrl ?? "").trim()
    }
  };
}

function normalizeCohostInviteResponse(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const id = String(value.id ?? "").trim();
  const targetHandle = String(value.target?.handle ?? "").trim();
  if (!id || !targetHandle) {
    return null;
  }

  return {
    id,
    accepted: Boolean(value.accepted),
    respondedAt: String(value.respondedAt ?? "").trim(),
    target: {
      id: String(value.target?.id ?? "").trim(),
      handle: targetHandle,
      displayName: String(value.target?.displayName ?? "").trim(),
      avatarUrl: String(value.target?.avatarUrl ?? "").trim()
    }
  };
}

function normalizeCohostActive(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const peerRoomId = String(value.peerRoomId ?? "").trim();
  const peerHandle = String(value.peer?.handle ?? "").trim();
  const protocol = normalizeStreamProtocol(value.stream?.protocol);
  const stream = {
    relayUrl: String(value.stream?.relayUrl ?? "").trim(),
    namespace: String(value.stream?.namespace ?? "").trim(),
    protocol,
    webRtcUrl: String(value.stream?.webRtcUrl ?? "").trim()
  };
  const moqReady = protocol !== "webrtc" && stream.relayUrl && stream.namespace;
  const webRtcReady = protocol === "webrtc" && stream.webRtcUrl;
  if (!peerRoomId || !peerHandle || (!moqReady && !webRtcReady)) {
    return null;
  }

  return {
    id: String(value.id ?? "").trim(),
    peerRoomId,
    acceptedAt: String(value.acceptedAt ?? "").trim(),
    peer: {
      id: String(value.peer?.id ?? "").trim(),
      handle: peerHandle,
      displayName: String(value.peer?.displayName ?? "").trim(),
      avatarUrl: String(value.peer?.avatarUrl ?? "").trim()
    },
    stream
  };
}

function getReconnectDelayMs(attempt) {
  return RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
}

export function useChatController({
  room,
  enabled,
  authKey,
  role = "viewer",
  log
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [connectionState, setConnectionState] = useState("idle");
  const [onlineCount, setOnlineCount] = useState(0);
  const [loggedInViewers, setLoggedInViewers] = useState([]);
  const [readOnly, setReadOnly] = useState(true);
  const [chatError, setChatError] = useState("");
  const [streamState, setStreamState] = useState(getDefaultStreamState);
  const [roomMeta, setRoomMeta] = useState(getDefaultRoomMeta);
  const [roomLocation, setRoomLocation] = useState(getDefaultRoomLocation);
  const [roomStateReady, setRoomStateReady] = useState(false);
  const [canControlBroadcast, setCanControlBroadcast] = useState(false);
  const [cohostInvitesAllowed, setCohostInvitesAllowed] = useState(true);
  const [cohostInvite, setCohostInvite] = useState(null);
  const [cohostInviteResponse, setCohostInviteResponse] = useState(null);
  const [cohostActive, setCohostActive] = useState(null);
  const [recoveringFromPageLifecycle, setRecoveringFromPageLifecycle] = useState(false);

  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectCountdownTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const connectionAttemptedAtRef = useRef([]);
  const broadcastControlRequestsRef = useRef(new Map());
  const intentionalCloseRef = useRef(false);
  const pageHiddenRef = useRef(typeof document !== "undefined" ? document.hidden : false);
  const lastPageVisibleAtRef = useRef(pageHiddenRef.current ? 0 : Date.now());
  const recoveringFromPageLifecycleRef = useRef(false);
  const logRef = useRef(log);

  logRef.current = log;

  function clearReconnectTimers() {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (reconnectCountdownTimerRef.current) {
      clearInterval(reconnectCountdownTimerRef.current);
      reconnectCountdownTimerRef.current = null;
    }
  }

  function clearBroadcastControlRequests(error = createAppError("broadcast_control_check_cancelled")) {
    for (const request of broadcastControlRequestsRef.current.values()) {
      clearTimeout(request.timeoutId);
      request.reject(error);
    }
    broadcastControlRequestsRef.current.clear();
  }

  function showReconnectCountdown(delayMs) {
    const retryAt = Date.now() + delayMs;
    const updateCountdown = () => {
      const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
      setChatError(getChatErrorMessage({
        code: "socket_retry_scheduled",
        details: { seconds }
      }));
    };

    if (reconnectCountdownTimerRef.current) {
      clearInterval(reconnectCountdownTimerRef.current);
      reconnectCountdownTimerRef.current = null;
    }
    updateCountdown();
    reconnectCountdownTimerRef.current = window.setInterval(updateCountdown, 1_000);
  }

  function reserveConnectionAttempt() {
    const now = Date.now();
    connectionAttemptedAtRef.current = connectionAttemptedAtRef.current.filter(
      (attemptedAt) => now - attemptedAt <= CONNECTION_WINDOW_MS
    );
    if (connectionAttemptedAtRef.current.length >= MAX_CONNECTIONS_PER_WINDOW) {
      return false;
    }
    connectionAttemptedAtRef.current.push(now);
    return true;
  }

  function isLikelyPageLifecycleDisconnect() {
    const now = Date.now();
    return pageHiddenRef.current
      || (lastPageVisibleAtRef.current > 0
        && now - lastPageVisibleAtRef.current <= PAGE_RESTORE_SILENT_RECONNECT_WINDOW_MS);
  }

  function updatePageLifecycleRecovery(nextRecovering) {
    recoveringFromPageLifecycleRef.current = Boolean(nextRecovering);
    setRecoveringFromPageLifecycle(Boolean(nextRecovering));
  }

  useEffect(() => {
    clearReconnectTimers();

    if (!enabled || !room) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setMessages([]);
      setDraft("");
      setConnectionState("idle");
      setOnlineCount(0);
      setLoggedInViewers([]);
      setReadOnly(true);
      setChatError("");
      setStreamState(getDefaultStreamState());
      setRoomMeta(getDefaultRoomMeta());
      setRoomLocation(getDefaultRoomLocation());
      setRoomStateReady(false);
      setCanControlBroadcast(false);
      setCohostInvitesAllowed(true);
      setCohostInvite(null);
      setCohostInviteResponse(null);
      setCohostActive(null);
      updatePageLifecycleRecovery(false);
      clearBroadcastControlRequests();
      reconnectAttemptRef.current = 0;
      connectionAttemptedAtRef.current = [];
      return undefined;
    }

    reconnectAttemptRef.current = 0;
    connectionAttemptedAtRef.current = [];

    let cancelled = false;
    let socket = null;

    const connect = () => {
      intentionalCloseRef.current = false;
      if (!reserveConnectionAttempt()) {
        setConnectionState("closed");
        setChatError(getChatErrorMessage({ code: "socket_reconnect_stopped" }));
        logRef.current?.(
          `chat reconnect stopped after ${MAX_CONNECTIONS_PER_WINDOW} connection attempts in ${Math.round(CONNECTION_WINDOW_MS / 60_000)} minutes`
        );
        return;
      }

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socketUrl = new URL(`/api/chat/${encodeURIComponent(room)}/ws`, `${protocol}//${window.location.host}`);
      socketUrl.searchParams.set("role", role);
      const reconnecting = reconnectAttemptRef.current > 0;
      setConnectionState(reconnecting ? "reconnecting" : "connecting");
      setChatError(reconnecting && !recoveringFromPageLifecycleRef.current
        ? getChatErrorMessage({ code: "socket_retrying" })
        : "");

      socket = new WebSocket(socketUrl);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setConnectionState("connecting");
        setChatError("");
      });

      socket.addEventListener("message", (event) => {
        let payload = null;
        try {
          payload = JSON.parse(event.data);
        } catch {
          setChatError(getChatErrorMessage({ code: "socket_payload_invalid" }));
          return;
        }

        if (payload.type === "chat.snapshot") {
          setConnectionState("connected");
          reconnectAttemptRef.current = 0;
          setMessages(Array.isArray(payload.messages) ? payload.messages : []);
          setOnlineCount(Number(payload.onlineCount) || 0);
          setLoggedInViewers(normalizeLoggedInViewers(payload.loggedInViewers));
          setReadOnly(Boolean(payload.readOnly));
          setCanControlBroadcast(Boolean(payload.canControlBroadcast));
          setStreamState({
            isLive: Boolean(payload.stream?.isLive),
            protocol: normalizeStreamProtocol(payload.stream?.protocol),
            startedAt: payload.stream?.startedAt || null
          });
          setRoomMeta({
            title: payload.roomMeta?.title || "",
            stream: {
              relayUrl: payload.roomMeta?.stream?.relayUrl || "",
              namespace: payload.roomMeta?.stream?.namespace || "",
              protocol: normalizeStreamProtocol(payload.roomMeta?.stream?.protocol),
              webRtcUrl: payload.roomMeta?.stream?.webRtcUrl || ""
            }
          });
          setRoomLocation(normalizeRoomLocation(payload.location));
          setCohostInvitesAllowed(
            payload.cohost?.invitesAllowed === false
              ? false
              : getDefaultCohostState().invitesAllowed
          );
          setCohostActive(normalizeCohostActive(payload.cohost?.active));
          setRoomStateReady(true);
          setChatError("");
          updatePageLifecycleRecovery(false);
          return;
        }

        if (payload.type === "broadcast.control.checked") {
          const request = broadcastControlRequestsRef.current.get(payload.requestId);
          if (!request) {
            return;
          }
          clearTimeout(request.timeoutId);
          broadcastControlRequestsRef.current.delete(payload.requestId);
          setCanControlBroadcast(Boolean(payload.canControlBroadcast));
          request.resolve(Boolean(payload.canControlBroadcast));
          return;
        }

        if (payload.type === "broadcast.control.changed") {
          setCanControlBroadcast(Boolean(payload.canControlBroadcast));
          return;
        }

        if (payload.type === "cohost.invites.changed") {
          setCohostInvitesAllowed(payload.invitesAllowed !== false);
          return;
        }

        if (payload.type === "cohost.invite.received") {
          const invite = normalizeCohostInvite(payload.invite);
          if (invite) {
            setCohostInvite(invite);
          }
          return;
        }

        if (payload.type === "cohost.invite.responded") {
          const response = normalizeCohostInviteResponse(payload.response);
          if (response) {
            setCohostInviteResponse(response);
          }
          return;
        }

        if (payload.type === "cohost.active.changed") {
          setCohostActive(normalizeCohostActive(payload.active));
          return;
        }

        if (payload.type === "message.created" && payload.message) {
          setMessages((current) => upsertMessages(current, [payload.message]));
          return;
        }

        if (payload.type === "message.retracted" && payload.messageId) {
          setMessages((current) => current.filter((message) => message.id !== payload.messageId));
          return;
        }

        if (payload.type === "presence.snapshot") {
          setOnlineCount(Number(payload.onlineCount) || 0);
          setLoggedInViewers(normalizeLoggedInViewers(payload.loggedInViewers));
          return;
        }

        if (payload.type === "stream.started") {
          setStreamState({
            isLive: true,
            protocol: normalizeStreamProtocol(payload.stream?.protocol),
            startedAt: payload.stream?.startedAt || new Date().toISOString()
          });
          return;
        }

        if (payload.type === "stream.stopped") {
          setStreamState(getDefaultStreamState());
          return;
        }

        if (payload.type === "room.updated") {
          setRoomMeta({
            title: payload.roomMeta?.title || "",
            stream: {
              relayUrl: payload.roomMeta?.stream?.relayUrl || "",
              namespace: payload.roomMeta?.stream?.namespace || "",
              protocol: normalizeStreamProtocol(payload.roomMeta?.stream?.protocol),
              webRtcUrl: payload.roomMeta?.stream?.webRtcUrl || ""
            }
          });
          return;
        }

        if (payload.type === "room.location.updated") {
          setRoomLocation(normalizeRoomLocation(payload.location));
          return;
        }

        if (payload.type === "error") {
          if (payload.code === "forbidden_room_update") {
            setChatError("");
            logRef.current?.("chat room update skipped: forbidden_room_update");
            return;
          }
          const message = getChatErrorMessage(payload);
          setChatError(message);
          logRef.current?.(`chat warning: ${payload.code || "unknown"}: ${message}`);
        }
      });

      socket.addEventListener("close", (event) => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        clearBroadcastControlRequests(createAppError("broadcast_control_connection_closed"));
        if (cancelled || intentionalCloseRef.current) {
          return;
        }
        setConnectionState("closed");
        const lifecycleReconnect = isLikelyPageLifecycleDisconnect();
        if (lifecycleReconnect) {
          updatePageLifecycleRecovery(true);
          setChatError("");
        }
        const attempt = reconnectAttemptRef.current;
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          updatePageLifecycleRecovery(false);
          setChatError(getChatErrorMessage({ code: "socket_reconnect_stopped" }));
          logRef.current?.(
            `chat reconnect stopped after ${MAX_RECONNECT_ATTEMPTS} attempts; close code=${event.code}, reason=${event.reason || ""}, wasClean=${event.wasClean}`
          );
          return;
        }

        const delay = getReconnectDelayMs(attempt);
        reconnectAttemptRef.current = attempt + 1;
        if (lifecycleReconnect) {
          logRef.current?.(
            `chat reconnect scheduled silently after page lifecycle close in ${delay}ms (attempt ${attempt + 1}, code=${event.code}, reason=${event.reason || ""}, wasClean=${event.wasClean})`
          );
        } else {
          updatePageLifecycleRecovery(false);
          showReconnectCountdown(delay);
          logRef.current?.(
            `chat reconnect scheduled in ${delay}ms (attempt ${attempt + 1}, code=${event.code}, reason=${event.reason || ""}, wasClean=${event.wasClean})`
          );
        }
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        reconnectTimerRef.current = window.setTimeout(() => {
          if (reconnectCountdownTimerRef.current) {
            clearInterval(reconnectCountdownTimerRef.current);
            reconnectCountdownTimerRef.current = null;
          }
          if (!cancelled) {
            connect();
          }
        }, delay);
      });

      socket.addEventListener("error", () => {
        if (isLikelyPageLifecycleDisconnect()) {
          updatePageLifecycleRecovery(true);
          setChatError("");
          return;
        }
        updatePageLifecycleRecovery(false);
        setChatError(getChatErrorMessage({ code: "socket_error_waiting" }));
      });
    };

    connect();

    function reconnectAfterPageRestore(source) {
      pageHiddenRef.current = false;
      lastPageVisibleAtRef.current = Date.now();

      const currentSocket = socketRef.current;
      if (currentSocket && currentSocket.readyState < WebSocket.CLOSING) {
        return;
      }

      clearReconnectTimers();
      reconnectAttemptRef.current = 0;
      updatePageLifecycleRecovery(true);
      setChatError("");
      logRef.current?.(`chat reconnecting after page ${source}`);
      connect();
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        pageHiddenRef.current = true;
        return;
      }
      reconnectAfterPageRestore("visibilitychange");
    }

    function handlePageShow() {
      reconnectAfterPageRestore("pageshow");
    }

    function handleFocus() {
      reconnectAfterPageRestore("focus");
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
      clearReconnectTimers();
      clearBroadcastControlRequests();
      if (socketRef.current) {
        intentionalCloseRef.current = true;
        socketRef.current.close();
        socketRef.current = null;
      } else if (socket) {
        intentionalCloseRef.current = true;
        socket.close();
      }
    };
  }, [authKey, enabled, role, room]);

  function sendMessage() {
    const text = draft.trim();
    if (!text || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || readOnly) {
      return false;
    }

    socketRef.current.send(JSON.stringify({
      type: "message.send",
      text
    }));
    setDraft("");
    return true;
  }

  function sendEvent(payload) {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    socketRef.current.send(JSON.stringify(payload));
    return true;
  }

  function retractMessage(messageId) {
    const normalizedMessageId = String(messageId || "").trim();
    if (!normalizedMessageId || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return false;
    }

    socketRef.current.send(JSON.stringify({
      type: "message.retract",
      messageId: normalizedMessageId
    }));
    return true;
  }

  function requestBroadcastControl() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(createAppError("broadcast_control_channel_unavailable"));
    }

    const requestId = `bc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        broadcastControlRequestsRef.current.delete(requestId);
        reject(createAppError("broadcast_control_check_timeout"));
      }, BROADCAST_CONTROL_CHECK_TIMEOUT_MS);

      broadcastControlRequestsRef.current.set(requestId, {
        resolve,
        reject,
        timeoutId
      });
      socket.send(JSON.stringify({
        type: "broadcast.control.check",
        requestId
      }));
    });
  }

  function releaseBroadcastControl() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setCanControlBroadcast(false);
      return false;
    }

    socket.send(JSON.stringify({
      type: "broadcast.control.release",
    }));
    intentionalCloseRef.current = true;
    setCanControlBroadcast(false);
    return true;
  }

  function setCohostInviteAllowed(nextAllowed) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify({
      type: "cohost.invites.set_allowed",
      invitesAllowed: Boolean(nextAllowed)
    }));
    setCohostInvitesAllowed(Boolean(nextAllowed));
    return true;
  }

  function clearCohostActive() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(JSON.stringify({
      type: "cohost.active.clear"
    }));
    setCohostActive(null);
    return true;
  }

  function dismissCohostInvite(inviteId) {
    setCohostInvite((current) => (
      !inviteId || current?.id === inviteId ? null : current
    ));
  }

  return {
    messages,
    draft,
    setDraft,
    connectionState,
    onlineCount,
    loggedInViewers,
    readOnly,
    chatError,
    streamState,
    roomMeta,
    roomLocation,
    roomStateReady,
    canControlBroadcast,
    cohostInvitesAllowed,
    cohostInvite,
    cohostInviteResponse,
    cohostActive,
    recoveringFromPageLifecycle,
    sendMessage,
    sendEvent,
    retractMessage,
    requestBroadcastControl,
    releaseBroadcastControl,
    setCohostInviteAllowed,
    clearCohostActive,
    dismissCohostInvite
  };
}
