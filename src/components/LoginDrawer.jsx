function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5.5L8.5 12 15 18.5" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="2" y="2" width="9" height="9" fill="#f25022" />
      <rect x="13" y="2" width="9" height="9" fill="#7fba00" />
      <rect x="2" y="13" width="9" height="9" fill="#00a4ef" />
      <rect x="13" y="13" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function LoginDrawer({ authAvailable, authLoading, onClose, onMicrosoftLogin }) {
  return (
    <>
      <button
        type="button"
        class="auth-panel-backdrop"
        aria-label="关闭登录页面"
        onClick={onClose}
      />
      <aside class="auth-panel auth-panel-login" aria-label="登录页面">
        <div class="login-panel-head">
          <button
            type="button"
            class="login-panel-close"
            aria-label="返回"
            onClick={onClose}
          >
            <BackIcon />
          </button>
          <strong>登录</strong>
          <span class="panel-head-spacer" aria-hidden="true" />
        </div>
        <div class="login-panel-body">
          <div class="login-panel-copy">
            <h2>登录账号</h2>
          </div>

          <button
            type="button"
            class="login-provider-button"
            onClick={onMicrosoftLogin}
            disabled={!authAvailable || authLoading}
          >
            <span class="login-provider-icon" aria-hidden="true">
              <MicrosoftIcon />
            </span>
            <span>{authLoading ? "鉴权检查中" : "继续登录"}</span>
          </button>

          {!authAvailable ? <p class="inline-warning">Auth API 未连接，当前环境无法完成登录。</p> : null}
        </div>
      </aside>
    </>
  );
}
