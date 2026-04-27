import { useEffect, useRef, useState } from "preact/hooks";
import {
  attach,
  detachAll,
  getPlayerAudioSupportReason,
  getPlayerStatusFromMessage,
  isNoCatalogDataMessage,
  withTimeout,
} from "./playerControllerUtils.js";

const PLAYER_TARGET_LATENCY_MS = 600;

function formatAudioRenderStats(stats, now) {
  if (!stats || typeof stats !== "object") {
    return "audioStats=none";
  }

  const at =
    Number.isFinite(stats.at) && Number.isFinite(now)
      ? Math.max(0, Math.round(now - stats.at))
      : null;

  return [
    `audioStats.read=${Number(stats.read ?? 0)}`,
    `audioStats.size=${Number(stats.size ?? 0)}`,
    `audioStats.required=${Number(stats.required ?? 0)}`,
    `audioStats.capacity=${Number(stats.capacity ?? 0)}`,
    `audioStats.level=${Number(stats.level ?? 0).toFixed(4)}`,
    `audioStats.buffering=${stats.buffering === true}`,
    `audioStats.started=${stats.started === true}`,
    `audioStats.dropped=${Number(stats.dropped ?? 0)}`,
    `audioStats.ageMs=${at ?? "na"}`,
  ].join(" ");
}

function formatVideoFrameStats(stats, now) {
  if (!stats || typeof stats !== "object") {
    return "videoStats=none";
  }

  const at =
    Number.isFinite(stats.at) && Number.isFinite(now)
      ? Math.max(0, Math.round(now - stats.at))
      : null;

  return [
    `videoStats.width=${Number(stats.width ?? 0)}`,
    `videoStats.height=${Number(stats.height ?? 0)}`,
    `videoStats.ageMs=${at ?? "na"}`,
  ].join(" ");
}

export function usePlayerSession({
  relayUrlRef,
  roomRef,
  setLogText,
  log,
  audioPlaybackSupported,
}) {
  const [playerStatus, setPlayerStatus] = useState("等待开始。");
  const [playerStatusKind, setPlayerStatusKind] = useState("idle");
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [playerPaused, setPlayerPaused] = useState(false);
  const [playerMuted, setPlayerMutedState] = useState(!audioPlaybackSupported);
  const [playerSession, setPlayerSession] = useState(null);
  const [fullscreenRotate, setFullscreenRotate] = useState(false);
  const [playbackStartToken, setPlaybackStartToken] = useState(0);
  const [moqWatchModule, setMoqWatchModule] = useState(null);

  const playerRef = useRef(null);
  const watchStageRef = useRef(null);
  const logRef = useRef(log);
  const moqWatchModuleRef = useRef(null);
  const playbackTokenRef = useRef(0);
  const sessionRef = useRef(null);
  const playerSessionStateRef = useRef(null);
  const orientationLockedRef = useRef(false);
  const audioFallbackLoggedRef = useRef(false);
  const desiredPlayerMutedRef = useRef(!audioPlaybackSupported);

  logRef.current = log;
  playerSessionStateRef.current = playerSession;

  function updatePlayerStatus(kind, message) {
    setPlayerStatusKind(kind);
    setPlayerStatus(message);
  }

  async function loadMoqWatchModule() {
    if (moqWatchModuleRef.current) {
      return moqWatchModuleRef.current;
    }

    const module = await import("@moq/watch");
    moqWatchModuleRef.current = module;
    setMoqWatchModule(module);
    return module;
  }

  function syncPlayerMutedState(nextMuted) {
    const targetMuted = !audioPlaybackSupported || nextMuted;
    desiredPlayerMutedRef.current = targetMuted;
    setPlayerMutedState(targetMuted);
  }

  function clampPlayerVolume(value) {
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.min(1, Math.max(0, value));
  }

  function getPlayerVolume(playerEl) {
    const backend = sessionRef.current?.backend;
    if (backend?.audio?.volume) {
      const nextVolume = Number(backend.audio.volume.peek());
      if (Number.isFinite(nextVolume)) {
        return clampPlayerVolume(nextVolume);
      }
    }

    if (!playerEl) {
      return null;
    }

    if ("volume" in playerEl) {
      const nextVolume = Number(playerEl.volume);
      if (Number.isFinite(nextVolume)) {
        return clampPlayerVolume(nextVolume);
      }
    }

    if (typeof playerEl.getVolume === "function") {
      const nextVolume = Number(playerEl.getVolume());
      if (Number.isFinite(nextVolume)) {
        return clampPlayerVolume(nextVolume);
      }
    }

    if (typeof playerEl.player?.getVolume === "function") {
      const nextVolume = Number(playerEl.player.getVolume());
      if (Number.isFinite(nextVolume)) {
        return clampPlayerVolume(nextVolume);
      }
    }

    return null;
  }

  async function setPlayerVolume(playerEl, nextVolume) {
    const volume = clampPlayerVolume(nextVolume);
    const backend = sessionRef.current?.backend;
    if (backend?.audio?.volume) {
      backend.audio.volume.set(volume);
      backend.audio.muted.set(volume <= 0.001);
      playerEl?.dispatchEvent?.(
        new CustomEvent("volumechange", {
          detail: {
            muted: volume <= 0.001,
            volume,
          },
        }),
      );
      return true;
    }

    if (!playerEl) {
      return false;
    }

    if (typeof playerEl.player?.setVolume === "function") {
      await playerEl.player.setVolume(volume);
      playerEl.dispatchEvent(
        new CustomEvent("volumechange", {
          detail: {
            muted: volume <= 0.001,
            volume,
          },
        }),
      );
      return true;
    }

    if ("volume" in playerEl) {
      playerEl.volume = volume;
      return true;
    }

    return false;
  }

  function inferPlayerMuted(playerEl, fallbackMuted) {
    if (!audioPlaybackSupported) {
      return true;
    }

    const volume = getPlayerVolume(playerEl);
    if (volume != null) {
      return volume <= 0.001;
    }

    return fallbackMuted;
  }

  async function stopPlayer(options = {}) {
    const {
      token = ++playbackTokenRef.current,
      finalStatus = "已离开直播间。",
      finalKind = "left",
      logMessage = "stopped player",
    } = options;
    const current = sessionRef.current;
    const currentPlayer = current?.player ?? playerRef.current;
    const hadPlayer = Boolean(current || playerSessionStateRef.current);

    sessionRef.current = null;
    window.player = null;

    if (!hadPlayer) {
      setPlayerSession(null);
      setPlayerStatusKind("idle");
      setFullscreenActive(false);
      setFullscreenRotate(false);
      setPlayerPaused(false);
      desiredPlayerMutedRef.current = !audioPlaybackSupported;
      setPlayerMutedState(!audioPlaybackSupported);
      return;
    }

    updatePlayerStatus("left", "正在离开直播间。");

    if (current?.tickerId) {
      clearInterval(current.tickerId);
      current.tickerId = null;
    }
    if (current) {
      detachAll(current);
    }

    if (currentPlayer) {
      try {
        if (current?.backend) {
          current.backend.close();
        }
        if (current?.broadcast) {
          current.broadcast.close();
        }
        if (current?.connection) {
          current.connection.close();
        }
        if (typeof currentPlayer.destroy === "function") {
          await withTimeout(currentPlayer.destroy(), 1200);
        }
      } catch (error) {
        logRef.current?.(
          `stop warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    setPlayerSession(null);
    setFullscreenActive(false);
    setFullscreenRotate(false);
    setPlayerPaused(false);
    desiredPlayerMutedRef.current = !audioPlaybackSupported;
    setPlayerMutedState(!audioPlaybackSupported);
    await Promise.resolve();

    if (token === playbackTokenRef.current) {
      updatePlayerStatus(finalKind, finalStatus);
      logRef.current?.(logMessage);
    }
  }

  async function startPlayer(options = {}) {
    const { initialMuted = false } = options;
    const targetMuted = !audioPlaybackSupported || initialMuted;
    const token = ++playbackTokenRef.current;
    await stopPlayer({
      token,
      finalStatus: "等待开始。",
      finalKind: "idle",
      logMessage: "reset player before restart",
    });
    setLogText("");

    if (!globalThis.WebTransport) {
      updatePlayerStatus("error", "浏览器版本过旧");
      logRef.current?.("Browser does not support WebTransport");
      return;
    }

    let nextSession;
    try {
      const nextRelayUrl = new URL(relayUrlRef.current).toString();
      const namespace = roomRef.current.trim();
      if (!namespace) {
        throw new Error("Namespace 不能为空");
      }
      nextSession = {
        key: `${namespace}-${token}`,
        token,
        relayUrl: nextRelayUrl,
        namespace,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updatePlayerStatus("error", `失败：${message}`);
      logRef.current?.(
        `失败：${error instanceof Error ? (error.stack ?? error.message) : message}`,
      );
      return;
    }

    try {
      await loadMoqWatchModule();
      if (token !== playbackTokenRef.current) {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updatePlayerStatus("error", `失败：${message}`);
      logRef.current?.(
        `failed to load @moq/watch: ${error instanceof Error ? (error.stack ?? error.message) : message}`,
      );
      return;
    }

    setPlayerSession(nextSession);
    setFullscreenActive(false);
    setFullscreenRotate(false);
    setPlayerPaused(false);
    desiredPlayerMutedRef.current = targetMuted;
    setPlayerMutedState(targetMuted);
    if (!audioPlaybackSupported && !audioFallbackLoggedRef.current) {
      logRef.current?.(
        `audio playback disabled: ${getPlayerAudioSupportReason()}; auto-muted player`,
      );
      audioFallbackLoggedRef.current = true;
    }
    updatePlayerStatus("connecting", "播放器已创建，正在连接 relay。");
    logRef.current?.(
      `created @moq/watch player: url=${nextSession.relayUrl} namespace=${nextSession.namespace}`,
    );
  }

  async function pausePlayer() {
    const playerEl = playerRef.current;
    if (!playerEl) {
      return;
    }

    if (sessionRef.current?.backend?.paused) {
      sessionRef.current.backend.paused.set(true);
    }
    if (typeof playerEl.pause === "function") {
      await playerEl.pause();
    }
    setPlayerPaused(true);
  }

  async function resumePlayer() {
    await startPlayer({
      initialMuted: desiredPlayerMutedRef.current,
    });
  }

  async function applyDesiredPlayerMute({ logFailure = true } = {}) {
    const playerEl = playerRef.current;
    if (!playerEl) {
      return false;
    }

    const targetMuted =
      !audioPlaybackSupported || desiredPlayerMutedRef.current;
    if (!audioPlaybackSupported) {
      if (logFailure) {
        logRef.current?.(
          `audio playback unavailable: ${getPlayerAudioSupportReason()}; keep muted`,
        );
      }
      await setPlayerVolume(playerEl, 0);
      syncPlayerMutedState(true);
      return true;
    }

    await setPlayerVolume(playerEl, targetMuted ? 0 : 1);
    syncPlayerMutedState(targetMuted);
    return true;
  }

  async function setPlayerMute(nextMuted, { logFailure = true } = {}) {
    syncPlayerMutedState(nextMuted);
    await applyDesiredPlayerMute({ logFailure });
  }

  async function requestAudiblePlayback({ logFailure = true } = {}) {
    await setPlayerMute(false, { logFailure });

    if (!audioPlaybackSupported) {
      return false;
    }

    const playerEl = playerRef.current;
    if (!playerEl) {
      return false;
    }

    try {
      const backend = sessionRef.current?.backend;
      if (backend?.audio?.muted) {
        backend.audio.muted.set(false);
        backend.audio.volume.set(1);
        return true;
      }

      const playerStillMuted =
        playerEl.muted === true || playerEl.player?.muted === true;
      const audioContextState =
        typeof playerEl.player?.getAudioContextState === "function"
          ? playerEl.player.getAudioContextState()
          : "unknown";

      if (!playerStillMuted && audioContextState === "running") {
        return true;
      }

      if (
        !playerStillMuted &&
        typeof playerEl.player?.resumeAudioContext === "function"
      ) {
        await playerEl.player.resumeAudioContext();
        return true;
      }

      if (typeof playerEl.unmute === "function") {
        await playerEl.unmute();
        return true;
      }

      if (typeof playerEl.player?.mute === "function") {
        await playerEl.player.mute(false);
        return true;
      }
    } catch (error) {
      if (logFailure) {
        logRef.current?.(
          `audible playback warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return true;
  }

  function setPlayerMutedStateOnly(nextMuted) {
    syncPlayerMutedState(nextMuted);
  }

  async function togglePlayerMute() {
    await setPlayerMute(!desiredPlayerMutedRef.current);
  }

  async function fullscreenPlayer() {
    const stageEl = watchStageRef.current;
    if (!stageEl) {
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (typeof stageEl.requestFullscreen === "function") {
      await stageEl.requestFullscreen();
    }

    const orientation = screen.orientation;
    const shouldRotateLandscape = window.innerHeight > window.innerWidth;
    setFullscreenRotate(shouldRotateLandscape);

    if (shouldRotateLandscape && orientation?.lock) {
      try {
        await orientation.lock("landscape");
        orientationLockedRef.current = true;
      } catch {
        orientationLockedRef.current = false;
      }
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreenActive(active);

      if (
        !active &&
        orientationLockedRef.current &&
        screen.orientation?.unlock
      ) {
        screen.orientation.unlock();
        orientationLockedRef.current = false;
      }
      if (!active) {
        setFullscreenRotate(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const playerEl = playerRef.current;
    if (
      !playerSession ||
      !playerEl ||
      !moqWatchModule ||
      playerSession.token !== playbackTokenRef.current
    ) {
      return;
    }

    const MoqWatch = moqWatchModule;
    const connection = new MoqWatch.Lite.Connection.Reload({
      enabled: true,
      url: new URL(playerSession.relayUrl),
      websocket: { enabled: false },
    });
    const broadcast = new MoqWatch.Broadcast({
      connection: connection.established,
      announced: connection.announced,
      enabled: true,
      name: MoqWatch.Lite.Path.from(playerSession.namespace),
      catalogFormat: "hang",
    });
    const rtt = new MoqWatch.Signals.Signal(undefined);
    const signals = new MoqWatch.Signals.Effect();
    signals.run((effect) => {
      const established = effect.get(connection.established);
      rtt.set(established?.rtt ? effect.get(established.rtt) : undefined);
    });
    const backend = new MoqWatch.MultiBackend({
      element: playerEl,
      broadcast,
      rtt,
      paused: false,
      latency: PLAYER_TARGET_LATENCY_MS,
    });

    const ctx = {
      ...playerSession,
      player: playerEl,
      connection,
      broadcast,
      backend,
      signals,
      listeners: [],
      signalDisposers: [],
      tickerId: null,
      started: false,
      stallState: {
        active: false,
        signature: "",
        loggedAt: 0,
      },
    };
    sessionRef.current = ctx;
    window.player = ctx;
    void applyDesiredPlayerMute({ logFailure: false });

    const markStarted = () => {
      if (sessionRef.current !== ctx || ctx.started) {
        return;
      }
      ctx.started = true;
      setPlayerPaused(false);
      updatePlayerStatus("live", "播放中（@moq/watch JS API）。");
      setPlaybackStartToken((current) => current + 1);
      logRef.current?.("playback started");
    };

    attach(ctx, ctx.player, "loadeddata", markStarted);
    attach(ctx, ctx.player, "playing", markStarted);
    attach(ctx, ctx.player, "play", () => {
      if (sessionRef.current !== ctx) {
        return;
      }
      backend.paused.set(false);
      setPlayerPaused(false);
      if (ctx.started) {
        updatePlayerStatus("live", "播放中（@moq/watch JS API）。");
      }
    });

    attach(ctx, ctx.player, "pause", () => {
      if (sessionRef.current !== ctx) {
        return;
      }
      backend.paused.set(true);
      setPlayerPaused(true);
      if (ctx.started) {
        setPlayerStatus("已暂停");
      }
    });

    attach(ctx, ctx.player, "volumechange", (event) => {
      if (sessionRef.current !== ctx) {
        return;
      }
      const mutedFromDetail = event?.detail?.muted;
      const muted =
        typeof mutedFromDetail === "boolean"
          ? mutedFromDetail
          : backend.audio.muted.peek();
      syncPlayerMutedState(muted);
    });

    attach(ctx, ctx.player, "error", (event) => {
      if (sessionRef.current !== ctx) {
        return;
      }
      const detail = event?.detail ?? ctx.player.error;
      const err =
        detail instanceof Error
          ? detail
          : new Error(
              detail?.message || String(detail ?? "unknown player error"),
            );
      const nextStatus = getPlayerStatusFromMessage(err.message);
      updatePlayerStatus(nextStatus.kind, nextStatus.message);
      logRef.current?.(
        `${isNoCatalogDataMessage(err.message) ? "未开播" : "失败"}：${err.stack ?? err.message}`,
      );
    });

    const deriveAndUpdateStatus = () => {
      if (sessionRef.current !== ctx) return;

      if (ctx.started) {
        updatePlayerStatus("live", "播放中（@moq/watch JS API）。");
        return;
      }

      const connStatus = connection.status.peek();
      const broadcastStatus = broadcast.status.peek();

      if (connStatus === "connecting") {
        updatePlayerStatus("connecting", "正在连接视频流。");
      } else if (connStatus === "disconnected") {
        updatePlayerStatus("buffering", "等待视频流连接。");
      } else if (broadcastStatus === "loading") {
        updatePlayerStatus("connecting", "正在加载 catalog。");
      } else if (broadcastStatus === "offline") {
        updatePlayerStatus("offair", "直播暂未开始。");
        logRef.current?.("未开播：catalog unavailable");
      }
    };

    ctx.signalDisposers.push(
      connection.status.watch(deriveAndUpdateStatus),
      broadcast.status.watch(deriveAndUpdateStatus),
    );

    ctx.tickerId = window.setInterval(() => {
      if (sessionRef.current !== ctx) {
        return;
      }
      const now = Date.now();
      const playerMuted = inferPlayerMuted(
        ctx.player,
        desiredPlayerMutedRef.current,
      );
      const audioStats = backend.audio.stats.peek();
      const videoStats = backend.video.stats.peek();
      const videoTimestamp = backend.video.timestamp.peek();
      const audioTimestamp = backend.sync.audio.peek();
      const videoFrameStats = videoStats
        ? {
            at: Number.isFinite(videoTimestamp)
              ? performance.timeOrigin + videoTimestamp
              : now,
            width: ctx.player.videoWidth || 0,
            height: ctx.player.videoHeight || 0,
          }
        : null;
      const audioRenderStats = audioStats
        ? {
            at: Number.isFinite(audioTimestamp)
              ? performance.timeOrigin + audioTimestamp
              : now,
            read: audioStats.sampleCount,
            size: audioStats.bytesReceived,
            required: 0,
            capacity: 0,
            level: 0,
            buffering: false,
            started: audioStats.sampleCount > 0,
            dropped: 0,
          }
        : null;
      const stalled = ctx.started && backend.video.stalled.peek();

      if (videoStats?.frameCount > 0) {
        markStarted();
      }

      if (stalled) {
        updatePlayerStatus("buffering", "缓冲中（等待稳定缓冲）。");
        const signature = [
          playerMuted,
          audioStats?.sampleCount ?? "na",
          audioStats?.bytesReceived ?? "na",
          videoStats?.frameCount ?? "na",
          videoStats?.bytesReceived ?? "na",
          ctx.player.videoWidth,
          ctx.player.videoHeight,
        ].join("|");

        if (
          !ctx.stallState.active ||
          ctx.stallState.signature !== signature ||
          now - ctx.stallState.loggedAt >= 5000
        ) {
          logRef.current?.(
            [
              "[Player] suspected playback stall",
              `muted=${playerMuted}`,
              formatAudioRenderStats(audioRenderStats, now),
              formatVideoFrameStats(videoFrameStats, now),
            ].join(" "),
          );
          ctx.stallState.active = true;
          ctx.stallState.signature = signature;
          ctx.stallState.loggedAt = now;
        }
        return;
      }

      if (ctx.stallState.active) {
        logRef.current?.(
          [
            "[Player] playback recovered",
            `muted=${playerMuted}`,
            formatAudioRenderStats(audioRenderStats, now),
            formatVideoFrameStats(videoFrameStats, now),
          ].join(" "),
        );
        ctx.stallState.active = false;
        ctx.stallState.signature = "";
        ctx.stallState.loggedAt = 0;
      }

      if (ctx.started) {
        updatePlayerStatus("live", "播放中（@moq/watch JS API）。");
      }
    }, 1000);

    return () => {
      if (ctx.tickerId) {
        clearInterval(ctx.tickerId);
      }
      ctx.signalDisposers.forEach((dispose) => dispose());
      detachAll(ctx);
      backend.close();
      broadcast.close();
      connection.close();
      signals.close();
      if (sessionRef.current === ctx) {
        sessionRef.current = null;
      }
      if (window.player === ctx) {
        window.player = null;
      }
    };
  }, [playerSession, audioPlaybackSupported, moqWatchModule]);

  useEffect(
    () => () => {
      void stopPlayer();
    },
    [],
  );

  return {
    playerStatus,
    playerStatusKind,
    fullscreenActive,
    fullscreenRotate,
    playerPaused,
    playerMuted,
    playerSession,
    playbackStartToken,
    playerRef,
    watchStageRef,
    startPlayer,
    stopPlayer,
    pausePlayer,
    resumePlayer,
    togglePlayerMute,
    setPlayerMute,
    requestAudiblePlayback,
    setPlayerMutedStateOnly,
    fullscreenPlayer,
  };
}
