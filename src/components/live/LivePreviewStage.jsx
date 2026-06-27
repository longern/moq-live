import { useEffect, useRef } from "react";
import { LoadingSpinner } from "../primitives/LoadingSpinner.jsx";
import { applyCameraZoom, getPreviewVideoTrack, normalizeCameraZoom, readCameraZoom } from "../../lib/cameraZoom.js";
import { STREAM_PROTOCOL_WEBRTC } from "../../lib/streamProtocol.js";
import { useI18n } from "../../i18n/I18nProvider.jsx";

function getTouchDistance(touches) {
  if (touches.length < 2) {
    return 0;
  }

  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export function LivePreviewStage({
  previewVideoRef,
  previewActive,
  previewHasVideo,
  previewPending = false,
  mediaMode = "video",
  cameraEnabled = true,
  mirrorPreview = false,
  cohostActive = null,
  cohostPlayerSession = null,
  cohostPlayerMuted = true,
  cohostPlayerRef,
  cohostPlayerStatus = "",
}) {
  const { t } = useI18n();
  const hostRef = useRef(null);
  const pinchRef = useRef(null);
  const applyFrameRef = useRef(0);
  const applyInFlightRef = useRef(false);
  const pendingZoomRef = useRef(null);
  const pendingTrackRef = useRef(null);
  const showPending = mediaMode === "video" && previewPending && !previewHasVideo;
  const showCameraOffBlackout = mediaMode === "video" && !cameraEnabled;
  const placeholderText = !previewActive
    ? (mediaMode === "voice" ? t("live.voiceLive") : t("live.openCameraPreview"))
    : mediaMode === "voice"
      ? t("live.voiceLive")
      : t("live.noCameraDetected");
  const cohostPeerLabel =
    cohostActive?.peer?.displayName
    || cohostActive?.peer?.handle
    || t("common.user");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mediaMode !== "video" || !previewActive || !previewHasVideo) {
      return undefined;
    }

    function cancelScheduledApply() {
      if (applyFrameRef.current) {
        window.cancelAnimationFrame(applyFrameRef.current);
        applyFrameRef.current = 0;
      }
    }

    function requestZoomApply() {
      if (applyFrameRef.current || applyInFlightRef.current) {
        return;
      }

      applyFrameRef.current = window.requestAnimationFrame(async () => {
        applyFrameRef.current = 0;
        const pendingTrack = pendingTrackRef.current;
        const pendingZoom = pendingZoomRef.current;
        pendingTrackRef.current = null;
        pendingZoomRef.current = null;
        if (!pendingTrack || !Number.isFinite(pendingZoom)) {
          return;
        }

        applyInFlightRef.current = true;
        try {
          await applyCameraZoom(pendingTrack, pendingZoom);
        } catch {
          // Ignore transient device constraint failures; the next gesture frame can retry.
        } finally {
          applyInFlightRef.current = false;
          if (pendingTrackRef.current && Number.isFinite(pendingZoomRef.current)) {
            requestZoomApply();
          }
        }
      });
    }

    function scheduleZoomApply(track, value) {
      pendingTrackRef.current = track;
      pendingZoomRef.current = value;
      requestZoomApply();
    }

    function handleTouchStart(event) {
      if (event.touches.length !== 2) {
        pinchRef.current = null;
        return;
      }

      const track = getPreviewVideoTrack(previewVideoRef);
      const zoom = readCameraZoom(track);
      if (!zoom?.supported) {
        pinchRef.current = null;
        return;
      }

      const distance = getTouchDistance(event.touches);
      if (!distance) {
        pinchRef.current = null;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pinchRef.current = {
        distance,
        value: zoom.value,
        min: zoom.min,
        max: zoom.max,
        track,
      };
    }

    function handleTouchMove(event) {
      const pinch = pinchRef.current;
      if (!pinch || event.touches.length !== 2) {
        return;
      }

      const distance = getTouchDistance(event.touches);
      if (!distance) {
        return;
      }

      const nextZoom = normalizeCameraZoom((distance / pinch.distance) * pinch.value, pinch);
      if (!Number.isFinite(nextZoom)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      scheduleZoomApply(pinch.track, nextZoom);
    }

    function handleTouchEnd(event) {
      if (event.touches.length < 2) {
        pinchRef.current = null;
      }
    }

    host.addEventListener("touchstart", handleTouchStart, { passive: false });
    host.addEventListener("touchmove", handleTouchMove, { passive: false });
    host.addEventListener("touchend", handleTouchEnd);
    host.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      host.removeEventListener("touchstart", handleTouchStart);
      host.removeEventListener("touchmove", handleTouchMove);
      host.removeEventListener("touchend", handleTouchEnd);
      host.removeEventListener("touchcancel", handleTouchEnd);
      cancelScheduledApply();
      pinchRef.current = null;
    };
  }, [mediaMode, previewActive, previewHasVideo, previewVideoRef]);

  return (
    <div className="publisher-host" id="publisherHost" ref={hostRef}>
      <video
        ref={previewVideoRef}
        className={`publisher-preview${mirrorPreview ? " is-mirrored" : ""}`}
        id="publisherPreview"
        autoPlay
        playsInline
        muted
        hidden={!previewActive || !previewHasVideo}
      />
      {!previewActive || !previewHasVideo ? (
        <div className="publisher-placeholder">
          {showCameraOffBlackout ? null : showPending ? (
            <LoadingSpinner className="publisher-preview-spinner" label={t("live.openingCamera")} />
          ) : (
            <p>{placeholderText}</p>
          )}
        </div>
      ) : null}
      {cohostActive ? (
        <div className="publisher-cohost-preview">
          <div className="publisher-cohost-media">
            {cohostPlayerSession ? (
              cohostPlayerSession.protocol === STREAM_PROTOCOL_WEBRTC ? (
                <video
                  ref={cohostPlayerRef}
                  className="publisher-cohost-video"
                  autoPlay
                  playsInline
                  muted={cohostPlayerMuted}
                  aria-label={`${cohostPeerLabel} ${t("live.cohostVideo")}`}
                />
              ) : (
                <canvas
                  ref={cohostPlayerRef}
                  className="publisher-cohost-video"
                  width="1280"
                  height="720"
                  aria-label={`${cohostPeerLabel} ${t("live.cohostVideo")}`}
                />
              )
            ) : (
              <div className="publisher-cohost-placeholder">
                <LoadingSpinner className="publisher-preview-spinner" />
                <span>{cohostPlayerStatus || t("live.cohostLoading")}</span>
              </div>
            )}
            <span className="publisher-cohost-label">{cohostPeerLabel}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
