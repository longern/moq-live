export function SettingsPage({
  hidden,
  relayUrl,
  relayHost,
  buildLabel,
  authAvailable,
  authLoading,
  authUser,
  onMicrosoftLogin,
  onLogout,
  onRelayUrlInput,
  logText,
  logRef
}) {
  return (
    <section class="page" data-page="settings" hidden={hidden}>
      <div class="page-grid settings-layout">
        <div class="settings-stack">
          <article class="card stack">
            <h2>账户</h2>
            <div class="summary-item">
              <strong>当前状态</strong>
              <span>
                {!authAvailable
                  ? "Auth API 未连接"
                  : authUser
                    ? `${authUser.displayName || authUser.email || "已登录"}${authUser.email ? ` · ${authUser.email}` : ""}`
                    : "未登录"}
              </span>
            </div>
            <div class="action-row">
              {authUser ? (
                <button type="button" class="secondary" onClick={onLogout}>退出登录</button>
              ) : (
                <button type="button" onClick={onMicrosoftLogin} disabled={!authAvailable || authLoading}>
                  {authLoading ? "鉴权检查中" : "使用微软账户登录"}
                </button>
              )}
            </div>
          </article>

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
