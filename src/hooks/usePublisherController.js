import { useEffect, useRef, useState } from "preact/hooks";
import { PublisherApi } from "../../vendor/moq-js/publish/index.ts";
import { getPublishBlockReason } from "../lib/roomPolicy.js";
import {
  createSyntheticMedia,
  sampleCanvasMarkerSignature,
} from "../lib/syntheticMedia.js";

const VIDEO_TARGET_WIDTH = 1280;
const VIDEO_TARGET_HEIGHT = 720;
const VIDEO_TARGET_FRAMERATE = 30;
const VIDEO_TARGET_BITRATE = 2_500_000;
const DEFAULT_PREVIEW_SOURCE = "camera";

function hasUsableMediaStream(stream) {
  if (!stream) {
    return false;
  }

  const tracks = stream.getTracks();
  return (
    tracks.length > 0 && tracks.every((track) => track.readyState === "live")
  );
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
  const liveMediaStreamRef = useRef(null);
  const publishMediaStreamRef = useRef(null);
  const publisherIsPublishingRef = useRef(false);
  const appliedCameraIdRef = useRef("");
  const appliedMicrophoneIdRef = useRef("");
  const previewSourceTypeRef = useRef(DEFAULT_PREVIEW_SOURCE);
  const appliedMicrophoneEnabledRef = useRef(true);

  publisherIsPublishingRef.current = publisherIsPublishing;
  previewSourceTypeRef.current = previewSourceType;

  function ensureRoomId(force = false) {
    const currentRoom = roomRef.current;
    const nextRoom = force || !currentRoom ? generateRoomId() : currentRoom;
    return nextRoom;
  }

  function assertPublishAllowed(room) {
    const reason = getPublishBlockReason(room);
    if (reason) {
      setPublishStatus(`失败：${reason}`);
      throw new Error(reason);
    }
  }

  function stopLivePreview({ resetSource = false } = {}) {
    const stream = liveMediaStreamRef.current;
    if (stream) {
      liveMediaStreamRef.current = null;
      stream.getTracks().forEach((track) => track.stop());
    }
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

  function setCameraEnabled(nextEnabled) {
    setCameraEnabledState(nextEnabled);
    const nextHasVideo =
      previewSourceTypeRef.current === "screen"
        ? Boolean(liveMediaStreamRef.current?.getVideoTracks().length)
        : nextEnabled &&
      Boolean(liveMediaStreamRef.current?.getVideoTracks().length);

    if (previewSourceTypeRef.current !== "screen") {
      for (const stream of [
        liveMediaStreamRef.current,
        publishMediaStreamRef.current,
      ]) {
        stream?.getVideoTracks().forEach((track) => {
          track.enabled = nextEnabled;
        });
      }
    }

    setPreviewHasVideo(nextHasVideo);
  }

  function setMicrophoneEnabled(nextEnabled) {
    setMicrophoneEnabledState(nextEnabled);

    for (const stream of [
      liveMediaStreamRef.current,
      publishMediaStreamRef.current,
    ]) {
      stream?.getAudioTracks().forEach((track) => {
        track.enabled = nextEnabled;
      });
    }
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
    liveMediaStreamRef.current = stream;
    appliedCameraIdRef.current = selectedCameraId;
    appliedMicrophoneIdRef.current = selectedMicrophoneId;
    appliedMicrophoneEnabledRef.current = microphoneEnabled;
    previewSourceTypeRef.current = sourceType;
    setPreviewSourceType(sourceType);
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

  async function startCameraPreview() {
    const existing = liveMediaStreamRef.current;
    if (existing) {
      existing.getTracks().forEach((track) => track.stop());
      liveMediaStreamRef.current = null;
    }

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

    setLivePreviewStream(stream, "camera");
    for (const track of stream.getTracks()) {
      track.addEventListener(
        "ended",
        () => {
          if (liveMediaStreamRef.current !== stream) {
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
            setPublishStatus(`预览失败：${message}`);
            log(`preview track restore failed: ${message}`);
          });
        },
        { once: true },
      );
    }
    const hasVideoTrack = stream.getVideoTracks().length > 0;
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = hasVideoTrack ? stream : null;
    }
    setPreviewActive(true);
    setPreviewHasVideo(hasVideoTrack && cameraEnabled);
    await refreshMediaDevices(stream);
  }

  async function startScreenSharePreview() {
    if (!screenShareSupported) {
      throw new Error("当前浏览器不支持屏幕共享");
    }

    const existing = liveMediaStreamRef.current;
    if (existing) {
      existing.getTracks().forEach((track) => track.stop());
      liveMediaStreamRef.current = null;
    }

    let displayStream = null;
    let lastDisplayError = null;
    for (const constraints of [
      {
        video: {
          frameRate: { ideal: VIDEO_TARGET_FRAMERATE },
          width: { ideal: VIDEO_TARGET_WIDTH },
          height: { ideal: VIDEO_TARGET_HEIGHT },
        },
        audio: true,
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
      }
    }

    if (!displayStream) {
      throw lastDisplayError instanceof Error
        ? lastDisplayError
        : new Error("未获取到可共享的屏幕画面");
    }

    const videoTrack = displayStream.getVideoTracks()[0] ?? null;
    let audioTrack = displayStream.getAudioTracks()[0] ?? null;
    let microphoneTrack = null;

    if (microphoneEnabled) {
      try {
        microphoneTrack = await requestPreferredMicrophoneTrack();
      } catch (error) {
        if (!audioTrack) {
          displayStream.getTracks().forEach((track) => track.stop());
          throw error instanceof Error
            ? error
            : new Error("未获取到可用的麦克风");
        }
        log(
          `screen share microphone warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (microphoneTrack) {
      if (audioTrack && audioTrack !== microphoneTrack) {
        audioTrack.stop();
      }
      audioTrack = microphoneTrack;
    }

    if (!videoTrack && !audioTrack) {
      displayStream.getTracks().forEach((track) => track.stop());
      throw new Error("未获取到可推流的屏幕共享轨道");
    }

    const usedTracks = [videoTrack, audioTrack].filter(Boolean);
    const stream = new MediaStream(usedTracks);
    for (const track of displayStream.getTracks()) {
      if (!usedTracks.includes(track)) {
        track.stop();
      }
    }

    setLivePreviewStream(stream, "screen");
    for (const track of stream.getTracks()) {
      track.addEventListener(
        "ended",
        () => {
          if (liveMediaStreamRef.current !== stream || pageRef.current !== "live") {
            return;
          }

          stopLivePreview({ resetSource: true });
          if (publisherIsPublishingRef.current) {
            void stopCameraPublish();
            setPublishStatus("屏幕共享已结束，请重新开始直播。");
            return;
          }

          void startLivePreview().catch((error) => {
            const message =
              error instanceof Error ? error.message : String(error);
            setPublishStatus(`预览失败：${message}`);
            log(`screen share restore failed: ${message}`);
          });
        },
        { once: true },
      );
    }

    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = videoTrack ? stream : null;
    }
    setPreviewActive(true);
    setPreviewHasVideo(Boolean(videoTrack));
    setPublishStatus("屏幕共享已就绪。");
    await refreshMediaDevices(stream);
  }

  async function startLivePreview() {
    if (publisherIsPublishingRef.current) {
      return;
    }

    if (previewSourceTypeRef.current === "screen") {
      await startScreenSharePreview();
      return;
    }

    await startCameraPreview();
  }

  async function startScreenShare() {
    await startScreenSharePreview();
  }

  async function stopScreenShare() {
    if (previewSourceTypeRef.current !== "screen") {
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

    let stream = liveMediaStreamRef.current;
    if (!hasUsableMediaStream(stream)) {
      stopLivePreview();
      await startLivePreview();
      stream = liveMediaStreamRef.current;
    }
    if (!stream) {
      throw new Error("未获取到摄像头预览");
    }

    const namespace = ensureRoomId();
    assertPublishAllowed(namespace);
    const nextRelayUrl = new URL(relayUrlRef.current).toString();
    const previewVideoTrack = stream.getVideoTracks()[0];
    const previewAudioTrack = stream.getAudioTracks()[0];
    const clonedTracks = [];
    if (previewVideoTrack) {
      clonedTracks.push(previewVideoTrack.clone());
    }
    if (previewAudioTrack) {
      clonedTracks.push(previewAudioTrack.clone());
    }
    if (!previewVideoTrack && !previewAudioTrack) {
      throw new Error("未获取到可推流的音视频轨");
    }
    const publishStream = new MediaStream(clonedTracks);
    publishMediaStreamRef.current = publishStream;

    const audioTrack = publishStream.getAudioTracks()[0];
    const previewVideo = previewVideoRef.current;
    const makeEven = (value) => Math.floor(value / 2) * 2;

    setPublishStatus("正在启动直播。");

    const publisherOptions = {
      url: nextRelayUrl,
      namespace: [namespace],
      media: publishStream,
    };

    if (previewVideoTrack) {
      const width = makeEven(previewVideo?.videoWidth || 640);
      const height = makeEven(previewVideo?.videoHeight || 360);
      publisherOptions.video = {
        codec: "avc1.42E01E",
        width,
        height,
        bitrate: VIDEO_TARGET_BITRATE,
        framerate: VIDEO_TARGET_FRAMERATE,
      };
    }

    if (audioTrack) {
      const sampleRate =
        audioTrack.getSettings().sampleRate ??
        (await new AudioContext()).sampleRate;
      const numberOfChannels = audioTrack.getSettings().channelCount ?? 2;
      publisherOptions.audio = {
        codec: "opus",
        sampleRate,
        numberOfChannels,
        bitrate: 64_000,
      };
    }

    const publisher = new PublisherApi(publisherOptions);

    try {
      await publisher.publish();
      livePublisherRef.current = publisher;
      publisherIsPublishingRef.current = true;
      setPublisherIsPublishing(true);
      publishStream.getVideoTracks().forEach((track) => {
        track.enabled =
          previewSourceTypeRef.current === "screen" ? true : cameraEnabled;
      });
      publishStream.getAudioTracks().forEach((track) => {
        track.enabled = microphoneEnabled;
      });
      setPublishStatus(`直播已启动：${namespace}`);
      log(`camera publish started: url=${nextRelayUrl} namespace=${namespace}`);
    } catch (error) {
      publishMediaStreamRef.current = null;
      publishStream.getTracks().forEach((track) => track.stop());
      setPublishStatus(
        `失败：${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async function stopCameraPublish() {
    const publisher = livePublisherRef.current;
    const publishStream = publishMediaStreamRef.current;
    livePublisherRef.current = null;
    publishMediaStreamRef.current = null;

    if (!publisher) {
      if (publishStream) {
        publishStream.getTracks().forEach((track) => track.stop());
      }
      return;
    }

    publisherIsPublishingRef.current = false;
    setPublisherIsPublishing(false);
    setPublishStatus("正在停止直播。");

    try {
      await publisher.stop();
      setPublishStatus("直播已停止。");
      log(`camera publish stopped: namespace=${roomRef.current || "unset"}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPublishStatus(`失败：${message}`);
      log(`camera stop warning: ${message}`);
    } finally {
      if (publishStream) {
        publishStream.getTracks().forEach((track) => track.stop());
      }
    }
  }

  async function startSyntheticPublish() {
    if (syntheticSessionRef.current) {
      return syntheticSessionRef.current.namespace;
    }

    const namespace = ensureRoomId();
    assertPublishAllowed(namespace);
    const nextRelayUrl = new URL(relayUrlRef.current).toString();
    if (!namespace) {
      throw new Error("Namespace 不能为空");
    }

    setPublishStatus("正在启动合成推流。");

    const syntheticMedia = createSyntheticMedia(namespace);
    const publisher = new PublisherApi({
      url: nextRelayUrl,
      namespace: [namespace],
      media: syntheticMedia.mediaStream,
      video: {
        codec: "avc1.42E01E",
        width: VIDEO_TARGET_WIDTH,
        height: VIDEO_TARGET_HEIGHT,
        bitrate: VIDEO_TARGET_BITRATE,
        framerate: VIDEO_TARGET_FRAMERATE,
      },
      audio: {
        codec: "opus",
        sampleRate: 48_000,
        numberOfChannels: 2,
        bitrate: 64_000,
      },
    });

    try {
      await publisher.publish();
    } catch (error) {
      await syntheticMedia.stop();
      throw error;
    }

    syntheticSessionRef.current = { namespace, publisher, syntheticMedia };
    setSyntheticPublishing(true);
    setPublishStatus(`合成推流已启动：${namespace}`);
    log(
      `synthetic publish started: url=${nextRelayUrl} namespace=${namespace}`,
    );
    return namespace;
  }

  async function stopSyntheticPublish() {
    const current = syntheticSessionRef.current;
    syntheticSessionRef.current = null;
    setSyntheticPublishing(false);

    if (!current) {
      setPublishStatus("等待推流。");
      return;
    }

    setPublishStatus("正在停止合成推流。");
    try {
      await current.publisher.stop();
    } catch (error) {
      log(
        `synthetic stop warning: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await current.syntheticMedia.stop();
    setPublishStatus("合成推流已停止。");
    log(`synthetic publish stopped: namespace=${current.namespace}`);
  }

  useEffect(() => {
    if (page === "live" && !publisherIsPublishing) {
      const currentStream = liveMediaStreamRef.current;
      const shouldRestartPreview =
        !hasUsableMediaStream(currentStream) ||
        (previewSourceTypeRef.current === "screen"
          ? appliedMicrophoneIdRef.current !== selectedMicrophoneId ||
            appliedMicrophoneEnabledRef.current !== microphoneEnabled
          : appliedCameraIdRef.current !== selectedCameraId ||
            appliedMicrophoneIdRef.current !== selectedMicrophoneId);

      if (shouldRestartPreview) {
        stopLivePreview();
        void startLivePreview().catch((error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          setPublishStatus(`预览失败：${message}`);
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
    const stream = liveMediaStreamRef.current;
    if (!previewVideo || !stream || !previewHasVideo) {
      if (previewVideo) {
        previewVideo.srcObject = null;
      }
      return;
    }

    if (previewVideo.srcObject !== stream) {
      previewVideo.srcObject = stream;
    }
  }, [page, previewActive, previewHasVideo]);

  useEffect(() => {
    void refreshMediaDevices(liveMediaStreamRef.current).catch(() => {});

    const handleDeviceChange = () => {
      void refreshMediaDevices(liveMediaStreamRef.current).catch(() => {});
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
            setPublishStatus(`预览失败：${message}`);
            log(`preview resume failed: ${message}`);
          });
        }
        return;
      }

      if (
        !publisherIsPublishingRef.current &&
        previewSourceTypeRef.current !== "screen"
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
    screenShareActive: previewSourceType === "screen" && previewActive,
    syntheticPublishing,
    previewVideoRef,
    syntheticSessionRef,
    setSelectedCameraId,
    setSelectedMicrophoneId,
    setCameraEnabled,
    setMicrophoneEnabled,
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
