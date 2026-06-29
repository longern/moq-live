import { useEffect, useMemo, useRef } from "react";
import { usePlayerController } from "./usePlayerController.js";
import { STREAM_PROTOCOL_MOQ, normalizeStreamProtocol } from "../lib/streamProtocol.js";

export const MAX_COHOST_PEERS = 8;

function normalizeActiveList(active) {
  return (Array.isArray(active) ? active : (active ? [active] : [])).slice(0, MAX_COHOST_PEERS);
}

function getPlaybackTarget(active) {
  const stream = active?.stream || {};
  const protocol = normalizeStreamProtocol(stream.protocol);
  const relayUrl = stream.relayUrl || "";
  const namespace = stream.namespace || "";
  const webRtcUrl = stream.webRtcUrl || "";
  const ready = protocol === STREAM_PROTOCOL_MOQ
    ? Boolean(relayUrl && namespace)
    : Boolean(webRtcUrl);
  if (!active?.peerRoomId || !ready) {
    return null;
  }
  return {
    active,
    protocol,
    relayUrl,
    namespace,
    webRtcUrl,
    key: `${active.peerRoomId}:${active.acceptedAt || ""}:${protocol}:${protocol === STREAM_PROTOCOL_MOQ ? namespace : webRtcUrl}`,
  };
}

function sessionMatchesTarget(session, target) {
  if (!session || !target) {
    return false;
  }
  const sessionProtocol = session.protocol || "";
  const sessionRoom = session.room || session.namespace || "";
  const sessionWebRtcUrl = session.webRtcUrl || "";
  return sessionProtocol === target.protocol && (
    target.protocol === STREAM_PROTOCOL_MOQ
      ? sessionRoom === target.namespace
      : sessionWebRtcUrl === target.webRtcUrl
  );
}

export function useCohostPlayerControllers({
  active,
  enabled = true,
  layoutScopeKey,
  log,
  setLogText,
}) {
  const relayUrlRefs = useRef(Array.from({ length: MAX_COHOST_PEERS }, () => ({ current: "" })));
  const namespaceRefs = useRef(Array.from({ length: MAX_COHOST_PEERS }, () => ({ current: "" })));
  const protocolRefs = useRef(Array.from({ length: MAX_COHOST_PEERS }, () => ({ current: "webrtc" })));
  const webRtcUrlRefs = useRef(Array.from({ length: MAX_COHOST_PEERS }, () => ({ current: "" })));
  const handledTargetKeysRef = useRef(Array.from({ length: MAX_COHOST_PEERS }, () => ""));

  const players = Array.from({ length: MAX_COHOST_PEERS }, (_, index) => usePlayerController({
    initialAutorun: false,
    relayUrlRef: relayUrlRefs.current[index],
    roomRef: namespaceRefs.current[index],
    streamProtocolRef: protocolRefs.current[index],
    webRtcUrlRef: webRtcUrlRefs.current[index],
    setLogText,
    log,
    layoutScopeKey: `${layoutScopeKey}:cohost:${index}`,
  }));

  const targets = useMemo(
    () => normalizeActiveList(active).map(getPlaybackTarget),
    [active],
  );

  for (let index = 0; index < MAX_COHOST_PEERS; index += 1) {
    const target = targets[index];
    relayUrlRefs.current[index].current = target?.relayUrl || "";
    namespaceRefs.current[index].current = target?.namespace || "";
    protocolRefs.current[index].current = target?.protocol || "webrtc";
    webRtcUrlRefs.current[index].current = target?.webRtcUrl || "";
  }

  const targetSignature = targets.map((target) => target?.key || "").join("|");
  const sessionSignature = players.map((player) => player.playerSession?.key || "").join("|");

  useEffect(() => {
    players.forEach((player, index) => {
      const target = targets[index];
      if (!enabled || !target) {
        handledTargetKeysRef.current[index] = "";
        if (player.playerSession) {
          void player.stopPlayer();
        }
        return;
      }
      const handledTargetKey = handledTargetKeysRef.current[index];
      if (
        handledTargetKey !== target.key ||
        (player.playerSession && !sessionMatchesTarget(player.playerSession, target))
      ) {
        handledTargetKeysRef.current[index] = target.key;
        void player.startPlayer();
      }
    });
  }, [enabled, players, sessionSignature, targetSignature, targets]);

  return targets.map((target, index) => ({
    active: target?.active || null,
    player: players[index],
  })).filter((item) => item.active);
}
