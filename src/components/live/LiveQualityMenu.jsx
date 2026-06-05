import { useState } from "react";
import { STREAM_PROTOCOL_WEBRTC } from "../../lib/streamProtocol.js";
import { LiveMenuItem, LiveMenuList } from "./LiveMenuList.jsx";
import { MenuChevronIcon } from "./liveIcons.jsx";

export function LiveQualityMenu({
  publishQualityOptions = [],
  publishQualityId,
  publishProtocolOptions = [],
  publishProtocol,
  webRtcPublishUrl = "",
  webRtcPlaybackUrl = "",
  onPublishQualityChange,
  onPublishProtocolChange,
  onWebRtcPublishUrlChange,
  onWebRtcPlaybackUrlChange,
  onAfterSelect,
}) {
  const [protocolEditorOpen, setProtocolEditorOpen] = useState(false);
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
            <span className="live-quality-panel-title">推流设置</span>
          </div>
          <div className="live-quality-section">
            <div className="live-quality-section-title">画质</div>
            <LiveMenuList className="live-quality-list" ariaLabel="直播画质">
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
            <div className="live-quality-section-title">推流协议</div>
            <LiveMenuList className="live-quality-list">
              <LiveMenuItem
                className="live-quality-protocol-entry"
                onClick={() => setProtocolEditorOpen(true)}
                aria-label="推流协议"
              >
                <span className="live-quality-option-label">推流协议</span>
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
              aria-label="返回推流设置"
            >
              <MenuChevronIcon />
            </button>
            <strong>推流协议</strong>
          </div>
          <LiveMenuList className="live-quality-list" ariaLabel="推流协议">
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
