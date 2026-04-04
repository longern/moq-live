import { useEffect, useRef, useState } from "preact/hooks";
import { PublisherApi } from "../vendor/moq-js/publish/index.ts";
import { DesktopNavigation, MobileNavigation } from "./components/Navigation.jsx";
import { LivePage } from "./components/LivePage.jsx";
import { SettingsPage } from "./components/SettingsPage.jsx";
import { WatchPage } from "./components/WatchPage.jsx";

const DEFAULT_RELAY_URL = "https://draft-14.cloudflare.mediaoverquic.com/";
const playerModuleState = { promise: null };

const SYNTHETIC_MARKER = {
  x: 488,
  y: 36,
  width: 96,
  height: 96
};

function generateRoomId() {
  return `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function getInitialViewState() {
  const params = new URLSearchParams(window.location.search);
  const requestedPage = params.get("mode");
  const page = requestedPage === "live" || requestedPage === "settings" ? requestedPage : "watch";
  let room = params.get("room") ?? params.get("namespace") ?? "";

  if (page === "live" && !room) {
    room = generateRoomId();
  }

  return {
    page,
    room,
    relayUrl: params.get("url") ?? DEFAULT_RELAY_URL,
    autorun: params.get("autorun") === "1"
  };
}

function buildWatchLink(relayUrl, room) {
  if (!relayUrl || !room) {
    return "等待生成观看链接";
  }

  return `${window.location.origin}${window.location.pathname}?mode=watch&room=${encodeURIComponent(room)}&url=${encodeURIComponent(relayUrl)}&autorun=1`;
}

function getRelayHostValue(relayUrl) {
  if (!relayUrl) {
    return "未配置 relay";
  }

  try {
    return new URL(relayUrl).host;
  } catch {
    return relayUrl;
  }
}

function writeRoute({ page, room, relayUrl, autorun }) {
  const next = new URL(window.location.href);
  next.searchParams.set("mode", page);

  if (relayUrl) {
    next.searchParams.set("url", relayUrl);
  } else {
    next.searchParams.delete("url");
  }

  if (room) {
    next.searchParams.set("room", room);
  } else {
    next.searchParams.delete("room");
  }

  next.searchParams.delete("namespace");

  if (autorun) {
    next.searchParams.set("autorun", "1");
  } else {
    next.searchParams.delete("autorun");
  }

  history.replaceState({}, "", next);
}

function describePlayerState(message = "") {
  if (message.includes("播放中")) {
    return { label: "正在收看", state: "live" };
  }
  if (message.includes("缓冲") || message.includes("连接")) {
    return { label: "连接中", state: "warm" };
  }
  if (message.includes("失败")) {
    return { label: "收看异常", state: "error" };
  }
  if (message.includes("离开") || message.includes("停止")) {
    return { label: "已离开", state: "idle" };
  }
  return { label: "待收看", state: "idle" };
}

function describePublishState(message = "") {
  if (message.includes("已启动")) {
    return { label: "直播中", state: "live" };
  }
  if (message.includes("正在启动") || message.includes("正在停止")) {
    return { label: "准备中", state: "warm" };
  }
  if (message.includes("失败")) {
    return { label: "开播异常", state: "error" };
  }
  return { label: "未开播", state: "idle" };
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createMarkerPalette(namespace) {
  const seed = hashString(namespace || "unset");
  return [
    [64 + ((seed >>> 0) & 0x7f), 48 + ((seed >>> 7) & 0x7f), 56 + ((seed >>> 14) & 0x7f)],
    [56 + ((seed >>> 5) & 0x7f), 64 + ((seed >>> 12) & 0x7f), 48 + ((seed >>> 19) & 0x7f)],
    [48 + ((seed >>> 10) & 0x7f), 56 + ((seed >>> 17) & 0x7f), 64 + ((seed >>> 24) & 0x7f)],
    [240, 240, 240]
  ];
}

function createSyntheticMedia(namespace) {
  const width = 640;
  const height = 360;
  const fps = 30;
  const markerPalette = createMarkerPalette(namespace);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建 canvas 上下文");
  }

  let rafId = 0;
  const startedAt = performance.now();
  const renderFrame = (now) => {
    const t = (now - startedAt) / 1000;
    ctx.fillStyle = "#0f1720";
    ctx.fillRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#d97706");
    gradient.addColorStop(1, "#0ea5e9");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(15, 23, 32, 0.72)";
    ctx.fillRect(24, 24, width - 48, height - 48);

    for (let i = 0; i < 16; i += 1) {
      const phase = t * 2.4 + i * 0.35;
      const barHeight = 24 + ((Math.sin(phase) + 1) / 2) * (height - 140);
      const barWidth = 18;
      const gap = 16;
      const x = 40 + i * (barWidth + gap);
      const y = height - 36 - barHeight;
      ctx.fillStyle = i % 2 === 0 ? "#f8fafc" : "#fde68a";
      ctx.fillRect(x, y, barWidth, barHeight);
    }

    ctx.fillStyle = "#f8fafc";
    ctx.font = '700 28px "SF Mono", Menlo, monospace';
    ctx.fillText("MOQ SYNTHETIC LIVE", 38, 72);
    ctx.font = '500 18px "SF Mono", Menlo, monospace';
    ctx.fillText(new Date().toISOString(), 38, 102);
    ctx.fillText(`namespace=${namespace || "unset"}`, 38, 128);

    const cellWidth = SYNTHETIC_MARKER.width / 2;
    const cellHeight = SYNTHETIC_MARKER.height / 2;
    ctx.fillStyle = "rgba(15, 23, 32, 0.2)";
    ctx.fillRect(
      SYNTHETIC_MARKER.x - 6,
      SYNTHETIC_MARKER.y - 6,
      SYNTHETIC_MARKER.width + 12,
      SYNTHETIC_MARKER.height + 12
    );
    markerPalette.forEach(([r, g, b], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      ctx.fillStyle = `rgb(${r} ${g} ${b})`;
      ctx.fillRect(
        SYNTHETIC_MARKER.x + col * cellWidth,
        SYNTHETIC_MARKER.y + row * cellHeight,
        cellWidth,
        cellHeight
      );
    });
    ctx.strokeStyle = "#0f1720";
    ctx.lineWidth = 4;
    ctx.strokeRect(SYNTHETIC_MARKER.x, SYNTHETIC_MARKER.y, SYNTHETIC_MARKER.width, SYNTHETIC_MARKER.height);

    const orbX = width * 0.78 + Math.sin(t * 1.7) * 56;
    const orbY = height * 0.52 + Math.cos(t * 1.3) * 46;
    ctx.beginPath();
    ctx.fillStyle = "#fb7185";
    ctx.arc(orbX, orbY, 26, 0, Math.PI * 2);
    ctx.fill();

    rafId = window.requestAnimationFrame(renderFrame);
  };
  rafId = window.requestAnimationFrame(renderFrame);

  const videoStream = canvas.captureStream(fps);
  const videoTrack = videoStream.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error("无法创建合成视频轨");
  }

  const audioContext = new AudioContext({ sampleRate: 48_000 });
  const destination = audioContext.createMediaStreamDestination();
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.08;
  masterGain.connect(destination);

  const oscillatorA = audioContext.createOscillator();
  oscillatorA.type = "sine";
  oscillatorA.frequency.value = 220;
  oscillatorA.connect(masterGain);
  oscillatorA.start();

  const oscillatorB = audioContext.createOscillator();
  oscillatorB.type = "triangle";
  oscillatorB.frequency.value = 330;
  oscillatorB.connect(masterGain);
  oscillatorB.start();

  const lfo = audioContext.createOscillator();
  const lfoGain = audioContext.createGain();
  lfo.type = "sine";
  lfo.frequency.value = 0.8;
  lfoGain.gain.value = 110;
  lfo.connect(lfoGain);
  lfoGain.connect(oscillatorA.frequency);
  lfo.start();

  const audioTrack = destination.stream.getAudioTracks()[0];
  if (!audioTrack) {
    throw new Error("无法创建合成音频轨");
  }

  const mediaStream = new MediaStream([videoTrack, audioTrack]);

  return {
    canvas,
    markerPalette,
    mediaStream,
    async stop() {
      window.cancelAnimationFrame(rafId);
      mediaStream.getTracks().forEach((track) => track.stop());
      oscillatorA.stop();
      oscillatorB.stop();
      lfo.stop();
      await audioContext.close();
    }
  };
}

function samplePatch(ctx, canvas, centerX, centerY, size = 18) {
  const half = Math.max(2, Math.floor(size / 2));
  const x = Math.max(0, Math.min(canvas.width - 1, Math.round(centerX) - half));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.round(centerY) - half));
  const width = Math.max(1, Math.min(canvas.width - x, half * 2));
  const height = Math.max(1, Math.min(canvas.height - y, half * 2));
  const { data } = ctx.getImageData(x, y, width, height);
  let r = 0;
  let g = 0;
  let b = 0;
  const count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function sampleCanvasMarkerSignature(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return null;
  }

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  const cellWidth = SYNTHETIC_MARKER.width / 2;
  const cellHeight = SYNTHETIC_MARKER.height / 2;
  return Array.from({ length: 4 }, (_, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = (SYNTHETIC_MARKER.x + col * cellWidth + cellWidth / 2) / 640;
    const y = (SYNTHETIC_MARKER.y + row * cellHeight + cellHeight / 2) / 360;
    return samplePatch(ctx, canvas, canvas.width * x, canvas.height * y);
  });
}

function compareSignatures(source, player) {
  if (!source || !player) {
    return { ok: false, reason: "missing-signature", source, player };
  }

  const perCell = source.map((expected, index) => {
    const actual = player[index];
    const delta = expected.map((value, channel) => Math.abs(value - actual[channel]));
    return {
      expected,
      actual,
      delta,
      maxDelta: Math.max(...delta),
      totalDelta: delta[0] + delta[1] + delta[2]
    };
  });

  const ok = perCell.every((cell) => cell.maxDelta <= 45 && cell.totalDelta <= 90);
  return {
    ok,
    reason: ok ? "matched" : "mismatch",
    source,
    player,
    perCell
  };
}

async function sampleImageMarkerSignature(dataUrl) {
  if (!dataUrl) {
    return null;
  }

  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  ctx.drawImage(image, 0, 0);
  return sampleCanvasMarkerSignature(canvas);
}

async function ensurePlayerModule() {
  if (!playerModuleState.promise) {
    playerModuleState.promise = import("../vendor/moq-js/moq-player.esm.js");
  }
  await playerModuleState.promise;
}

async function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, ms);
  });

  try {
    await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function attach(ctx, target, event, handler) {
  target.addEventListener(event, handler);
  ctx.listeners.push({ target, event, handler });
}

function detachAll(ctx) {
  for (const item of ctx.listeners) {
    item.target.removeEventListener(item.event, item.handler);
  }
  ctx.listeners.length = 0;
}

export function App() {
  const initial = useRef(getInitialViewState()).current;

  const [page, setPage] = useState(initial.page);
  const [relayUrl, setRelayUrl] = useState(initial.relayUrl);
  const [room, setRoom] = useState(initial.room);
  const [playerStatus, setPlayerStatus] = useState("等待开始。");
  const [publishStatus, setPublishStatus] = useState("等待推流。");
  const [logText, setLogText] = useState("");
  const [playerSession, setPlayerSession] = useState(null);
  const [publisherIsPublishing, setPublisherIsPublishing] = useState(false);
  const [cameraOptions, setCameraOptions] = useState([]);
  const [microphoneOptions, setMicrophoneOptions] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState("");
  const [previewActive, setPreviewActive] = useState(false);

  const logRef = useRef(null);
  const playerRef = useRef(null);
  const previewVideoRef = useRef(null);
  const playbackTokenRef = useRef(0);
  const sessionRef = useRef(null);
  const syntheticSessionRef = useRef(null);
  const livePublisherRef = useRef(null);
  const liveMediaStreamRef = useRef(null);
  const publishMediaStreamRef = useRef(null);
  const playerSessionStateRef = useRef(null);
  const autorunRef = useRef(initial.autorun);
  const pageRef = useRef(initial.page);
  const relayUrlRef = useRef(initial.relayUrl);
  const roomRef = useRef(initial.room);
  const publisherIsPublishingRef = useRef(false);

  playerSessionStateRef.current = playerSession;
  pageRef.current = page;
  relayUrlRef.current = relayUrl;
  roomRef.current = room;
  publisherIsPublishingRef.current = publisherIsPublishing;

  const roomLabel = room || "等待生成或输入房间 ID";
  const watchLink = buildWatchLink(relayUrl, room);
  const relayHost = getRelayHostValue(relayUrl);
  const playerBadge = describePlayerState(playerStatus);
  const publishBadge = describePublishState(publishStatus);
  const buildLabel = `Build ${__BUILD_HASH__}`;
  const playbackBaseUrl = relayUrl
    ? `${window.location.origin}${window.location.pathname}?url=${encodeURIComponent(relayUrl)}&namespace=`
    : "";

  function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setLogText((current) => `${current}${line}\n`);
  }

  function setRoomValue(nextRoom) {
    roomRef.current = nextRoom;
    setRoom(nextRoom);
    return nextRoom;
  }

  function setRelayUrlValue(nextRelayUrl) {
    relayUrlRef.current = nextRelayUrl;
    setRelayUrl(nextRelayUrl);
    return nextRelayUrl;
  }

  function ensureRoomId(force = false) {
    const currentRoom = roomRef.current;
    const nextRoom = force || !currentRoom ? generateRoomId() : currentRoom;
    if (nextRoom !== currentRoom) {
      setRoomValue(nextRoom);
    }
    return nextRoom;
  }

  function selectPage(nextPage, { updateAutorun = true } = {}) {
    pageRef.current = nextPage;
    if (nextPage === "live") {
      if (!roomRef.current) {
        setRoomValue(generateRoomId());
      }
    }

    if (updateAutorun) {
      autorunRef.current = false;
    }

    setPage(nextPage);
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

  function hasUsableMediaStream(stream) {
    if (!stream) {
      return false;
    }

    const tracks = stream.getTracks();
    return tracks.length > 0 && tracks.every((track) => track.readyState === "live");
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

  async function stopPlayer(token = ++playbackTokenRef.current) {
    const current = sessionRef.current;
    const currentPlayer = current?.player ?? playerRef.current;
    const hadPlayer = Boolean(current || playerSessionStateRef.current);

    sessionRef.current = null;
    window.player = null;

    if (!hadPlayer) {
      setPlayerSession(null);
      return;
    }

    setPlayerStatus("正在离开直播间。");

    if (current?.tickerId) {
      clearInterval(current.tickerId);
      current.tickerId = null;
    }
    if (current) {
      detachAll(current);
    }

    if (currentPlayer) {
      try {
        if (typeof currentPlayer.destroy === "function") {
          await withTimeout(currentPlayer.destroy(), 1200);
        } else if (currentPlayer.player && typeof currentPlayer.player.close === "function") {
          await withTimeout(currentPlayer.player.close(), 1200);
        }
      } catch (error) {
        log(`stop warning: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    setPlayerSession(null);
    await Promise.resolve();

    if (token === playbackTokenRef.current) {
      setPlayerStatus("已离开直播间。");
      log("stopped player");
    }
  }

  async function startPlayer() {
    const token = ++playbackTokenRef.current;
    await stopPlayer(token);
    setLogText("");

    let nextSession;
    try {
      await ensurePlayerModule();
      const nextRelayUrl = new URL(relayUrlRef.current).toString();
      const namespace = roomRef.current.trim();
      if (!namespace) {
        throw new Error("Namespace 不能为空");
      }
      nextSession = {
        key: `${namespace}-${token}`,
        token,
        relayUrl: nextRelayUrl,
        namespace
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPlayerStatus(`失败：${message}`);
      log(`失败：${error instanceof Error ? error.stack ?? error.message : message}`);
      return;
    }

    setPlayerSession(nextSession);
    setPlayerStatus("播放器已创建，正在连接 relay。");
    log(`created video-moq player: url=${nextSession.relayUrl} namespace=${nextSession.namespace}`);
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

  async function compareSyntheticPlaybackFromDataUrl(dataUrl) {
    const source = sampleCanvasMarkerSignature(syntheticSessionRef.current?.syntheticMedia?.canvas ?? null);
    const player = await sampleImageMarkerSignature(dataUrl);
    return compareSignatures(source, player);
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logText]);

  useEffect(() => {
    writeRoute({ page, room, relayUrl, autorun: autorunRef.current });
  }, [page, room, relayUrl]);

  useEffect(() => {
    if (page === "live" && !publisherIsPublishing) {
      if (!hasUsableMediaStream(liveMediaStreamRef.current)) {
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

  useEffect(() => {
    const playerEl = playerRef.current;
    if (!playerSession || !playerEl || playerSession.token !== playbackTokenRef.current) {
      return;
    }

    const ctx = {
      ...playerSession,
      player: playerEl,
      listeners: [],
      tickerId: null,
      lastTime: 0,
      lastAdvanceAt: Date.now(),
      started: false
    };
    sessionRef.current = ctx;
    window.player = ctx.player;

    attach(ctx, ctx.player, "loadeddata", () => {
      if (sessionRef.current !== ctx) {
        return;
      }
      ctx.started = true;
      ctx.lastAdvanceAt = Date.now();
      setPlayerStatus("播放中（moq-js WebCodecs 路径）。");
      log("playback started");
    });

    attach(ctx, ctx.player, "error", (event) => {
      if (sessionRef.current !== ctx) {
        return;
      }
      const detail = event?.detail;
      const err = detail instanceof Error ? detail : new Error(String(detail ?? "unknown player error"));
      setPlayerStatus(`失败：${err.message}`);
      log(`失败：${err.stack ?? err.message}`);
    });

    const shadowErrorEl = playerEl.shadowRoot?.querySelector?.("#error");
    let shadowErrorObserver = null;
    if (shadowErrorEl) {
      shadowErrorEl.style.display = "none";
      shadowErrorObserver = new MutationObserver(() => {
        if (sessionRef.current !== ctx) {
          return;
        }
        const message = shadowErrorEl.textContent?.trim();
        if (!message) {
          return;
        }
        setPlayerStatus(`失败：${message}`);
        log(`播放器错误：${message}`);
      });
      shadowErrorObserver.observe(shadowErrorEl, { childList: true, subtree: true, characterData: true });
    }

    ctx.tickerId = window.setInterval(() => {
      if (sessionRef.current !== ctx) {
        return;
      }
      const currentTime = Number(ctx.player.currentTime ?? 0);
      if (Number.isFinite(currentTime) && currentTime > ctx.lastTime + 0.05) {
        ctx.lastTime = currentTime;
        ctx.lastAdvanceAt = Date.now();
        if (ctx.started) {
          setPlayerStatus("播放中（moq-js WebCodecs 路径）。");
        }
        return;
      }
      if (ctx.started && Date.now() - ctx.lastAdvanceAt > 2500) {
        setPlayerStatus("缓冲中（等待稳定缓冲）。");
      }
    }, 1000);

    return () => {
      shadowErrorObserver?.disconnect();
      if (ctx.tickerId) {
        clearInterval(ctx.tickerId);
      }
      detachAll(ctx);
      if (sessionRef.current === ctx) {
        sessionRef.current = null;
      }
      if (window.player === ctx.player) {
        window.player = null;
      }
    };
  }, [playerSession]);

  useEffect(() => {
    window.__moqTest = {
      startPlayer: async () => {
        await startPlayer();
      },
      stopPlayer: async () => {
        await stopPlayer();
      },
      startSyntheticPublish,
      stopSyntheticPublish,
      getState: () => ({
        playerStatus,
        publishStatus,
        namespace: roomRef.current
      }),
      getSyntheticSignatures: () => ({
        source: sampleCanvasMarkerSignature(syntheticSessionRef.current?.syntheticMedia?.canvas ?? null),
        expectedPalette: syntheticSessionRef.current?.syntheticMedia?.markerPalette ?? null
      }),
      compareScreenshotSignature: async (dataUrl) => compareSyntheticPlaybackFromDataUrl(dataUrl)
    };

    return () => {
      delete window.__moqTest;
    };
  }, [playerStatus, publishStatus, room]);

  useEffect(() => {
    if (!initial.autorun) {
      return;
    }

    autorunRef.current = true;
    selectPage("watch", { updateAutorun: false });
    void startPlayer();
  }, []);

  useEffect(() => () => {
    void stopSyntheticPublish();
    void stopCameraPublish();
    stopLivePreview();
    void stopPlayer();
  }, []);

  async function copyWatchLink() {
    if (!watchLink || watchLink === "等待生成观看链接") {
      return;
    }

    await navigator.clipboard.writeText(watchLink);
    log("watch link copied");
  }

  return (
    <>
      <div class="app-container">
        <header class="topbar">
          <div class="brand">
            <h1>MoQ Live Deck</h1>
          </div>

          <div class="topbar-right">
            <DesktopNavigation currentPage={page} onSelect={(nextPage) => selectPage(nextPage)} />
          </div>
        </header>

        <main class="page-shell">
          <WatchPage
            hidden={page !== "watch"}
            roomLabel={roomLabel}
            watchLink={watchLink}
            playerStatus={playerStatus}
            playerBadge={playerBadge}
            room={room}
            onRoomInput={(event) => {
              setRoomValue(event.currentTarget.value);
            }}
            onStart={() => {
              autorunRef.current = true;
              selectPage("watch", { updateAutorun: false });
              void startPlayer();
            }}
            onStop={() => {
              autorunRef.current = false;
              selectPage("watch", { updateAutorun: false });
              void stopPlayer();
            }}
            playerSession={playerSession}
            playerRef={playerRef}
          />

          <LivePage
            hidden={page !== "live"}
            room={room}
            roomLabel={roomLabel}
            watchLink={watchLink}
            publishStatus={publishStatus}
            publishBadge={publishBadge}
            cameraOptions={cameraOptions}
            microphoneOptions={microphoneOptions}
            selectedCameraId={selectedCameraId}
            selectedMicrophoneId={selectedMicrophoneId}
            isPublishing={publisherIsPublishing}
            previewActive={previewActive}
            previewVideoRef={previewVideoRef}
            onCameraChange={(event) => {
              setSelectedCameraId(event.currentTarget.value);
            }}
            onMicrophoneChange={(event) => {
              setSelectedMicrophoneId(event.currentTarget.value);
            }}
            onStartPublish={() => {
              void startCameraPublish().catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                log(`camera publish failed: ${message}`);
              });
            }}
            onStopPublish={() => {
              void stopCameraPublish();
            }}
            onRegenerateRoom={() => {
              autorunRef.current = false;
              setRoomValue(generateRoomId());
            }}
            onCopyWatchLink={() => {
              void copyWatchLink().catch((error) => {
                log(`copy failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            onStartSynthetic={() => {
              selectPage("live");
              void startSyntheticPublish().catch((error) => {
                const message = error instanceof Error ? error.message : String(error);
                setPublishStatus(`失败：${message}`);
                log(`synthetic publish failed: ${message}`);
              });
            }}
            onStopSynthetic={() => {
              selectPage("live");
              void stopSyntheticPublish();
            }}
          />

          <SettingsPage
            hidden={page !== "settings"}
            relayUrl={relayUrl}
            relayHost={relayHost}
            buildLabel={buildLabel}
            onRelayUrlInput={(event) => {
              autorunRef.current = false;
              setRelayUrlValue(event.currentTarget.value);
            }}
            logText={logText}
            logRef={logRef}
          />
        </main>
      </div>

      <MobileNavigation currentPage={page} onSelect={(nextPage) => selectPage(nextPage)} />
    </>
  );
}
