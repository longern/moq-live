export function LoginPromptModal({
  open,
  authAvailable,
  authLoading,
  onClose,
  onLogin
}) {
  if (!open) {
    return null;
  }

  return (
    <div class="modal-layer" role="dialog" aria-modal="true" aria-labelledby="loginPromptTitle">
      <button type="button" class="modal-backdrop" aria-label="关闭登录弹框" onClick={onClose} />
      <section class="modal-card login-modal-card">
        <div class="login-modal-head">
          <h3 id="loginPromptTitle">登录后发言</h3>
          <p>当前聊天室支持游客只读。登录后可发送评论，并显示你的昵称与头像。</p>
        </div>
        {authAvailable ? (
          <div class="login-modal-actions">
            <button type="button" onClick={onLogin} disabled={authLoading}>
              {authLoading ? "鉴权检查中" : "使用 Microsoft 登录"}
            </button>
            <button type="button" class="secondary" onClick={onClose}>
              先看看
            </button>
          </div>
        ) : (
          <div class="login-modal-actions">
            <p class="inline-warning">登录服务当前未连接，暂时只能只读浏览聊天。</p>
            <button type="button" class="secondary" onClick={onClose}>
              关闭
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
