import { DEFAULT_STREAM_PROTOCOL } from "./constants.js";
import {
  getDefaultAudienceCallState,
  normalizeAudienceCallState,
} from "./audience-call-state.js";
import {
  getDefaultCohostState,
  normalizeCohostState,
} from "./cohost-state.js";
import {
  getDefaultModerationState,
  normalizeModerationState,
} from "./moderation.js";
import {
  getDefaultRoomLocation,
  normalizeRoomLocation,
} from "./location.js";
import {
  sanitizeIsoTimestamp,
  sanitizeNamespace,
  sanitizeRoomTitle,
  sanitizeStreamProtocol,
  sanitizeUrl,
} from "./sanitize.js";

export function getDefaultRoomState() {
  return {
    stream: {
      isLive: false,
      protocol: DEFAULT_STREAM_PROTOCOL,
      startedAt: null,
    },
    roomMeta: {
      title: "",
      stream: {
        relayUrl: "",
        namespace: "",
        protocol: DEFAULT_STREAM_PROTOCOL,
        webRtcUrl: "",
      },
    },
    location: getDefaultRoomLocation(),
    cohost: getDefaultCohostState(),
    audienceCall: getDefaultAudienceCallState(),
    moderation: getDefaultModerationState(),
  };
}

export function normalizeRoomState(roomState) {
  return {
    stream: {
      isLive: Boolean(roomState?.stream?.isLive),
      protocol: sanitizeStreamProtocol(roomState?.stream?.protocol),
      startedAt: sanitizeIsoTimestamp(roomState?.stream?.startedAt),
    },
    roomMeta: {
      title: sanitizeRoomTitle(roomState?.roomMeta?.title),
      stream: {
        relayUrl: sanitizeUrl(roomState?.roomMeta?.stream?.relayUrl),
        namespace: sanitizeNamespace(roomState?.roomMeta?.stream?.namespace),
        protocol: sanitizeStreamProtocol(roomState?.roomMeta?.stream?.protocol),
        webRtcUrl: sanitizeUrl(roomState?.roomMeta?.stream?.webRtcUrl),
      },
    },
    location: normalizeRoomLocation(roomState?.location),
    cohost: normalizeCohostState(roomState?.cohost),
    audienceCall: normalizeAudienceCallState(roomState?.audienceCall),
    moderation: normalizeModerationState(
      roomState?.moderation,
      Date.now(),
      Boolean(roomState?.stream?.isLive),
    ),
  };
}

export function areRoomMetaEqual(left, right) {
  return (
    String(left?.title ?? "") === String(right?.title ?? "") &&
    String(left?.stream?.relayUrl ?? "") ===
      String(right?.stream?.relayUrl ?? "") &&
    String(left?.stream?.namespace ?? "") ===
      String(right?.stream?.namespace ?? "") &&
    String(left?.stream?.protocol ?? DEFAULT_STREAM_PROTOCOL) ===
      String(right?.stream?.protocol ?? DEFAULT_STREAM_PROTOCOL) &&
    String(left?.stream?.webRtcUrl ?? "") ===
      String(right?.stream?.webRtcUrl ?? "")
  );
}
