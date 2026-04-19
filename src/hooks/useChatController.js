import { useEffect, useRef, useState } from "preact/hooks";
import { getChatErrorMessage } from "../lib/chatErrors.js";

const RECONNECT_DELAYS_MS = [
  1_000,
  2_000,
  3_000,
  15_000,
  30_000,
  60_000,
  2 * 60_000,
  5 * 60_000,
  10 * 60_000,
  20 * 60_000,
  40 * 60_000,
  60 * 60_000,
  2 * 60 * 60_000,
  4 * 60 * 60_000
];

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
    startedAt: null
  };
}

function getDefaultRoomMeta() {
  return {
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
  const [readOnly, setReadOnly] = useState(true);
  const [chatError, setChatError] = useState("");
  const [streamState, setStreamState] = useState(getDefaultStreamState);
  const [roomMeta, setRoomMeta] = useState(getDefaultRoomMeta);
  const [roomStateReady, setRoomStateReady] = useState(false);

  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const logRef = useRef(log);

  logRef.current = log;

  function clearReconnectTimer() {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  useEffect(() => {
    clearReconnectTimer();

    if (!enabled || !room) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setMessages([]);
      setDraft("");
      setConnectionState("idle");
      setOnlineCount(0);
      setReadOnly(true);
      setChatError("");
      setStreamState(getDefaultStreamState());
      setRoomMeta(getDefaultRoomMeta());
      setRoomStateReady(false);
      reconnectAttemptRef.current = 0;
      return undefined;
    }

    let cancelled = false;
    let socket = null;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socketUrl = new URL(`/api/chat/${encodeURIComponent(room)}/ws`, `${protocol}//${window.location.host}`);
      socketUrl.searchParams.set("role", role);
      setConnectionState(reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting");

      socket = new WebSocket(socketUrl);
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectAttemptRef.current = 0;
        setConnectionState("connected");
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
          setMessages(Array.isArray(payload.messages) ? payload.messages : []);
          setOnlineCount(Number(payload.onlineCount) || 0);
          setReadOnly(Boolean(payload.readOnly));
          setStreamState({
            isLive: Boolean(payload.stream?.isLive),
            startedAt: payload.stream?.startedAt || null
          });
          setRoomMeta({
            title: payload.roomMeta?.title || "",
            stream: {
              relayUrl: payload.roomMeta?.stream?.relayUrl || "",
              namespace: payload.roomMeta?.stream?.namespace || ""
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

        if (payload.type === "message.created" && payload.message) {
          setMessages((current) => upsertMessages(current, [payload.message]));
          return;
        }

        if (payload.type === "presence.snapshot") {
          setOnlineCount(Number(payload.onlineCount) || 0);
          return;
        }

        if (payload.type === "stream.started") {
          setStreamState({
            isLive: true,
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
              namespace: payload.roomMeta?.stream?.namespace || ""
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
        if (cancelled) {
          return;
        }
        setConnectionState("closed");
        const attempt = reconnectAttemptRef.current;
        const delay = getReconnectDelayMs(attempt);
        reconnectAttemptRef.current = attempt + 1;
        setChatError(getChatErrorMessage({ code: "socket_closed_retrying" }));
        logRef.current?.(`chat reconnect scheduled in ${delay}ms (attempt ${attempt + 1})`);
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
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
      clearReconnectTimer();
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

  return {
    messages,
    draft,
    setDraft,
    connectionState,
    onlineCount,
    readOnly,
    chatError,
    streamState,
    roomMeta,
    roomStateReady,
    sendMessage,
    sendEvent
  };
}
