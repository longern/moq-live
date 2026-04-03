import { Cmaf } from "@moq/hang/container";

const state = {
  videoTimescale: 90000,
  audioTimescale: 48000,
  queues: {
    video: [],
    audio: []
  },
  done: {
    video: false,
    audio: false
  },
  lastTimestampUs: {
    video: 0,
    audio: 0
  },
  seq: 0
};

function reset() {
  state.queues.video.length = 0;
  state.queues.audio.length = 0;
  state.done.video = false;
  state.done.audio = false;
  state.lastTimestampUs.video = 0;
  state.lastTimestampUs.audio = 0;
  state.seq = 0;
}

function decodeTimestampUs(streamKind, segment) {
  const timescale = streamKind === "video" ? state.videoTimescale : state.audioTimescale;
  try {
    const parsed = Number(Cmaf.decodeTimestamp(segment, timescale));
    if (Number.isFinite(parsed) && parsed >= 0) {
      state.lastTimestampUs[streamKind] = Math.max(state.lastTimestampUs[streamKind], parsed);
      return parsed;
    }
  } catch {}

  const fallbackStep = streamKind === "video" ? 33_333 : 20_000;
  const fallback = state.lastTimestampUs[streamKind] + fallbackStep;
  state.lastTimestampUs[streamKind] = fallback;
  return fallback;
}

function enqueueSegment(streamKind, segment) {
  const queue = state.queues[streamKind];
  const item = {
    streamKind,
    segment,
    timestampUs: decodeTimestampUs(streamKind, segment),
    seq: state.seq++
  };
  queue.push(item);
  queue.sort((a, b) => {
    if (a.timestampUs === b.timestampUs) {
      return a.seq - b.seq;
    }
    return a.timestampUs - b.timestampUs;
  });
}

function takeNextSegment() {
  const videoHead = state.queues.video[0];
  const audioHead = state.queues.audio[0];

  if (!videoHead && !audioHead) {
    return null;
  }
  if (!videoHead) {
    return state.queues.audio.shift();
  }
  if (!audioHead) {
    return state.queues.video.shift();
  }
  if (videoHead.timestampUs === audioHead.timestampUs) {
    return videoHead.seq <= audioHead.seq ? state.queues.video.shift() : state.queues.audio.shift();
  }
  return videoHead.timestampUs < audioHead.timestampUs ? state.queues.video.shift() : state.queues.audio.shift();
}

function flush() {
  for (;;) {
    const item = takeNextSegment();
    if (!item) {
      break;
    }
    postMessage(
      {
        type: "segment",
        streamKind: item.streamKind,
        timestampUs: item.timestampUs,
        segment: item.segment.buffer
      },
      [item.segment.buffer]
    );
  }

  if (
    state.done.video &&
    state.done.audio &&
    state.queues.video.length === 0 &&
    state.queues.audio.length === 0
  ) {
    postMessage({ type: "drained" });
  }
}

onmessage = (event) => {
  try {
    const payload = event.data ?? {};
    const type = payload.type;

    if (type === "reset") {
      reset();
      return;
    }

    if (type === "init") {
      state.videoTimescale = Number.isFinite(payload.videoTimescale) ? payload.videoTimescale : 90000;
      state.audioTimescale = Number.isFinite(payload.audioTimescale) ? payload.audioTimescale : 48000;
      return;
    }

    if (type === "push") {
      const streamKind = payload.streamKind === "audio" ? "audio" : "video";
      const raw = payload.segment;
      const segment = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      enqueueSegment(streamKind, segment);
      flush();
      return;
    }

    if (type === "end") {
      const streamKind = payload.streamKind === "audio" ? "audio" : "video";
      state.done[streamKind] = true;
      flush();
    }
  } catch (error) {
    postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
};

postMessage({ type: "ready" });
