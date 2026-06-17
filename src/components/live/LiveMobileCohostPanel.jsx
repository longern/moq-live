import { useState } from "react";
import { SwipeableDrawer } from "../primitives/SwipeableDrawer.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { CheckIcon, CloseIcon, CohostIcon } from "./liveIcons.jsx";
import { LiveMenuItem, LiveMenuList } from "./LiveMenuList.jsx";
import { LiveSwitch } from "./LiveSwitch.jsx";

function LiveCohostInviteDialog({ invite, onRespond }) {
  const [busy, setBusy] = useState(false);

  if (!invite) {
    return null;
  }

  async function respond(accepted) {
    if (busy) {
      return;
    }

    setBusy(true);
    await onRespond?.(invite, accepted);
    setBusy(false);
  }

  return (
    <div className="live-cohost-invite-layer">
      <section
        className="live-cohost-invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="连线邀请"
      >
        <div className="live-cohost-invite-copy">
          <strong>{invite.requester.displayName || invite.requester.handle}</strong>
          <span>申请与你连线</span>
        </div>
        <div className="live-cohost-invite-actions">
          <button
            type="button"
            className="live-cohost-invite-button reject"
            onClick={() => {
              void respond(false);
            }}
            disabled={busy}
            aria-label="拒绝连线邀请"
          >
            <CloseIcon />
          </button>
          <button
            type="button"
            className="live-cohost-invite-button accept"
            onClick={() => {
              void respond(true);
            }}
            disabled={busy}
            aria-label="接受连线邀请"
          >
            <CheckIcon />
          </button>
        </div>
      </section>
    </div>
  );
}

export function LiveMobileCohostPanel({
  open,
  onClose,
  active,
  invitesAllowed,
  invite,
  recentHosts = [],
  onDisconnect,
  onInvitesAllowedChange,
  onInviteRequest,
  onInviteRespond,
}) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitInvite(nextHandle = handle) {
    const value = String(nextHandle || "").trim().replace(/^@+/, "");
    if (!value || busy) {
      return;
    }

    setBusy(true);
    const ok = await onInviteRequest?.(value);
    setBusy(false);
    if (ok) {
      setHandle("");
      onClose?.();
    }
  }

  function disconnect() {
    onDisconnect?.();
    onClose?.();
  }

  return (
    <>
      <SwipeableDrawer
        open={open}
        onClose={onClose}
        ariaLabel="关闭连线"
        className="live-mobile-drawer"
        panelClassName="live-mobile-cohost-panel"
      >
        <div className="live-cohost-head">
          <strong>连线</strong>
        </div>
        <LiveMenuList className="live-cohost-menu" ariaLabel="连线设置">
          {active ? (
            <LiveMenuItem
              className="live-more-menu-item live-cohost-menu-item live-cohost-disconnect-item"
              aria-label="断开连线"
              onClick={disconnect}
            >
              <span className="live-more-menu-icon">
                <CloseIcon />
              </span>
              <span className="live-more-menu-label">断开连线</span>
            </LiveMenuItem>
          ) : null}
          <li className="live-menu-list-item">
            <button
              type="button"
              className="live-menu-item live-more-menu-item live-more-menu-switch-item live-cohost-menu-item"
              role="switch"
              aria-checked={invitesAllowed}
              aria-label="允许其他主播邀请连线"
              onClick={() => onInvitesAllowedChange?.(!invitesAllowed)}
            >
              <span className="live-more-menu-icon">
                <CohostIcon />
              </span>
              <span className="live-more-menu-label">允许邀请</span>
              <LiveSwitch checked={invitesAllowed} />
            </button>
          </li>
        </LiveMenuList>
        <form
          className="live-cohost-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitInvite();
          }}
        >
          <input
            value={handle}
            onChange={(event) => setHandle(event.currentTarget.value)}
            placeholder="输入 UID"
            autoComplete="off"
            inputMode="text"
          />
          <button type="submit" disabled={!handle.trim() || busy}>
            申请
          </button>
        </form>
        <div className="live-cohost-recent">
          <div className="live-cohost-recent-head">最近连线</div>
          {recentHosts.length > 0 ? (
            <div className="live-cohost-recent-list">
              {recentHosts.map((host) => {
                const name = host.displayName || host.handle;
                return (
                  <button
                    type="button"
                    className="live-cohost-recent-row"
                    key={host.handle}
                    disabled={busy}
                    onClick={() => {
                      void submitInvite(host.handle);
                    }}
                  >
                    <UserAvatar
                      avatarUrl={host.avatarUrl}
                      displayName={name}
                      className="live-cohost-avatar"
                      imgAlt={`${name}头像`}
                      imgWidth={38}
                      imgHeight={38}
                      monogramClassName="is-monogram"
                      placeholderClassName="is-placeholder"
                      iconClassName="live-cohost-avatar-icon"
                    />
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="live-cohost-empty">暂无最近连线</div>
          )}
        </div>
      </SwipeableDrawer>
      <LiveCohostInviteDialog invite={invite} onRespond={onInviteRespond} />
    </>
  );
}
