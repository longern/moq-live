import { PublisherApi } from "../../vendor/moq-js/publish/index.ts";

let currentSession = null;

function postMessageSafe(message) {
  self.postMessage(message);
}

function postWorkerLog(level, message, details = undefined) {
  postMessageSafe({
    type: "log",
    level,
    message: details ? `${message} ${JSON.stringify(details)}` : message,
  });
}

globalThis.__MOQ_PUBLISHER_LOG__ = ({ level = "log", message, details } = {}) => {
  postWorkerLog(level, message || "publisher worker log", details);
};

function toErrorPayload(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack ?? "",
    };
  }

  return {
    message: String(error),
    name: "Error",
    stack: "",
  };
}

function stopOwnedTracks(session) {
  session?.cancel?.();
}

async function closeCurrentSession(reason = "stopped") {
  const session = currentSession;
  currentSession = null;

  if (!session) {
    return;
  }

  try {
    await session.publisher.stop();
  } catch (error) {
    postWorkerLog(
      "warn",
      `worker stop warning: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    stopOwnedTracks(session);
  }

  postMessageSafe({ type: "stopped", reason });
}

function setTrackEnabled(kind, enabled) {
  postWorkerLog(
    "warn",
    `set-track-enabled ignored for ${kind}=${enabled}; publish tracks are controlled on the main thread`,
  );
}

async function startPublish({
  relayUrl,
  namespace,
  videoSource = null,
  audioSource = null,
  videoConfig = null,
  audioConfig = null,
}) {
  await closeCurrentSession("superseded");

  const sources = [videoSource, audioSource].filter(Boolean);
  if (!sources.length) {
    throw new Error("No audio or video frame sources available for publishing");
  }

  const publisher = new PublisherApi({
    url: relayUrl,
    namespace: [namespace],
    sources,
    ...(videoConfig ? { video: videoConfig } : {}),
    ...(audioConfig ? { audio: audioConfig } : {}),
  });

  currentSession = {
    publisher,
    cancel() {
      sources.forEach((source) => {
        const cancelResult = source.readable?.cancel?.("worker session closed");
        cancelResult?.catch?.(() => {});
      });
    },
  };

  await publisher.publish();
  postMessageSafe({ type: "started" });
}

async function probeTrack(track) {
  if (!track?.readable) {
    return null;
  }

  const reader = track.readable.getReader();
  try {
    const result = await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`probe timeout: ${track.kind}`)), 1_000);
      }),
    ]);

    result.value?.close?.();
    return {
      kind: track.kind,
      ok: true,
      done: Boolean(result.done),
    };
  } finally {
    reader.releaseLock();
  }
}

self.addEventListener("message", (event) => {
  const { type, payload } = event.data ?? {};

  if (type === "set-track-enabled") {
    setTrackEnabled(payload?.kind, Boolean(payload?.enabled));
    return;
  }

  if (type === "stop") {
    void closeCurrentSession(payload?.reason ?? "stopped");
    return;
  }

  if (type === "probe") {
    void Promise.all([
      probeTrack(payload?.videoSource),
      probeTrack(payload?.audioSource),
    ])
      .then((results) => {
        postMessageSafe({ type: "probe-result", results });
      })
      .catch((error) => {
        postMessageSafe({
          type: "error",
          ...toErrorPayload(error),
        });
      });
    return;
  }

  if (type !== "start") {
    return;
  }

  void startPublish(payload).catch((error) => {
    stopOwnedTracks(currentSession);
    currentSession = null;
    postMessageSafe({
      type: "error",
      ...toErrorPayload(error),
    });
  });
});
