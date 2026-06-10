import { useEffect, useRef } from "react";

function getCommentSpeechLanguage() {
  if (typeof navigator === "undefined") {
    return "zh-CN";
  }

  const language = navigator.language || navigator.languages?.[0] || "";
  return language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

function buildCommentSpeechText(message) {
  const author = String(
    message?.user?.displayName
      || message?.user?.email
      || "匿名用户",
  ).trim();
  const text = String(message?.text || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  return getCommentSpeechLanguage().startsWith("zh")
    ? `${author}说，${text}`
    : `${author} says: ${text}`;
}

function speakComment(message, onFinished) {
  if (
    typeof window === "undefined"
    || !("speechSynthesis" in window)
    || typeof window.SpeechSynthesisUtterance !== "function"
  ) {
    return false;
  }

  const text = buildCommentSpeechText(message);
  if (!text) {
    return false;
  }

  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = getCommentSpeechLanguage();
  let finished = false;
  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    onFinished?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function useCommentSpeech({
  enabled,
  messages,
  connectionState,
  log,
}) {
  const seenMessageIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const pendingMessageRef = useRef(null);
  const speakingRef = useRef(false);
  const speechRunIdRef = useRef(0);
  const logRef = useRef(log);

  logRef.current = log;

  function clearSpeechQueue() {
    pendingMessageRef.current = null;
    speakingRef.current = false;
    speechRunIdRef.current += 1;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function startSpeaking(message) {
    const runId = speechRunIdRef.current + 1;
    speechRunIdRef.current = runId;
    speakingRef.current = true;

    const spoken = speakComment(message, () => {
      if (speechRunIdRef.current !== runId) {
        return;
      }

      const pendingMessage = pendingMessageRef.current;
      pendingMessageRef.current = null;
      if (pendingMessage) {
        startSpeaking(pendingMessage);
        return;
      }

      speakingRef.current = false;
    });

    if (!spoken) {
      pendingMessageRef.current = null;
      speakingRef.current = false;
      logRef.current?.("comment speech skipped: speech synthesis unavailable");
    }
  }

  function queueComment(message) {
    if (speakingRef.current) {
      pendingMessageRef.current = message;
      return;
    }

    startSpeaking(message);
  }

  useEffect(() => {
    if (!enabled || connectionState !== "connected") {
      seenMessageIdsRef.current = new Set(messages.map((message) => message.id));
      initializedRef.current = false;
      clearSpeechQueue();
      return;
    }

    const seenMessageIds = seenMessageIdsRef.current;
    const nextMessageIds = new Set();
    const newMessages = [];

    for (const message of messages) {
      if (!message?.id) {
        continue;
      }
      nextMessageIds.add(message.id);
      if (!seenMessageIds.has(message.id)) {
        newMessages.push(message);
      }
    }

    if (!initializedRef.current) {
      seenMessageIdsRef.current = nextMessageIds;
      initializedRef.current = true;
      return;
    }

    seenMessageIdsRef.current = nextMessageIds;

    for (const message of newMessages) {
      queueComment(message);
    }
  }, [connectionState, enabled, messages]);

  useEffect(() => () => {
    clearSpeechQueue();
  }, []);
}
