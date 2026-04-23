export async function withTimeout(promise, ms) {
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

export async function withTimeoutFallback(promise, ms, fallbackValue) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallbackValue), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function attach(ctx, target, event, handler) {
  target.addEventListener(event, handler);
  ctx.listeners.push({ target, event, handler });
}

export function detachAll(ctx) {
  for (const item of ctx.listeners) {
    item.target.removeEventListener(item.event, item.handler);
  }
  ctx.listeners.length = 0;
}

export function ensureContainedPlayerStyles(playerEl) {
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

export function ensureInitialCanvasSize(playerEl) {
  const canvasEl = playerEl?.shadowRoot?.querySelector("canvas#canvas");
  if (!(canvasEl instanceof HTMLCanvasElement)) {
    return;
  }

  if (canvasEl.width === 300 && canvasEl.height === 150) {
    canvasEl.width = 1280;
    canvasEl.height = 720;
  }
}

export function syncContainedCanvasLayout(playerEl) {
  const shadowRoot = playerEl?.shadowRoot;
  const baseEl = shadowRoot?.querySelector("#base");
  const canvasEl = shadowRoot?.querySelector("canvas#canvas");
  if (
    !(baseEl instanceof HTMLElement) ||
    !(canvasEl instanceof HTMLCanvasElement)
  ) {
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

export function isNoCatalogDataMessage(message = "") {
  return message.toLowerCase().includes("no catalog data");
}

export function getPlayerStatusFromMessage(message = "") {
  if (isNoCatalogDataMessage(message)) {
    return {
      kind: "offair",
      message: `未开播：${message}`,
    };
  }

  return {
    kind: "error",
    message: `失败：${message}`,
  };
}

export function isPlayerAudioSupported() {
  return (
    globalThis.crossOriginIsolated === true &&
    typeof globalThis.SharedArrayBuffer !== "undefined" &&
    typeof globalThis.AudioWorkletNode === "function"
  );
}

export function getPlayerAudioSupportReason() {
  const reasons = [];

  if (globalThis.crossOriginIsolated !== true) {
    reasons.push("crossOriginIsolated=false");
  } else if (typeof globalThis.SharedArrayBuffer === "undefined") {
    reasons.push("SharedArrayBuffer 不可用");
  }
  if (typeof globalThis.AudioWorkletNode !== "function") {
    reasons.push("AudioWorkletNode 不可用");
  }

  return reasons.join("，");
}

function getAudioContextConstructor() {
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

export async function canAutoplayAudioWithoutGesture() {
  const AudioContextCtor = getAudioContextConstructor();
  if (typeof AudioContextCtor !== "function") {
    return false;
  }

  const context = new AudioContextCtor();
  try {
    if (context.state === "running") {
      return true;
    }

    try {
      await withTimeoutFallback(context.resume(), 250, null);
    } catch {
      return false;
    }

    return context.state === "running";
  } finally {
    try {
      await context.close();
    } catch {
      // Ignore probe cleanup failures.
    }
  }
}
