import { createWhepPlaybackSession } from "../../lib/whepClient.js";
import { STREAM_PROTOCOL_WEBRTC } from "../../lib/streamProtocol.js";
import { attach, detachAll, withTimeout } from "./playerControllerUtils.js";

const WHEP_SIGNALING_TIMEOUT_MS = 12_000;
const WHEP_MEDIA_CONNECTION_TIMEOUT_MS = 10_000;
const WHEP_FIRST_FRAME_TIMEOUT_MS = 15_000;
const WHEP_STARTUP_TIMEOUT_MS = 25_000;
const WHEP_CLOSE_TIMEOUT_MS = 1200;

function waitForAnimationFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function formatWhepTrackStats(kind, stats) {
  if (!stats || typeof stats !== "object") {
    return `${kind}=none`;
  }

  if (kind === "video") {
    return [
      "video",
      `bytes=${Number(stats.bytesReceived ?? 0)}`,
      `packets=${Number(stats.packetsReceived ?? 0)}`,
      `lost=${Number(stats.packetsLost ?? 0)}`,
      `frames=${Number(stats.framesReceived ?? 0)}`,
      `decoded=${Number(stats.framesDecoded ?? 0)}`,
      `keyFrames=${Number(stats.keyFramesDecoded ?? 0)}`,
      `size=${Number(stats.frameWidth ?? 0)}x${Number(stats.frameHeight ?? 0)}`,
    ].join(".");
  }

  return [
    "audio",
    `bytes=${Number(stats.bytesReceived ?? 0)}`,
    `packets=${Number(stats.packetsReceived ?? 0)}`,
    `lost=${Number(stats.packetsLost ?? 0)}`,
    `jitter=${Number(stats.jitter ?? 0).toFixed(4)}`,
  ].join(".");
}

function formatWhepStatsSummary(summary) {
  if (!summary) {
    return "stats=none";
  }

  return [
    formatWhepTrackStats("audio", summary.audio),
    formatWhepTrackStats("video", summary.video),
  ].join(" ");
}

async function readWhepInboundStats(peerConnection) {
  if (!peerConnection || typeof peerConnection.getStats !== "function") {
    return null;
  }

  const report = await peerConnection.getStats();
  const summary = {
    audio: null,
    video: null,
  };

  report.forEach((stats) => {
    if (stats.type !== "inbound-rtp" || stats.isRemote) {
      return;
    }
    if (stats.kind === "audio" || stats.mediaType === "audio") {
      summary.audio = stats;
    }
    if (stats.kind === "video" || stats.mediaType === "video") {
      summary.video = stats;
    }
  });

  return summary;
}

function captureVideoFreezeFrame(videoEl) {
  if (
    !(videoEl instanceof HTMLVideoElement) ||
    !videoEl.videoWidth ||
    !videoEl.videoHeight
  ) {
    return "";
  }

  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    return "";
  }

  try {
    context.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return "";
  }
}

function clearWhepContextTimers(ctx) {
  if (ctx.statsTickerId) {
    clearInterval(ctx.statsTickerId);
    ctx.statsTickerId = null;
  }
  if (ctx.timeoutIds) {
    ctx.timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
    ctx.timeoutIds.length = 0;
  }
}

export async function pauseWhepPlayerSession({
  ctx,
  playerEl,
  setPlayerFreezeFrameUrl,
  setPlayerPaused,
  updatePlayerStatus,
  log,
}) {
  const freezeFrameUrl = captureVideoFreezeFrame(playerEl);
  if (freezeFrameUrl) {
    setPlayerFreezeFrameUrl(freezeFrameUrl);
    await waitForAnimationFrame();
  }

  clearWhepContextTimers(ctx);
  detachAll(ctx);

  const connection = ctx.connection;
  ctx.connection = null;
  if (connection) {
    await withTimeout(connection.close(), WHEP_CLOSE_TIMEOUT_MS);
  }

  if (typeof playerEl.pause === "function") {
    await playerEl.pause();
  }

  setPlayerPaused(true);
  updatePlayerStatus("paused", "已暂停。");
  log?.("paused WHEP player and closed media session");
}

export function startWhepPlayerSession({
  playerSession,
  playerEl,
  playbackTokenRef,
  sessionRef,
  logRef,
  updatePlayerStatus,
  setPlayerStarted,
  setPlayerFreezeFrameUrl,
  setPlayerPaused,
  setPlaybackStartToken,
  applyDesiredPlayerMute,
  setPlayerMute,
}) {
  if (
    !playerSession ||
    playerSession.protocol !== STREAM_PROTOCOL_WEBRTC ||
    !playerEl ||
    playerSession.token !== playbackTokenRef.current
  ) {
    return undefined;
  }

  let disposed = false;
  let whepSession = null;
  const ctx = {
    ...playerSession,
    player: playerEl,
    connection: null,
    listeners: [],
    signalDisposers: [],
    tickerId: null,
    statsTickerId: null,
    timeoutIds: [],
    started: false,
    failed: false,
    phase: "initializing",
  };
  sessionRef.current = ctx;
  window.player = ctx;

  const clearWhepTimeouts = () => {
    ctx.timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
    ctx.timeoutIds.length = 0;
  };

  const failWhep = (message, detail) => {
    if (disposed || sessionRef.current !== ctx || ctx.started || ctx.failed) {
      return;
    }
    ctx.failed = true;
    clearWhepContextTimers(ctx);
    detachAll(ctx);
    const connection = whepSession ?? ctx.connection;
    ctx.connection = null;
    updatePlayerStatus("error", message);
    logRef.current?.(
      [
        detail || message,
        `phase=${ctx.phase}`,
        `readyState=${playerEl.readyState}`,
        `paused=${playerEl.paused}`,
        `muted=${playerEl.muted}`,
        `video=${playerEl.videoWidth}x${playerEl.videoHeight}`,
      ].join(" "),
    );
    void connection?.close();
  };

  const failWhepWithStats = (message, detail) => {
    const peerConnection = (whepSession ?? ctx.connection)?.peerConnection;
    if (!peerConnection) {
      failWhep(message, detail);
      return;
    }
    void readWhepInboundStats(peerConnection)
      .then((summary) => {
        failWhep(message, `${detail} ${formatWhepStatsSummary(summary)}`);
      })
      .catch((error) => {
        failWhep(
          message,
          `${detail} statsError=${error instanceof Error ? error.message : String(error)}`,
        );
      });
  };

  const setWhepTimeout = (message, delay, detail) => {
    const timeoutId = window.setTimeout(() => {
      failWhepWithStats(message, detail);
    }, delay);
    ctx.timeoutIds.push(timeoutId);
    return timeoutId;
  };

  const markStarted = () => {
    if (sessionRef.current !== ctx || ctx.started) {
      return;
    }
    ctx.started = true;
    clearWhepContextTimers(ctx);
    setPlayerStarted(true);
    setPlayerFreezeFrameUrl("");
    setPlayerPaused(false);
    updatePlayerStatus("live", "播放中。");
    setPlaybackStartToken((current) => current + 1);
    logRef.current?.("WHEP playback started");
  };

  attach(ctx, playerEl, "loadeddata", markStarted);
  attach(ctx, playerEl, "playing", markStarted);
  setWhepTimeout(
    "播放连接超时",
    WHEP_STARTUP_TIMEOUT_MS,
    "WHEP startup timeout",
  );

  async function connectWhep() {
    const abortController = new AbortController();
    ctx.phase = "signaling";
    const signalingTimeoutId = window.setTimeout(() => {
      failWhep("连接信令服务器超时", "WHEP signaling timeout");
      abortController.abort();
    }, WHEP_SIGNALING_TIMEOUT_MS);
    ctx.timeoutIds.push(signalingTimeoutId);

    try {
      whepSession = await createWhepPlaybackSession({
        url: playerSession.webRtcUrl,
        videoElement: playerEl,
        signal: abortController.signal,
      });
      clearTimeout(signalingTimeoutId);
      ctx.timeoutIds = ctx.timeoutIds.filter(
        (timeoutId) => timeoutId !== signalingTimeoutId,
      );
      if (disposed || sessionRef.current !== ctx) {
        void whepSession.close();
        return;
      }

      ctx.connection = whepSession;
      ctx.phase = "media";
      const peerConnection = whepSession.peerConnection;
      const mediaTimeoutId = setWhepTimeout(
        "连接媒体超时",
        WHEP_MEDIA_CONNECTION_TIMEOUT_MS,
        "WHEP media connection timeout",
      );
      const clearMediaTimeout = () => {
        clearTimeout(mediaTimeoutId);
        ctx.timeoutIds = ctx.timeoutIds.filter(
          (timeoutId) => timeoutId !== mediaTimeoutId,
        );
      };
      const logWhepState = (label) => {
        logRef.current?.(
          [
            `[Player] WHEP ${label}`,
            `pc=${peerConnection.connectionState}`,
            `ice=${peerConnection.iceConnectionState}`,
            `gathering=${peerConnection.iceGatheringState}`,
            `signaling=${peerConnection.signalingState}`,
            `tracks=${whepSession.remoteStream
              .getTracks()
              .map(
                (track) =>
                  `${track.kind}:${track.readyState}:${track.muted ? "muted" : "live"}`,
              )
              .join(",") || "none"}`,
          ].join(" "),
        );
        if (
          peerConnection.connectionState === "connected" ||
          peerConnection.iceConnectionState === "connected" ||
          peerConnection.iceConnectionState === "completed"
        ) {
          clearMediaTimeout();
        }
      };

      attach(ctx, peerConnection, "connectionstatechange", () =>
        logWhepState("connectionstatechange"),
      );
      attach(ctx, peerConnection, "iceconnectionstatechange", () =>
        logWhepState("iceconnectionstatechange"),
      );
      logWhepState("connected");

      await applyDesiredPlayerMute({ logFailure: false });
      void startElementPlayback();

      setPlayerPaused(false);
      if (playerEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        markStarted();
        return;
      }

      ctx.phase = "first-frame";
      updatePlayerStatus("buffering", "等待视频首帧。");
      setWhepTimeout(
        "等待首帧超时",
        WHEP_FIRST_FRAME_TIMEOUT_MS,
        "WHEP first frame timeout",
      );
      ctx.statsTickerId = window.setInterval(() => {
        if (sessionRef.current !== ctx || ctx.started) {
          return;
        }
        void readWhepInboundStats(peerConnection)
          .then((summary) => {
            if (sessionRef.current !== ctx || ctx.started || !summary) {
              return;
            }
            logRef.current?.(
              [
                "[Player] WHEP waiting first frame",
                `readyState=${playerEl.readyState}`,
                `paused=${playerEl.paused}`,
                `muted=${playerEl.muted}`,
                `video=${playerEl.videoWidth}x${playerEl.videoHeight}`,
                formatWhepTrackStats("audio", summary.audio),
                formatWhepTrackStats("video", summary.video),
              ].join(" "),
            );
          })
          .catch((error) => {
            logRef.current?.(
              `WHEP stats failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      }, 1000);
    } catch (error) {
      if (disposed || sessionRef.current !== ctx || ctx.failed) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      failWhep(`失败：${message}`, `WHEP playback failed: ${message}`);
    }
  }

  async function startElementPlayback() {
    try {
      await playerEl.play?.();
    } catch (error) {
      if (disposed || sessionRef.current !== ctx || ctx.started || ctx.failed) {
        return;
      }
      logRef.current?.(
        `WHEP play() failed: ${error instanceof Error ? error.message : String(error)}; retry muted`,
      );
      try {
        await setPlayerMute(true, { logFailure: false });
        await playerEl.play?.();
      } catch (retryError) {
        failWhep(
          "播放被浏览器阻止",
          `WHEP muted play() failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
        );
      }
    }
  }

  void connectWhep();

  return () => {
    disposed = true;
    if (sessionRef.current === ctx) {
      sessionRef.current = null;
    }
    clearWhepContextTimers(ctx);
    detachAll(ctx);
    void whepSession?.close();
  };
}
