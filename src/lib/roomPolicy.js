import { getAppErrorMessage } from "./appErrors.js";

export function getPublishBlockError(room) {
  const normalized = room?.trim().toLowerCase();
  if (normalized === "bbb") {
    return {
      code: "publish_blocked_room",
      details: { room: normalized }
    };
  }

  return null;
}

export function getPublishBlockReason(room) {
  const error = getPublishBlockError(room);
  return error ? getAppErrorMessage(error) : "";
}

export function isPublishBlocked(room) {
  return Boolean(getPublishBlockError(room));
}
