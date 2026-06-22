const WEBRTC_AUDIO_MAX_BITRATE = 192_000;
const WEBRTC_PROXY_RESOURCE_RENEW_INTERVAL_MS = 30 * 60 * 1000;

export async function createWhipPublishSession({
  url,
  tracks,
  audioMaxBitrate = WEBRTC_AUDIO_MAX_BITRATE,
  videoMaxBitrate,
}) {
  const endpoint = new URL(url, window.location.href).toString();
  const peerConnection = new RTCPeerConnection();
  let resourceUrl = "";
  let renewIntervalId = null;
  let videoSender = null;
  let currentVideoMaxBitrate = videoMaxBitrate;

  for (const track of tracks) {
    const sender = peerConnection.addTrack(track);
    if (track.kind === "audio") {
      await setSenderBitrate(sender, audioMaxBitrate, "audio");
    } else if (track.kind === "video") {
      videoSender = sender;
      await setSenderBitrate(sender, videoMaxBitrate, "video");
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
    renewIntervalId = startWebRtcProxyResourceRenewal(resourceUrl);
  }

  await peerConnection.setRemoteDescription({
    type: "answer",
    sdp: answerSdp,
  });

  return {
    peerConnection,
    async replaceVideoTrack(track) {
      if (!videoSender || typeof videoSender.replaceTrack !== "function") {
        return false;
      }
      await videoSender.replaceTrack(track ?? null);
      if (track) {
        await setSenderBitrate(videoSender, currentVideoMaxBitrate, "video");
      }
      return true;
    },
    async setVideoMaxBitrate(maxBitrate) {
      currentVideoMaxBitrate = maxBitrate;
      await setSenderBitrate(videoSender, currentVideoMaxBitrate, "video");
    },
    close() {
      peerConnection.close();
      if (renewIntervalId) {
        window.clearInterval(renewIntervalId);
        renewIntervalId = null;
      }
      if (resourceUrl) {
        void fetch(resourceUrl, { method: "DELETE" }).catch(() => {});
      }
    },
  };
}

function startWebRtcProxyResourceRenewal(resourceUrl) {
  if (!resourceUrl.startsWith(window.location.origin)) {
    return null;
  }

  return window.setInterval(() => {
    void fetch(resourceUrl, {
      method: "PATCH",
      credentials: "same-origin",
    }).catch(() => {});
  }, WEBRTC_PROXY_RESOURCE_RENEW_INTERVAL_MS);
}

async function setSenderBitrate(sender, maxBitrate, mediaKind) {
  if (!Number.isFinite(maxBitrate) || maxBitrate <= 0) {
    return;
  }
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
    console.warn(`failed to set WebRTC ${mediaKind} bitrate`, error);
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
