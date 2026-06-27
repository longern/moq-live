import { useState } from "react";
import { STREAM_PROTOCOL_MOQ, STREAM_PROTOCOL_WEBRTC } from "../../lib/streamProtocol.js";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { LiveMenuItem, LiveMenuList } from "./LiveMenuList.jsx";
import { MenuChevronIcon } from "./liveIcons.jsx";

const MOQ_RELAY_ENDPOINT_PLACEHOLDER = "draft-14.cloudflare.mediaoverquic.com";

export function LiveQualityMenu({
  publishQualityOptions = [],
  publishQualityId,
  publishProtocolOptions = [],
  publishProtocol,
  relayUrl = "",
  webRtcPublishUrl = "",
  webRtcPlaybackUrl = "",
  onPublishQualityChange,
  onPublishProtocolChange,
  onRelayUrlChange,
  onWebRtcPublishUrlChange,
  onWebRtcPlaybackUrlChange,
  onAfterSelect,
}) {
  const { t } = useI18n();
  const [protocolEditorOpen, setProtocolEditorOpen] = useState(false);
  const showMoqRelayUrl = publishProtocol === STREAM_PROTOCOL_MOQ;
  const showWebRtcUrls = publishProtocol === STREAM_PROTOCOL_WEBRTC;

  function handleQualitySelect(optionId) {
    onPublishQualityChange?.(optionId);
    onAfterSelect?.();
  }

  function handleProtocolSelect(protocolId) {
    onPublishProtocolChange?.(protocolId);
  }

  return (
    <div className={`live-quality-menu-shell${protocolEditorOpen ? " is-editing" : ""}`}>
      <div className="live-quality-menu-track">
        <div className="live-quality-menu-screen">
          <div className="live-quality-panel-head">
            <span className="live-quality-panel-title">{t("live.publishSettings")}</span>
          </div>
          <div className="live-quality-section">
            <div className="live-quality-section-title">{t("live.streamQuality")}</div>
            <LiveMenuList className="live-quality-list" ariaLabel={t("live.streamQualityAria")}>
              {publishQualityOptions.map((option) => (
                <LiveMenuItem
                  key={option.id}
                  className="live-quality-option"
                  active={publishQualityId === option.id}
                  onClick={() => handleQualitySelect(option.id)}
                  aria-pressed={publishQualityId === option.id}
                >
                  <span>
                    <span className="live-quality-option-label">{option.label}</span>
                    <small>{option.detail}</small>
                  </span>
                  <span className="live-quality-check" aria-hidden="true">
                    {publishQualityId === option.id ? "✓" : ""}
                  </span>
                </LiveMenuItem>
              ))}
            </LiveMenuList>
          </div>
          <div className="live-quality-section">
            <div className="live-quality-section-title">{t("live.streamProtocol")}</div>
            <LiveMenuList className="live-quality-list">
              <LiveMenuItem
                className="live-quality-protocol-entry"
                onClick={() => setProtocolEditorOpen(true)}
                aria-label={t("live.streamProtocol")}
              >
                <span className="live-quality-option-label">{t("live.streamProtocol")}</span>
                <MenuChevronIcon />
              </LiveMenuItem>
            </LiveMenuList>
          </div>
        </div>

        <div className="live-quality-menu-screen live-more-editor-screen">
          <div className="live-more-editor-head">
            <button
              type="button"
              className="live-more-editor-back"
              onClick={() => setProtocolEditorOpen(false)}
              aria-label={t("live.backToPublishSettings")}
            >
              <MenuChevronIcon />
            </button>
            <strong>{t("live.streamProtocol")}</strong>
          </div>
          <LiveMenuList className="live-quality-list" ariaLabel={t("live.streamProtocol")}>
            {publishProtocolOptions.map((option) => (
              <LiveMenuItem
                key={option.id}
                className="live-quality-option"
                active={publishProtocol === option.id}
                onClick={() => handleProtocolSelect(option.id)}
                aria-pressed={publishProtocol === option.id}
              >
                <span>
                  <span className="live-quality-option-label">{option.label}</span>
                </span>
                <span className="live-quality-check" aria-hidden="true">
                  {publishProtocol === option.id ? "✓" : ""}
                </span>
              </LiveMenuItem>
            ))}
          </LiveMenuList>
          {showMoqRelayUrl ? (
            <div className="live-quality-url-fields">
              <label className="live-more-title-field live-quality-url-field">
                <span>{t("live.relayEndpoint")}</span>
                <input
                  type="url"
                  value={relayUrl}
                  placeholder={MOQ_RELAY_ENDPOINT_PLACEHOLDER}
                  onChange={(event) => onRelayUrlChange?.(event.currentTarget.value)}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
            </div>
          ) : null}
          {showWebRtcUrls ? (
            <div className="live-quality-url-fields">
              <label className="live-more-title-field live-quality-url-field">
                <span>WHIP URL</span>
                <input
                  type="url"
                  value={webRtcPublishUrl}
                  onChange={(event) => onWebRtcPublishUrlChange?.(event.currentTarget.value)}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              <label className="live-more-title-field live-quality-url-field">
                <span>WHEP URL</span>
                <input
                  type="url"
                  value={webRtcPlaybackUrl}
                  onChange={(event) => onWebRtcPlaybackUrlChange?.(event.currentTarget.value)}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
