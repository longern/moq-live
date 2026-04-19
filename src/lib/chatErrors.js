const CHAT_ERROR_MESSAGES = {
  "zh-CN": {
    session_missing: "聊天室会话不存在",
    invalid_json: "消息格式无效",
    unsupported_event: "不支持的事件类型",
    auth_required: "登录后才可发言",
    empty_message: "消息不能为空",
    message_too_long: ({ maxLength } = {}) => `单条消息最多 ${maxLength ?? 280} 字`,
    rate_limited: "发送过快，请稍后再试",
    forbidden_stream_update: "仅房主可更新直播状态",
    forbidden_room_update: "仅房主可更新直播间信息",
    storage_write_limited: "聊天室写入额度已用尽，已暂停写入，请稍后再试",
    socket_payload_invalid: "聊天室返回了无法解析的数据",
    socket_closed_retrying: "聊天室连接异常，正在重试",
    socket_error_waiting: "聊天室连接异常，等待重新连接",
    unknown: "聊天室出现错误"
  },
  en: {
    session_missing: "Chat session is missing.",
    invalid_json: "Invalid chat payload.",
    unsupported_event: "Unsupported chat event.",
    auth_required: "Sign in to join the chat.",
    empty_message: "Message cannot be empty.",
    message_too_long: ({ maxLength } = {}) => `Messages can be at most ${maxLength ?? 280} characters.`,
    rate_limited: "You are sending messages too quickly. Please try again later.",
    forbidden_stream_update: "Only the room owner can update the stream state.",
    forbidden_room_update: "Only the room owner can update the room info.",
    storage_write_limited: "Chat writes are temporarily paused because storage quota was exhausted.",
    socket_payload_invalid: "The chat server returned unreadable data.",
    socket_closed_retrying: "Chat connection lost. Reconnecting.",
    socket_error_waiting: "Chat connection error. Waiting to reconnect.",
    unknown: "Chat error."
  }
};

function normalizeLocale(locale) {
  const value = String(locale || "").toLowerCase();
  if (value.startsWith("zh")) {
    return "zh-CN";
  }
  return "en";
}

export function getChatErrorMessage(errorLike = {}, locale = undefined) {
  const resolvedLocale = normalizeLocale(
    locale
      ?? (typeof document !== "undefined" ? document.documentElement.lang : "")
      ?? (typeof navigator !== "undefined" ? navigator.language : "")
  );
  const dictionary = CHAT_ERROR_MESSAGES[resolvedLocale] ?? CHAT_ERROR_MESSAGES.en;
  const code = typeof errorLike.code === "string" ? errorLike.code : "unknown";
  const template = dictionary[code] ?? dictionary.unknown;

  if (typeof template === "function") {
    return template(errorLike.details);
  }
  if (typeof template === "string") {
    return template;
  }
  if (typeof errorLike.message === "string" && errorLike.message) {
    return errorLike.message;
  }
  return dictionary.unknown;
}
