import { MESSAGE_TTL_MS } from "./constants.js";

export function isMessageFresh(message, now) {
  if (!message || typeof message !== "object") {
    return false;
  }

  const sentAt = Date.parse(message.sentAt);
  return Number.isFinite(sentAt) && now - sentAt < MESSAGE_TTL_MS;
}
