export async function createWhepPlaybackSession({ url, videoElement, signal }) {
  const endpoint = new URL(url).toString();
  const peerConnection = new RTCPeerConnection();
  const remoteStream = new MediaStream();
  let resourceUrl = "";
  let closed = false;

  const close = async () => {
    if (closed) {
      return;
    }
    closed = true;
    for (const track of remoteStream.getTracks()) {
      track.stop();
    }
    if (videoElement.srcObject === remoteStream) {
      videoElement.srcObject = null;
    }
    peerConnection.close();
    if (resourceUrl) {
      await fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
    }
  };

  try {
    if (signal?.aborted) {
      throw createAbortError();
    }

    peerConnection.addTransceiver("audio", { direction: "recvonly" });
    peerConnection.addTransceiver("video", { direction: "recvonly" });
    peerConnection.addEventListener("track", (event) => {
      const [stream] = event.streams;
      const tracks = stream?.getTracks?.().length
        ? stream.getTracks()
        : [event.track];
      for (const track of tracks) {
        if (
          !remoteStream
            .getTracks()
            .some((currentTrack) => currentTrack.id === track.id)
        ) {
          remoteStream.addTrack(track);
        }
      }
      videoElement.srcObject = remoteStream;
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGatheringComplete(peerConnection, signal);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/sdp",
        "content-type": "application/sdp",
      },
      body: peerConnection.localDescription.sdp,
      signal,
    });
    const answerSdp = await response.text();

    if (!response.ok) {
      throw new Error(answerSdp || `WHEP request failed with ${response.status}`);
    }

    resourceUrl = response.headers.get("location") || "";
    if (resourceUrl) {
      resourceUrl = new URL(resourceUrl, endpoint).toString();
    }

    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: answerSdp,
    });

    return {
      peerConnection,
      remoteStream,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

function waitForIceGatheringComplete(peerConnection, signal) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      peerConnection.removeEventListener("icegatheringstatechange", handleStateChange);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleStateChange = () => {
      if (peerConnection.iceGatheringState !== "complete") {
        return;
      }
      cleanup();
      resolve();
    };
    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    peerConnection.addEventListener("icegatheringstatechange", handleStateChange);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function createAbortError() {
  if (typeof DOMException === "function") {
    return new DOMException("Aborted", "AbortError");
  }
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}
