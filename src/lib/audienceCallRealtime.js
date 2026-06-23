const AUDIO_TRACK_NAME = "audience-call-audio";
const ICE_TIMEOUT_MS = 10_000;

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

export async function publishAudienceAudioTrack({ session, audioTrack }) {
  const peerConnection = createRealtimePeerConnection();
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
      peerConnection.close();
    },
  };
}

export async function pullAudienceAudioTrack({ session, remote }) {
  const peerConnection = createRealtimePeerConnection();
  const remoteStream = new MediaStream();
  const audioElement = new Audio();
  audioElement.autoplay = true;
  audioElement.playsInline = true;
  audioElement.srcObject = remoteStream;

  peerConnection.addEventListener("track", (event) => {
    const [stream] = event.streams;
    const tracks = stream?.getTracks?.().length
      ? stream.getTracks()
      : [event.track];
    for (const track of tracks) {
      if (!remoteStream.getTracks().some((current) => current.id === track.id)) {
        remoteStream.addTrack(track);
      }
    }
    void audioElement.play().catch(() => {});
  });

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

  if (payload.sessionDescription) {
    await peerConnection.setRemoteDescription(payload.sessionDescription);
  }

  if (payload.requiresImmediateRenegotiation) {
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    await postRealtimeSession(session, "renegotiate", {
      sessionDescription: peerConnection.localDescription,
    }, { method: "PUT" });
  }

  return {
    peerConnection,
    remoteStream,
    audioElement,
    close() {
      for (const track of remoteStream.getTracks()) {
        track.stop();
      }
      audioElement.pause();
      audioElement.srcObject = null;
      peerConnection.close();
    },
  };
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
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Realtime ICE gathering timeout"));
    }, ICE_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      peerConnection.removeEventListener("icegatheringstatechange", handleStateChange);
    };
    const handleStateChange = () => {
      if (peerConnection.iceGatheringState !== "complete") {
        return;
      }
      cleanup();
      resolve();
    };
    peerConnection.addEventListener("icegatheringstatechange", handleStateChange);
  });
}
