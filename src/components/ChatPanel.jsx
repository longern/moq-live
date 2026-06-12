import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Copy, RotateCcw } from "lucide-react";
import { LoadingSpinner } from "./LoadingSpinner.jsx";
import { UserAvatar } from "./UserAvatar.jsx";

const CHAT_MESSAGE_MENU_MARGIN = 8;
const CHAT_MESSAGE_MENU_TOUCH_GAP = 10;
const CHAT_MESSAGE_MENU_EXIT_MS = 120;

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

function getComposerState({
  authAvailable,
  authLoading,
  authUser,
  chatRecovering,
  connectionState,
  draft,
  readOnly,
}) {
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

  const isLoading = chatRecovering || connectionState !== "connected";
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

function isCoarsePointer() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
}

function getMeasuredContextMenuPosition(anchorLeft, anchorTop, menuNode, placement) {
  const rect = menuNode.getBoundingClientRect();
  const maxLeft = Math.max(
    CHAT_MESSAGE_MENU_MARGIN,
    window.innerWidth - rect.width - CHAT_MESSAGE_MENU_MARGIN
  );
  const maxTop = Math.max(
    CHAT_MESSAGE_MENU_MARGIN,
    window.innerHeight - rect.height - CHAT_MESSAGE_MENU_MARGIN
  );
  const preferredLeft = placement === "above-point"
    ? anchorLeft - rect.width / 2
    : anchorLeft;
  const preferredTop = placement === "above-point"
    ? anchorTop - rect.height - CHAT_MESSAGE_MENU_TOUCH_GAP
    : anchorTop;

  return {
    left: Math.max(CHAT_MESSAGE_MENU_MARGIN, Math.min(preferredLeft, maxLeft)),
    top: Math.max(CHAT_MESSAGE_MENU_MARGIN, Math.min(preferredTop, maxTop)),
  };
}

function ChatMessageContextMenu({
  canRetract,
  closing,
  left,
  menuRef,
  onClose,
  onCopy,
  onRetract,
  open,
  positioned,
  top,
}) {
  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={`chat-message-context-backdrop${closing ? " is-closing" : ""}`}
        aria-label="关闭评论操作菜单"
        onClick={onClose}
      />
      <div
        ref={menuRef}
        className={[
          "chat-message-context-menu",
          closing ? "is-closing" : "",
          positioned ? "" : "is-measuring",
        ].filter(Boolean).join(" ")}
        role="menu"
        style={{ left: `${left}px`, top: `${top}px` }}
      >
        <button
          type="button"
          className="chat-message-context-action"
          role="menuitem"
          onClick={onCopy}
        >
          <span className="chat-message-context-icon">
            <Copy aria-hidden="true" />
          </span>
          <span>复制</span>
        </button>
        {canRetract ? (
          <button
            type="button"
            className="chat-message-context-action"
            role="menuitem"
            onClick={onRetract}
          >
            <span className="chat-message-context-icon">
              <RotateCcw aria-hidden="true" />
            </span>
            <span>撤回</span>
          </button>
        ) : null}
      </div>
    </>
  );
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
  chatRecovering = false,
  canRetractMessages = false,
  variant = "default",
  className = "",
  title = "聊天室",
  welcomeMessage = "",
  showComposer = true,
  showWelcome = true,
  onRetractMessage,
}) {
  const composerInputId = useId();
  const listRef = useRef(null);
  const contextMenuRef = useRef(null);
  const contextMenuCloseTimerRef = useRef(null);
  const lastPointerRef = useRef({
    clientX: 0,
    clientY: 0,
    pointerType: "",
    time: 0,
  });
  const [contextMenu, setContextMenu] = useState({
    open: false,
    closing: false,
    positioned: false,
    anchorLeft: 0,
    anchorTop: 0,
    placement: "at-point",
    left: 0,
    top: 0,
    message: null,
  });

  function clearContextMenuCloseTimer() {
    if (contextMenuCloseTimerRef.current) {
      window.clearTimeout(contextMenuCloseTimerRef.current);
      contextMenuCloseTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!contextMenu.open) {
      return undefined;
    }

    function closeMenu() {
      closeMessageMenu();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu.open]);

  useLayoutEffect(() => {
    if (!contextMenu.open || contextMenu.closing || !contextMenuRef.current) {
      return;
    }

    const position = getMeasuredContextMenuPosition(
      contextMenu.anchorLeft,
      contextMenu.anchorTop,
      contextMenuRef.current,
      contextMenu.placement
    );

    setContextMenu((current) => {
      if (!current.open || current.closing) {
        return current;
      }
      if (
        current.positioned
        && current.left === position.left
        && current.top === position.top
      ) {
        return current;
      }
      return {
        ...current,
        left: position.left,
        top: position.top,
        positioned: true,
      };
    });
  }, [
    canRetractMessages,
    contextMenu.anchorLeft,
    contextMenu.anchorTop,
    contextMenu.closing,
    contextMenu.open,
    contextMenu.placement,
  ]);

  useEffect(() => () => {
    clearContextMenuCloseTimer();
  }, []);

  function rememberMessagePointer(event) {
    lastPointerRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType || "",
      time: performance.now(),
    };
  }

  function isRecentTouchPointer(event) {
    const pointer = lastPointerRef.current;
    if (pointer.pointerType !== "touch" && pointer.pointerType !== "pen") {
      return false;
    }
    if (performance.now() - pointer.time > 900) {
      return false;
    }
    return Math.abs(pointer.clientX - event.clientX) <= 24
      && Math.abs(pointer.clientY - event.clientY) <= 24;
  }

  function openMessageMenu(event, message, { placement } = {}) {
    event.preventDefault();
    event.stopPropagation();
    const resolvedPlacement = placement
      || (isRecentTouchPointer(event) ? "above-point" : "at-point");
    clearContextMenuCloseTimer();
    setContextMenu({
      open: true,
      closing: false,
      positioned: false,
      anchorLeft: event.clientX,
      anchorTop: event.clientY,
      placement: resolvedPlacement,
      left: event.clientX,
      top: event.clientY,
      message,
    });
  }

  function closeMessageMenu() {
    setContextMenu((current) => {
      if (!current.open || current.closing) {
        return current;
      }
      return { ...current, closing: true };
    });
    clearContextMenuCloseTimer();
    contextMenuCloseTimerRef.current = window.setTimeout(() => {
      contextMenuCloseTimerRef.current = null;
      setContextMenu((current) => {
        if (!current.closing) {
          return current;
        }
        return {
          ...current,
          open: false,
          closing: false,
          positioned: false,
          message: null,
        };
      });
    }, CHAT_MESSAGE_MENU_EXIT_MS);
  }

  async function copyContextMessage() {
    const text = String(contextMenu.message?.text || "");
    if (!text) {
      closeMessageMenu();
      return;
    }

    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    } finally {
      closeMessageMenu();
    }
  }

  function retractContextMessage() {
    const messageId = contextMenu.message?.id;
    if (messageId) {
      onRetractMessage?.(messageId);
    }
    closeMessageMenu();
  }

  const composerState = getComposerState({
    authAvailable,
    authLoading,
    authUser,
    chatRecovering,
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
  const configuredWelcomeText = String(welcomeMessage || "").trim();
  const welcomeText = configuredWelcomeText || (roomLabel
    ? `欢迎来到 ${roomLabel} 的直播间`
    : "欢迎来到直播间");
  const showSendSpinner =
    composerState.mode === "member" && chatRecovering;

  return (
    <section className={panelClassName}>
      {!floating ? (
        <div className="control-head chat-panel-head">
          <div className="chat-panel-title-row">
            <h3>{title}</h3>
            <span className="chat-panel-online-count">{onlineCount} 在线</span>
          </div>
          <span className={`chat-connection-state is-${connectionState}`}>{getConnectionLabel(connectionState)}</span>
        </div>
      ) : null}

      <div ref={listRef} className="chat-message-list" aria-live="polite">
        {messages.length ? messages.map((message) => (
          <article
            key={message.id}
            className="chat-message-card"
          >
            <div
              className="chat-message-hit-area"
              onPointerDown={rememberMessagePointer}
              onContextMenu={(event) => openMessageMenu(event, message)}
              onClick={(event) => {
                if (isCoarsePointer()) {
                  openMessageMenu(event, message, { placement: "above-point" });
                }
              }}
            >
              <UserAvatar
                avatarUrl={message.user?.avatarUrl}
                displayName={message.user?.displayName}
                email={message.user?.email}
                className="chat-avatar"
                imgAlt={message.user?.displayName || "用户头像"}
                placeholderClassName="is-placeholder"
              />
              <div className="chat-message-body">
                <p className="chat-message-line">
                  <span className="chat-message-author">
                    {message.user?.displayName || message.user?.email || "匿名用户"}
                  </span>
                  <span className="chat-message-text">{message.text}</span>
                </p>
              </div>
            </div>
          </article>
        )) : null}

        {showWelcomeMessage ? (
          <article className="chat-message-card chat-message-card-system chat-message-card-system-no-avatar">
            <div className="chat-message-body chat-message-body-system">
              <p className="chat-message-line chat-message-line-system">
                <span className="chat-message-author">系统</span>
                <span className="chat-message-text">{welcomeText}</span>
              </p>
            </div>
          </article>
        ) : null}
      </div>
      <ChatMessageContextMenu
        canRetract={canRetractMessages}
        closing={contextMenu.closing}
        left={contextMenu.left}
        menuRef={contextMenuRef}
        onClose={closeMessageMenu}
        onCopy={copyContextMessage}
        onRetract={retractContextMessage}
        open={contextMenu.open}
        positioned={contextMenu.positioned}
        top={contextMenu.top}
      />

      {chatError && !chatRecovering ? (
        <p className={`inline-warning${floating ? " chat-floating-warning" : ""}`}>{chatError}</p>
      ) : null}

      {showComposer ? (
        composerState.mode === "guest" ? (
          <div className={`chat-composer chat-composer-readonly${floating ? " chat-composer-floating" : ""}`}>
            <input
              id={`${composerInputId}-readonly`}
              name="chat_message_readonly"
              type="text"
              value=""
              readOnly
              placeholder={composerState.inputPlaceholder}
              autoComplete="off"
              inputMode="text"
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
              className="secondary"
              onClick={onRequireLogin}
              disabled={composerState.buttonDisabled}
              data-disabled-reason={composerState.buttonDisabledReason}
            >
              {composerState.buttonLabel}
            </button>
          </div>
        ) : (
          <form
            className={`chat-composer${floating ? " chat-composer-floating" : ""}`}
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            <input
              id={composerInputId}
              name="chat_message"
              type="text"
              value={draft}
              placeholder={composerState.inputPlaceholder}
              maxLength={280}
              autoComplete="off"
              inputMode="text"
              enterKeyHint="send"
              onInput={onDraftChange}
              disabled={composerState.inputDisabled}
            />
            <button
              type="submit"
              className="primary chat-send-button"
              disabled={composerState.buttonDisabled}
              data-disabled-reason={composerState.buttonDisabledReason}
              aria-busy={showSendSpinner || undefined}
            >
              <span className={showSendSpinner ? "chat-send-button-label is-hidden" : "chat-send-button-label"}>
                {composerState.buttonLabel}
              </span>
              {showSendSpinner ? (
                <LoadingSpinner
                  className="chat-send-button-spinner"
                  label="正在恢复连接"
                />
              ) : null}
            </button>
          </form>
        )
      ) : null}

    </section>
  );
}
