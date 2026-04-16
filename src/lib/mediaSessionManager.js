export function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => {
    track.stop();
  });
}

export function createMediaSessionManager() {
  let requestVersion = 0;
  let activeStream = null;

  return {
    beginRequest({ stopActive = true } = {}) {
      requestVersion += 1;
      if (stopActive) {
        stopMediaStream(activeStream);
        activeStream = null;
      }
      return requestVersion;
    },

    invalidate() {
      requestVersion += 1;
      return requestVersion;
    },

    isCurrentRequest(requestId) {
      return requestVersion === requestId;
    },

    adoptStream(requestId, stream) {
      if (requestVersion !== requestId) {
        stopMediaStream(stream);
        return null;
      }
      activeStream = stream;
      return stream;
    },

    getActiveStream() {
      return activeStream;
    },

    stopActiveStream({ invalidate = true } = {}) {
      if (invalidate) {
        requestVersion += 1;
      }
      const stream = activeStream;
      activeStream = null;
      stopMediaStream(stream);
      return stream;
    },
  };
}
