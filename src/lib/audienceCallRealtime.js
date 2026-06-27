const AUDIO_TRACK_NAME = "audience-call-audio";
const ICE_TIMEOUT_MS = 15_000;
const ICE_CANDIDATE_GRACE_MS = 2_000;

export async function createAudienceCallRealtimeSession({ roomId, role }) {
  const response = await fetch("/api/audience-call/realtime/sessions", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ roomId, role }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Realtime session failed with ${response.status}`);
  }
  return payload;
}

export function createAudienceCallRealtimePeer(session) {
  const peerConnection = createRealtimePeerConnection();
  const remoteEntries = new Map();
  let operationQueue = Promise.resolve();

  peerConnection.addEventListener("track", (event) => {
    const mid = String(event.transceiver?.mid ?? "").trim();
    const entry = remoteEntries.get(mid);
    if (!entry) {
      console.warn("audience call remote track without matching mid", mid || "(empty)");
      return;
    }
    const [stream] = event.streams;
    const tracks = stream?.getTracks?.().length
      ? stream.getTracks()
      : [event.track];
    for (const track of tracks) {
      if (!entry.remoteStream.getTracks().some((current) => current.id === track.id)) {
        entry.remoteStream.addTrack(track);
      }
    }
    entry.onRemoteStream?.(entry.remoteStream);
    if (entry.audioElement) {
      void entry.audioElement.play().catch((error) => {
        console.warn(
          "audience call audio playback failed",
          error instanceof Error ? error.message : String(error),
        );
      });
    }
  });

  function enqueue(operation) {
    const nextOperation = operationQueue.then(operation, operation);
    operationQueue = nextOperation.catch(() => {});
    return nextOperation;
  }

  return {
    peerConnection,
    publishAudioTrack(audioTrack) {
      return enqueue(() => publishAudienceAudioTrackOnPeer({
        session,
        peerConnection,
        audioTrack,
      }));
    },
    pullAudioTrack({ remote, playback = false, onRemoteStream }) {
      return enqueue(() => pullAudienceAudioTrackOnPeer({
        session,
        peerConnection,
        remote,
        playback,
        onRemoteStream,
        remoteEntries,
      }));
    },
    close() {
      for (const entry of remoteEntries.values()) {
        closeRemoteEntry(entry);
      }
      remoteEntries.clear();
      peerConnection.close();
    },
  };
}

export async function publishAudienceAudioTrack({ session, audioTrack }) {
  const realtimePeer = createAudienceCallRealtimePeer(session);
  const published = await realtimePeer.publishAudioTrack(audioTrack);
  return {
    ...published,
    peerConnection: realtimePeer.peerConnection,
    close() {
      published.close?.();
      realtimePeer.close();
    },
  };
}

async function publishAudienceAudioTrackOnPeer({ session, peerConnection, audioTrack }) {
  const transceiver = peerConnection.addTransceiver(audioTrack, {
    direction: "sendonly",
  });
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await waitForIceGatheringComplete(peerConnection);

  const payload = await postRealtimeSession(session, "tracks", {
    sessionDescription: peerConnection.localDescription,
    tracks: [
      {
        location: "local",
        mid: transceiver.mid,
        trackName: AUDIO_TRACK_NAME,
      },
    ],
  });

  if (payload.sessionDescription) {
    await peerConnection.setRemoteDescription(payload.sessionDescription);
  }

  return {
    peerConnection,
    trackName: AUDIO_TRACK_NAME,
    close() {
      audioTrack.stop();
    },
  };
}

export async function pullAudienceAudioTrack({
  session,
  remote,
  playback = false,
  onRemoteStream,
}) {
  const realtimePeer = createAudienceCallRealtimePeer(session);
  const pulled = await realtimePeer.pullAudioTrack({ remote, playback, onRemoteStream });
  return {
    ...pulled,
    peerConnection: realtimePeer.peerConnection,
    close() {
      pulled.close?.();
      realtimePeer.close();
    },
  };
}

async function pullAudienceAudioTrackOnPeer({
  session,
  peerConnection,
  remote,
  playback = false,
  onRemoteStream,
  remoteEntries,
}) {
  const remoteStream = new MediaStream();
  const audioElement = playback ? createAudienceCallAudioElement(remoteStream) : null;

  const payload = await postRealtimeSession(session, "tracks", {
    trackPullTokens: [remote.trackPullToken],
    tracks: [
      {
        location: "remote",
        sessionId: remote.sessionId,
        trackName: remote.trackName || AUDIO_TRACK_NAME,
      },
    ],
  });
  const responseTrack = Array.isArray(payload.tracks) ? payload.tracks[0] : null;
  const mid = String(responseTrack?.mid ?? "").trim();
  if (!mid) {
    closeRemoteEntry({ remoteStream, audioElement });
    throw new Error("Realtime remote track response missing mid");
  }
  const entry = {
    remoteStream,
    audioElement,
    onRemoteStream,
  };
  remoteEntries.set(mid, entry);

  try {
    if (payload.sessionDescription) {
      await peerConnection.setRemoteDescription(payload.sessionDescription);
    }

    if (payload.requiresImmediateRenegotiation) {
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await waitForIceGatheringComplete(peerConnection);
      await postRealtimeSession(session, "renegotiate", {
        sessionDescription: peerConnection.localDescription,
      }, { method: "PUT" });
    }
  } catch (error) {
    remoteEntries.delete(mid);
    closeRemoteEntry(entry);
    throw error;
  }

  return {
    peerConnection,
    remoteStream,
    mid,
    audioElement,
    close() {
      remoteEntries.delete(mid);
      closeRemoteEntry(entry);
    },
  };
}

function closeRemoteEntry(entry) {
  for (const track of entry.remoteStream?.getTracks?.() ?? []) {
    track.stop();
  }
  if (entry.audioElement) {
    entry.audioElement.pause();
    entry.audioElement.srcObject = null;
    entry.audioElement.remove();
  }
}

function createAudienceCallAudioElement(stream) {
  const audioElement = new Audio();
  audioElement.autoplay = true;
  audioElement.playsInline = true;
  audioElement.srcObject = stream;
  audioElement.style.display = "none";
  audioElement.setAttribute("data-audience-call-audio", "true");
  document.body?.appendChild(audioElement);
  void audioElement.play().catch((error) => {
    console.warn(
      "audience call audio preplay failed",
      error instanceof Error ? error.message : String(error),
    );
  });
  return audioElement;
}

export async function createMicrophoneAudioTrack() {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  return stream.getAudioTracks()[0] ?? null;
}

function createRealtimePeerConnection() {
  return new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.cloudflare.com:3478",
      },
    ],
    bundlePolicy: "max-bundle",
  });
}

async function postRealtimeSession(session, suffix, payload, { method = "POST" } = {}) {
  const response = await fetch(
    `/api/audience-call/realtime/sessions/${encodeURIComponent(session.sessionId)}/${suffix}`,
    {
      method,
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-realtime-session-token": session.sessionToken,
      },
      body: JSON.stringify(payload),
    },
  );
  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok || responsePayload.ok === false) {
    throw new Error(responsePayload.error || `Realtime ${suffix} failed with ${response.status}`);
  }
  return responsePayload.realtime || responsePayload;
}

function waitForIceGatheringComplete(peerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let graceTimeoutId = 0;
    const timeoutId = window.setTimeout(() => {
      if (hasLocalIceCandidate(peerConnection)) {
        cleanup();
        resolve();
        return;
      }
      cleanup();
      reject(new Error("Realtime ICE gathering timeout"));
    }, ICE_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(graceTimeoutId);
      peerConnection.removeEventListener("icegatheringstatechange", handleStateChange);
      peerConnection.removeEventListener("icecandidate", handleIceCandidate);
    };
    const handleStateChange = () => {
      if (peerConnection.iceGatheringState !== "complete") {
        return;
      }
      cleanup();
      resolve();
    };
    const handleIceCandidate = () => {
      if (peerConnection.iceGatheringState === "complete") {
        cleanup();
        resolve();
        return;
      }
      if (!graceTimeoutId && hasLocalIceCandidate(peerConnection)) {
        graceTimeoutId = window.setTimeout(() => {
          cleanup();
          resolve();
        }, ICE_CANDIDATE_GRACE_MS);
      }
    };
    peerConnection.addEventListener("icegatheringstatechange", handleStateChange);
    peerConnection.addEventListener("icecandidate", handleIceCandidate);
  });
}

function hasLocalIceCandidate(peerConnection) {
  return /\r?\na=candidate:/u.test(peerConnection.localDescription?.sdp || "");
}
