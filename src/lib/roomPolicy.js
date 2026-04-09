export function getPublishBlockReason(room) {
  const normalized = room?.trim().toLowerCase();
  if (normalized === "bbb") {
    return "频道 bbb 禁止开播";
  }

  return "";
}

export function isPublishBlocked(room) {
  return Boolean(getPublishBlockReason(room));
}
