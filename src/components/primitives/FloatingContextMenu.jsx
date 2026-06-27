import { createPortal } from "react-dom";
import { useOverlayPortalTarget } from "../../hooks/useOverlayPortalTarget.js";

export const FLOATING_CONTEXT_MENU_EXIT_MS = 120;

const FLOATING_CONTEXT_MENU_MARGIN = 8;
const FLOATING_CONTEXT_MENU_TOUCH_GAP = 10;

export function getFloatingContextMenuPosition(anchorLeft, anchorTop, menuNode, placement) {
  const rect = menuNode.getBoundingClientRect();
  const maxLeft = Math.max(
    FLOATING_CONTEXT_MENU_MARGIN,
    window.innerWidth - rect.width - FLOATING_CONTEXT_MENU_MARGIN,
  );
  const maxTop = Math.max(
    FLOATING_CONTEXT_MENU_MARGIN,
    window.innerHeight - rect.height - FLOATING_CONTEXT_MENU_MARGIN,
  );
  const preferredLeft = placement === "above-point"
    ? anchorLeft - rect.width / 2
    : anchorLeft;
  const preferredTop = placement === "above-point"
    ? anchorTop - rect.height - FLOATING_CONTEXT_MENU_TOUCH_GAP
    : anchorTop;

  return {
    left: Math.max(FLOATING_CONTEXT_MENU_MARGIN, Math.min(preferredLeft, maxLeft)),
    top: Math.max(FLOATING_CONTEXT_MENU_MARGIN, Math.min(preferredTop, maxTop)),
  };
}

export function FloatingContextMenu({
  ariaLabel,
  children,
  className = "",
  closing = false,
  left = 0,
  menuRef,
  onClose,
  open = false,
  positioned = false,
  top = 0,
}) {
  const overlayPortalTarget = useOverlayPortalTarget();

  if (!open) {
    return null;
  }

  const menu = (
    <>
      <button
        type="button"
        className={`chat-message-context-backdrop${closing ? " is-closing" : ""}`}
        aria-label={ariaLabel}
        onClick={onClose}
      />
      <div
        ref={menuRef}
        className={[
          "chat-message-context-menu",
          className,
          closing ? "is-closing" : "",
          positioned ? "" : "is-measuring",
        ].filter(Boolean).join(" ")}
        role="menu"
        style={{ left: `${left}px`, top: `${top}px` }}
      >
        {children}
      </div>
    </>
  );

  if (typeof document === "undefined") {
    return menu;
  }

  return createPortal(menu, overlayPortalTarget || document.body);
}

export function FloatingActionMenu({
  actions = [],
  ...menuProps
}) {
  return (
    <FloatingContextMenu {...menuProps}>
      {actions
        .filter((action) => action && action.hidden !== true)
        .map((action) => (
          <button
            type="button"
            className={[
              "chat-message-context-action",
              action.danger ? "is-danger" : "",
            ].filter(Boolean).join(" ")}
            role="menuitem"
            disabled={action.disabled === true}
            key={action.id}
            onClick={action.onClick}
          >
            <span className="chat-message-context-icon">
              {action.icon}
            </span>
            <span>{action.label}</span>
          </button>
        ))}
    </FloatingContextMenu>
  );
}
