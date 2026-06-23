export const MAX_MESSAGE_LENGTH = 280;
export const MAX_RECENT_MESSAGES = 80;
export const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
export const RATE_LIMIT_WINDOW_MS = 5_000;
export const RATE_LIMIT_MAX_MESSAGES = 4;
export const MAX_CHAT_MUTE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ROOM_TITLE_LENGTH = 80;
export const DURABLE_OBJECT_FREE_TIER_WRITE_LIMIT_MESSAGE =
  "Exceeded allowed rows written in Durable Objects free tier.";
export const STREAM_PROTOCOL_MOQ = "moq";
export const STREAM_PROTOCOL_WEBRTC = "webrtc";
export const DEFAULT_STREAM_PROTOCOL = STREAM_PROTOCOL_WEBRTC;
export const COHOST_INVITE_TTL_MS = 60_000;
export const AUDIENCE_CALL_REQUEST_TTL_MS = 10 * 60_000;
export const MAX_AUDIENCE_CALL_REQUESTS = 50;
export const MAX_AUDIENCE_CALL_ACTIVE = 5;
export const WEBRTC_PROXY_SESSION_STORAGE_PREFIX = "webrtcProxySession:";
export const BIG_DATA_CLOUD_REVERSE_GEOCODE_URL =
  "https://api-bdc.net/data/reverse-geocode";
export const BIG_DATA_CLOUD_FREE_REVERSE_GEOCODE_URL =
  "https://api-bdc.net/data/reverse-geocode-client";
export const BIG_DATA_CLOUD_TIMEOUT_MS = 3_000;
