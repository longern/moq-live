import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Mic, MicOff, PhoneOff, UserPlus, UserRound } from "lucide-react";
import {
  FLOATING_CONTEXT_MENU_EXIT_MS,
  FloatingActionMenu,
  getFloatingContextMenuPosition,
} from "../primitives/FloatingContextMenu.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { WatchHostProfileSheet } from "../watch/WatchSessionSheets.jsx";
import { useLazyUserProfileSheet } from "../../hooks/useLazyUserProfileSheet.js";
import { useI18n } from "../../i18n/I18nProvider.jsx";

function getActiveUser(activeUser) {
  return activeUser?.user || {};
}

export function LiveAudienceCallOverlay({
  active = [],
  canManage = true,
  enabled = false,
  mutedUserIds = [],
  speakingUserIds = [],
  hidden = false,
  actionLabel = "",
  actionAriaLabel = "",
  onAction,
  onDisconnectUser,
  onMuteUserChange,
}) {
  const { t } = useI18n();
  const menuRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState({
    open: false,
    closing: false,
    positioned: false,
    anchorLeft: 0,
    anchorTop: 0,
    placement: "above-point",
    left: 0,
    top: 0,
    userId: "",
  });
  const {
    openUserProfile,
    profileError,
    profileSheetProps,
  } = useLazyUserProfileSheet();
  const activeUsers = Array.isArray(active) ? active : [];
  const mutedSet = new Set(Array.isArray(mutedUserIds) ? mutedUserIds : []);
  const speakingSet = new Set(Array.isArray(speakingUserIds) ? speakingUserIds : []);
  const selectedActiveUser = activeUsers.find((item) => getActiveUser(item).id === menu.userId) || null;
  const selectedUser = getActiveUser(selectedActiveUser);
  const selectedMuted = selectedUser.id ? mutedSet.has(selectedUser.id) : false;
  const visible = Boolean(enabled || activeUsers.length > 0);
  const showAction = Boolean(onAction && actionLabel && activeUsers.length < 5);

  useEffect(() => {
    if (menu.userId && !activeUsers.some((item) => getActiveUser(item).id === menu.userId)) {
      closeMenuImmediately();
    }
  }, [activeUsers, menu.userId]);

  useEffect(() => {
    if (!hidden && visible) {
      return undefined;
    }
    closeMenuImmediately();
    return undefined;
  }, [hidden, visible]);

  useEffect(() => {
    if (!menu.open) {
      return undefined;
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
  }, [menu.open]);

  useLayoutEffect(() => {
    if (!menu.open || menu.closing || !menuRef.current) {
      return;
    }

    const position = getFloatingContextMenuPosition(
      menu.anchorLeft,
      menu.anchorTop,
      menuRef.current,
      menu.placement,
    );

    setMenu((current) => {
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
    menu.anchorLeft,
    menu.anchorTop,
    menu.closing,
    menu.open,
    menu.placement,
    selectedMuted,
  ]);

  useEffect(() => () => {
    clearCloseTimer();
  }, []);

  function clearCloseTimer() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openMenu(event, userId) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    clearCloseTimer();
    setMenu({
      open: true,
      closing: false,
      positioned: false,
      anchorLeft: rect.left + rect.width / 2,
      anchorTop: rect.top,
      placement: "above-point",
      left: rect.left,
      top: rect.top,
      userId,
    });
  }

  function closeMenu() {
    setMenu((current) => {
      if (!current.open || current.closing) {
        return current;
      }
      return { ...current, closing: true };
    });
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setMenu((current) => {
        if (!current.closing) {
          return current;
        }
        return {
          ...current,
          open: false,
          closing: false,
          positioned: false,
          userId: "",
        };
      });
    }, FLOATING_CONTEXT_MENU_EXIT_MS);
  }

  function closeMenuImmediately() {
    clearCloseTimer();
    setMenu((current) => ({
      ...current,
      open: false,
      closing: false,
      positioned: false,
      userId: "",
    }));
  }

  function toggleCollapsed(event) {
    event.stopPropagation();
    setCollapsed((current) => {
      const next = !current;
      if (next) {
        closeMenuImmediately();
      }
      return next;
    });
  }

  if (hidden || !visible) {
    return null;
  }

  const menuActions = selectedActiveUser
    ? [
        {
          id: "profile",
          icon: <UserRound aria-hidden="true" />,
          label: t("live.profile"),
          onClick: (event) => {
            event.stopPropagation();
            void openUserProfile(selectedUser, {
              onBeforeOpen: closeMenuImmediately,
            });
          },
        },
        ...(canManage
          ? [
              {
                id: "mute",
                icon: selectedMuted ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />,
                label: selectedMuted ? t("live.unmute") : t("live.mute"),
                onClick: (event) => {
                  event.stopPropagation();
                  onMuteUserChange?.(selectedUser.id, !selectedMuted);
                },
              },
              {
                id: "disconnect",
                danger: true,
                icon: <PhoneOff aria-hidden="true" />,
                label: t("live.disconnect"),
                onClick: (event) => {
                  event.stopPropagation();
                  onDisconnectUser?.(selectedUser.id);
                  closeMenuImmediately();
                },
              },
            ]
          : []),
      ]
    : [];

  return (
    <>
      <div
        className={`live-audience-call-overlay${collapsed ? " is-collapsed" : ""}`}
        aria-label={t("live.activeAudienceCall")}
      >
        <div className="live-audience-call-panel">
          <button
            type="button"
            className="live-audience-call-panel-head"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("live.expandAudienceCallPanel") : t("live.collapseAudienceCallPanel")}
          >
            <span>{t("live.audienceCallPanelTitle")} {activeUsers.length}</span>
            {collapsed ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </button>
          <div className="live-audience-call-active-list" aria-hidden={collapsed}>
            {showAction ? (
              <button
                type="button"
                className="live-audience-call-panel-action"
                onClick={onAction}
                aria-label={actionAriaLabel || actionLabel}
                tabIndex={collapsed ? -1 : undefined}
              >
                <UserPlus aria-hidden="true" />
                <span>{actionLabel}</span>
              </button>
            ) : null}
            {activeUsers.map((item) => {
              const user = getActiveUser(item);
              const name = user.displayName || t("common.signedInUser");
              const muted = mutedSet.has(user.id);
              const speaking = !muted && speakingSet.has(user.id);
              return (
                <button
                  type="button"
                  className={`live-audience-call-active-user${menu.userId === user.id ? " is-active" : ""}${muted ? " is-muted" : ""}${speaking ? " is-speaking" : ""}`}
                  key={item.id || user.id}
                  onClick={(event) => {
                    openMenu(event, user.id);
                  }}
                  aria-label={`${name}${muted ? t("live.mutedSuffix") : ""}`}
                  tabIndex={collapsed ? -1 : undefined}
                >
                  <UserAvatar
                    avatarUrl={user.avatarUrl}
                    displayName={name}
                    className="live-audience-call-active-avatar"
                    imgAlt={t("live.userAvatar", { name })}
                    imgWidth={28}
                    imgHeight={28}
                    monogramClassName="is-monogram"
                    placeholderClassName="is-placeholder"
                    iconClassName="live-audience-call-active-avatar-icon"
                  />
                  <span>{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {selectedActiveUser ? (
        <FloatingActionMenu
          actions={menuActions}
          ariaLabel={t("live.audienceCallManagement", { name: selectedUser.displayName || t("common.user") })}
          className="live-audience-call-context-menu"
          closing={menu.closing}
          left={menu.left}
          menuRef={menuRef}
          onClose={closeMenu}
          open={menu.open}
          positioned={menu.positioned}
          top={menu.top}
        />
      ) : null}
      <WatchHostProfileSheet
        {...profileSheetProps}
        portal
        viewport
        followButton={profileError ? <p className="inline-warning">{profileError}</p> : null}
      />
    </>
  );
}
