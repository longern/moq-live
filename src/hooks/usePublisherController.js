import { useEffect, useRef, useState } from "preact/hooks";
import { PublisherApi } from "../../vendor/moq-js/publish/index.ts";
import { createSyntheticMedia, sampleCanvasMarkerSignature } from "../lib/syntheticMedia.js";

function hasUsableMediaStream(stream) {
  if (!stream) {
    return false;
  }

  const tracks = stream.getTracks();
  return tracks.length > 0 && tracks.every((track) => track.readyState === "live");
}

export function usePublisherController({
  page,
  pageRef,
  relayUrlRef,
  roomRef,
  generateRoomId,
  log
}) {
  const [publishStatus, setPublishStatus] = useState("等待推流。");
  const [publisherIsPublishing, setPublisherIsPublishing] = useState(false);
  const [cameraOptions, setCameraOptions] = useState([]);
  const [microphoneOptions, setMicrophoneOptions] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [previewActive, setPreviewActive] = useState(false);

  const previewVideoRef = useRef(null);
  const syntheticSessionRef = useRef(null);
  const livePublisherRef = useRef(null);
  const liveMediaStreamRef = useRef(null);
  const publishMediaStreamRef = useRef(null);
  const publisherIsPublishingRef = useRef(false);
  const appliedCameraIdRef = useRef("");
  const appliedMicrophoneIdRef = useRef("");

  publisherIsPublishingRef.current = publisherIsPublishing;

  function ensureRoomId(force = false) {
    const currentRoom = roomRef.current;
    const nextRoom = force || !currentRoom ? generateRoomId() : currentRoom;
    return nextRoom;
  }

  function stopLivePreview() {
    const stream = liveMediaStreamRef.current;
    if (stream) {
      liveMediaStreamRef.current = null;
      stream.getTracks().forEach((track) => track.stop());
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null;
    }
    setPreviewActive(false);
  }

  async function refreshMediaDevices(preferredStream = null) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter((device) => device.kind === "videoinput");
    const microphones = devices.filter((device) => device.kind === "audioinput");
    const nextCameraOptions = videos.map((device, index) => ({
      value: device.deviceId,
      label: device.label || `Camera ${index + 1}`
    }));
    const nextMicrophoneOptions = microphones.map((device, index) => ({
      value: device.deviceId,
      label: device.label || `Mic ${index + 1}`
    }));

    setCameraOptions(nextCameraOptions);
    setMicrophoneOptions(nextMicrophoneOptions);

    setSelectedCameraId((current) => {
      if (current && nextCameraOptions.some((option) => option.value === current)) {
        return current;
      }
      const streamCameraId = preferredStream?.getVideoTracks?.()[0]?.getSettings?.().deviceId;
      if (streamCameraId && nextCameraOptions.some((option) => option.value === streamCameraId)) {
        return streamCameraId;
      }
      return nextCameraOptions[0]?.value ?? "";
    });

    setSelectedMicrophoneId((current) => {
      if (current && nextMicrophoneOptions.some((option) => option.value === current)) {
        return current;
      }
      const streamMicrophoneId = preferredStream?.getAudioTracks?.()[0]?.getSettings?.().deviceId;
      if (streamMicrophoneId && nextMicrophoneOptions.some((option) => option.value === streamMicrophoneId)) {
        return streamMicrophoneId;
      }
      return nextMicrophoneOptions[0]?.value ?? "";
    });
  }

  async function startLivePreview() {
    if (publisherIsPublishingRef.current) {
      return;
    }

    const existing = liveMediaStreamRef.current;
    if (existing) {
      existing.getTracks().forEach((track) => track.stop());
      liveMediaStreamRef.current = null;
    }

    const videoConstraints = selectedCameraId
      ? { deviceId: { exact: selectedCameraId }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
      : { height: { ideal: 480 }, frameRate: { ideal: 30 } };
    const audioConstraints = selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : true;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: audioConstraints
    });

    liveMediaStreamRef.current = stream;
    appliedCameraIdRef.current = selectedCameraId;
    appliedMicrophoneIdRef.current = selectedMicrophoneId;
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => {
        if (liveMediaStreamRef.current !== stream) {
          return;
        }
        if (publisherIsPublishingRef.current || pageRef.current !== "live") {
          return;
        }

        stopLivePreview();
        void startLivePreview().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setPublishStatus(`预览失败：${message}`);
          log(`preview track restore failed: ${message}`);
        });
      }, { once: true });
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = stream;
    }
    setPreviewActive(true);
    await refreshMediaDevices(stream);
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
    if (!previewAudioTrack) {
      throw new Error("未获取到麦克风音频轨");
    }
    const publishStream = new MediaStream(clonedTracks);
    publishMediaStreamRef.current = publishStream;

    const audioTrack = publishStream.getAudioTracks()[0];
    const sampleRate = audioTrack?.getSettings().sampleRate ?? (await new AudioContext()).sampleRate;
    const numberOfChannels = audioTrack?.getSettings().channelCount ?? 2;
    const previewVideo = previewVideoRef.current;
    const makeEven = (value) => Math.floor(value / 2) * 2;
    const width = makeEven(previewVideo?.videoWidth || 640);
    const height = makeEven(previewVideo?.videoHeight || 360);

    setPublishStatus("正在启动直播。");

    const publisher = new PublisherApi({
      url: nextRelayUrl,
      namespace: [namespace],
      media: publishStream,
      video: {
        codec: "avc1.42E01E",
        width,
        height,
        bitrate: 1_000_000,
        framerate: 30
      },
      audio: {
        codec: "opus",
        sampleRate,
        numberOfChannels,
        bitrate: 64_000
      }
    });

    try {
      await publisher.publish();
      livePublisherRef.current = publisher;
      publisherIsPublishingRef.current = true;
      setPublisherIsPublishing(true);
      setPublishStatus(`直播已启动：${namespace}`);
      log(`camera publish started: url=${nextRelayUrl} namespace=${namespace}`);
    } catch (error) {
      publishMediaStreamRef.current = null;
      publishStream.getTracks().forEach((track) => track.stop());
      setPublishStatus(`失败：${error instanceof Error ? error.message : String(error)}`);
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
        width: 640,
        height: 360,
        bitrate: 1_000_000,
        framerate: 30
      },
      audio: {
        codec: "opus",
        sampleRate: 48_000,
        numberOfChannels: 2,
        bitrate: 64_000
      }
    });

    try {
      await publisher.publish();
    } catch (error) {
      await syntheticMedia.stop();
      throw error;
    }

    syntheticSessionRef.current = { namespace, publisher, syntheticMedia };
    setPublishStatus(`合成推流已启动：${namespace}`);
    log(`synthetic publish started: url=${nextRelayUrl} namespace=${namespace}`);
    return namespace;
  }

  async function stopSyntheticPublish() {
    const current = syntheticSessionRef.current;
    syntheticSessionRef.current = null;

    if (!current) {
      setPublishStatus("等待推流。");
      return;
    }

    setPublishStatus("正在停止合成推流。");
    try {
      await current.publisher.stop();
    } catch (error) {
      log(`synthetic stop warning: ${error instanceof Error ? error.message : String(error)}`);
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
        appliedCameraIdRef.current !== selectedCameraId ||
        appliedMicrophoneIdRef.current !== selectedMicrophoneId;

      if (shouldRestartPreview) {
        stopLivePreview();
        void startLivePreview().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setPublishStatus(`预览失败：${message}`);
          log(`preview failed: ${message}`);
        });
      }
      return;
    }

    if (!publisherIsPublishing) {
      stopLivePreview();
    }
  }, [page, selectedCameraId, selectedMicrophoneId, publisherIsPublishing]);

  useEffect(() => {
    if (page !== "live") {
      return;
    }

    const previewVideo = previewVideoRef.current;
    const stream = liveMediaStreamRef.current;
    if (!previewVideo || !stream) {
      return;
    }

    if (previewVideo.srcObject !== stream) {
      previewVideo.srcObject = stream;
    }
  }, [page, previewActive]);

  useEffect(() => {
    void refreshMediaDevices(liveMediaStreamRef.current).catch(() => {});

    const handleDeviceChange = () => {
      void refreshMediaDevices(liveMediaStreamRef.current).catch(() => {});
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (pageRef.current === "live" && !publisherIsPublishingRef.current) {
          void startLivePreview().catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            setPublishStatus(`预览失败：${message}`);
            log(`preview resume failed: ${message}`);
          });
        }
        return;
      }

      if (!publisherIsPublishingRef.current) {
        stopLivePreview();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => () => {
    void stopSyntheticPublish();
    void stopCameraPublish();
    stopLivePreview();
  }, []);

  return {
    publishStatus,
    publisherIsPublishing,
    cameraOptions,
    microphoneOptions,
    selectedCameraId,
    selectedMicrophoneId,
    previewActive,
    previewVideoRef,
    syntheticSessionRef,
    setSelectedCameraId,
    setSelectedMicrophoneId,
    startCameraPublish,
    stopCameraPublish,
    startSyntheticPublish,
    stopSyntheticPublish,
    getSyntheticSignatures: () => ({
      source: sampleCanvasMarkerSignature(syntheticSessionRef.current?.syntheticMedia?.canvas ?? null),
      expectedPalette: syntheticSessionRef.current?.syntheticMedia?.markerPalette ?? null
    })
  };
}
