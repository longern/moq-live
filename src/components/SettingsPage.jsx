export function SettingsPage({ hidden, relayUrl, relayHost, buildLabel, onRelayUrlInput, logText, logRef }) {
  return (
    <section class="page" data-page="settings" hidden={hidden}>
      <div class="page-grid settings-layout">
        <div class="settings-stack">
          <article class="card stack">
            <h2>设置</h2>
            <label>
              Relay Endpoint
              <input id="url" value={relayUrl} onInput={onRelayUrlInput} />
            </label>
            <div class="summary-item">
              <strong>当前 Host</strong>
              <span data-relay-host>{relayHost}</span>
            </div>
            <div class="summary-item">
              <strong>Build</strong>
              <span id="buildSubtitle">{buildLabel}</span>
            </div>
          </article>

          <article class="card stack">
            <h3>开发日志</h3>
            <pre id="log" ref={logRef}>{logText}</pre>
          </article>
        </div>
      </div>
    </section>
  );
}
