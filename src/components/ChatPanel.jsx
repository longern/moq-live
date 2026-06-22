import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Copy, RotateCcw, X } from "lucide-react";
import { LoadingSpinner } from "./primitives/LoadingSpinner.jsx";
import { SwipeableDrawer } from "./primitives/SwipeableDrawer.jsx";
import { UserAvatar } from "./primitives/UserAvatar.jsx";
import { useToast } from "./primitives/FloatingToast.jsx";
import { useOverlayPortalTarget } from "../hooks/useOverlayPortalTarget.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

const CHAT_MESSAGE_MENU_MARGIN = 8;
const CHAT_MESSAGE_MENU_TOUCH_GAP = 10;
const CHAT_MESSAGE_MENU_EXIT_MS = 120;
const CHAT_COMPOSER_AUTOCOMPLETE = "off";
const CHAT_COMPOSER_FIELD_NAME = "moq_draft_text";
const CHAT_PANEL_MAX_VISIBLE_MESSAGES = 80;
const CHAT_MUTE_OPTIONS = [
  { id: "10m", labelKey: "chat.muteOptions.tenMinutes", durationMs: 10 * 60_000 },
  { id: "1h", labelKey: "chat.muteOptions.oneHour", durationMs: 60 * 60_000 },
  { id: "24h", labelKey: "chat.muteOptions.oneDay", durationMs: 24 * 60 * 60_000 },
  { id: "7d", labelKey: "chat.muteOptions.sevenDays", durationMs: 7 * 24 * 60 * 60_000 },
];

function getConnectionLabel(state, t) {
  if (state === "connected") {
    return t("chat.connected");
  }
  if (state === "idle") {
    return t("chat.loading");
  }
  if (state === "connecting") {
    return t("chat.connecting");
  }
  if (state === "reconnecting") {
    return t("chat.reconnecting");
  }
  if (state === "closed") {
    return t("chat.closed");
  }
  return t("chat.disconnected");
}

function getComposerState({
  authAvailable,
  authLoading,
  authUser,
  chatRecovering,
  connectionState,
  draft,
  readOnly,
  t,
}) {
  if (!authUser) {
    return {
      mode: "guest",
      inputDisabled: true,
      inputPlaceholder: authLoading ? t("chat.loading") : authAvailable ? t("chat.loginToChat") : t("chat.authDisconnected"),
      buttonDisabled: !authAvailable || authLoading,
      buttonDisabledReason: !authAvailable || authLoading ? "blocked" : "guest",
      buttonLabel: t("account.login")
    };
  }

  const isLoading = chatRecovering || connectionState !== "connected";
  const isBlocked = readOnly;
  const canInteract = !isLoading && !isBlocked;
  const hasDraft = draft.trim().length > 0;

  return {
    mode: "member",
    inputDisabled: !canInteract,
    inputPlaceholder: isLoading ? t("chat.loading") : isBlocked ? t("chat.blocked") : t("chat.input"),
    buttonDisabled: !canInteract || !hasDraft,
    buttonDisabledReason: !canInteract ? "blocked" : !hasDraft ? "empty" : "ready",
    buttonLabel: t("chat.send")
  };
}

function isCoarsePointer() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
}

function stopTouchPropagation(event) {
  event.stopPropagation();
}

function compareChatMessageOrder(left, right) {
  const leftSentAt = String(left?.sentAt || "");
  const rightSentAt = String(right?.sentAt || "");
  if (leftSentAt && rightSentAt && leftSentAt !== rightSentAt) {
    return leftSentAt.localeCompare(rightSentAt);
  }

  return String(left?.id || "").localeCompare(String(right?.id || ""));
}

function isMessageAfterAnchor(message, anchor) {
  if (!anchor) {
    return false;
  }
  if (!anchor.id && !anchor.sentAt) {
    return true;
  }

  return compareChatMessageOrder(message, anchor) > 0;
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

function ChatMessageMutePanel({
  message,
  muteRetractMessage,
  onCancel,
  onMute,
  onMuteRetractMessageChange,
}) {
  const { t } = useI18n();
  const targetName = message?.user?.displayName || message?.user?.email || t("common.user");
  const messageText = String(message?.text || "").trim() || t("chat.thisComment");

  return (
    <div className="chat-message-mute-panel" role="none">
      <div className="chat-message-mute-target">
        <span className="chat-message-author chat-message-mute-target-name">{targetName}</span>
        <p>{messageText}</p>
      </div>
      <div className="chat-message-mute-title">{t("chat.muteDuration")}</div>
      <ul className="chat-message-mute-options" aria-label={t("chat.chooseMuteDuration")}>
        {CHAT_MUTE_OPTIONS.map((option) => (
          <li key={option.id} className="chat-message-mute-option-item">
            <button
              type="button"
              className="chat-message-mute-option"
              onClick={() => onMute(option)}
            >
              <span>{t(option.labelKey)}</span>
            </button>
          </li>
        ))}
      </ul>
      <label className="chat-message-mute-retract">
        <input
          type="checkbox"
          checked={muteRetractMessage}
          onChange={(event) => onMuteRetractMessageChange(event.currentTarget.checked)}
        />
        <span>{t("chat.retractSameMessage")}</span>
      </label>
      <button
        type="button"
        className="chat-message-mute-cancel"
        onClick={onCancel}
      >
        {t("common.cancel")}
      </button>
    </div>
  );
}

function ChatMessageContextMenu({
  canMute,
  canRetract,
  closing,
  left,
  menuRef,
  onClose,
  onCopy,
  onOpenMute,
  onRetract,
  open,
  positioned,
  top,
}) {
  const { t } = useI18n();
  const overlayPortalTarget = useOverlayPortalTarget();

  if (!open) {
    return null;
  }

  const menu = (
    <>
      <button
        type="button"
        className={`chat-message-context-backdrop${closing ? " is-closing" : ""}`}
        aria-label={t("chat.closeContextMenu")}
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
          <span>{t("chat.copy")}</span>
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
            <span>{t("chat.retract")}</span>
          </button>
        ) : null}
        {canMute ? (
          <button
            type="button"
            className="chat-message-context-action"
            role="menuitem"
            onClick={onOpenMute}
          >
            <span className="chat-message-context-icon">
              <Ban aria-hidden="true" />
            </span>
            <span>{t("chat.mute")}</span>
          </button>
        ) : null}
      </div>
    </>
  );

  if (typeof document === "undefined") {
    return menu;
  }

  return createPortal(menu, overlayPortalTarget || document.body);
}

function ChatMessageMuteDialog({
  message,
  muteRetractMessage,
  onClose,
  onMute,
  onMuteRetractMessageChange,
  open,
}) {
  const { t } = useI18n();
  const overlayPortalTarget = useOverlayPortalTarget();

  if (!open) {
    return null;
  }

  const dialog = (
    <div className="chat-message-mute-dialog-layer">
      <button
        type="button"
        className="chat-message-mute-dialog-backdrop"
        aria-label={t("chat.closeMuteDialog")}
        onClick={onClose}
      />
      <section
        className="chat-message-mute-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("chat.muteUser")}
      >
        <header className="chat-message-mute-dialog-header">
          <div className="chat-message-mute-dialog-copy">
            <strong>{t("chat.muteUser")}</strong>
          </div>
          <button
            type="button"
            className="chat-message-mute-dialog-close"
            aria-label={t("chat.closeMuteDialog")}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <ChatMessageMutePanel
          message={message}
          muteRetractMessage={muteRetractMessage}
          onCancel={onClose}
          onMute={onMute}
          onMuteRetractMessageChange={onMuteRetractMessageChange}
        />
      </section>
    </div>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return createPortal(dialog, overlayPortalTarget || document.body);
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
  title = "",
  hostUserId = "",
  welcomeMessage = "",
  showComposer = true,
  showWelcome = true,
  composerTrailingAction = null,
  showSendButton = true,
  onRetractMessage,
  onMuteMessage,
}) {
  const { t } = useI18n();
  const composerInputId = useId();
  const { showToast } = useToast();
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
  const [muteDrawer, setMuteDrawer] = useState({
    open: false,
    message: null,
  });
  const [muteDialog, setMuteDialog] = useState({
    open: false,
    message: null,
  });
  const [muteRetractMessage, setMuteRetractMessage] = useState(true);
  const [welcomeAnchor, setWelcomeAnchor] = useState(null);

  function clearContextMenuCloseTimer() {
    if (contextMenuCloseTimerRef.current) {
      window.clearTimeout(contextMenuCloseTimerRef.current);
      contextMenuCloseTimerRef.current = null;
    }
  }

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

  useEffect(() => {
    if (!muteDialog.open) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeMuteDialog();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [muteDialog.open]);

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
    setMuteRetractMessage(true);
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

  function closeMessageMenuImmediately() {
    clearContextMenuCloseTimer();
    setContextMenu((current) => ({
      ...current,
      open: false,
      closing: false,
      positioned: false,
      message: null,
    }));
  }

  async function copyContextMessage() {
    const text = String(contextMenu.message?.text || "");
    if (!text) {
      showToast(t("chat.copyFailed"));
      closeMessageMenu();
      return;
    }

    let copied = false;
    try {
      if (typeof navigator.clipboard?.writeText === "function") {
        await navigator.clipboard.writeText(text);
        copied = true;
      } else {
        throw new Error("clipboard unavailable");
      }
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
      textarea.remove();
    } finally {
      showToast(copied ? t("chat.copied") : t("chat.copyFailed"));
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

  function openMutePanel() {
    if (isCoarsePointer()) {
      setMuteDrawer({
        open: true,
        message: contextMenu.message,
      });
      closeMessageMenuImmediately();
      return;
    }

    setMuteDialog({
      open: true,
      message: contextMenu.message,
    });
    closeMessageMenuImmediately();
  }

  function muteContextMessage(option) {
    const messageId = (
      muteDrawer.open
        ? muteDrawer.message
        : muteDialog.open
          ? muteDialog.message
          : contextMenu.message
    )?.id;
    if (messageId) {
      onMuteMessage?.(messageId, {
        durationMs: option.durationMs,
        untilStreamEnds: option.untilStreamEnds === true,
        retractMessage: muteRetractMessage
      });
    }
    setMuteDrawer({ open: false, message: null });
    setMuteDialog({ open: false, message: null });
    closeMessageMenu();
  }

  function closeMuteDrawer() {
    setMuteDrawer((current) => ({
      ...current,
      open: false,
    }));
  }

  function closeMuteDialog() {
    setMuteDialog({ open: false, message: null });
  }

  const composerState = getComposerState({
    authAvailable,
    authLoading,
    authUser,
    chatRecovering,
    connectionState,
    draft,
    readOnly,
    t,
  });
  const floating = variant === "floating";
  const panelClassName = [
    "chat-panel-block",
    floating ? "chat-panel-floating" : "control-block",
    className
  ].filter(Boolean).join(" ");
  const configuredWelcomeText = String(welcomeMessage || "").trim();
  const welcomeText = configuredWelcomeText || (roomLabel
    ? t("chat.welcome", { room: roomLabel })
    : t("chat.welcome"));
  const normalizedHostUserId = String(hostUserId || "").trim();
  const showWelcomeMessage = showWelcome && connectionState === "connected";
  const displayedMessages = useMemo(() => {
    if (!showWelcomeMessage || !welcomeAnchor) {
      return messages.slice(-CHAT_PANEL_MAX_VISIBLE_MESSAGES);
    }

    const welcomeEntry = {
      id: `welcome-${welcomeAnchor.id || welcomeAnchor.sentAt || "entry"}`,
      type: "system",
      text: welcomeText,
    };
    const entries = [];
    let welcomeInserted = false;

    for (const message of messages) {
      if (!welcomeInserted && isMessageAfterAnchor(message, welcomeAnchor)) {
        entries.push(welcomeEntry);
        welcomeInserted = true;
      }
      entries.push(message);
    }

    if (!welcomeInserted) {
      entries.push(welcomeEntry);
    }

    return entries.slice(-CHAT_PANEL_MAX_VISIBLE_MESSAGES);
  }, [messages, showWelcomeMessage, welcomeAnchor, welcomeText]);
  const showSendSpinner =
    composerState.mode === "member" && chatRecovering;

  useEffect(() => {
    if (!showWelcomeMessage) {
      return;
    }

    setWelcomeAnchor((current) => {
      if (current) {
        return current;
      }

      const lastMessage = messages[messages.length - 1];
      return {
        id: String(lastMessage?.id || ""),
        sentAt: String(lastMessage?.sentAt || ""),
      };
    });
  }, [messages, showWelcomeMessage]);

  useEffect(() => {
    if (connectionState === "idle" && messages.length === 0) {
      setWelcomeAnchor(null);
    }
  }, [connectionState, messages.length]);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [displayedMessages]);

  return (
    <section className={panelClassName}>
      {!floating ? (
        <div className="control-head chat-panel-head">
          <div className="chat-panel-title-row">
            <h3>{title || t("chat.title")}</h3>
            <span className="chat-panel-online-count">{onlineCount} {t("chat.online")}</span>
          </div>
          <span className={`chat-connection-state is-${connectionState}`}>{getConnectionLabel(connectionState, t)}</span>
        </div>
      ) : null}

      <div ref={listRef} className="chat-message-list" aria-live="polite">
        {displayedMessages.length ? displayedMessages.map((message) => (
          message.type === "system" ? (
            <article
              key={message.id}
              className="chat-message-card chat-message-card-system chat-message-card-system-no-avatar"
            >
              <div className="chat-message-hit-area chat-message-hit-area-system">
                <div className="chat-message-body chat-message-body-system">
                  <p className="chat-message-line chat-message-line-system">
                    <span className="chat-message-author">{t("chat.system")}</span>
                    <span className="chat-message-text">{message.text}</span>
                  </p>
                </div>
              </div>
            </article>
          ) : (
            (() => {
              const hostMessage = Boolean(
                normalizedHostUserId && message.user?.id === normalizedHostUserId
              );

              return (
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
                      imgAlt={message.user?.displayName || t("common.userAvatar")}
                      placeholderClassName="is-placeholder"
                    />
                    <div className="chat-message-body">
                      <p className="chat-message-line">
                        <span className={`chat-message-author${hostMessage ? " chat-message-author-host" : ""}`}>
                          {message.user?.displayName || message.user?.email || t("chat.anonymousUser")}
                        </span>
                        <span className="chat-message-text">{message.text}</span>
                      </p>
                    </div>
                  </div>
                </article>
              );
            })()
          )
        )) : null}
      </div>
      <ChatMessageContextMenu
        canMute={Boolean(
          canRetractMessages
          && contextMenu.message?.user?.id
          && contextMenu.message?.user?.id !== authUser?.id
          && onMuteMessage
        )}
        canRetract={canRetractMessages}
        closing={contextMenu.closing}
        left={contextMenu.left}
        menuRef={contextMenuRef}
        onClose={closeMessageMenu}
        onCopy={copyContextMessage}
        onOpenMute={openMutePanel}
        onRetract={retractContextMessage}
        open={contextMenu.open}
        positioned={contextMenu.positioned}
        top={contextMenu.top}
      />
      <ChatMessageMuteDialog
        open={muteDialog.open}
        message={muteDialog.message}
        muteRetractMessage={muteRetractMessage}
        onClose={closeMuteDialog}
        onMute={muteContextMessage}
        onMuteRetractMessageChange={setMuteRetractMessage}
      />
      <SwipeableDrawer
        open={muteDrawer.open}
        onClose={closeMuteDrawer}
        ariaLabel={t("chat.closeMutePanel")}
        className="chat-message-mute-drawer"
        panelClassName="chat-message-mute-drawer-panel"
        portal
        viewport
      >
        <ChatMessageMutePanel
          message={muteDrawer.message}
          muteRetractMessage={muteRetractMessage}
          onCancel={closeMuteDrawer}
          onMute={muteContextMessage}
          onMuteRetractMessageChange={setMuteRetractMessage}
        />
      </SwipeableDrawer>

      {chatError && !chatRecovering ? (
        <p className={`inline-warning${floating ? " chat-floating-warning" : ""}`}>{chatError}</p>
      ) : null}

      {showComposer ? (
        composerState.mode === "guest" ? (
          <div
            className={`chat-composer chat-composer-readonly chat-composer-shell${floating ? " chat-composer-floating" : ""}`}
            onTouchCancel={stopTouchPropagation}
            onTouchEnd={stopTouchPropagation}
            onTouchMove={stopTouchPropagation}
            onTouchStart={stopTouchPropagation}
          >
            <input
              id={`${composerInputId}-readonly`}
              name={CHAT_COMPOSER_FIELD_NAME}
              type="text"
              value=""
              readOnly
              placeholder={composerState.inputPlaceholder}
              autoComplete={CHAT_COMPOSER_AUTOCOMPLETE}
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
            {showSendButton ? (
              <button
                type="button"
                className="secondary"
                onClick={onRequireLogin}
                disabled={composerState.buttonDisabled}
                data-disabled-reason={composerState.buttonDisabledReason}
              >
                {composerState.buttonLabel}
              </button>
            ) : null}
            {composerTrailingAction}
          </div>
        ) : (
          <form
            className={`chat-composer chat-composer-shell${floating ? " chat-composer-floating" : ""}`}
            autoComplete="off"
            onTouchCancel={stopTouchPropagation}
            onTouchEnd={stopTouchPropagation}
            onTouchMove={stopTouchPropagation}
            onTouchStart={stopTouchPropagation}
            onSubmit={(event) => {
              event.preventDefault();
              onSend();
            }}
          >
            {/* Search type keeps mobile Chrome from showing the autofill accessory bar here. */}
            <input
              id={composerInputId}
              name={CHAT_COMPOSER_FIELD_NAME}
              type="search"
              value={draft}
              placeholder={composerState.inputPlaceholder}
              maxLength={280}
              autoComplete={CHAT_COMPOSER_AUTOCOMPLETE}
              inputMode="text"
              enterKeyHint="send"
              onInput={onDraftChange}
              disabled={composerState.inputDisabled}
            />
            {showSendButton ? (
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
                    label={t("chat.restoring")}
                  />
                ) : null}
              </button>
            ) : null}
            {composerTrailingAction}
          </form>
        )
      ) : null}

    </section>
  );
}
