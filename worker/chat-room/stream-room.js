import {
  applyStoredRoomLocationResolution,
  areRoomLocationsEqual,
  areRoomMetaEqual,
  calculateDistanceMeters,
  clearStreamScopedMutes,
  formatDistanceText,
  getDefaultAudienceCallState,
  getDefaultRoomLocation,
  getDefaultRoomState,
  getPublicAudienceCallState,
  getPublicRoomLocation,
  json,
  normalizeRoomLocation,
  normalizeRoomLocationInput,
  reverseGeocodeProvince,
  sanitizeCoordinate,
  sanitizeIsoTimestamp,
  sanitizeLocationProvince,
  sanitizeNamespace,
  sanitizeRoomTitle,
  sanitizeStreamProtocol,
  sanitizeUrl,
} from "./utils.js";
import { persistStorageOrNotify } from "./broadcast-control.js";
import { clearPeerCohostActive } from "./cohost.js";

export async function handleStreamStarted(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_stream_update");
    return;
  }

  const nextStream = {
    isLive: true,
    protocol: sanitizeStreamProtocol(payload.stream?.protocol),
    startedAt:
      sanitizeIsoTimestamp(payload.stream?.startedAt) ??
      new Date().toISOString(),
  };
  if (room.roomState.stream.isLive) {
    return;
  }

  const nextRoomState = {
    ...room.roomState,
    stream: nextStream,
    location: getDefaultRoomLocation(),
    cohost: {
      ...room.roomState.cohost,
      invitesAllowed: true,
      active: null,
    },
    audienceCall: getDefaultAudienceCallState(),
  };
  const persisted = await persistStorageOrNotify(
    room,
    ws,
    "roomState",
    nextRoomState,
  );
  if (!persisted) {
    return;
  }
  room.roomState = nextRoomState;
  room.audienceCallSpeakingUserIds = [];
  await writeRoomLastStartedAt(room, session.room, nextStream.startedAt);
  room.broadcast({
    type: "stream.started",
    stream: nextStream,
  });
  room.broadcast({
    type: "room.location.updated",
    location: getPublicRoomLocation(nextRoomState.location),
  });
  room.broadcast({
    type: "cohost.invites.changed",
    invitesAllowed: nextRoomState.cohost.invitesAllowed,
  });
  room.broadcast({
    type: "cohost.active.changed",
    active: nextRoomState.cohost.active,
  });
  room.broadcast({
    type: "audience_call.changed",
    audienceCall: getPublicAudienceCallState(nextRoomState.audienceCall),
  });
}

export async function handleStreamStopped(room, ws, session) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_stream_update");
    return;
  }

  if (!room.roomState.stream.isLive) {
    return;
  }

  const previousActive = room.roomState.cohost.active;
  const previousLocation = room.roomState.location;
  const nextRoomState = {
    ...room.roomState,
    stream: getDefaultRoomState().stream,
    location: getDefaultRoomLocation(),
    cohost: {
      ...room.roomState.cohost,
      active: null,
    },
    audienceCall: getDefaultAudienceCallState(),
    moderation: clearStreamScopedMutes(room.roomState.moderation),
  };
  const persisted = await persistStorageOrNotify(
    room,
    ws,
    "roomState",
    nextRoomState,
  );
  if (!persisted) {
    return;
  }
  room.roomState = nextRoomState;
  room.audienceCallSpeakingUserIds = [];
  await writeUserLastLocation(room, session.user?.id, previousLocation);
  room.broadcast({
    type: "stream.stopped",
    stream: room.roomState.stream,
  });
  room.broadcast({
    type: "room.location.updated",
    location: getPublicRoomLocation(room.roomState.location),
  });
  room.broadcast({
    type: "cohost.active.changed",
    active: null,
  });
  room.broadcast({
    type: "audience_call.changed",
    audienceCall: getPublicAudienceCallState(nextRoomState.audienceCall),
  });
  await clearPeerCohostActive(room, previousActive);
}

export async function handleRoomUpdated(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_room_update");
    return;
  }

  const nextRoomMeta = {
    title: sanitizeRoomTitle(payload.roomMeta?.title),
    stream: {
      relayUrl: sanitizeUrl(payload.roomMeta?.stream?.relayUrl),
      namespace: sanitizeNamespace(payload.roomMeta?.stream?.namespace),
      protocol: sanitizeStreamProtocol(payload.roomMeta?.stream?.protocol),
      webRtcUrl: sanitizeUrl(payload.roomMeta?.stream?.webRtcUrl),
    },
  };
  if (areRoomMetaEqual(room.roomState.roomMeta, nextRoomMeta)) {
    return;
  }

  const nextRoomState = {
    ...room.roomState,
    roomMeta: nextRoomMeta,
  };
  const persisted = await persistStorageOrNotify(
    room,
    ws,
    "roomState",
    nextRoomState,
  );
  if (!persisted) {
    return;
  }
  room.roomState = nextRoomState;
  room.broadcast({
    type: "room.updated",
    roomMeta: nextRoomMeta,
  });
}

export async function handleRoomLocationUpdated(room, ws, session, payload) {
  if (!session.isRoomOwner || !session.canControlBroadcast) {
    room.sendError(ws, "forbidden_room_location_update");
    return;
  }

  let nextLocation = normalizeRoomLocationInput(payload.location);
  if (nextLocation.enabled) {
    nextLocation = applyStoredRoomLocationResolution(
      nextLocation,
      room.roomState.location,
    );
    if (room.roomState.stream.isLive && !nextLocation.geocodingAttempted) {
      const resolvedAt = new Date().toISOString();
      nextLocation = {
        ...nextLocation,
        province: await reverseGeocodeProvince(
          nextLocation.latitude,
          nextLocation.longitude,
          room.env,
        ),
        provinceResolvedAt: resolvedAt,
        geocodingAttempted: true,
      };
    }
  }
  if (areRoomLocationsEqual(room.roomState.location, nextLocation)) {
    return;
  }

  const nextRoomState = {
    ...room.roomState,
    location: nextLocation,
  };
  const persisted = await persistStorageOrNotify(
    room,
    ws,
    "roomState",
    nextRoomState,
  );
  if (!persisted) {
    return;
  }
  room.roomState = nextRoomState;
  await writeUserLastLocation(room, session.user?.id, nextLocation);
  room.broadcast({
    type: "room.location.updated",
    location: getPublicRoomLocation(nextLocation),
  });
}

export async function writeUserLastLocation(room, userId, location) {
  if (!userId || !room.env?.APP_DB) {
    return;
  }

  const normalized = normalizeRoomLocation(location);
  const province = normalized.enabled
    ? sanitizeLocationProvince(normalized.province)
    : "";
  if (!normalized.enabled || !province) {
    return;
  }

  const updatedAt =
    sanitizeIsoTimestamp(normalized.provinceResolvedAt) ||
    sanitizeIsoTimestamp(normalized.updatedAt) ||
    new Date().toISOString();

  try {
    await room.env.APP_DB.prepare(
      `UPDATE moq_users
       SET last_location_province = ?, last_location_updated_at = ?
       WHERE id = ?`,
    )
      .bind(province || null, updatedAt, userId)
      .run();
  } catch (error) {
    console.warn(
      "Failed to persist user last location",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function writeRoomLastStartedAt(room, roomId, startedAt) {
  if (!roomId || !room.env?.APP_DB) {
    return;
  }

  const normalizedStartedAt =
    sanitizeIsoTimestamp(startedAt) || new Date().toISOString();
  try {
    await room.env.APP_DB.prepare(
      `UPDATE moq_rooms
       SET last_started_at = ?
       WHERE id = ?`,
    )
      .bind(normalizedStartedAt, roomId)
      .run();
  } catch (error) {
    console.warn(
      "Failed to persist room live start",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function handleLocationDistance(room, request) {
  const hostLocation = normalizeRoomLocation(room.roomState.location);
  if (!hostLocation.enabled) {
    return json(
      {
        ok: false,
        error: "Location unavailable",
        code: "location_unavailable",
      },
      { status: 404 },
    );
  }
  if (!room.roomState.stream.isLive) {
    return json(
      {
        ok: false,
        error: "Distance unavailable",
        code: "distance_unavailable",
      },
      { status: 409 },
    );
  }

  const payload = await request.json().catch(() => null);
  const viewerLatitude = sanitizeCoordinate(payload?.latitude, -90, 90);
  const viewerLongitude = sanitizeCoordinate(payload?.longitude, -180, 180);
  if (viewerLatitude === null || viewerLongitude === null) {
    return json(
      { ok: false, error: "Invalid location", code: "invalid_location" },
      { status: 400 },
    );
  }

  const distanceMeters = calculateDistanceMeters(
    {
      latitude: hostLocation.latitude,
      longitude: hostLocation.longitude,
    },
    {
      latitude: viewerLatitude,
      longitude: viewerLongitude,
    },
  );

  return json({
    ok: true,
    distanceMeters,
    distanceText: formatDistanceText(distanceMeters),
  });
}
