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
  const muteSyncPromiseRef = useRef(Promise.resolve());

  logRef.current = log;
  playerSessionStateRef.current = playerSession;

  function updatePlayerStatus(kind, message) {
    setPlayerStatusKind(kind);
    setPlayerStatus(message);
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

  async function startPlayer() {
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
    desiredPlayerMutedRef.current = !audioPlaybackSupported;
    setPlayerMutedState(!audioPlaybackSupported);
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
    const playerEl = playerRef.current;
    if (!playerEl) {
      if (!playerSessionStateRef.current) {
        await startPlayer();
      }
      return;
    }

    if (typeof playerEl.play === "function") {
      await playerEl.play();
    }
    setPlayerPaused(false);
  }

  async function setPlayerMute(nextMuted, { logFailure = true } = {}) {
    desiredPlayerMutedRef.current = !audioPlaybackSupported || nextMuted;

    muteSyncPromiseRef.current = muteSyncPromiseRef.current
      .catch(() => {})
      .then(async () => {
        for (;;) {
          const playerEl = playerRef.current;
          if (!playerEl) {
            return;
          }

          const targetMuted = !audioPlaybackSupported || desiredPlayerMutedRef.current;
          setPlayerMutedState(targetMuted);
          if ("muted" in playerEl) {
            playerEl.muted = targetMuted;
          }

          if (!audioPlaybackSupported) {
            if (typeof playerEl.mute === "function") {
              await playerEl.mute();
            }
            if (logFailure) {
              logRef.current?.(
                `audio playback unavailable: ${getPlayerAudioSupportReason()}; keep muted`,
              );
            }
          } else if (targetMuted) {
            if (typeof playerEl.mute === "function") {
              await playerEl.mute();
            }
          } else if (typeof playerEl.unmute === "function") {
            await playerEl.unmute();
          }

          setPlayerMutedState(targetMuted);
          if ((!audioPlaybackSupported || desiredPlayerMutedRef.current) === targetMuted) {
            return;
          }
        }
      });

    await muteSyncPromiseRef.current;
  }

  function setPlayerMutedStateOnly(nextMuted) {
    const targetMuted = !audioPlaybackSupported || nextMuted;
    desiredPlayerMutedRef.current = targetMuted;
    setPlayerMutedState(targetMuted);
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
      updatePlayerStatus("live", "播放中（moq-js WebCodecs 路径）。");
      setPlaybackStartToken((current) => current + 1);
      logRef.current?.("playback started");
    });

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
    setPlayerMutedStateOnly,
    fullscreenPlayer,
  };
}
