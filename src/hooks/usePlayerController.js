import { useEffect, useRef, useState } from "preact/hooks";
import {
  compareSignatures,
  sampleCanvasMarkerSignature,
  sampleImageMarkerSignature
} from "../lib/syntheticMedia.js";

const playerModuleState = { promise: null };

async function ensurePlayerModule() {
  if (!playerModuleState.promise) {
    playerModuleState.promise = import("../../vendor/moq-js/moq-player.esm.js");
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

function ensureContainedPlayerStyles(playerEl) {
  const shadowRoot = playerEl?.shadowRoot;
  if (!shadowRoot) {
    return;
  }

  if (shadowRoot.querySelector('style[data-layout="contain-media"]')) {
    return;
  }

  const style = document.createElement("style");
  style.dataset.layout = "contain-media";
  style.textContent = `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      background: #000;
    }

    #base {
      width: 100%;
      height: 100%;
      display: grid !important;
      place-items: center;
      overflow: hidden;
      background: #000;
    }

    canvas,
    video {
      display: block;
      max-width: 100% !important;
      max-height: 100% !important;
      margin: auto !important;
      background: #000;
    }
  `;

  shadowRoot.append(style);
}

function syncContainedCanvasLayout(playerEl) {
  const shadowRoot = playerEl?.shadowRoot;
  const baseEl = shadowRoot?.querySelector("#base");
  const canvasEl = shadowRoot?.querySelector("canvas#canvas");
  if (!(baseEl instanceof HTMLElement) || !(canvasEl instanceof HTMLCanvasElement)) {
    return null;
  }

  const containerWidth = baseEl.clientWidth;
  const containerHeight = baseEl.clientHeight;
  const mediaWidth = canvasEl.width;
  const mediaHeight = canvasEl.height;
  if (!containerWidth || !containerHeight || !mediaWidth || !mediaHeight) {
    return null;
  }

  const containerAspect = containerWidth / containerHeight;
  const mediaAspect = mediaWidth / mediaHeight;
  let targetWidth;
  let targetHeight;

  if (mediaAspect >= containerAspect) {
    targetWidth = containerWidth;
    targetHeight = containerWidth / mediaAspect;
  } else {
    targetHeight = containerHeight;
    targetWidth = containerHeight * mediaAspect;
  }

  canvasEl.style.width = `${Math.round(targetWidth)}px`;
  canvasEl.style.height = `${Math.round(targetHeight)}px`;
  canvasEl.style.maxWidth = "none";
  canvasEl.style.maxHeight = "none";

  return mediaHeight > mediaWidth ? "portrait" : "landscape";
}

export function usePlayerController({
  initialAutorun,
  relayUrlRef,
  roomRef,
  setLogText,
  log,
  syntheticSessionRef
}) {
  const [playerStatus, setPlayerStatus] = useState("等待开始。");
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [playerPaused, setPlayerPaused] = useState(false);
  const [playerMuted, setPlayerMuted] = useState(false);
  const [playerSession, setPlayerSession] = useState(null);
  const [playerOrientation, setPlayerOrientation] = useState("landscape");
  const [fullscreenRotate, setFullscreenRotate] = useState(false);

  const playerRef = useRef(null);
  const watchStageRef = useRef(null);
  const playbackTokenRef = useRef(0);
  const sessionRef = useRef(null);
  const playerSessionStateRef = useRef(null);
  const orientationLockedRef = useRef(false);

  playerSessionStateRef.current = playerSession;

  async function stopPlayer(token = ++playbackTokenRef.current) {
    const current = sessionRef.current;
    const currentPlayer = current?.player ?? playerRef.current;
    const hadPlayer = Boolean(current || playerSessionStateRef.current);

    sessionRef.current = null;
    window.player = null;

    if (!hadPlayer) {
      setPlayerSession(null);
      setFullscreenActive(false);
      setFullscreenRotate(false);
      setPlayerPaused(false);
      setPlayerMuted(false);
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
    setFullscreenActive(false);
    setFullscreenRotate(false);
    setPlayerPaused(false);
    setPlayerMuted(false);
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
    setFullscreenActive(false);
    setFullscreenRotate(false);
    setPlayerPaused(false);
    setPlayerMuted(false);
    setPlayerStatus("播放器已创建，正在连接 relay。");
    log(`created video-moq player: url=${nextSession.relayUrl} namespace=${nextSession.namespace}`);
  }

  async function togglePlayerPlayback() {
    const playerEl = playerRef.current;
    if (!playerEl) {
      return;
    }

    if (playerPaused) {
      await startPlayer();
      return;
    }

    if (typeof playerEl.pause === "function") {
      await playerEl.pause();
    }
    setPlayerPaused(true);
  }

  async function togglePlayerMute() {
    const playerEl = playerRef.current;
    if (!playerEl) {
      return;
    }

    const nextMuted = !playerMuted;
    setPlayerMuted(nextMuted);
    if ("muted" in playerEl) {
      playerEl.muted = nextMuted;
    }

    if (nextMuted) {
      if (typeof playerEl.mute === "function") {
        await playerEl.mute();
      }
    } else if (typeof playerEl.unmute === "function") {
      await playerEl.unmute();
    }

    setPlayerMuted(nextMuted);
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

  async function compareSyntheticPlaybackFromDataUrl(dataUrl) {
    const source = sampleCanvasMarkerSignature(syntheticSessionRef.current?.syntheticMedia?.canvas ?? null);
    const player = await sampleImageMarkerSignature(dataUrl);
    return compareSignatures(source, player);
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreenActive(active);

      if (!active && orientationLockedRef.current && screen.orientation?.unlock) {
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
    if (!playerSession || !playerEl || playerSession.token !== playbackTokenRef.current) {
      return;
    }

    const updateCanvasLayout = () => {
      const nextOrientation = syncContainedCanvasLayout(playerEl);
      if (nextOrientation) {
        setPlayerOrientation(nextOrientation);
      }
    };

    ensureContainedPlayerStyles(playerEl);
    updateCanvasLayout();

    const resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => {
          updateCanvasLayout();
        })
      : null;
    resizeObserver?.observe(playerEl);

    const canvasEl = playerEl.shadowRoot?.querySelector("canvas#canvas");
    const canvasObserver = canvasEl instanceof HTMLCanvasElement
      ? new MutationObserver(() => {
          updateCanvasLayout();
        })
      : null;
    canvasObserver?.observe(canvasEl, {
      attributes: true,
      attributeFilter: ["width", "height", "style", "class"]
    });

    const canvasSyncTicker = window.setInterval(() => {
      updateCanvasLayout();
    }, 250);

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
      ensureContainedPlayerStyles(ctx.player);
      updateCanvasLayout();
      ctx.started = true;
      ctx.lastAdvanceAt = Date.now();
      setPlayerPaused(false);
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
      clearInterval(canvasSyncTicker);
      canvasObserver?.disconnect();
      resizeObserver?.disconnect();
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
    if (!initialAutorun) {
      return;
    }

    void startPlayer();
  }, []);

  useEffect(() => () => {
    setPlayerOrientation("landscape");
    void stopPlayer();
  }, []);

  return {
    playerStatus,
    fullscreenActive,
    fullscreenRotate,
    playerPaused,
    playerMuted,
    playerOrientation,
    playerSession,
    playerRef,
    watchStageRef,
    startPlayer,
    stopPlayer,
    togglePlayerPlayback,
    togglePlayerMute,
    fullscreenPlayer,
    compareSyntheticPlaybackFromDataUrl
  };
}
