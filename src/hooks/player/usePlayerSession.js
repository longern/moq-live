import { useEffect, useRef, useState } from "preact/hooks";
import {
  attach,
  detachAll,
  ensurePlayerModule,
  getPlayerAudioSupportReason,
  getPlayerStatusFromMessage,
  isNoCatalogDataMessage,
  withTimeout,
} from "./playerControllerUtils.js";

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

  const playerRef = useRef(null);
  const watchStageRef = useRef(null);
  const logRef = useRef(log);
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
        if (typeof currentPlayer.destroy === "function") {
          await withTimeout(currentPlayer.destroy(), 1200);
        } else if (
          currentPlayer.player &&
          typeof currentPlayer.player.close === "function"
        ) {
          await withTimeout(currentPlayer.player.close(), 1200);
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
    const {
      initialMuted = !audioPlaybackSupported,
    } = options;
    const targetMuted = !audioPlaybackSupported || initialMuted;
    const token = ++playbackTokenRef.current;
    await stopPlayer({
      token,
      finalStatus: "等待开始。",
      finalKind: "idle",
      logMessage: "reset player before restart",
    });
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
      `created video-moq player: url=${nextSession.relayUrl} namespace=${nextSession.namespace}`,
    );
  }

  async function pausePlayer() {
    const playerEl = playerRef.current;
    if (!playerEl) {
      return;
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

    const targetMuted = !audioPlaybackSupported || desiredPlayerMutedRef.current;
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
      playerSession.token !== playbackTokenRef.current
    ) {
      return;
    }

    const ctx = {
      ...playerSession,
      player: playerEl,
      listeners: [],
      tickerId: null,
      lastTime: 0,
      lastAdvanceAt: Date.now(),
      started: false,
    };
    sessionRef.current = ctx;
    window.player = ctx.player;

    attach(ctx, ctx.player, "loadeddata", () => {
      if (sessionRef.current !== ctx) {
        return;
      }
      ctx.started = true;
      ctx.lastAdvanceAt = Date.now();
      setPlayerPaused(false);
      void applyDesiredPlayerMute({ logFailure: false });
      updatePlayerStatus("live", "播放中（moq-js WebCodecs 路径）。");
      setPlaybackStartToken((current) => current + 1);
      logRef.current?.("playback started");
    });

    attach(ctx, ctx.player, "play", () => {
      if (sessionRef.current !== ctx) {
        return;
      }
      setPlayerPaused(false);
      if (ctx.started) {
        updatePlayerStatus("live", "播放中（moq-js WebCodecs 路径）。");
      }
    });

    attach(ctx, ctx.player, "pause", () => {
      if (sessionRef.current !== ctx) {
        return;
      }
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
      const muted = typeof mutedFromDetail === "boolean"
        ? mutedFromDetail
        : desiredPlayerMutedRef.current;
      syncPlayerMutedState(muted);
    });

    void applyDesiredPlayerMute({ logFailure: false });

    attach(ctx, ctx.player, "error", (event) => {
      if (sessionRef.current !== ctx) {
        return;
      }
      const detail = event?.detail;
      const err =
        detail instanceof Error
          ? detail
          : new Error(String(detail ?? "unknown player error"));
      const nextStatus = getPlayerStatusFromMessage(err.message);
      updatePlayerStatus(nextStatus.kind, nextStatus.message);
      logRef.current?.(
        `${isNoCatalogDataMessage(err.message) ? "未开播" : "失败"}：${err.stack ?? err.message}`,
      );
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
        const nextStatus = getPlayerStatusFromMessage(message);
        updatePlayerStatus(nextStatus.kind, nextStatus.message);
        logRef.current?.(
          `${isNoCatalogDataMessage(message) ? "未开播" : "播放器错误"}：${message}`,
        );
      });
      shadowErrorObserver.observe(shadowErrorEl, {
        childList: true,
        subtree: true,
        characterData: true,
      });
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
          updatePlayerStatus("live", "播放中（moq-js WebCodecs 路径）。");
        }
        return;
      }
      if (ctx.started && Date.now() - ctx.lastAdvanceAt > 2500) {
        updatePlayerStatus("buffering", "缓冲中（等待稳定缓冲）。");
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
  }, [playerSession, audioPlaybackSupported]);

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
