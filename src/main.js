const buildSubtitleEl = document.getElementById("buildSubtitle");
const logEl = document.getElementById("log");
const namespaceEl = document.getElementById("namespace");
const playerMountEl = document.getElementById("playerMount");
const startButton = document.getElementById("start");
const statusEl = document.getElementById("status");
const stopButton = document.getElementById("stop");
const urlEl = document.getElementById("url");

const idlePlaceholder = `
  <div class="placeholder">
    <p>播放器尚未创建。<br />点击左侧按钮后会在这里启动 <code>video-moq</code>。</p>
  </div>
`;

let playbackToken = 0;
let session = null;
let playerModulePromise = null;

console.warn = () => {};

buildSubtitleEl.textContent = `Build ${__BUILD_HASH__}`;

function log(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
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

function createPlayerContext() {
  const relayUrl = new URL(urlEl.value.trim()).toString();
  const namespace = namespaceEl.value.trim();
  if (!namespace) {
    throw new Error("Namespace 不能为空");
  }

  const container = document.createElement("div");
  container.style.position = "relative";

  const player = document.createElement("video-moq");
  player.className = "player-moq";
  player.setAttribute("src", relayUrl);
  player.setAttribute("namespace", namespace);
  // Do not set `controls`: keep built-in controls disabled.

  container.append(player);
  return {
    relayUrl,
    namespace,
    container,
    player,
    listeners: [],
    tickerId: null,
    lastTime: 0,
    lastAdvanceAt: Date.now(),
    started: false
  };
}

async function ensurePlayerModule() {
  if (!playerModulePromise) {
    playerModulePromise = import("../vendor/moq-js/moq-player.esm.js");
  }
  await playerModulePromise;
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

function startTicker(ctx) {
  ctx.tickerId = window.setInterval(() => {
    if (session !== ctx) {
      return;
    }
    const currentTime = Number(ctx.player.currentTime ?? 0);
    if (Number.isFinite(currentTime) && currentTime > ctx.lastTime + 0.05) {
      ctx.lastTime = currentTime;
      ctx.lastAdvanceAt = Date.now();
      if (ctx.started) {
        statusEl.textContent = "播放中（moq-js WebCodecs 路径）。";
      }
      return;
    }
    if (ctx.started && Date.now() - ctx.lastAdvanceAt > 2500) {
      statusEl.textContent = "缓冲中（等待稳定缓冲）。";
    }
  }, 1000);
}

async function stop(token = ++playbackToken) {
  const current = session;
  session = null;
  window.player = null;

  if (!current) {
    playerMountEl.innerHTML = idlePlaceholder;
    return;
  }

  statusEl.textContent = "正在停止。";
  if (current.tickerId) {
    clearInterval(current.tickerId);
    current.tickerId = null;
  }
  detachAll(current);

  try {
    if (typeof current.player.destroy === "function") {
      await withTimeout(current.player.destroy(), 1200);
    } else if (current.player.player && typeof current.player.player.close === "function") {
      await withTimeout(current.player.player.close(), 1200);
    }
  } catch (error) {
    log(`stop warning: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    current.player.remove();
  } catch {}

  playerMountEl.innerHTML = idlePlaceholder;
  await Promise.resolve();

  if (token === playbackToken) {
    statusEl.textContent = "已停止。";
    log("stopped player");
  }
}

async function start() {
  const token = ++playbackToken;
  await stop(token);
  logEl.textContent = "";

  let ctx;
  try {
    await ensurePlayerModule();
    ctx = createPlayerContext();
  } catch (error) {
    statusEl.textContent = `失败：${error.message}`;
    log(`失败：${error.stack ?? error.message}`);
    return;
  }

  session = ctx;
  window.player = ctx.player;
  playerMountEl.replaceChildren(ctx.container);
  statusEl.textContent = "播放器已创建，正在连接 relay。";
  log(`created video-moq player: url=${ctx.relayUrl} namespace=${ctx.namespace}`);

  attach(ctx, ctx.player, "loadeddata", () => {
    if (session !== ctx) {
      return;
    }
    ctx.started = true;
    ctx.lastAdvanceAt = Date.now();
    statusEl.textContent = "播放中（moq-js WebCodecs 路径）。";
    log("playback started");
  });

  attach(ctx, ctx.player, "error", (event) => {
    if (session !== ctx) {
      return;
    }
    const detail = event?.detail;
    const err = detail instanceof Error ? detail : new Error(String(detail ?? "unknown player error"));
    statusEl.textContent = `失败：${err.message}`;
    log(`失败：${err.stack ?? err.message}`);
  });

  startTicker(ctx);

  if (token !== playbackToken || session !== ctx) {
    await stop(token);
  }
}

startButton.addEventListener("click", () => {
  void start();
});

stopButton.addEventListener("click", () => {
  void stop();
});

const params = new URLSearchParams(window.location.search);
if (params.has("url")) {
  urlEl.value = params.get("url");
}
if (params.has("namespace")) {
  namespaceEl.value = params.get("namespace");
}
if (params.get("autorun") === "1") {
  void start();
}
