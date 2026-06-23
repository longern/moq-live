import { useState } from "react";
import { SwipeableDrawer } from "../primitives/SwipeableDrawer.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { AudienceIcon, CheckIcon, CloseIcon, CohostIcon, EndBroadcastIcon } from "./liveIcons.jsx";
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
  audienceCallEnabled = false,
  audienceCallRequests = [],
  audienceCallActive = [],
  onDisconnect,
  onInvitesAllowedChange,
  onInviteRequest,
  onInviteRespond,
  onAudienceCallEnabledChange,
  onAudienceCallRequestRespond,
}) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [audienceTab, setAudienceTab] = useState("requests");
  const [audienceResponseBusyId, setAudienceResponseBusyId] = useState("");

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

  function closeAudienceCallMode() {
    onAudienceCallEnabledChange?.(false);
  }

  async function respondAudienceCallRequest(request, accepted) {
    if (!request?.id || audienceResponseBusyId) {
      return;
    }

    setAudienceResponseBusyId(request.id);
    try {
      await onAudienceCallRequestRespond?.(request, accepted);
    } finally {
      setAudienceResponseBusyId("");
    }
  }

  const normalizedAudienceCallRequests = Array.isArray(audienceCallRequests)
    ? audienceCallRequests
    : [];
  const normalizedAudienceCallActive = Array.isArray(audienceCallActive)
    ? audienceCallActive
    : [];
  const audienceCallActiveCount = normalizedAudienceCallActive.length;

  return (
    <>
      <SwipeableDrawer
        open={open}
        onClose={onClose}
        ariaLabel="关闭连线"
        className="live-mobile-drawer"
        panelClassName="live-mobile-cohost-panel"
      >
        {audienceCallEnabled ? (
          <>
            <div className="live-cohost-head live-audience-call-head">
              <div className="live-audience-call-tabs" role="tablist" aria-label="观众连线">
                <button
                  type="button"
                  className={audienceTab === "requests" ? "is-active" : ""}
                  role="tab"
                  aria-selected={audienceTab === "requests"}
                  onClick={() => setAudienceTab("requests")}
                >
                  申请消息
                  {audienceCallActiveCount ? ` ${audienceCallActiveCount}/5` : ""}
                </button>
                <button
                  type="button"
                  className={audienceTab === "invite" ? "is-active" : ""}
                  role="tab"
                  aria-selected={audienceTab === "invite"}
                  onClick={() => setAudienceTab("invite")}
                >
                  邀请观众
                </button>
              </div>
              <button
                type="button"
                className="live-audience-call-close"
                onClick={closeAudienceCallMode}
                aria-label="关闭观众连线"
              >
                <EndBroadcastIcon />
              </button>
            </div>
            {audienceTab === "requests" ? (
              <div className="live-audience-call-list">
                {normalizedAudienceCallRequests.length > 0 ? (
                  normalizedAudienceCallRequests.map((request) => {
                    const name = request.user.displayName || "已登录用户";
                    const activeLimitReached = audienceCallActiveCount >= 5
                      && !normalizedAudienceCallActive.some((item) => item.user?.id === request.user.id);
                    return (
                      <div className="live-audience-call-row" key={request.id}>
                        <UserAvatar
                          avatarUrl={request.user.avatarUrl}
                          displayName={name}
                          className="live-cohost-avatar"
                          imgAlt={`${name}头像`}
                          imgWidth={38}
                          imgHeight={38}
                          monogramClassName="is-monogram"
                          placeholderClassName="is-placeholder"
                          iconClassName="live-cohost-avatar-icon"
                        />
                        <span className="live-audience-call-name">{name}</span>
                        <div className="live-audience-call-row-actions">
                          <button
                            type="button"
                            className="live-audience-call-response-button reject"
                            onClick={() => {
                              void respondAudienceCallRequest(request, false);
                            }}
                            disabled={Boolean(audienceResponseBusyId)}
                            aria-label={`拒绝${name}的连线申请`}
                          >
                            <CloseIcon />
                          </button>
                          <button
                            type="button"
                            className="live-audience-call-response-button accept"
                            onClick={() => {
                              void respondAudienceCallRequest(request, true);
                            }}
                            disabled={Boolean(audienceResponseBusyId) || activeLimitReached}
                            aria-label={`同意${name}的连线申请`}
                          >
                            <CheckIcon />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="live-cohost-empty">暂无申请消息</div>
                )}
              </div>
            ) : (
              <div className="live-cohost-empty">暂无可邀请观众</div>
            )}
          </>
        ) : (
          <>
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
                  className="live-menu-item live-more-menu-item live-cohost-menu-item"
                  aria-label="开启观众连线"
                  onClick={() => onAudienceCallEnabledChange?.(true)}
                >
                  <span className="live-more-menu-icon">
                    <AudienceIcon />
                  </span>
                  <span className="live-more-menu-label">开启观众连线</span>
                </button>
              </li>
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
                        <span className="live-cohost-recent-name">{name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="live-cohost-empty">暂无最近连线</div>
              )}
            </div>
          </>
        )}
      </SwipeableDrawer>
      <LiveCohostInviteDialog invite={invite} onRespond={onInviteRespond} />
    </>
  );
}
