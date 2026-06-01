import { ChevronLeft } from "lucide-react";

function BackIcon() {
  return <ChevronLeft aria-hidden="true" />;
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

export function LoginDrawer({
  authAvailable,
  authLoading,
  onClose,
  onMicrosoftLogin,
  transitionClassName = ""
}) {
  const transitionSuffix = transitionClassName ? ` ${transitionClassName}` : "";

  return (
    <>
      <button
        type="button"
        className={`auth-panel-backdrop${transitionSuffix}`}
        aria-label="关闭登录页面"
        onClick={onClose}
      />
      <aside className={`auth-panel auth-panel-login${transitionSuffix}`} aria-label="登录页面">
        <div className="login-panel-head">
          <button
            type="button"
            className="login-panel-close"
            aria-label="返回"
            onClick={onClose}
          >
            <BackIcon />
          </button>
          <strong>登录</strong>
          <span className="panel-head-spacer" aria-hidden="true" />
        </div>
        <div className="login-panel-body">
          <div className="login-panel-copy">
            <h2>登录账号</h2>
          </div>

          <button
            type="button"
            className="login-provider-button"
            onClick={onMicrosoftLogin}
            disabled={!authAvailable || authLoading}
          >
            <span className="login-provider-icon" aria-hidden="true">
              <MicrosoftIcon />
            </span>
            <span>{authLoading ? "鉴权检查中" : "继续登录"}</span>
          </button>

          {!authAvailable ? <p className="inline-warning">Auth API 未连接，当前环境无法完成登录。</p> : null}
        </div>
      </aside>
    </>
  );
}
