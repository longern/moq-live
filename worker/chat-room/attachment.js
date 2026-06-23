export function normalizeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }

  return {
    room: typeof attachment.room === "string" ? attachment.room : "",
    role: attachment.role === "broadcaster" ? "broadcaster" : "viewer",
    isRoomOwner: attachment.isRoomOwner === true,
    canControlBroadcast: attachment.canControlBroadcast === true,
    readOnly: attachment.readOnly !== false ? true : false,
    user:
      attachment.user && typeof attachment.user === "object"
        ? attachment.user
        : null,
    connectedAt: Number.isFinite(attachment.connectedAt)
      ? attachment.connectedAt
      : 0,
    sentAt: Array.isArray(attachment.sentAt)
      ? attachment.sentAt.filter((value) => typeof value === "number")
      : [],
  };
}
