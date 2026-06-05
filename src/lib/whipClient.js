const WEBRTC_AUDIO_MAX_BITRATE = 192_000;

export async function createWhipPublishSession({ url, tracks }) {
  const endpoint = new URL(url).toString();
  const peerConnection = new RTCPeerConnection();
  let resourceUrl = "";

  for (const track of tracks) {
    const sender = peerConnection.addTrack(track);
    if (track.kind === "audio") {
      await setAudioSenderBitrate(sender, WEBRTC_AUDIO_MAX_BITRATE);
    }
  }

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
    throw new Error(answerSdp || `WHIP request failed with ${response.status}`);
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
    close() {
      peerConnection.close();
      if (resourceUrl) {
        void fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
      }
    },
  };
}

async function setAudioSenderBitrate(sender, maxBitrate) {
  if (
    !sender ||
    typeof sender.getParameters !== "function" ||
    typeof sender.setParameters !== "function"
  ) {
    return;
  }

  const parameters = sender.getParameters();
  const [encoding] = parameters.encodings ?? [];
  if (!encoding) {
    return;
  }

  encoding.maxBitrate = maxBitrate;
  try {
    await sender.setParameters(parameters);
  } catch (error) {
    console.warn("failed to set WebRTC audio bitrate", error);
  }
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
      peerConnection.removeEventListener(
        "icegatheringstatechange",
        handleStateChange,
      );
      resolve();
    };
    peerConnection.addEventListener(
      "icegatheringstatechange",
      handleStateChange,
    );
  });
}
