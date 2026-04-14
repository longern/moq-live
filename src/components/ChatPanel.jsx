import { useEffect, useRef } from "preact/hooks";

function getInitials(name) {
  const source = String(name || "").trim();
  if (!source) {
    return "聊";
  }

  return source.slice(0, 2).toUpperCase();
}

function getConnectionLabel(state) {
  if (state === "connected") {
    return "已连接";
  }
  if (state === "idle") {
    return "加载中";
  }
  if (state === "connecting") {
    return "连接中";
  }
  if (state === "reconnecting") {
    return "重连中";
  }
  if (state === "closed") {
    return "连接已断开";
  }
  return "未连接";
}

export function ChatPanel({
  room,
  authAvailable,
  authLoading,
  authUser,
  messages,
  draft,
  onDraftChange,
  onSend,
  onRequireLogin,
  connectionState,
  onlineCount,
  readOnly,
  chatError,
  variant = "default",
  title = "聊天室",
  emptyText = "还没有聊天消息，来发第一条。"
}) {
  const listRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const disabled = connectionState !== "connected" || readOnly;
  const canSend = !disabled && draft.trim().length > 0;
  const floating = variant === "floating";
  const showWelcomeMessage =
    connectionState === "connected" && messages.length === 0;
  const welcomeText = room
    ? `欢迎来到 ${room} 的直播间`
    : "欢迎来到直播间";

  return (
    <section class={`control-block chat-panel-block${floating ? " chat-panel-floating" : ""}`}>
      {!floating ? (
        <div class="control-head chat-panel-head">
          <div class="chat-panel-title-row">
            <h3>{title}</h3>
            <span class="chat-panel-online-count">{onlineCount} 在线</span>
          </div>
          <span class={`chat-connection-state is-${connectionState}`}>{getConnectionLabel(connectionState)}</span>
        </div>
      ) : null}

      <div ref={listRef} class="chat-message-list" aria-live="polite">
        {messages.length ? messages.map((message) => (
          <article key={message.id} class="chat-message-card">
            <div class="chat-avatar">
              {message.user?.avatarUrl ? (
                <img src={message.user.avatarUrl} alt={message.user?.displayName || "用户头像"} />
              ) : (
                <span>{getInitials(message.user?.displayName || message.user?.email)}</span>
              )}
            </div>
            <div class="chat-message-body">
              <p>
                <strong>{message.user?.displayName || message.user?.email || "匿名用户"}</strong>
                <span>{message.text}</span>
              </p>
            </div>
          </article>
        )) : null}

        {showWelcomeMessage ? (
          <article class="chat-message-card chat-message-card-system chat-message-card-system-no-avatar">
            <div class="chat-message-body chat-message-body-system">
              <p>
                <strong>系统</strong>
                <span>{welcomeText}</span>
              </p>
            </div>
          </article>
        ) : null}
      </div>

      {chatError ? <p class={`inline-warning${floating ? " chat-floating-warning" : ""}`}>{chatError}</p> : null}

      {!authUser ? (
        <div class={`chat-composer chat-composer-readonly${floating ? " chat-composer-floating" : ""}`}>
          <input
            value=""
            readOnly
            placeholder={authAvailable ? (authLoading ? "鉴权检查中" : "登录后参与聊天") : "登录服务未连接"}
            onClick={() => {
              if (authAvailable && !authLoading) {
                onRequireLogin();
              }
            }}
            onFocus={(event) => {
              event.currentTarget.blur();
              if (authAvailable && !authLoading) {
                onRequireLogin();
              }
            }}
          />
          <button type="button" class="secondary" onClick={onRequireLogin} disabled={!authAvailable || authLoading}>
            登录
          </button>
        </div>
      ) : (
        <form
          class={`chat-composer${floating ? " chat-composer-floating" : ""}`}
          onSubmit={(event) => {
            event.preventDefault();
            onSend();
          }}
        >
          <input
            value={draft}
            placeholder={disabled ? "聊天室连接中或当前只读" : "输入聊天内容"}
            maxLength={280}
            onInput={onDraftChange}
            disabled={disabled}
          />
          <button type="submit" disabled={!canSend}>{readOnly ? "只读" : "发送"}</button>
        </form>
      )}

    </section>
  );
}
