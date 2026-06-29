import { useEffect, useRef } from "react";
import { LoadingSpinner } from "../primitives/LoadingSpinner.jsx";
import { applyCameraZoom, getPreviewVideoTrack, normalizeCameraZoom, readCameraZoom } from "../../lib/cameraZoom.js";
import { getCohostLayoutGuide, getCohostTilePlacementStyle } from "../../lib/cohostLayout.js";
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
  previewOrientation = "landscape",
  portraitViewport = false,
  cohostActive = null,
  cohostPlayers = [],
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
  const activeCohostPlayers = cohostPlayers.length
    ? cohostPlayers
    : (Array.isArray(cohostActive) ? cohostActive : (cohostActive ? [{ active: cohostActive }] : []));
  const cohostLayoutActive = activeCohostPlayers.length > 0;
  const layoutGuide = getCohostLayoutGuide({
    participantCount: 1 + activeCohostPlayers.length,
    portraitViewport,
    orientations: [
      previewOrientation,
      ...activeCohostPlayers.map((item) => item.playerOrientation),
    ],
    baseClassName: "publisher-cohost-layout",
  });
  const hostClassName = `publisher-host${cohostLayoutActive ? ` is-cohost-layout ${layoutGuide.className}` : ""}`;
  const hostStyle = cohostLayoutActive
    ? {
      "--cohost-layout-columns": layoutGuide.columns,
      "--cohost-layout-rows": layoutGuide.rows,
    }
    : undefined;
  const hostTileClassName =
    previewOrientation === "portrait"
      ? "publisher-tile is-host-tile is-media-portrait"
      : "publisher-tile is-host-tile is-media-landscape";

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
    <div className={hostClassName} id="publisherHost" ref={hostRef} style={hostStyle}>
      <div className={hostTileClassName} style={getCohostTilePlacementStyle(layoutGuide.placements[0])}>
        <div className="publisher-tile-media">
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
        </div>
      </div>
      {activeCohostPlayers.length ? (
        <>
          {activeCohostPlayers.map((item, index) => {
            const active = item.active || item;
            const peerLabel =
              active?.peer?.displayName
              || active?.peer?.handle
              || t("common.user");
            const previewClassName =
              item.playerOrientation === "portrait"
                ? "publisher-tile publisher-cohost-preview is-media-portrait"
                : "publisher-tile publisher-cohost-preview is-media-landscape";
            return (
              <div
                className={previewClassName}
                key={active?.id || active?.peerRoomId}
                style={getCohostTilePlacementStyle(layoutGuide.placements[index + 1])}
              >
                <div className="publisher-cohost-boundary">
                  <div className="publisher-cohost-media">
                    {item.playerSession ? (
                      item.playerSession.protocol === STREAM_PROTOCOL_WEBRTC ? (
                        <video
                          ref={item.playerRef}
                          className="publisher-cohost-video"
                          autoPlay
                          playsInline
                          muted={item.playerMuted}
                          aria-label={`${peerLabel} ${t("live.cohostVideo")}`}
                        />
                      ) : (
                        <canvas
                          ref={item.playerRef}
                          className="publisher-cohost-video"
                          width="1280"
                          height="720"
                          aria-label={`${peerLabel} ${t("live.cohostVideo")}`}
                        />
                      )
                    ) : (
                      <div className="publisher-cohost-placeholder">
                        <LoadingSpinner className="publisher-preview-spinner" />
                        <span>{item.playerStatus || t("live.cohostLoading")}</span>
                      </div>
                    )}
                  </div>
                  <span className="publisher-cohost-label">{peerLabel}</span>
                </div>
              </div>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
