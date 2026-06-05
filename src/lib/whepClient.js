export async function createWhepPlaybackSession({ url, videoElement }) {
  const endpoint = new URL(url).toString();
  const peerConnection = new RTCPeerConnection();
  const remoteStream = new MediaStream();
  let resourceUrl = "";

  peerConnection.addTransceiver("audio", { direction: "recvonly" });
  peerConnection.addTransceiver("video", { direction: "recvonly" });
  peerConnection.addEventListener("track", (event) => {
    const [stream] = event.streams;
    const tracks = stream?.getTracks?.().length ? stream.getTracks() : [event.track];
    for (const track of tracks) {
      if (!remoteStream.getTracks().some((currentTrack) => currentTrack.id === track.id)) {
        remoteStream.addTrack(track);
      }
    }
    videoElement.srcObject = remoteStream;
  });

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await waitForIceGatheringComplete(peerConnection);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/sdp",
      "content-type": "application/sdp",
    },
    body: peerConnection.localDescription.sdp,
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
    close() {
      for (const track of remoteStream.getTracks()) {
        track.stop();
      }
      videoElement.srcObject = null;
      peerConnection.close();
      if (resourceUrl) {
        void fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
      }
    },
  };
}

function waitForIceGatheringComplete(peerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const handleStateChange = () => {
      if (peerConnection.iceGatheringState !== "complete") {
        return;
      }
      peerConnection.removeEventListener("icegatheringstatechange", handleStateChange);
      resolve();
    };
    peerConnection.addEventListener("icegatheringstatechange", handleStateChange);
  });
}
