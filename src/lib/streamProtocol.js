export const STREAM_PROTOCOL_MOQ = "moq";
export const STREAM_PROTOCOL_WEBRTC = "webrtc";
export const DEFAULT_STREAM_PROTOCOL = STREAM_PROTOCOL_WEBRTC;

export const STREAM_PROTOCOL_OPTIONS = [
  {
    id: STREAM_PROTOCOL_WEBRTC,
    label: "WebRTC",
  },
  {
    id: STREAM_PROTOCOL_MOQ,
    label: "MoQ",
  },
];

export function normalizeStreamProtocol(value) {
  return value === STREAM_PROTOCOL_MOQ ? STREAM_PROTOCOL_MOQ : STREAM_PROTOCOL_WEBRTC;
}
