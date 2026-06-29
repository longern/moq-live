import { useEffect, useState } from "react";
import { SwipeableDrawer } from "../primitives/SwipeableDrawer.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { applyCameraZoom, getPreviewVideoTrack, normalizeCameraZoom, readCameraZoom } from "../../lib/cameraZoom.js";
import { CameraIcon, FlipCameraIcon, MicrophoneIcon } from "./liveIcons.jsx";

function LiveMediaIconButton({
  className = "",
  icon,
  label,
  ariaLabel,
  ariaDisabled,
  disabled = false,
  onClick,
}) {
  return (
    <button
      type="button"
      className={`live-media-icon-button${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-disabled={ariaDisabled}
      disabled={disabled}
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
  onToggleCamera,
  onToggleMicrophone,
  onUnavailableCamera,
}) {
  const { t } = useI18n();

  return (
    <SwipeableDrawer
      open={open}
      onClose={onClose}
      ariaLabel={t("live.closeMediaSettings")}
      className="live-mobile-drawer"
      panelClassName="live-mobile-media-panel"
    >
      <LiveMobileMediaSettingsContent
        cameraUnavailable={cameraUnavailable}
        cameraMode={cameraMode}
        cameraEnabled={cameraEnabled}
        microphoneEnabled={microphoneEnabled}
        previewVideoRef={previewVideoRef}
        onCycleCamera={onCycleCamera}
        onToggleCamera={onToggleCamera}
        onToggleMicrophone={onToggleMicrophone}
        onUnavailableCamera={onUnavailableCamera}
      />
    </SwipeableDrawer>
  );
}

export function LiveMobileMediaSettingsContent({
  cameraUnavailable,
  cameraMode,
  cameraEnabled,
  microphoneEnabled,
  previewVideoRef,
  onCycleCamera,
  onToggleCamera,
  onToggleMicrophone,
  onUnavailableCamera,
}) {
  const { t } = useI18n();
  const cameraLabel = cameraUnavailable
    ? t("live.cameraUnavailable")
    : cameraEnabled
      ? t("live.cameraOn")
      : t("live.cameraOff");
  const microphoneLabel = microphoneEnabled ? t("live.microphoneOn") : t("live.microphoneOff");

  function handleToggleCamera() {
    if (cameraUnavailable) {
      onUnavailableCamera?.();
      return;
    }

    onToggleCamera?.();
  }

  function handleFlipCamera() {
    if (cameraUnavailable) {
      onUnavailableCamera?.();
      return;
    }
    if (!cameraEnabled) {
      return;
    }

    onCycleCamera?.();
  }

  return (
    <>
      <div className="live-mobile-media-panel-head">
        <strong>{t("live.mediaSettings")}</strong>
      </div>
      <div className="live-mobile-media-toolbar">
        <div className="live-mobile-media-toolbar-left" role="group" aria-label={t("live.mediaQuickControls")}>
          <LiveMediaIconButton
            className={cameraUnavailable ? "is-unavailable" : ""}
            onClick={handleToggleCamera}
            aria-label={cameraUnavailable ? t("live.unavailableCamera") : (cameraEnabled ? t("live.closeCamera") : t("live.openCamera"))}
            aria-disabled={cameraUnavailable ? "true" : undefined}
            icon={<CameraIcon enabled={cameraEnabled} />}
            label={cameraLabel}
          />
          <LiveMediaIconButton
            className={cameraUnavailable || !cameraEnabled ? "is-unavailable" : ""}
            onClick={handleFlipCamera}
            aria-label={cameraUnavailable ? t("live.unavailableCamera") : t("live.flipCamera")}
            aria-disabled={cameraUnavailable || !cameraEnabled ? "true" : undefined}
            disabled={cameraUnavailable || !cameraEnabled}
            icon={<FlipCameraIcon />}
            label={t("live.flipCamera")}
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
    </>
  );
}
