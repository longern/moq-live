import { useEffect, useRef, useState } from "preact/hooks";

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

export function useChatController({
  room,
  enabled,
  authKey,
  log
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [connectionState, setConnectionState] = useState("idle");
  const [onlineCount, setOnlineCount] = useState(0);
  const [readOnly, setReadOnly] = useState(true);
  const [chatError, setChatError] = useState("");

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
      reconnectAttemptRef.current = 0;
      return undefined;
    }

    let cancelled = false;
    let socket = null;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socketUrl = new URL(`/api/chat/${encodeURIComponent(room)}/ws`, `${protocol}//${window.location.host}`);
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
          setChatError("聊天室返回了无法解析的数据");
          return;
        }

        if (payload.type === "chat.snapshot") {
          setMessages(Array.isArray(payload.messages) ? payload.messages : []);
          setOnlineCount(Number(payload.onlineCount) || 0);
          setReadOnly(Boolean(payload.readOnly));
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

        if (payload.type === "error") {
          const message = payload.message || "聊天室出现错误";
          setChatError(message);
          logRef.current?.(`chat warning: ${message}`);
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
        const delay = Math.min(5_000, 1_000 * (reconnectAttemptRef.current + 1));
        reconnectAttemptRef.current += 1;
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          if (!cancelled) {
            connect();
          }
        }, delay);
      });

      socket.addEventListener("error", () => {
        setChatError("聊天室连接异常，正在重试");
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
  }, [authKey, enabled, room]);

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

  return {
    messages,
    draft,
    setDraft,
    connectionState,
    onlineCount,
    readOnly,
    chatError,
    sendMessage
  };
}
