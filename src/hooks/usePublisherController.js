import { useEffect, useRef, useState } from "react";
import * as MoqPublish from "@moq/publish";
import {
  createMediaSessionManager,
  stopMediaStream,
} from "../lib/mediaSessionManager.js";
import { createAppError, getAppErrorMessage } from "../lib/appErrors.js";
import { getPublishBlockError } from "../lib/roomPolicy.js";
import {
  DEFAULT_STREAM_PROTOCOL,
  STREAM_PROTOCOL_WEBRTC,
  STREAM_PROTOCOL_OPTIONS,
  normalizeStreamProtocol,
} from "../lib/streamProtocol.js";
import { createWhipPublishSession } from "../lib/whipClient.js";

const VIDEO_TARGET_WIDTH = 1280;
const VIDEO_TARGET_HEIGHT = 720;
const VIDEO_TARGET_FRAMERATE = 30;
const VIDEO_TARGET_BITRATE = 3_000_000;
const PUBLISH_QUALITY_OPTIONS = [
  {
    id: "smooth",
    label: "流畅",
    detail: "360p · 1.0 Mbps",
    width: 640,
    height: 360,
    frameRate: 24,
    maxBitrate: 1_000_000,
  },
  {
    id: "hd",
    label: "高清",
    detail: "720p · 3.0 Mbps",
    width: VIDEO_TARGET_WIDTH,
    height: VIDEO_TARGET_HEIGHT,
    frameRate: VIDEO_TARGET_FRAMERATE,
    maxBitrate: VIDEO_TARGET_BITRATE,
  },
  {
    id: "fullhd",
    label: "超清",
    detail: "1080p · 6.0 Mbps",
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 6_000_000,
  },
];
const DEFAULT_PUBLISH_QUALITY_ID = "hd";
const PREVIEW_SOURCE_CAMERA = "camera";
const PREVIEW_SOURCE_SCREEN = "screen";
const DEFAULT_PREVIEW_SOURCE = PREVIEW_SOURCE_CAMERA;
const PUBLISH_CONNECT_TIMEOUT_MS = 10_000;
const MICROPHONE_PUBLISH_GAIN = 1.6;
const MUSIC_AUDIO_TRACKS = new WeakSet();
const MICROPHONE_AUDIO_TRACKS = new WeakSet();
const DEFAULT_WEBRTC_PUBLISH_PROXY_URL = "/api/me/room/webrtc/whip";

function buildDefaultWebRtcPlaybackProxyUrl({ roomId }) {
  const normalizedRoomId = String(roomId || "").trim();
  return normalizedRoomId
    ? `/api/rooms/${encodeURIComponent(normalizedRoomId)}/webrtc/whep`
    : "";
}

function getPublishQuality(id) {
  return (
    PUBLISH_QUALITY_OPTIONS.find((option) => option.id === id) ??
    PUBLISH_QUALITY_OPTIONS.find(
      (option) => option.id === DEFAULT_PUBLISH_QUALITY_ID,
    ) ??
    PUBLISH_QUALITY_OPTIONS[0]
  );
}

function getPublishQualityConfig(id) {
  const quality = getPublishQuality(id);
  return {
    maxPixels: quality.width * quality.height,
    maxBitrate: quality.maxBitrate,
    frameRate: quality.frameRate,
  };
}

function buildVideoConstraints(
  deviceId = "",
  qualityId = DEFAULT_PUBLISH_QUALITY_ID,
  { cameraControls = false } = {},
) {
  const quality = getPublishQuality(qualityId);
  const constraints = {
    width: { ideal: quality.width },
    height: { ideal: quality.height },
    frameRate: { ideal: quality.frameRate },
  };

  if (deviceId) {
    constraints.deviceId = { exact: deviceId };
  }

  if (cameraControls) {
    constraints.zoom = true;
  }

  return constraints;
}

function hasUsableMediaStream(stream) {
  if (!stream) {
    return false;
  }

  const tracks = stream.getTracks();
  return (
    tracks.length > 0 && tracks.every((track) => track.readyState === "live")
  );
}

function getStreamVideoDimensions(stream, videoElement = null) {
  const track = stream?.getVideoTracks?.()[0] ?? null;
  const settings = track?.getSettings?.() ?? {};
  const width = videoElement?.videoWidth || settings.width || 0;
  const height = videoElement?.videoHeight || settings.height || 0;
  return { width, height };
}

function shouldRetryDisplayMediaRequest(error) {
  const name = error?.name ?? "";
  return name !== "AbortError" && name !== "NotAllowedError";
}

function buildSharedAudioConstraints() {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
  const constraints = {};

  if (supported.echoCancellation) {
    constraints.echoCancellation = false;
  }
  if (supported.noiseSuppression) {
    constraints.noiseSuppression = false;
  }
  if (supported.autoGainControl) {
    constraints.autoGainControl = false;
  }
  if (supported.suppressLocalAudioPlayback) {
    constraints.suppressLocalAudioPlayback = false;
  }

  return Object.keys(constraints).length > 0 ? constraints : true;
}

function buildMicrophoneAudioConstraints(deviceId = "") {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
  const constraints = {};

  if (supported.echoCancellation) {
    constraints.echoCancellation = true;
  }
  if (supported.noiseSuppression) {
    constraints.noiseSuppression = true;
  }
  if (supported.autoGainControl) {
    constraints.autoGainControl = true;
  }

  if (deviceId) {
    constraints.deviceId = { exact: deviceId };
  }

  return Object.keys(constraints).length > 0 ? constraints : true;
}

function setAudioTrackContentHint(track, contentHint) {
  if (!track || !("contentHint" in track)) {
    return;
  }

  try {
    track.contentHint = contentHint;
  } catch {
    // Some browsers expose contentHint but reject values for specific sources.
  }
}

function markMusicAudioTrack(track) {
  if (!track) {
    return;
  }

  MUSIC_AUDIO_TRACKS.add(track);
  setAudioTrackContentHint(track, "music");
}

function isMusicAudioTrack(track) {
  return Boolean(track && MUSIC_AUDIO_TRACKS.has(track));
}

function markMicrophoneAudioTrack(track) {
  if (!track) {
    return;
  }

  MICROPHONE_AUDIO_TRACKS.add(track);
  setAudioTrackContentHint(track, "speech");
}

function isMicrophoneAudioTrack(track) {
  return Boolean(track && MICROPHONE_AUDIO_TRACKS.has(track));
}

function buildMoqAudioSource(track, kind = "auto") {
  if (!track) {
    return undefined;
  }

  return kind === "music" ? { track, kind } : track;
}

export function usePublisherController({
  page,
  pageRef,
  relayUrlRef,
  roomRef,
  webRtcPublishUrlRef,
  webRtcPlaybackUrlRef,
  webRtcPlaybackRoomIdRef,
  generateRoomId,
  assertCanPublish,
  log,
}) {
  const [publishStatus, setPublishStatus] = useState("等待推流。");
  const [publishStatusKind, setPublishStatusKind] = useState("idle");
  const [publisherIsPublishing, setPublisherIsPublishing] = useState(false);
  const [publisherIsStarting, setPublisherIsStarting] = useState(false);
  const [cameraOptions, setCameraOptions] = useState([]);
  const [microphoneOptions, setMicrophoneOptions] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [publishQualityId, setPublishQualityIdState] = useState(
    DEFAULT_PUBLISH_QUALITY_ID,
  );
  const [publishProtocol, setPublishProtocolState] = useState(
    DEFAULT_STREAM_PROTOCOL,
  );
  const [webRtcPublishUrl, setWebRtcPublishUrlState] = useState("");
  const [webRtcPlaybackUrl, setWebRtcPlaybackUrlState] = useState("");
  const [cameraEnabled, setCameraEnabledState] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabledState] = useState(true);
  const [previewActive, setPreviewActive] = useState(false);
  const [previewHasVideo, setPreviewHasVideo] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewSourceType, setPreviewSourceType] = useState(
    DEFAULT_PREVIEW_SOURCE,
  );
  const [screenShareSupported] = useState(() =>
    Boolean(navigator.mediaDevices?.getDisplayMedia),
  );

  const previewVideoRef = useRef(null);
  const livePublisherRef = useRef(null);
  const pendingPublisherRef = useRef(null);
  const liveSessionManagerRef = useRef(createMediaSessionManager());
  const previewMediaStreamRef = useRef(null);
  const publisherIsPublishingRef = useRef(false);
  const publisherIsStartingRef = useRef(false);
  const publishStartTokenRef = useRef(0);
  const appliedCameraIdRef = useRef("");
  const appliedMicrophoneIdRef = useRef("");
  const appliedPublishQualityIdRef = useRef(DEFAULT_PUBLISH_QUALITY_ID);
  const previewSourceTypeRef = useRef(DEFAULT_PREVIEW_SOURCE);
  const appliedMicrophoneEnabledRef = useRef(true);
  const cameraEnabledRef = useRef(cameraEnabled);
  const microphoneEnabledRef = useRef(microphoneEnabled);
  const selectedCameraIdRef = useRef(selectedCameraId);
  const selectedMicrophoneIdRef = useRef(selectedMicrophoneId);
  const publishQualityIdRef = useRef(publishQualityId);
  const publishProtocolRef = useRef(publishProtocol);
  const webRtcPublishUrlValueRef = useRef(webRtcPublishUrl);
  const webRtcPlaybackUrlValueRef = useRef(webRtcPlaybackUrl);

  publisherIsPublishingRef.current = publisherIsPublishing;
  publisherIsStartingRef.current = publisherIsStarting;
  previewSourceTypeRef.current = previewSourceType;
  cameraEnabledRef.current = cameraEnabled;
  microphoneEnabledRef.current = microphoneEnabled;
  selectedCameraIdRef.current = selectedCameraId;
  selectedMicrophoneIdRef.current = selectedMicrophoneId;
  publishQualityIdRef.current = publishQualityId;
  publishProtocolRef.current = publishProtocol;
  webRtcPublishUrlValueRef.current = webRtcPublishUrl;
  webRtcPlaybackUrlValueRef.current = webRtcPlaybackUrl;

  function updatePublishStatus(kind, message) {
    setPublishStatusKind(kind);
    setPublishStatus(message);
  }

  function applyPublishQualityToSession(
    session,
    qualityId = publishQualityIdRef.current,
  ) {
    session?.broadcast?.video?.hd?.config?.set?.(
      getPublishQualityConfig(qualityId),
    );
  }

  async function applyWebRtcVideoBitrateToSession(
    session,
    qualityId = publishQualityIdRef.current,
  ) {
    if (session?.protocol !== STREAM_PROTOCOL_WEBRTC) {
      return;
    }
    const qualityConfig = getPublishQualityConfig(qualityId);
    await session.connection?.setVideoMaxBitrate?.(qualityConfig.maxBitrate);
  }

  async function setPublishQualityId(nextQualityId) {
    const nextQuality = getPublishQuality(nextQualityId);
    const normalizedQualityId = nextQuality.id;
    const liveSession = livePublisherRef.current;

    publishQualityIdRef.current = normalizedQualityId;
    setPublishQualityIdState(normalizedQualityId);
    applyPublishQualityToSession(liveSession, normalizedQualityId);
    applyPublishQualityToSession(
      pendingPublisherRef.current,
      normalizedQualityId,
    );

    if (
      liveSession &&
      publisherIsPublishingRef.current &&
      previewSourceTypeRef.current === PREVIEW_SOURCE_CAMERA &&
      cameraEnabledRef.current
    ) {
      await switchPublishCamera(
        selectedCameraIdRef.current,
        normalizedQualityId,
      );
      return;
    }

    if (liveSession && publisherIsPublishingRef.current) {
      await applyWebRtcVideoBitrateToSession(liveSession, normalizedQualityId);
    }

    appliedPublishQualityIdRef.current = normalizedQualityId;
    log(`publish quality set: ${normalizedQualityId}`);
  }

  async function setPublishProtocol(nextProtocol) {
    const normalizedProtocol = normalizeStreamProtocol(nextProtocol);
    publishProtocolRef.current = normalizedProtocol;
    setPublishProtocolState(normalizedProtocol);
    log(`publish protocol set: ${normalizedProtocol}`);
  }

  function setWebRtcPublishUrl(nextUrl) {
    const value = String(nextUrl ?? "");
    webRtcPublishUrlValueRef.current = value;
    setWebRtcPublishUrlState(value);
  }

  function setWebRtcPlaybackUrl(nextUrl) {
    const value = String(nextUrl ?? "");
    webRtcPlaybackUrlValueRef.current = value;
    setWebRtcPlaybackUrlState(value);
  }

  function ensureRoomId(force = false) {
    const currentRoom = roomRef.current;
    const nextRoom = force || !currentRoom ? generateRoomId() : currentRoom;
    return nextRoom;
  }

  function assertPublishAllowed(room) {
    const errorLike = getPublishBlockError(room);
    if (errorLike) {
      const error = createAppError(errorLike.code, errorLike.details);
      updatePublishStatus("error", `失败：${getAppErrorMessage(error)}`);
      throw error;
    }
  }

  async function assertBroadcastControl(room) {
    try {
      await assertCanPublish?.(room);
    } catch (error) {
      const message = getAppErrorMessage(error);
      updatePublishStatus("error", `失败：${message}`);
      throw error;
    }
  }

  function getLiveMediaStream() {
    return liveSessionManagerRef.current.getActiveStream();
  }

  function beginPreviewRequest(options) {
    return liveSessionManagerRef.current.beginRequest(options);
  }

  function isCurrentPreviewRequest(requestId) {
    return liveSessionManagerRef.current.isCurrentRequest(requestId);
  }

  function waitForSignalValue(signal, predicate, timeoutMs, timeoutCode) {
    if (predicate(signal.peek())) {
      return Promise.resolve(signal.peek());
    }

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        dispose();
        reject(createAppError(timeoutCode));
      }, timeoutMs);
      const dispose = signal.watch((value) => {
        if (!predicate(value)) {
          return;
        }
        window.clearTimeout(timeoutId);
        dispose();
        resolve(value);
      });
    });
  }

  function setPublishTrackEnabled(kind, enabled) {
    const session = livePublisherRef.current;
    if (!session?.publishTracks?.length) {
      return;
    }

    session.publishTracks.forEach((track) => {
      if (track.kind === kind) {
        track.enabled = enabled;
      }
    });
  }

  function removeVideoTracksFromStream(stream) {
    const videoTracks = stream?.getVideoTracks?.() ?? [];
    for (const track of videoTracks) {
      try {
        stream.removeTrack?.(track);
      } catch {
        // Ignore stale stream cleanup failures.
      }
      try {
        track.stop();
      } catch {
        // Ignore stale track cleanup failures.
      }
    }
  }

  function removePublishVideoTracks() {
    const session = livePublisherRef.current;
    if (!session) {
      return;
    }

    const videoTracks =
      session.publishTracks?.filter((track) => track.kind === "video") ?? [];

    if (session.protocol === STREAM_PROTOCOL_WEBRTC) {
      void session.connection?.replaceVideoTrack?.(null).catch((error) => {
        log(
          `WebRTC video source cleanup warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    } else {
      try {
        session.broadcast?.video?.source?.set?.(undefined);
      } catch (error) {
        log(
          `publish video source cleanup warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    session.publishTracks =
      session.publishTracks?.filter((track) => track.kind !== "video") ?? [];

    for (const track of videoTracks) {
      try {
        track.stop();
      } catch {
        // Ignore stale publish track cleanup failures.
      }
    }
  }

  function createPublishSession({
    relayUrl,
    namespace,
    videoTrack,
    audioTrack,
    audioKind = "auto",
    maxPixels,
    qualityId = publishQualityIdRef.current,
    audioMuted = !microphoneEnabledRef.current,
  }) {
    const qualityConfig = getPublishQualityConfig(qualityId);
    const audioSource = buildMoqAudioSource(audioTrack, audioKind);
    const connection = new MoqPublish.Lite.Connection.Reload({
      enabled: true,
      url: new URL(relayUrl),
      websocket: { enabled: false },
    });
    const broadcast = new MoqPublish.Broadcast({
      connection: connection.established,
      enabled: true,
      name: MoqPublish.Lite.Path.from(namespace),
      video: {
        source: videoTrack || undefined,
        hd: {
          enabled: Boolean(videoTrack),
          config: {
            ...qualityConfig,
            maxPixels: maxPixels || qualityConfig.maxPixels,
          },
        },
        sd: {
          enabled: false,
        },
      },
      audio: {
        enabled: Boolean(audioTrack),
        source: audioSource,
        muted: audioMuted,
        volume: 1,
      },
    });

    return {
      connection,
      broadcast,
      publishTracks: [videoTrack, audioTrack].filter(Boolean),
      cleanupPublishTracks: null,
    };
  }

  function closePublishSession(session = livePublisherRef.current) {
    if (!session) {
      return;
    }

    try {
      session.broadcast?.close?.();
    } catch (error) {
      log(
        `publish close warning: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      session.connection?.close?.();
    } catch (error) {
      log(
        `connection close warning: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    session.cleanupPublishTracks?.();
    if (livePublisherRef.current === session) {
      livePublisherRef.current = null;
    }
  }

  async function relaxSharedAudioTrack(track) {
    if (!track?.applyConstraints) {
      return;
    }

    const constraints = buildSharedAudioConstraints();
    if (constraints === true) {
      return;
    }

    try {
      await track.applyConstraints(constraints);
    } catch (error) {
      log(
        `shared audio constraints warning: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function createStableAudioPublishTrack(sourceTrack) {
    if (!sourceTrack) {
      return { track: null, cleanup: null };
    }

    const fallbackTrack = sourceTrack.clone?.() ?? sourceTrack;
    if (isMusicAudioTrack(sourceTrack)) {
      markMusicAudioTrack(fallbackTrack);
    } else if (isMicrophoneAudioTrack(sourceTrack)) {
      markMicrophoneAudioTrack(fallbackTrack);
    }
    const AudioContextCtor =
      globalThis.AudioContext || globalThis.webkitAudioContext;
    if (typeof AudioContextCtor !== "function") {
      return { track: fallbackTrack, cleanup: null };
    }

    const settings = sourceTrack.getSettings?.() ?? {};
    let audioContext = null;
    let sourceNode = null;
    let microphoneGain = null;
    let keepaliveOscillator = null;
    let keepaliveGain = null;
    let destination = null;

    try {
      audioContext = new AudioContextCtor({
        latencyHint: "interactive",
        sampleRate: settings.sampleRate || 48_000,
      });
      sourceNode = audioContext.createMediaStreamSource(
        new MediaStream([sourceTrack]),
      );
      microphoneGain = audioContext.createGain();
      microphoneGain.gain.value = isMicrophoneAudioTrack(sourceTrack)
        ? MICROPHONE_PUBLISH_GAIN
        : 1;
      destination = audioContext.createMediaStreamDestination();

      sourceNode.connect(microphoneGain);
      microphoneGain.connect(destination);

      keepaliveOscillator = audioContext.createOscillator();
      keepaliveGain = audioContext.createGain();
      keepaliveOscillator.frequency.value = 440;
      keepaliveGain.gain.value = 0.001;
      keepaliveOscillator.connect(keepaliveGain);
      keepaliveGain.connect(destination);
      keepaliveOscillator.start();

      await audioContext.resume?.();

      const mixedTrack = destination.stream.getAudioTracks()[0] ?? null;
      if (!mixedTrack) {
        throw new Error("missing mixed audio track");
      }

      mixedTrack.enabled = sourceTrack.enabled;
      if (isMusicAudioTrack(sourceTrack)) {
        markMusicAudioTrack(mixedTrack);
      } else if (isMicrophoneAudioTrack(sourceTrack)) {
        markMicrophoneAudioTrack(mixedTrack);
      }
      return {
        track: mixedTrack,
        cleanup: () => {
          try {
            keepaliveOscillator?.stop?.();
          } catch {
            // Ignore oscillator cleanup after it has already stopped.
          }
          try {
            sourceNode?.disconnect?.();
            microphoneGain?.disconnect?.();
            keepaliveGain?.disconnect?.();
          } catch {
            // Ignore disconnect races during teardown.
          }
          try {
            mixedTrack.stop();
          } catch {
            // Ignore stale track cleanup failures.
          }
          void audioContext?.close?.().catch(() => {});
        },
      };
    } catch (error) {
      log(
        `audio keepalive mixer warning: ${error instanceof Error ? error.message : String(error)}`,
      );
      try {
        keepaliveOscillator?.stop?.();
      } catch {
        // Ignore oscillator cleanup after failed setup.
      }
      try {
        await audioContext?.close?.();
      } catch {
        // Ignore audio context cleanup failures.
      }
      return { track: fallbackTrack, cleanup: null };
    }
  }

  function updatePreviewState(stream, sourceType) {
    if (sourceType === PREVIEW_SOURCE_CAMERA && !cameraEnabledRef.current) {
      removeVideoTracksFromStream(stream);
    }

    const hasVideoTrack = Boolean(stream?.getVideoTracks?.().length);
    const nextHasVideo =
      sourceType === PREVIEW_SOURCE_CAMERA
        ? hasVideoTrack && cameraEnabledRef.current
        : hasVideoTrack;

    previewMediaStreamRef.current = stream;
    previewSourceTypeRef.current = sourceType;
    setPreviewSourceType(sourceType);

    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = nextHasVideo ? stream : null;
    }

    setPreviewActive(Boolean(stream));
    setPreviewHasVideo(nextHasVideo);
  }

  function clearPreviewState({ resetSource = false } = {}) {
    previewMediaStreamRef.current = null;
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setPreviewActive(false);
    setPreviewHasVideo(false);
    setPreviewPending(false);
    if (resetSource) {
      previewSourceTypeRef.current = DEFAULT_PREVIEW_SOURCE;
      setPreviewSourceType(DEFAULT_PREVIEW_SOURCE);
    }
  }

  function stopLivePreview({ resetSource = false } = {}) {
    const stream = liveSessionManagerRef.current.stopActiveStream();
    if (
      previewMediaStreamRef.current === stream ||
      !previewMediaStreamRef.current
    ) {
      clearPreviewState({ resetSource });
      return;
    }
    if (resetSource) {
      previewSourceTypeRef.current = DEFAULT_PREVIEW_SOURCE;
      setPreviewSourceType(DEFAULT_PREVIEW_SOURCE);
    }
  }

  function setCameraEnabled(nextEnabled) {
    cameraEnabledRef.current = nextEnabled;
    setCameraEnabledState(nextEnabled);
    const previewStream = previewMediaStreamRef.current;

    if (previewSourceTypeRef.current === PREVIEW_SOURCE_CAMERA) {
      if (!nextEnabled) {
        const liveStream = getLiveMediaStream();
        removeVideoTracksFromStream(liveStream);
        if (previewMediaStreamRef.current !== liveStream) {
          removeVideoTracksFromStream(previewMediaStreamRef.current);
        }
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = null;
        }
        removePublishVideoTracks();
        setPreviewHasVideo(false);
        setPreviewPending(false);
        return;
      }

      for (const stream of [getLiveMediaStream()]) {
        stream?.getVideoTracks().forEach((track) => {
          track.enabled = true;
        });
      }

      if (
        pageRef.current === "live" &&
        !publisherIsPublishingRef.current &&
        !previewStream?.getVideoTracks?.().length
      ) {
        void startLivePreview().catch((error) => {
          const message = getAppErrorMessage(error);
          updatePublishStatus("error", `预览失败：${message}`);
          log(`camera restore failed: ${message}`);
        });
      }

      if (
        publisherIsPublishingRef.current &&
        !livePublisherRef.current?.publishTracks?.some(
          (track) => track.kind === "video",
        )
      ) {
        void switchPublishCamera(selectedCameraIdRef.current).catch((error) => {
          const message = getAppErrorMessage(error);
          updatePublishStatus("error", `切换摄像头失败：${message}`);
          log(`camera publish restore failed: ${message}`);
        });
      }
    }

    setPublishTrackEnabled(
      "video",
      previewSourceTypeRef.current === PREVIEW_SOURCE_SCREEN
        ? true
        : nextEnabled,
    );

    const hasPreviewVideoTrack = Boolean(
      previewStream?.getVideoTracks?.().length,
    );
    const nextHasVideo =
      previewSourceTypeRef.current === PREVIEW_SOURCE_CAMERA
        ? nextEnabled && hasPreviewVideoTrack
        : hasPreviewVideoTrack;
    setPreviewHasVideo(nextHasVideo);
  }

  function setMicrophoneEnabled(nextEnabled) {
    microphoneEnabledRef.current = nextEnabled;
    setMicrophoneEnabledState(nextEnabled);

    for (const stream of [getLiveMediaStream()]) {
      stream?.getAudioTracks().forEach((track) => {
        track.enabled = nextEnabled;
      });
    }

    setPublishTrackEnabled("audio", nextEnabled);
  }

  async function refreshMediaDevices(preferredStream = null) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter((device) => device.kind === "videoinput");
    const microphones = devices.filter(
      (device) => device.kind === "audioinput",
    );
    const nextCameraOptions = videos.map((device, index) => ({
      value: device.deviceId,
      label: device.label || `Camera ${index + 1}`,
    }));
    const nextMicrophoneOptions = microphones.map((device, index) => ({
      value: device.deviceId,
      label: device.label || `Mic ${index + 1}`,
    }));

    setCameraOptions(nextCameraOptions);
    setMicrophoneOptions(nextMicrophoneOptions);

    setSelectedCameraId((current) => {
      if (
        current &&
        nextCameraOptions.some((option) => option.value === current)
      ) {
        return current;
      }
      const streamCameraId = preferredStream
        ?.getVideoTracks?.()[0]
        ?.getSettings?.().deviceId;
      if (
        streamCameraId &&
        nextCameraOptions.some((option) => option.value === streamCameraId)
      ) {
        return streamCameraId;
      }
      return nextCameraOptions[0]?.value ?? "";
    });

    setSelectedMicrophoneId((current) => {
      if (
        current &&
        nextMicrophoneOptions.some((option) => option.value === current)
      ) {
        return current;
      }
      const streamMicrophoneId = preferredStream
        ?.getAudioTracks?.()[0]
        ?.getSettings?.().deviceId;
      if (
        streamMicrophoneId &&
        nextMicrophoneOptions.some(
          (option) => option.value === streamMicrophoneId,
        )
      ) {
        return streamMicrophoneId;
      }
      return nextMicrophoneOptions[0]?.value ?? "";
    });
  }

  function setLivePreviewStream(stream, sourceType) {
    appliedCameraIdRef.current = selectedCameraIdRef.current;
    appliedMicrophoneIdRef.current = selectedMicrophoneIdRef.current;
    appliedPublishQualityIdRef.current = publishQualityIdRef.current;
    appliedMicrophoneEnabledRef.current = microphoneEnabledRef.current;
    updatePreviewState(stream, sourceType);
  }

  async function switchPublishCamera(
    cameraId,
    qualityId = publishQualityIdRef.current,
  ) {
    const session = livePublisherRef.current;
    if (!session || !publisherIsPublishingRef.current) {
      return false;
    }
    if (previewSourceTypeRef.current !== PREVIEW_SOURCE_CAMERA) {
      throw createAppError("publish_source_not_camera");
    }
    if (!cameraEnabledRef.current) {
      return false;
    }

    const requestId = beginPreviewRequest({ stopActive: false });
    const constraints = {
      video: buildVideoConstraints(cameraId, qualityId, {
        cameraControls: true,
      }),
      audio: false,
    };

    updatePublishStatus("preparing", "正在切换摄像头。");

    let newStream = null;
    let newPublishTrack = null;
    let publishTrackAdopted = false;
    try {
      newStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (
        !isCurrentPreviewRequest(requestId) ||
        livePublisherRef.current !== session ||
        !publisherIsPublishingRef.current
      ) {
        stopMediaStream(newStream);
        return false;
      }

      const newPreviewTrack = newStream.getVideoTracks()[0] ?? null;
      if (!newPreviewTrack) {
        throw createAppError("video_track_unavailable");
      }

      newPublishTrack = newPreviewTrack.clone();
      newPublishTrack.enabled = true;
      const qualityConfig = getPublishQualityConfig(qualityId);
      const oldPublishTracks = session.publishTracks.filter(
        (track) => track.kind === "video",
      );

      if (session.protocol === STREAM_PROTOCOL_WEBRTC) {
        const replaced =
          await session.connection?.replaceVideoTrack?.(newPublishTrack);
        if (!replaced) {
          throw createAppError("webrtc_video_sender_unavailable");
        }
        await session.connection?.setVideoMaxBitrate?.(
          qualityConfig.maxBitrate,
        );
      } else {
        applyPublishQualityToSession(session, qualityId);
        session.broadcast.video.source.set(newPublishTrack);
      }

      publishTrackAdopted = true;
      session.publishTracks = [
        ...session.publishTracks.filter((track) => track.kind !== "video"),
        newPublishTrack,
      ];
      for (const track of oldPublishTracks) {
        try {
          track.stop();
        } catch {
          // Ignore stale track cleanup failures after replacing the source.
        }
      }

      const previewStream = getLiveMediaStream();
      if (previewStream) {
        for (const track of previewStream.getVideoTracks()) {
          previewStream.removeTrack(track);
          try {
            track.stop();
          } catch {
            // Ignore stale preview track cleanup failures.
          }
        }
        previewStream.addTrack(newPreviewTrack);
        stopMediaStream(new MediaStream(newStream.getAudioTracks()));
        updatePreviewState(previewStream, PREVIEW_SOURCE_CAMERA);
        newStream = null;
      } else {
        liveSessionManagerRef.current.adoptStream(requestId, newStream);
        updatePreviewState(newStream, PREVIEW_SOURCE_CAMERA);
        newStream = null;
      }

      cameraEnabledRef.current = true;
      setCameraEnabledState(true);
      setPreviewHasVideo(true);
      appliedCameraIdRef.current = cameraId;
      appliedPublishQualityIdRef.current = qualityId;
      updatePublishStatus("live", `直播已启动：${roomRef.current || "unset"}`);
      log(
        `switched publish camera to ${cameraId || "default"} quality=${qualityId}`,
      );
      return true;
    } catch (error) {
      const message = getAppErrorMessage(error);
      updatePublishStatus("error", `切换摄像头失败：${message}`);
      log(`switch camera failed: ${message}`);
      throw error;
    } finally {
      if (!publishTrackAdopted) {
        try {
          newPublishTrack?.stop?.();
        } catch {
          // Ignore cleanup failures for an unused publish clone.
        }
      }
      if (newStream) {
        stopMediaStream(newStream);
      }
    }
  }

  async function requestPreferredMicrophoneTrack() {
    if (!microphoneEnabledRef.current) {
      return null;
    }

    const microphoneConstraints = {
      audio: buildMicrophoneAudioConstraints(selectedMicrophoneIdRef.current),
    };
    const microphoneStream = await navigator.mediaDevices.getUserMedia(
      microphoneConstraints,
    );
    const microphoneTrack = microphoneStream.getAudioTracks()[0] ?? null;
    markMicrophoneAudioTrack(microphoneTrack);
    return microphoneTrack;
  }

  async function startCameraPreview() {
    const requestId = beginPreviewRequest();
    const wantsCamera = cameraEnabledRef.current;
    const wantsMicrophone = microphoneEnabledRef.current;
    const cameraId = selectedCameraIdRef.current;
    const microphoneId = selectedMicrophoneIdRef.current;
    setPreviewPending(wantsCamera);

    try {
      const videoConstraints = !wantsCamera
        ? false
        : buildVideoConstraints(cameraId, publishQualityIdRef.current, {
            cameraControls: true,
          });
      const audioConstraints = !wantsMicrophone
        ? false
        : buildMicrophoneAudioConstraints(microphoneId);

      let stream = null;
      let lastError = null;
      for (const constraints of [
        { video: videoConstraints, audio: audioConstraints },
        { video: false, audio: audioConstraints },
        { video: videoConstraints, audio: false },
      ]) {
        if (!constraints.video && !constraints.audio) {
          continue;
        }

        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!stream) {
        throw lastError instanceof Error
          ? lastError
          : createAppError("media_devices_unavailable");
      }

      if (!cameraEnabledRef.current) {
        removeVideoTracksFromStream(stream);
      }
      for (const track of stream.getAudioTracks()) {
        markMicrophoneAudioTrack(track);
      }

      if (
        !isCurrentPreviewRequest(requestId) ||
        pageRef.current !== "live" ||
        publisherIsPublishingRef.current
      ) {
        stopMediaStream(stream);
        return;
      }

      if (!liveSessionManagerRef.current.adoptStream(requestId, stream)) {
        return;
      }

      setLivePreviewStream(stream, PREVIEW_SOURCE_CAMERA);
      for (const track of stream.getTracks()) {
        track.addEventListener(
          "ended",
          () => {
            if (getLiveMediaStream() !== stream) {
              return;
            }
            if (pageRef.current !== "live") {
              return;
            }

            if (publisherIsPublishingRef.current) {
              return;
            }

            stopLivePreview();
            void startLivePreview().catch((error) => {
              const message = getAppErrorMessage(error);
              updatePublishStatus("error", `预览失败：${message}`);
              log(`preview track restore failed: ${message}`);
            });
          },
          { once: true },
        );
      }
      await refreshMediaDevices(stream);
    } finally {
      if (isCurrentPreviewRequest(requestId)) {
        setPreviewPending(false);
      }
    }
  }

  async function startScreenSharePreview() {
    if (!screenShareSupported) {
      throw createAppError("screen_share_not_supported");
    }

    const requestId = beginPreviewRequest();

    let displayStream = null;
    let lastDisplayError = null;
    const displayVideoConstraints = buildVideoConstraints(
      "",
      publishQualityIdRef.current,
    );
    for (const constraints of [
      {
        video: displayVideoConstraints,
        audio: buildSharedAudioConstraints(),
      },
      {
        video: displayVideoConstraints,
        audio: false,
      },
    ]) {
      try {
        displayStream =
          await navigator.mediaDevices.getDisplayMedia(constraints);
        break;
      } catch (error) {
        lastDisplayError = error;
        if (!shouldRetryDisplayMediaRequest(error)) {
          break;
        }
      }
    }

    if (!displayStream) {
      throw lastDisplayError instanceof Error
        ? lastDisplayError
        : createAppError("screen_share_unavailable");
    }

    if (
      !isCurrentPreviewRequest(requestId) ||
      pageRef.current !== "live" ||
      publisherIsPublishingRef.current
    ) {
      stopMediaStream(displayStream);
      return;
    }

    const videoTrack = displayStream.getVideoTracks()[0] ?? null;
    let audioTrack = displayStream.getAudioTracks()[0] ?? null;
    let microphoneTrack = null;

    if (audioTrack) {
      markMusicAudioTrack(audioTrack);
      await relaxSharedAudioTrack(audioTrack);
    }

    if (microphoneEnabled) {
      try {
        microphoneTrack = await requestPreferredMicrophoneTrack();
      } catch (error) {
        if (!audioTrack) {
          stopMediaStream(displayStream);
          throw error instanceof Error
            ? error
            : createAppError("microphone_unavailable");
        }
        log(
          `screen share microphone warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Prefer shared-tab/system audio when available.
    // Fall back to microphone only when the browser did not provide display audio.
    if (!audioTrack && microphoneTrack) {
      audioTrack = microphoneTrack;
      microphoneTrack = null;
    }
    if (microphoneTrack) {
      microphoneTrack.stop();
    }

    if (
      !isCurrentPreviewRequest(requestId) ||
      pageRef.current !== "live" ||
      publisherIsPublishingRef.current
    ) {
      videoTrack?.stop();
      audioTrack?.stop();
      stopMediaStream(displayStream);
      return;
    }

    if (!videoTrack && !audioTrack) {
      stopMediaStream(displayStream);
      throw createAppError("screen_share_no_tracks");
    }

    const usedTracks = [videoTrack, audioTrack].filter(Boolean);
    const stream = new MediaStream(usedTracks);
    for (const track of displayStream.getTracks()) {
      if (!usedTracks.includes(track)) {
        track.stop();
      }
    }

    if (
      !isCurrentPreviewRequest(requestId) ||
      pageRef.current !== "live" ||
      publisherIsPublishingRef.current
    ) {
      stopMediaStream(stream);
      return;
    }

    if (!liveSessionManagerRef.current.adoptStream(requestId, stream)) {
      return;
    }

    setLivePreviewStream(stream, PREVIEW_SOURCE_SCREEN);
    for (const track of stream.getTracks()) {
      track.addEventListener(
        "ended",
        () => {
          if (getLiveMediaStream() !== stream || pageRef.current !== "live") {
            return;
          }

          stopLivePreview({ resetSource: true });
          if (publisherIsPublishingRef.current) {
            void stopCameraPublish();
            updatePublishStatus(
              "error",
              getAppErrorMessage(createAppError("screen_share_unavailable")),
            );
            return;
          }

          void startLivePreview().catch((error) => {
            const message = getAppErrorMessage(error);
            updatePublishStatus("error", `预览失败：${message}`);
            log(`screen share restore failed: ${message}`);
          });
        },
        { once: true },
      );
    }

    updatePublishStatus("idle", "屏幕共享已就绪。");
    await refreshMediaDevices(stream);
  }

  async function startLivePreview() {
    if (publisherIsPublishingRef.current) {
      return;
    }

    if (previewSourceTypeRef.current === PREVIEW_SOURCE_SCREEN) {
      await startScreenSharePreview();
      return;
    }

    await startCameraPreview();
  }

  async function startScreenShare() {
    await startScreenSharePreview();
  }

  async function stopScreenShare() {
    if (previewSourceTypeRef.current !== PREVIEW_SOURCE_SCREEN) {
      return;
    }

    stopLivePreview({ resetSource: true });
    if (pageRef.current === "live" && !publisherIsPublishingRef.current) {
      await startLivePreview();
    }
  }

  async function startCameraPublish() {
    if (livePublisherRef.current || publisherIsStartingRef.current) {
      return;
    }

    const namespace = ensureRoomId(true);
    assertPublishAllowed(namespace);
    await assertBroadcastControl(namespace);

    const startToken = publishStartTokenRef.current + 1;
    publishStartTokenRef.current = startToken;
    publisherIsStartingRef.current = true;
    setPublisherIsStarting(true);
    updatePublishStatus("preparing", "正在启动直播。");

    let session = null;
    let stableAudio = { track: null, cleanup: null };

    try {
      let stream = getLiveMediaStream();
      if (!hasUsableMediaStream(stream)) {
        stopLivePreview();
        await startLivePreview();
        stream = getLiveMediaStream();
      }
      if (!stream) {
        throw createAppError("live_preview_unavailable");
      }
      if (publishStartTokenRef.current !== startToken) {
        updatePublishStatus("idle", "直播启动已取消。");
        return;
      }

      const nextRelayUrl = new URL(relayUrlRef.current).toString();
      const canPublishVideo =
        previewSourceTypeRef.current === PREVIEW_SOURCE_SCREEN ||
        (previewSourceTypeRef.current === PREVIEW_SOURCE_CAMERA &&
          cameraEnabledRef.current);
      const previewVideoTrack = canPublishVideo
        ? stream.getVideoTracks()[0]
        : null;
      const previewAudioTrack = stream.getAudioTracks()[0];
      const previewAudioKind = isMusicAudioTrack(previewAudioTrack)
        ? "music"
        : "auto";
      if (!previewVideoTrack && !previewAudioTrack) {
        throw createAppError("publish_tracks_unavailable");
      }
      const previewVideo = previewVideoRef.current;
      const makeEven = (value) => Math.floor(value / 2) * 2;
      const publishVideoTrack = canPublishVideo
        ? (previewVideoTrack?.clone?.() ?? null)
        : null;
      stableAudio = microphoneEnabledRef.current
        ? await createStableAudioPublishTrack(previewAudioTrack)
        : { track: null, cleanup: null };
      const publishAudioTrack = stableAudio.track;
      const width = previewVideoTrack
        ? makeEven(
            previewVideo?.videoWidth ||
              previewVideoTrack.getSettings?.().width ||
              640,
          )
        : 0;
      const height = previewVideoTrack
        ? makeEven(
            previewVideo?.videoHeight ||
              previewVideoTrack.getSettings?.().height ||
              360,
          )
        : 0;

      if (publishStartTokenRef.current !== startToken) {
        publishVideoTrack?.stop?.();
        publishAudioTrack?.stop?.();
        stableAudio.cleanup?.();
        updatePublishStatus("idle", "直播启动已取消。");
        return;
      }

      if (publishVideoTrack) {
        publishVideoTrack.enabled =
          previewSourceTypeRef.current === PREVIEW_SOURCE_SCREEN
            ? true
            : cameraEnabledRef.current;
      }

      if (publishAudioTrack) {
        publishAudioTrack.enabled = microphoneEnabledRef.current;
      }

      if (publishProtocolRef.current === STREAM_PROTOCOL_WEBRTC) {
        const nextWebRtcPublishUrl = (
          webRtcPublishUrlRef?.current ||
          webRtcPublishUrlValueRef.current ||
          DEFAULT_WEBRTC_PUBLISH_PROXY_URL
        ).trim();
        const nextWebRtcPlaybackUrl = (
          webRtcPlaybackUrlRef?.current ||
          webRtcPlaybackUrlValueRef.current ||
          buildDefaultWebRtcPlaybackProxyUrl({ roomId: webRtcPlaybackRoomIdRef?.current }) ||
          ""
        ).trim();
        if (!nextWebRtcPlaybackUrl) {
          throw createAppError("webrtc_playback_url_missing");
        }
        const qualityConfig = getPublishQualityConfig(
          publishQualityIdRef.current,
        );
        const publishTracks = [publishVideoTrack, publishAudioTrack].filter(
          Boolean,
        );
        const whipSession = await createWhipPublishSession({
          url: nextWebRtcPublishUrl,
          tracks: publishTracks,
          videoMaxBitrate: qualityConfig.maxBitrate,
        });
        session = {
          protocol: STREAM_PROTOCOL_WEBRTC,
          publishTracks,
          connection: whipSession,
          close() {
            whipSession.close();
          },
        };
      } else {
        session = createPublishSession({
          relayUrl: nextRelayUrl,
          namespace,
          videoTrack: publishVideoTrack,
          audioTrack: publishAudioTrack,
          audioKind: previewAudioKind,
          maxPixels:
            width && height
              ? width * height
              : VIDEO_TARGET_WIDTH * VIDEO_TARGET_HEIGHT,
          qualityId: publishQualityIdRef.current,
        });
      }
      pendingPublisherRef.current = session;
      session.cleanupPublishTracks = () => {
        session.publishTracks.forEach((track) => {
          try {
            track.stop();
          } catch {
            // Ignore cleanup failures while tearing down publish clones.
          }
        });
        stableAudio.cleanup?.();
      };

      if (publishProtocolRef.current !== STREAM_PROTOCOL_WEBRTC) {
        await waitForSignalValue(
          session.connection.status,
          (status) => status === "connected",
          PUBLISH_CONNECT_TIMEOUT_MS,
          "publish_connect_timeout",
        );
      }
      if (publishStartTokenRef.current !== startToken) {
        closePublishSession(session);
        updatePublishStatus("idle", "直播启动已取消。");
        return;
      }
      pendingPublisherRef.current = null;
      livePublisherRef.current = session;
      publisherIsPublishingRef.current = true;
      setPublisherIsPublishing(true);
      publisherIsStartingRef.current = false;
      setPublisherIsStarting(false);
      updatePublishStatus("live", `直播已启动：${namespace}`);
      log(`camera publish started: url=${nextRelayUrl} namespace=${namespace}`);
    } catch (error) {
      console.error("camera publish start failed", error);
      if (session) {
        closePublishSession(session);
      } else {
        stableAudio.cleanup?.();
      }
      if (publishStartTokenRef.current !== startToken) {
        updatePublishStatus("idle", "直播启动已取消。");
        return;
      }
      updatePublishStatus("error", `失败：${getAppErrorMessage(error)}`);
      throw error;
    } finally {
      if (pendingPublisherRef.current === session) {
        pendingPublisherRef.current = null;
      }
      if (publishStartTokenRef.current === startToken) {
        publisherIsStartingRef.current = false;
        setPublisherIsStarting(false);
      }
    }
  }

  async function stopCameraPublish() {
    if (publisherIsStartingRef.current) {
      publishStartTokenRef.current += 1;
      publisherIsStartingRef.current = false;
      setPublisherIsStarting(false);
      const pendingSession = pendingPublisherRef.current;
      pendingPublisherRef.current = null;
      if (pendingSession) {
        closePublishSession(pendingSession);
      }
      updatePublishStatus("idle", "直播启动已取消。");
      log(`camera publish cancelled: namespace=${roomRef.current || "unset"}`);
      return;
    }

    const session = livePublisherRef.current;

    if (!session) {
      return;
    }

    publisherIsPublishingRef.current = false;
    setPublisherIsPublishing(false);
    updatePublishStatus("preparing", "正在停止直播。");

    try {
      closePublishSession(session);
      updatePublishStatus("idle", "直播已停止。");
      log(`camera publish stopped: namespace=${roomRef.current || "unset"}`);
    } catch (error) {
      const message = getAppErrorMessage(error);
      updatePublishStatus("error", `失败：${message}`);
      log(`camera stop warning: ${message}`);
    }
  }

  async function cleanupLiveResources() {
    await stopCameraPublish();
    stopLivePreview({ resetSource: true });
  }

  useEffect(() => {
    if (page === "live" && !publisherIsPublishing) {
      const currentStream = getLiveMediaStream();
      const shouldRestartPreview =
        !hasUsableMediaStream(currentStream) ||
        (previewSourceTypeRef.current === PREVIEW_SOURCE_SCREEN
          ? appliedMicrophoneIdRef.current !== selectedMicrophoneId ||
            appliedMicrophoneEnabledRef.current !== microphoneEnabled ||
            appliedPublishQualityIdRef.current !== publishQualityId
          : appliedCameraIdRef.current !== selectedCameraId ||
            appliedMicrophoneIdRef.current !== selectedMicrophoneId ||
            appliedPublishQualityIdRef.current !== publishQualityId);

      if (shouldRestartPreview) {
        stopLivePreview();
        void startLivePreview().catch((error) => {
          const message = getAppErrorMessage(error);
          updatePublishStatus("error", `预览失败：${message}`);
          log(`preview failed: ${message}`);
        });
      }
      return;
    }

    if (!publisherIsPublishing) {
      stopLivePreview();
    }
  }, [
    page,
    selectedCameraId,
    selectedMicrophoneId,
    publishQualityId,
    cameraEnabled,
    microphoneEnabled,
    publisherIsPublishing,
  ]);

  useEffect(() => {
    if (page !== "live") {
      return;
    }

    const syncPreviewVideo = () => {
      const previewVideo = previewVideoRef.current;
      const stream = previewMediaStreamRef.current;
      if (!previewVideo || !stream || !previewHasVideo) {
        if (previewVideo) {
          previewVideo.srcObject = null;
        }
        return;
      }

      if (previewVideo.srcObject !== stream) {
        previewVideo.srcObject = stream;
      }
    };

    syncPreviewVideo();
    const syncTicker = window.setInterval(syncPreviewVideo, 250);

    return () => {
      window.clearInterval(syncTicker);
      const previewVideo = previewVideoRef.current;
      if (previewVideo) {
        previewVideo.srcObject = null;
      }
    };
  }, [page, previewActive, previewHasVideo, previewSourceType]);

  useEffect(() => {
    void refreshMediaDevices(getLiveMediaStream()).catch(() => {});

    const handleDeviceChange = () => {
      void refreshMediaDevices(getLiveMediaStream()).catch(() => {});
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (pageRef.current === "live" && !publisherIsPublishingRef.current) {
          void startLivePreview().catch((error) => {
            const message = getAppErrorMessage(error);
            updatePublishStatus("error", `预览失败：${message}`);
            log(`preview resume failed: ${message}`);
          });
        }
        return;
      }

      if (
        !publisherIsPublishingRef.current &&
        previewSourceTypeRef.current !== PREVIEW_SOURCE_SCREEN
      ) {
        stopLivePreview();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(
    () => () => {
      void stopCameraPublish();
      stopLivePreview({ resetSource: true });
    },
    [],
  );

  return {
    publishStatus,
    publishStatusKind,
    publisherIsPublishing,
    publisherIsStarting,
    cameraOptions,
    microphoneOptions,
    publishQualityOptions: PUBLISH_QUALITY_OPTIONS,
    publishProtocolOptions: STREAM_PROTOCOL_OPTIONS,
    selectedCameraId,
    selectedMicrophoneId,
    publishQualityId,
    publishProtocol,
    webRtcPublishUrl,
    webRtcPlaybackUrl,
    cameraEnabled,
    microphoneEnabled,
    previewActive,
    previewHasVideo,
    previewPending,
    previewSourceType,
    screenShareSupported,
    screenShareActive:
      previewSourceType === PREVIEW_SOURCE_SCREEN && previewActive,
    previewVideoRef,
    setSelectedCameraId,
    setSelectedMicrophoneId,
    setPublishQualityId,
    setPublishProtocol,
    setWebRtcPublishUrl,
    setWebRtcPlaybackUrl,
    setCameraEnabled,
    setMicrophoneEnabled,
    switchPublishCamera,
    startCameraPublish,
    stopCameraPublish,
    startScreenShare,
    stopScreenShare,
    cleanupLiveResources,
  };
}
