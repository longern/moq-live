const SYNTHETIC_WIDTH = 1280;
const SYNTHETIC_HEIGHT = 720;
const SYNTHETIC_MARKER = {
  x: SYNTHETIC_WIDTH * 0.7625,
  y: SYNTHETIC_HEIGHT * 0.1,
  width: SYNTHETIC_WIDTH * 0.15,
  height: SYNTHETIC_WIDTH * 0.15
};

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

export function createSyntheticMedia(namespace) {
  const width = SYNTHETIC_WIDTH;
  const height = SYNTHETIC_HEIGHT;
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
    ctx.fillRect(48, 48, width - 96, height - 96);

    for (let i = 0; i < 16; i += 1) {
      const phase = t * 2.4 + i * 0.35;
      const barHeight = 48 + ((Math.sin(phase) + 1) / 2) * (height - 280);
      const barWidth = 36;
      const gap = 32;
      const x = 80 + i * (barWidth + gap);
      const y = height - 72 - barHeight;
      ctx.fillStyle = i % 2 === 0 ? "#f8fafc" : "#fde68a";
      ctx.fillRect(x, y, barWidth, barHeight);
    }

    ctx.fillStyle = "#f8fafc";
    ctx.font = '700 56px "SF Mono", Menlo, monospace';
    ctx.fillText("MOQ SYNTHETIC LIVE", 76, 144);
    ctx.font = '500 36px "SF Mono", Menlo, monospace';
    ctx.fillText(new Date().toISOString(), 76, 204);
    ctx.fillText(`namespace=${namespace || "unset"}`, 76, 256);

    const cellWidth = SYNTHETIC_MARKER.width / 2;
    const cellHeight = SYNTHETIC_MARKER.height / 2;
    ctx.fillStyle = "rgba(15, 23, 32, 0.2)";
    ctx.fillRect(
      SYNTHETIC_MARKER.x - 12,
      SYNTHETIC_MARKER.y - 12,
      SYNTHETIC_MARKER.width + 24,
      SYNTHETIC_MARKER.height + 24
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
    ctx.lineWidth = 8;
    ctx.strokeRect(SYNTHETIC_MARKER.x, SYNTHETIC_MARKER.y, SYNTHETIC_MARKER.width, SYNTHETIC_MARKER.height);

    const orbX = width * 0.78 + Math.sin(t * 1.7) * 112;
    const orbY = height * 0.52 + Math.cos(t * 1.3) * 92;
    ctx.beginPath();
    ctx.fillStyle = "#fb7185";
    ctx.arc(orbX, orbY, 52, 0, Math.PI * 2);
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

export function sampleCanvasMarkerSignature(canvas) {
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
    const x = (SYNTHETIC_MARKER.x + col * cellWidth + cellWidth / 2) / SYNTHETIC_WIDTH;
    const y = (SYNTHETIC_MARKER.y + row * cellHeight + cellHeight / 2) / SYNTHETIC_HEIGHT;
    return samplePatch(ctx, canvas, canvas.width * x, canvas.height * y);
  });
}

export function compareSignatures(source, player) {
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

export async function sampleImageMarkerSignature(dataUrl) {
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
