import { useEffect, useState } from "react";
import { SwipeableDrawer } from "../primitives/SwipeableDrawer.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { applyCameraZoom, getPreviewVideoTrack, normalizeCameraZoom, readCameraZoom } from "../../lib/cameraZoom.js";
import { FlipCameraIcon, MicrophoneIcon } from "./liveIcons.jsx";

function getCameraStatusLabel(t, cameraMode, cameraUnavailable) {
  if (cameraUnavailable) {
    return t("live.cameraUnavailable");
  }

  if (cameraMode === "rear") {
    return t("live.cameraRear");
  }

  return t("live.cameraFront");
}

function LiveMediaIconButton({
  className = "",
  icon,
  label,
  ariaLabel,
  ariaDisabled,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`live-media-icon-button${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-disabled={ariaDisabled}
    >
      <span className="live-media-icon-button-symbol">
        {icon}
      </span>
      <span className="live-media-icon-button-label">{label}</span>
    </button>
  );
}

function CameraZoomControl({ previewVideoRef, cameraEnabled, cameraMode }) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(null);
  const supported = Boolean(zoom?.supported);
  const value = Number.isFinite(zoom?.value) ? zoom.value : 1;
  const min = Number.isFinite(zoom?.min) ? zoom.min : 1;
  const max = Number.isFinite(zoom?.max) ? zoom.max : 1;
  const step = Number.isFinite(zoom?.step) && zoom.step > 0 ? zoom.step : 0.1;
  const valueLabel = supported ? `${value.toFixed(1)}x` : t("live.zoomUnsupported");

  useEffect(() => {
    setZoom(readCameraZoom(getPreviewVideoTrack(previewVideoRef)));
  }, [cameraEnabled, cameraMode, previewVideoRef]);

  function handleChange(nextRawValue) {
    const nextValue = Number(nextRawValue);
    if (!Number.isFinite(nextValue)) {
      return;
    }

    const normalizedValue = normalizeCameraZoom(nextValue, zoom);
    if (!Number.isFinite(normalizedValue)) {
      return;
    }
    setZoom((current) => ({ ...current, value: normalizedValue }));

    const track = getPreviewVideoTrack(previewVideoRef);
    void applyCameraZoom(track, normalizedValue)
      .then((nextZoom) => {
        setZoom(nextZoom ?? readCameraZoom(track));
      })
      .catch(() => {
        setZoom(readCameraZoom(track));
      });
  }

  return (
    <label className={`live-media-zoom-control${supported ? "" : " is-disabled"}`}>
      <span className="live-media-zoom-head">
        <span>{t("live.zoom")}</span>
        <span>{valueLabel}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={!supported}
        onChange={(event) => handleChange(event.currentTarget.value)}
        aria-label={t("live.cameraZoom")}
      />
    </label>
  );
}

export function LiveMobileMediaSettingsPanel({
  open,
  onClose,
  cameraUnavailable,
  cameraMode,
  cameraEnabled,
  microphoneEnabled,
  previewVideoRef,
  onCycleCamera,
  onToggleMicrophone,
  onUnavailableCamera,
}) {
  const { t } = useI18n();
  const cameraLabel = getCameraStatusLabel(t, cameraMode, cameraUnavailable);
  const microphoneLabel = microphoneEnabled ? t("live.microphoneOn") : t("live.microphoneOff");

  function handleCameraAction() {
    if (cameraUnavailable) {
      onUnavailableCamera?.();
      return;
    }

    onCycleCamera?.();
  }

  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel={t("live.closeMediaSettings")}
      className="live-mobile-drawer"
      panelClassName="live-mobile-media-panel"
    >
      <div className="live-mobile-media-panel-head">
        <strong>{t("live.mediaSettings")}</strong>
      </div>
      <div className="live-mobile-media-toolbar">
        <div className="live-mobile-media-toolbar-left" role="group" aria-label={t("live.mediaQuickControls")}>
          <LiveMediaIconButton
            className={cameraUnavailable ? "is-unavailable" : ""}
            onClick={handleCameraAction}
            aria-label={cameraUnavailable ? t("live.unavailableCamera") : t("live.flipCameraAria", { mode: cameraMode })}
            aria-disabled={cameraUnavailable ? "true" : undefined}
            icon={<FlipCameraIcon />}
            label={cameraLabel}
          />
          <LiveMediaIconButton
            className={microphoneEnabled ? "" : "is-muted"}
            onClick={onToggleMicrophone}
            aria-label={microphoneEnabled ? t("live.closeMicrophone") : t("live.openMicrophone")}
            icon={<MicrophoneIcon enabled={microphoneEnabled} />}
            label={microphoneLabel}
          />
        </div>
        <CameraZoomControl
          previewVideoRef={previewVideoRef}
          cameraEnabled={cameraEnabled}
          cameraMode={cameraMode}
        />
      </div>
    </SwipeableDrawer>
  );
}
