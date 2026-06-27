import { useRef, useState } from "react";
import { createAppError } from "../lib/appErrors.js";
import {
  createAudienceCallRealtimePeer,
  createAudienceCallRealtimeSession,
  createMicrophoneAudioTrack,
} from "../lib/audienceCallRealtime.js";

const MAX_AUDIENCE_CALL_ACTIVE = 5;

function normalizeAudienceCallRemote(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = String(value.id || value.user?.id || value.sessionId || "").trim();
  const sessionId = String(value.sessionId || value.hostSessionId || "").trim();
  const trackPullToken = String(value.trackPullToken || value.hostTrackPullToken || "").trim();
  const trackName = String(value.trackName || value.hostTrackName || "").trim();
  if (!id || !sessionId || !trackPullToken || !trackName) {
    return null;
  }
  return {
    id,
    sessionId,
    trackPullToken,
    trackName,
    user: value.user || null,
  };
}

export function useAudienceCallRealtimeController({
  room,
  role = "viewer",
  socketRef,
  onRemoteStream,
}) {
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  const peerRef = useRef(null);
  const publishRef = useRef(null);
  const pullsRef = useRef(new Map());
  const playbackMutedRemoteIdsRef = useRef(new Set());

  function closePulledRemote(remoteId, { clearMuted = false } = {}) {
    const pulled = pullsRef.current.get(remoteId);
    if (!pulled) {
      return;
    }
    pulled.close?.();
    if (pulled.mixRemoteId) {
      onRemoteStream?.(pulled.mixRemoteId, null);
    }
    pullsRef.current.delete(remoteId);
    if (clearMuted) {
      playbackMutedRemoteIdsRef.current.delete(remoteId);
    }
  }

  function closeSession() {
    publishRef.current?.close?.();
    publishRef.current = null;
    for (const remoteId of Array.from(pullsRef.current.keys())) {
      closePulledRemote(remoteId);
    }
    playbackMutedRemoteIdsRef.current.clear();
    peerRef.current?.close?.();
    peerRef.current = null;
    sessionRef.current = null;
    setSession(null);
  }

  async function startSession(sessionRole = role, extra = {}) {
    const normalizedRole = sessionRole === "host" ? "host" : "viewer";
    if (!room) {
      throw createAppError("room_required");
    }

    closeSession();
    const payload = await createAudienceCallRealtimeSession({
      roomId: room,
      role: normalizedRole,
    });
    const nextSession = {
      ...payload,
      role: normalizedRole,
      remote: extra.remote || null,
    };
    const peer = createAudienceCallRealtimePeer(nextSession);
    sessionRef.current = nextSession;
    peerRef.current = peer;
    setSession(nextSession);
    return nextSession;
  }

  async function publishTrack(audioTrack) {
    const published = await peerRef.current?.publishAudioTrack(audioTrack);
    if (!published) {
      audioTrack?.stop?.();
      throw createAppError("room_required");
    }
    publishRef.current = published;
    return published;
  }

  async function pullRemoteAudio(remote, { playback = false, mix = false } = {}) {
    const currentSession = sessionRef.current;
    const normalizedRemote = normalizeAudienceCallRemote(remote);
    if (!currentSession?.sessionId || !normalizedRemote) {
      return null;
    }
    if (
      pullsRef.current.size >= MAX_AUDIENCE_CALL_ACTIVE + 1 &&
      !pullsRef.current.has(normalizedRemote.id)
    ) {
      return null;
    }

    closePulledRemote(normalizedRemote.id);
    const handleRemoteStream = mix
      ? (remoteStream) => {
          onRemoteStream?.(normalizedRemote.id, remoteStream);
        }
      : null;
    const pulled = await peerRef.current?.pullAudioTrack({
      remote: normalizedRemote,
      playback,
      onRemoteStream: handleRemoteStream,
    });
    if (!pulled) {
      return null;
    }
    const entry = {
      ...pulled,
      mixRemoteId: mix ? normalizedRemote.id : "",
    };
    if (entry.audioElement) {
      entry.audioElement.muted = playbackMutedRemoteIdsRef.current.has(normalizedRemote.id);
    }
    pullsRef.current.set(normalizedRemote.id, entry);
    if (handleRemoteStream && pulled.remoteStream?.getAudioTracks?.().length) {
      handleRemoteStream(pulled.remoteStream);
    }
    return pulled;
  }

  async function startViewerSession({ remote = null } = {}) {
    const nextSession = await startSession("viewer", { remote });
    let audioTrack = null;
    try {
      audioTrack = await createMicrophoneAudioTrack();
      if (!audioTrack) {
        throw createAppError("microphone_unavailable");
      }

      const published = await publishTrack(audioTrack);
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "audience_call.viewer_ready",
          viewer: {
            sessionId: nextSession.sessionId,
            trackPullToken: nextSession.trackPullToken,
            trackName: published.trackName,
            remote,
          },
        }));
      }

      const hostRemote = normalizeAudienceCallRemote({
        id: "host",
        ...remote,
      });
      if (hostRemote) {
        await pullRemoteAudio(hostRemote, {
          playback: true,
          mix: false,
        });
      }
      return nextSession;
    } catch (error) {
      if (!publishRef.current) {
        audioTrack?.stop?.();
      }
      closeSession();
      throw error;
    }
  }

  async function startHostSession({ audioTrack } = {}) {
    let currentSession = sessionRef.current;
    const hadSession = Boolean(currentSession && currentSession.role === "host");
    if (!currentSession || currentSession.role !== "host") {
      currentSession = await startSession("host");
    }
    try {
      if (audioTrack && !publishRef.current) {
        await publishTrack(audioTrack);
      } else if (audioTrack) {
        audioTrack.stop?.();
      }
    } catch (error) {
      audioTrack?.stop?.();
      if (!hadSession) {
        closeSession();
      }
      throw error;
    }
    return {
      session: currentSession,
      trackName: publishRef.current?.trackName || "",
    };
  }

  async function pullViewerAudio(viewer) {
    if (role !== "broadcaster") {
      return null;
    }

    const currentSession = sessionRef.current;
    const remote = {
      id: String(viewer?.userId || viewer?.sessionId || "").trim(),
      sessionId: String(viewer?.sessionId || "").trim(),
      trackPullToken: String(viewer?.trackPullToken || "").trim(),
      trackName: String(viewer?.trackName || "").trim(),
    };
    if (!currentSession?.sessionId || !remote.id || !remote.sessionId || !remote.trackPullToken) {
      return null;
    }
    if (
      pullsRef.current.size >= MAX_AUDIENCE_CALL_ACTIVE &&
      !pullsRef.current.has(remote.id)
    ) {
      return null;
    }

    await pullRemoteAudio(remote, {
      playback: true,
      mix: true,
    });
    return pullsRef.current.get(remote.id) || null;
  }

  async function syncParticipantAudio(remotes) {
    if (role === "broadcaster") {
      return;
    }
    const normalizedRemotes = Array.isArray(remotes)
      ? remotes.map(normalizeAudienceCallRemote).filter(Boolean)
      : [];
    const nextRemoteIds = new Set(normalizedRemotes.map((remote) => remote.id));
    for (const remote of normalizedRemotes) {
      await pullRemoteAudio(remote, {
        playback: true,
        mix: false,
      });
    }
    for (const remoteId of Array.from(pullsRef.current.keys())) {
      if (remoteId === "host") {
        continue;
      }
      if (!nextRemoteIds.has(remoteId)) {
        closePulledRemote(remoteId, { clearMuted: true });
      }
    }
  }

  function closeInactiveViewerRemotes(active = []) {
    if (role !== "broadcaster") {
      return;
    }
    if (!active.length) {
      closeSession();
      return;
    }
    const activeRemoteIds = new Set(
      active
        .map((item) => String(item.user?.id || item.sessionId || "").trim())
        .filter(Boolean),
    );
    for (const remoteId of Array.from(pullsRef.current.keys())) {
      if (!activeRemoteIds.has(remoteId)) {
        closePulledRemote(remoteId, { clearMuted: true });
      }
    }
  }

  function setRemotePlaybackMuted(remoteId, muted) {
    const normalizedRemoteId = String(remoteId || "").trim();
    if (!normalizedRemoteId) {
      return;
    }
    if (muted) {
      playbackMutedRemoteIdsRef.current.add(normalizedRemoteId);
    } else {
      playbackMutedRemoteIdsRef.current.delete(normalizedRemoteId);
    }
    const pulled = pullsRef.current.get(normalizedRemoteId);
    if (pulled?.audioElement) {
      pulled.audioElement.muted = Boolean(muted);
    }
  }

  function leave() {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "audience_call.viewer_leave",
      }));
    }
    closeSession();
    return true;
  }

  return {
    session,
    startSession,
    startViewerSession,
    startHostSession,
    pullViewerAudio,
    syncParticipantAudio,
    closeInactiveViewerRemotes,
    setRemotePlaybackMuted,
    closePulledRemote,
    closeSession,
    leave,
  };
}
