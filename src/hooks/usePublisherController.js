import { useEffect, useRef, useState } from "preact/hooks";
import * as MoqPublish from "@moq/publish";
import {
  createMediaSessionManager,
  stopMediaStream,
} from "../lib/mediaSessionManager.js";
import { getPublishBlockReason } from "../lib/roomPolicy.js";
import {
  createSyntheticMedia,
  sampleCanvasMarkerSignature,
} from "../lib/syntheticMedia.js";

const VIDEO_TARGET_WIDTH = 1280;
const VIDEO_TARGET_HEIGHT = 720;
const VIDEO_TARGET_FRAMERATE = 30;
const VIDEO_TARGET_BITRATE = 2_500_000;
const PREVIEW_SOURCE_CAMERA = "camera";
const PREVIEW_SOURCE_SCREEN = "screen";
const PREVIEW_SOURCE_SYNTHETIC = "synthetic";
const DEFAULT_PREVIEW_SOURCE = PREVIEW_SOURCE_CAMERA;
const PUBLISH_CONNECT_TIMEOUT_MS = 10_000;

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
  const supported =
    navigator.mediaDevices?.getSupportedConstraints?.() ?? {};
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

export function usePublisherController({
  page,
  pageRef,
  relayUrlRef,
  roomRef,
  generateRoomId,
  log,
}) {
  const [publishStatus, setPublishStatus] = useState("等待推流。");
  const [publishStatusKind, setPublishStatusKind] = useState("idle");
  const [publisherIsPublishing, setPublisherIsPublishing] = useState(false);
  const [cameraOptions, setCameraOptions] = useState([]);
  const [microphoneOptions, setMicrophoneOptions] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [cameraEnabled, setCameraEnabledState] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabledState] = useState(true);
  const [previewActive, setPreviewActive] = useState(false);
  const [previewHasVideo, setPreviewHasVideo] = useState(false);
  const [syntheticPublishing, setSyntheticPublishing] = useState(false);
  const [previewSourceType, setPreviewSourceType] = useState(
    DEFAULT_PREVIEW_SOURCE,
  );
  const [screenShareSupported] = useState(() =>
    Boolean(navigator.mediaDevices?.getDisplayMedia),
  );

  const previewVideoRef = useRef(null);
  const syntheticSessionRef = useRef(null);
  const livePublisherRef = useRef(null);
  const liveSessionManagerRef = useRef(createMediaSessionManager());
  const previewMediaStreamRef = useRef(null);
  const publisherIsPublishingRef = useRef(false);
  const appliedCameraIdRef = useRef("");
  const appliedMicrophoneIdRef = useRef("");
  const previewSourceTypeRef = useRef(DEFAULT_PREVIEW_SOURCE);
  const appliedMicrophoneEnabledRef = useRef(true);

  publisherIsPublishingRef.current = publisherIsPublishing;
  previewSourceTypeRef.current = previewSourceType;

  function updatePublishStatus(kind, message) {
    setPublishStatusKind(kind);
    setPublishStatus(message);
  }

  function ensureRoomId(force = false) {
    const currentRoom = roomRef.current;
    const nextRoom = force || !currentRoom ? generateRoomId() : currentRoom;
    return nextRoom;
  }

  function assertPublishAllowed(room) {
    const reason = getPublishBlockReason(room);
    if (reason) {
      updatePublishStatus("error", `失败：${reason}`);
      throw new Error(reason);
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

  function waitForSignalValue(signal, predicate, timeoutMs, timeoutMessage) {
    if (predicate(signal.peek())) {
      return Promise.resolve(signal.peek());
    }

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        dispose();
        reject(new Error(timeoutMessage));
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

  function createPublishSession({
    relayUrl,
    namespace,
    videoTrack,
    audioTrack,
    maxPixels,
    audioMuted = !microphoneEnabled,
  }) {
    const connection = new MoqPublish.Lite.Connection.Reload({
      enabled: true,
      url: new URL(relayUrl),
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
            maxPixels,
            maxBitrate: VIDEO_TARGET_BITRATE,
            frameRate: VIDEO_TARGET_FRAMERATE,
          },
        },
        sd: {
          enabled: false,
        },
      },
      audio: {
        enabled: Boolean(audioTrack),
        source: audioTrack || undefined,
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
      log(`publish close warning: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      session.connection?.close?.();
    } catch (error) {
      log(`connection close warning: ${error instanceof Error ? error.message : String(error)}`);
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

  function updatePreviewState(stream, sourceType) {
    const hasVideoTrack = Boolean(stream?.getVideoTracks?.().length);
    const nextHasVideo =
      sourceType === PREVIEW_SOURCE_CAMERA
        ? hasVideoTrack && cameraEnabled
        : hasVideoTrack;

    previewMediaStreamRef.current = stream;
    previewSourceTypeRef.current = sourceType;
    setPreviewSourceType(sourceType);

    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = hasVideoTrack ? stream : null;
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
    if (resetSource) {
      previewSourceTypeRef.current = DEFAULT_PREVIEW_SOURCE;
      setPreviewSourceType(DEFAULT_PREVIEW_SOURCE);
    }
  }

  function stopLivePreview({ resetSource = false } = {}) {
    const stream = liveSessionManagerRef.current.stopActiveStream();
    if (previewMediaStreamRef.current === stream || !previewMediaStreamRef.current) {
      clearPreviewState({ resetSource });
      return;
    }
    if (resetSource && previewSourceTypeRef.current !== PREVIEW_SOURCE_SYNTHETIC) {
      previewSourceTypeRef.current = DEFAULT_PREVIEW_SOURCE;
      setPreviewSourceType(DEFAULT_PREVIEW_SOURCE);
    }
  }

  function setCameraEnabled(nextEnabled) {
    setCameraEnabledState(nextEnabled);
    const previewStream = previewMediaStreamRef.current;
    const hasPreviewVideoTrack = Boolean(previewStream?.getVideoTracks?.().length);
    const nextHasVideo =
      previewSourceTypeRef.current === PREVIEW_SOURCE_CAMERA
        ? nextEnabled && hasPreviewVideoTrack
        : hasPreviewVideoTrack;

    if (previewSourceTypeRef.current === PREVIEW_SOURCE_CAMERA) {
      for (const stream of [getLiveMediaStream()]) {
        stream?.getVideoTracks().forEach((track) => {
          track.enabled = nextEnabled;
        });
      }
    }

    setPublishTrackEnabled(
      "video",
      previewSourceTypeRef.current === PREVIEW_SOURCE_SCREEN ? true : nextEnabled,
    );

    setPreviewHasVideo(nextHasVideo);
  }

  function setMicrophoneEnabled(nextEnabled) {
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
    appliedCameraIdRef.current = selectedCameraId;
    appliedMicrophoneIdRef.current = selectedMicrophoneId;
    appliedMicrophoneEnabledRef.current = microphoneEnabled;
    updatePreviewState(stream, sourceType);
  }

  async function switchPublishCamera(cameraId) {
    const session = livePublisherRef.current;
    if (!session || !publisherIsPublishingRef.current) {
      return false;
    }
    if (previewSourceTypeRef.current !== PREVIEW_SOURCE_CAMERA) {
      throw new Error("当前直播源不是摄像头");
    }

    const requestId = beginPreviewRequest({ stopActive: false });
    const constraints = {
      video: cameraId
        ? {
            deviceId: { exact: cameraId },
            width: { ideal: VIDEO_TARGET_WIDTH },
            height: { ideal: VIDEO_TARGET_HEIGHT },
            frameRate: { ideal: VIDEO_TARGET_FRAMERATE },
          }
        : {
            width: { ideal: VIDEO_TARGET_WIDTH },
            height: { ideal: VIDEO_TARGET_HEIGHT },
            frameRate: { ideal: VIDEO_TARGET_FRAMERATE },
          },
      audio: false,
    };

    updatePublishStatus("preparing", "正在切换摄像头。");

    let newStream = null;
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
        throw new Error("无法获取新摄像头画面");
      }

      const newPublishTrack = newPreviewTrack.clone();
      newPublishTrack.enabled = true;
      const oldPublishTracks = session.publishTracks.filter(
        (track) => track.kind === "video",
      );
      session.broadcast.video.source.set(newPublishTrack);
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

      setCameraEnabledState(true);
      setPreviewHasVideo(true);
      appliedCameraIdRef.current = cameraId;
      updatePublishStatus("live", `直播已启动：${roomRef.current || "unset"}`);
      log(`switched publish camera to ${cameraId || "default"}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updatePublishStatus("error", `切换摄像头失败：${message}`);
      log(`switch camera failed: ${message}`);
      throw error;
    } finally {
      if (newStream) {
        stopMediaStream(newStream);
      }
    }
  }

  async function requestPreferredMicrophoneTrack() {
    if (!microphoneEnabled) {
      return null;
    }

    const microphoneConstraints = selectedMicrophoneId
      ? { audio: { deviceId: { exact: selectedMicrophoneId } } }
      : { audio: true };
    const microphoneStream =
      await navigator.mediaDevices.getUserMedia(microphoneConstraints);
    return microphoneStream.getAudioTracks()[0] ?? null;
  }

  function shouldUsePortraitSyntheticPreview() {
    if (!window.matchMedia("(max-width: 760px)").matches) {
      return false;
    }

    if (previewSourceTypeRef.current !== PREVIEW_SOURCE_CAMERA) {
      return false;
    }

    const { width, height } = getStreamVideoDimensions(
      getLiveMediaStream(),
      previewVideoRef.current,
    );
    return width > 0 && height > width;
  }

  async function startCameraPreview() {
    const requestId = beginPreviewRequest();

    const videoConstraints = !cameraEnabled
      ? false
      : selectedCameraId
        ? {
            deviceId: { exact: selectedCameraId },
            width: { ideal: VIDEO_TARGET_WIDTH },
            height: { ideal: VIDEO_TARGET_HEIGHT },
            frameRate: { ideal: VIDEO_TARGET_FRAMERATE },
          }
        : {
            width: { ideal: VIDEO_TARGET_WIDTH },
            height: { ideal: VIDEO_TARGET_HEIGHT },
            frameRate: { ideal: VIDEO_TARGET_FRAMERATE },
          };
    const audioConstraints = !microphoneEnabled
      ? false
      : selectedMicrophoneId
        ? { deviceId: { exact: selectedMicrophoneId } }
        : true;

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
        : new Error("未检测到可用的摄像头或麦克风");
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

          stopLivePreview();
          if (publisherIsPublishingRef.current) {
            return;
          }

          void startLivePreview().catch((error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            updatePublishStatus("error", `预览失败：${message}`);
            log(`preview track restore failed: ${message}`);
          });
        },
        { once: true },
      );
    }
    await refreshMediaDevices(stream);
  }

  async function startScreenSharePreview() {
    if (!screenShareSupported) {
      throw new Error("当前浏览器不支持屏幕共享");
    }

    const requestId = beginPreviewRequest();

    let displayStream = null;
    let lastDisplayError = null;
    for (const constraints of [
      {
        video: {
          frameRate: { ideal: VIDEO_TARGET_FRAMERATE },
          width: { ideal: VIDEO_TARGET_WIDTH },
          height: { ideal: VIDEO_TARGET_HEIGHT },
        },
        audio: buildSharedAudioConstraints(),
      },
      {
        video: {
          frameRate: { ideal: VIDEO_TARGET_FRAMERATE },
          width: { ideal: VIDEO_TARGET_WIDTH },
          height: { ideal: VIDEO_TARGET_HEIGHT },
        },
        audio: false,
      },
    ]) {
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia(
          constraints,
        );
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
        : new Error("未获取到可共享的屏幕画面");
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
            : new Error("未获取到可用的麦克风");
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
      throw new Error("未获取到可推流的屏幕共享轨道");
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
            updatePublishStatus("error", "屏幕共享已结束，请重新开始直播。");
            return;
          }

          void startLivePreview().catch((error) => {
            const message =
              error instanceof Error ? error.message : String(error);
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

    if (
      previewSourceTypeRef.current === PREVIEW_SOURCE_SYNTHETIC &&
      syntheticSessionRef.current?.syntheticMedia?.mediaStream
    ) {
      updatePreviewState(
        syntheticSessionRef.current.syntheticMedia.mediaStream,
        PREVIEW_SOURCE_SYNTHETIC,
      );
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
    if (livePublisherRef.current) {
      return;
    }

    let stream = getLiveMediaStream();
    if (!hasUsableMediaStream(stream)) {
      stopLivePreview();
      await startLivePreview();
      stream = getLiveMediaStream();
    }
    if (!stream) {
      throw new Error("未获取到摄像头预览");
    }

    const namespace = ensureRoomId(true);
    assertPublishAllowed(namespace);
    const nextRelayUrl = new URL(relayUrlRef.current).toString();
    const previewVideoTrack = stream.getVideoTracks()[0];
    const previewAudioTrack = stream.getAudioTracks()[0];
    if (!previewVideoTrack && !previewAudioTrack) {
      throw new Error("未获取到可推流的音视频轨");
    }
    const previewVideo = previewVideoRef.current;
    const makeEven = (value) => Math.floor(value / 2) * 2;
    const publishVideoTrack = previewVideoTrack?.clone?.() ?? null;
    const publishAudioTrack =
      microphoneEnabled && previewAudioTrack?.clone ? previewAudioTrack.clone() : null;
    const width = previewVideoTrack
      ? makeEven(previewVideo?.videoWidth || previewVideoTrack.getSettings?.().width || 640)
      : 0;
    const height = previewVideoTrack
      ? makeEven(previewVideo?.videoHeight || previewVideoTrack.getSettings?.().height || 360)
      : 0;

    updatePublishStatus("preparing", "正在启动直播。");

    if (publishVideoTrack) {
      publishVideoTrack.enabled =
        previewSourceTypeRef.current === PREVIEW_SOURCE_SCREEN ? true : cameraEnabled;
    }

    if (publishAudioTrack) {
      publishAudioTrack.enabled = microphoneEnabled;
    }

    const session = createPublishSession({
      relayUrl: nextRelayUrl,
      namespace,
      videoTrack: publishVideoTrack,
      audioTrack: publishAudioTrack,
      maxPixels: width && height ? width * height : VIDEO_TARGET_WIDTH * VIDEO_TARGET_HEIGHT,
    });
    session.cleanupPublishTracks = () => {
      session.publishTracks.forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore cleanup failures while tearing down publish clones.
        }
      });
    };

    try {
      await waitForSignalValue(
        session.connection.status,
        (status) => status === "connected",
        PUBLISH_CONNECT_TIMEOUT_MS,
        "连接 relay 超时",
      );
      livePublisherRef.current = session;
      publisherIsPublishingRef.current = true;
      setPublisherIsPublishing(true);
      updatePublishStatus("live", `直播已启动：${namespace}`);
      log(`camera publish started: url=${nextRelayUrl} namespace=${namespace}`);
    } catch (error) {
      console.error("camera publish start failed", error);
      closePublishSession(session);
      updatePublishStatus(
        "error",
        `失败：${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async function stopCameraPublish() {
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
      const message = error instanceof Error ? error.message : String(error);
      updatePublishStatus("error", `失败：${message}`);
      log(`camera stop warning: ${message}`);
    }
  }

  async function startSyntheticPublish() {
    if (syntheticSessionRef.current) {
      return syntheticSessionRef.current.namespace;
    }

    const namespace = ensureRoomId(true);
    assertPublishAllowed(namespace);
    const nextRelayUrl = new URL(relayUrlRef.current).toString();
    if (!namespace) {
      throw new Error("Namespace 不能为空");
    }

    updatePublishStatus("preparing", "正在启动合成推流。");

    const usePortraitSyntheticPreview = shouldUsePortraitSyntheticPreview();
    const shouldPreviewSynthetic =
      usePortraitSyntheticPreview ||
      !getLiveMediaStream()?.getVideoTracks?.().length;
    const syntheticMedia = createSyntheticMedia(namespace, {
      orientation: usePortraitSyntheticPreview ? "portrait" : "landscape",
    });
    const syntheticVideoTrack = syntheticMedia.mediaStream.getVideoTracks()[0];
    const syntheticAudioTrack = syntheticMedia.mediaStream.getAudioTracks()[0] ?? null;
    const syntheticSettings = syntheticVideoTrack?.getSettings?.() ?? {};
    const syntheticWidth = Math.floor((syntheticSettings.width || VIDEO_TARGET_WIDTH) / 2) * 2;
    const syntheticHeight = Math.floor((syntheticSettings.height || VIDEO_TARGET_HEIGHT) / 2) * 2;
    const publishVideoTrack = syntheticVideoTrack?.clone?.() ?? syntheticVideoTrack;
    const publishAudioTrack = syntheticAudioTrack?.clone?.() ?? syntheticAudioTrack;
    const publisher = createPublishSession({
      relayUrl: nextRelayUrl,
      namespace,
      videoTrack: publishVideoTrack,
      audioTrack: publishAudioTrack,
      maxPixels: syntheticWidth * syntheticHeight,
      audioMuted: false,
    });
    publisher.cleanupPublishTracks = () => {
      for (const track of publisher.publishTracks) {
        try {
          track.stop();
        } catch {
          // Ignore cleanup failures while stopping synthetic publish tracks.
        }
      }
    };

    try {
      await waitForSignalValue(
        publisher.connection.status,
        (status) => status === "connected",
        PUBLISH_CONNECT_TIMEOUT_MS,
        "连接 relay 超时",
      );
    } catch (error) {
      closePublishSession(publisher);
      await syntheticMedia.stop();
      throw error;
    }

    syntheticSessionRef.current = { namespace, publisher, syntheticMedia };
    setSyntheticPublishing(true);
    if (shouldPreviewSynthetic) {
      stopLivePreview();
      updatePreviewState(
        syntheticMedia.mediaStream,
        PREVIEW_SOURCE_SYNTHETIC,
      );
      updatePublishStatus(
        "live",
        `合成推流已启动：${namespace}（预览已切换为${usePortraitSyntheticPreview ? "竖屏" : "横屏"}合成源）`,
      );
    } else {
      updatePublishStatus("live", `合成推流已启动：${namespace}`);
    }
    log(
      `synthetic publish started: url=${nextRelayUrl} namespace=${namespace} orientation=${syntheticMedia.orientation}`,
    );
    return namespace;
  }

  async function stopSyntheticPublish() {
    const current = syntheticSessionRef.current;
    const wasPreviewingSynthetic =
      previewSourceTypeRef.current === PREVIEW_SOURCE_SYNTHETIC &&
      previewMediaStreamRef.current === current?.syntheticMedia?.mediaStream;
    syntheticSessionRef.current = null;
    setSyntheticPublishing(false);

    if (!current) {
      updatePublishStatus("idle", "等待推流。");
      return;
    }

    updatePublishStatus("preparing", "正在停止合成推流。");
    try {
      closePublishSession(current.publisher);
    } catch (error) {
      log(
        `synthetic stop warning: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await current.syntheticMedia.stop();
    updatePublishStatus("idle", "合成推流已停止。");
    log(`synthetic publish stopped: namespace=${current.namespace}`);

    if (wasPreviewingSynthetic) {
      clearPreviewState({ resetSource: true });
      if (pageRef.current === "live" && !publisherIsPublishingRef.current) {
        await startLivePreview();
      }
    }
  }

  useEffect(() => {
    if (page === "live" && !publisherIsPublishing) {
      if (
        previewSourceTypeRef.current === PREVIEW_SOURCE_SYNTHETIC &&
        syntheticSessionRef.current
      ) {
        return;
      }

      const currentStream = getLiveMediaStream();
      const shouldRestartPreview =
        !hasUsableMediaStream(currentStream) ||
        (previewSourceTypeRef.current === PREVIEW_SOURCE_SCREEN
          ? appliedMicrophoneIdRef.current !== selectedMicrophoneId ||
            appliedMicrophoneEnabledRef.current !== microphoneEnabled
          : appliedCameraIdRef.current !== selectedCameraId ||
            appliedMicrophoneIdRef.current !== selectedMicrophoneId);

      if (shouldRestartPreview) {
        stopLivePreview();
        void startLivePreview().catch((error) => {
          const message =
            error instanceof Error ? error.message : String(error);
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
    cameraEnabled,
    microphoneEnabled,
    publisherIsPublishing,
  ]);

  useEffect(() => {
    if (page !== "live") {
      return;
    }

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
            const message =
              error instanceof Error ? error.message : String(error);
            updatePublishStatus("error", `预览失败：${message}`);
            log(`preview resume failed: ${message}`);
          });
        }
        return;
      }

      if (
        !publisherIsPublishingRef.current &&
        previewSourceTypeRef.current !== PREVIEW_SOURCE_SCREEN &&
        previewSourceTypeRef.current !== PREVIEW_SOURCE_SYNTHETIC
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
      void stopSyntheticPublish();
      void stopCameraPublish();
      stopLivePreview({ resetSource: true });
    },
    [],
  );

  return {
    publishStatus,
    publishStatusKind,
    publisherIsPublishing,
    cameraOptions,
    microphoneOptions,
    selectedCameraId,
    selectedMicrophoneId,
    cameraEnabled,
    microphoneEnabled,
    previewActive,
    previewHasVideo,
    previewSourceType,
    screenShareSupported,
    screenShareActive: previewSourceType === PREVIEW_SOURCE_SCREEN && previewActive,
    syntheticPublishing,
    previewVideoRef,
    syntheticSessionRef,
    setSelectedCameraId,
    setSelectedMicrophoneId,
    setCameraEnabled,
    setMicrophoneEnabled,
    switchPublishCamera,
    startCameraPublish,
    stopCameraPublish,
    startScreenShare,
    stopScreenShare,
    startSyntheticPublish,
    stopSyntheticPublish,
    getSyntheticSignatures: () => ({
      source: sampleCanvasMarkerSignature(
        syntheticSessionRef.current?.syntheticMedia?.canvas ?? null,
      ),
      expectedPalette:
        syntheticSessionRef.current?.syntheticMedia?.markerPalette ?? null,
    }),
  };
}
