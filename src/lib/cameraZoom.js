export function readCameraZoom(track) {
  const settings = track?.getSettings?.() ?? {};
  const capabilities = track?.getCapabilities?.() ?? {};
  const zoomCapabilities = capabilities.zoom;
  if (!("zoom" in settings) || !zoomCapabilities || typeof zoomCapabilities !== "object") {
    return null;
  }

  const min = Number.isFinite(zoomCapabilities.min) ? zoomCapabilities.min : 1;
  const max = Number.isFinite(zoomCapabilities.max) ? zoomCapabilities.max : min;
  const step = Number.isFinite(zoomCapabilities.step) && zoomCapabilities.step > 0 ? zoomCapabilities.step : 0.1;
  const rawValue = Number.isFinite(settings.zoom) ? settings.zoom : min;
  const value = normalizeCameraZoom(rawValue, { min, max });

  return {
    supported: max > min,
    value,
    min,
    max,
    step,
  };
}

export function getPreviewVideoTrack(previewVideoRef) {
  const stream = previewVideoRef?.current?.srcObject;
  return stream?.getVideoTracks?.()[0] ?? null;
}

export function normalizeCameraZoom(value, zoom) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return null;
  }

  const min = Number.isFinite(zoom?.min) ? zoom.min : 1;
  const max = Number.isFinite(zoom?.max) ? zoom.max : min;
  return Math.min(max, Math.max(min, nextValue));
}

export async function applyCameraZoom(track, value) {
  const zoom = readCameraZoom(track);
  if (!zoom?.supported) {
    return null;
  }

  const normalizedValue = normalizeCameraZoom(value, zoom);
  if (!Number.isFinite(normalizedValue)) {
    return zoom;
  }

  const applyZoom = track?.applyConstraints?.({
    advanced: [{ zoom: normalizedValue }],
  });
  if (!applyZoom) {
    return readCameraZoom(track);
  }

  await applyZoom;
  return readCameraZoom(track);
}
