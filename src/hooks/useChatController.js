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
    },
    host: {
      id: "",
      displayName: "",
      avatarUrl: ""
    }
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
  const [roomStateReady, setRoomStateReady] = useState(false);
  const [canControlBroadcast, setCanControlBroadcast] = useState(false);

  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectCountdownTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const connectionAttemptedAtRef = useRef([]);
  const broadcastControlRequestsRef = useRef(new Map());
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
      setRoomStateReady(false);
      setCanControlBroadcast(false);
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
      setChatError(reconnecting
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
            },
            host: {
              id: payload.roomMeta?.host?.id || "",
              displayName: payload.roomMeta?.host?.displayName || "",
              avatarUrl: payload.roomMeta?.host?.avatarUrl || ""
            }
          });
          setRoomStateReady(true);
          setChatError("");
          return;
        }

        if (payload.type === "broadcast.control.checked") {
          const request = broadcastControlRequestsRef.current.get(payload.requestId);
          if (!request) {
            return;
          }
          clearTimeout(request.timeoutId);
          broadcastControlRequestsRef.current.delete(payload.requestId);
          request.resolve(Boolean(payload.canControlBroadcast));
          return;
        }

        if (payload.type === "message.created" && payload.message) {
          setMessages((current) => upsertMessages(current, [payload.message]));
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
            },
            host: {
              id: payload.roomMeta?.host?.id || "",
              displayName: payload.roomMeta?.host?.displayName || "",
              avatarUrl: payload.roomMeta?.host?.avatarUrl || ""
            }
          });
          return;
        }

        if (payload.type === "error") {
          const message = getChatErrorMessage(payload);
          setChatError(message);
          logRef.current?.(`chat warning: ${payload.code || "unknown"}: ${message}`);
        }
      });

      socket.addEventListener("close", () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        clearBroadcastControlRequests(createAppError("broadcast_control_connection_closed"));
        if (cancelled) {
          return;
        }
        setConnectionState("closed");
        const attempt = reconnectAttemptRef.current;
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          setChatError(getChatErrorMessage({ code: "socket_reconnect_stopped" }));
          logRef.current?.(`chat reconnect stopped after ${MAX_RECONNECT_ATTEMPTS} attempts`);
          return;
        }

        const delay = getReconnectDelayMs(attempt);
        reconnectAttemptRef.current = attempt + 1;
        showReconnectCountdown(delay);
        logRef.current?.(`chat reconnect scheduled in ${delay}ms (attempt ${attempt + 1})`);
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
        setChatError(getChatErrorMessage({ code: "socket_error_waiting" }));
      });
    };

    connect();

    return () => {
      cancelled = true;
      clearReconnectTimers();
      clearBroadcastControlRequests();
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      } else if (socket) {
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
    roomStateReady,
    canControlBroadcast,
    sendMessage,
    sendEvent,
    requestBroadcastControl
  };
}
