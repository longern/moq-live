import { useEffect, useRef } from "preact/hooks";
import { UserAvatar } from "./UserAvatar.jsx";

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

function getComposerState({ authAvailable, authLoading, authUser, connectionState, draft, readOnly }) {
  if (!authUser) {
    return {
      mode: "guest",
      inputDisabled: true,
      inputPlaceholder: authLoading ? "加载中" : authAvailable ? "登录后参与聊天" : "登录服务未连接",
      buttonDisabled: !authAvailable || authLoading,
      buttonDisabledReason: !authAvailable || authLoading ? "blocked" : "guest",
      buttonLabel: "登录"
    };
  }

  const isLoading = connectionState !== "connected";
  const isBlocked = readOnly;
  const canInteract = !isLoading && !isBlocked;
  const hasDraft = draft.trim().length > 0;

  return {
    mode: "member",
    inputDisabled: !canInteract,
    inputPlaceholder: isLoading ? "加载中" : isBlocked ? "不可发送消息" : "输入聊天内容",
    buttonDisabled: !canInteract || !hasDraft,
    buttonDisabledReason: !canInteract ? "blocked" : !hasDraft ? "empty" : "ready",
    buttonLabel: "发送"
  };
}

export function ChatPanel({
  roomLabel = "",
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
  className = "",
  title = "聊天室",
  showComposer = true,
  showWelcome = true,
}) {
  const listRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const composerState = getComposerState({
    authAvailable,
    authLoading,
    authUser,
    connectionState,
    draft,
    readOnly
  });
  const floating = variant === "floating";
  const panelClassName = [
    "chat-panel-block",
    floating ? "chat-panel-floating" : "control-block",
    className
  ].filter(Boolean).join(" ");
  const showWelcomeMessage =
    showWelcome && connectionState === "connected" && messages.length === 0;
  const welcomeText = roomLabel
    ? `欢迎来到 ${roomLabel} 的直播间`
    : "欢迎来到直播间";

  return (
    <section class={panelClassName}>
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
            <UserAvatar
              avatarUrl={message.user?.avatarUrl}
              displayName={message.user?.displayName}
              email={message.user?.email}
              className="chat-avatar"
              imgAlt={message.user?.displayName || "用户头像"}
              initialsLength={2}
              placeholderClassName="is-placeholder"
            />
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

      {showComposer ? (
        composerState.mode === "guest" ? (
          <div class={`chat-composer chat-composer-readonly${floating ? " chat-composer-floating" : ""}`}>
            <input
              value=""
              readOnly
              placeholder={composerState.inputPlaceholder}
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
            <button
              type="button"
              class="secondary"
              onClick={onRequireLogin}
              disabled={composerState.buttonDisabled}
              data-disabled-reason={composerState.buttonDisabledReason}
            >
              {composerState.buttonLabel}
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
              placeholder={composerState.inputPlaceholder}
              maxLength={280}
              onInput={onDraftChange}
              disabled={composerState.inputDisabled}
            />
            <button
              type="submit"
              disabled={composerState.buttonDisabled}
              data-disabled-reason={composerState.buttonDisabledReason}
            >
              {composerState.buttonLabel}
            </button>
          </form>
        )
      ) : null}

    </section>
  );
}
