export const DEFAULT_MEDIA_ORIENTATION = "landscape";
const MEDIA_ORIENTATION_PORTRAIT = "portrait";

export function getMediaOrientation({ width, height }) {
  return height > width ? MEDIA_ORIENTATION_PORTRAIT : DEFAULT_MEDIA_ORIENTATION;
}

export function isPortraitMedia(mediaOrientation) {
  return mediaOrientation === MEDIA_ORIENTATION_PORTRAIT;
}

export function shouldUsePortraitImmersiveMode({
  mediaOrientation,
  portraitViewport,
}) {
  return Boolean(portraitViewport && isPortraitMedia(mediaOrientation));
}

export function hasRenderableMediaSize(size) {
  return Boolean(size?.width && size?.height);
}

export function getMediaElementSize(
  mediaEl,
  { includeTrackSettings = true, includeClientSize = true } = {},
) {
  if (!mediaEl) {
    return { width: 0, height: 0 };
  }

  if (mediaEl instanceof HTMLCanvasElement) {
    return {
      width: mediaEl.width,
      height: mediaEl.height,
    };
  }

  const stream = mediaEl.srcObject;
  const track =
    includeTrackSettings && typeof stream?.getVideoTracks === "function"
      ? stream.getVideoTracks()[0]
      : null;
  const settings = track?.getSettings?.() ?? {};

  return {
    width:
      mediaEl.videoWidth ||
      settings.width ||
      (includeClientSize ? mediaEl.clientWidth : 0),
    height:
      mediaEl.videoHeight ||
      settings.height ||
      (includeClientSize ? mediaEl.clientHeight : 0),
  };
}
