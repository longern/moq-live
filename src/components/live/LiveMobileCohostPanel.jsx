import { useState } from "react";
import { SwipeableDrawer } from "../primitives/SwipeableDrawer.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { AudienceIcon, CheckIcon, CloseIcon, CohostIcon, EndBroadcastIcon } from "./liveIcons.jsx";
import { LiveMenuItem, LiveMenuList } from "./LiveMenuList.jsx";
import { LiveSwitch } from "./LiveSwitch.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

function LiveCohostInviteDialog({ invite, onRespond }) {
  const { t } = useI18n();
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
        aria-label={t("live.cohostInvite")}
      >
        <div className="live-cohost-invite-copy">
          <strong>{invite.requester.displayName || invite.requester.handle}</strong>
          <span>{t("live.cohostInviteMessage")}</span>
        </div>
        <div className="live-cohost-invite-actions">
          <button
            type="button"
            className="live-cohost-invite-button reject"
            onClick={() => {
              void respond(false);
            }}
            disabled={busy}
            aria-label={t("live.rejectCohostInvite")}
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
            aria-label={t("live.acceptCohostInvite")}
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
  audienceCallInvites = [],
  audienceCallActive = [],
  audienceCallInviteViewers = [],
  audienceTab = "requests",
  onAudienceTabChange,
  onDisconnect,
  onInvitesAllowedChange,
  onInviteRequest,
  onInviteRespond,
  onAudienceCallEnabledChange,
  onAudienceCallRequestRespond,
  onAudienceCallInviteViewer,
}) {
  const { t } = useI18n();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [audienceResponseBusyId, setAudienceResponseBusyId] = useState("");
  const [audienceInviteBusyId, setAudienceInviteBusyId] = useState("");

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

  async function inviteAudienceCallViewer(viewer) {
    if (!viewer?.id || audienceInviteBusyId) {
      return;
    }

    setAudienceInviteBusyId(viewer.id);
    try {
      await onAudienceCallInviteViewer?.(viewer);
    } finally {
      setAudienceInviteBusyId("");
    }
  }

  const normalizedAudienceCallRequests = Array.isArray(audienceCallRequests)
    ? audienceCallRequests
    : [];
  const normalizedAudienceCallInvites = Array.isArray(audienceCallInvites)
    ? audienceCallInvites
    : [];
  const normalizedAudienceCallActive = Array.isArray(audienceCallActive)
    ? audienceCallActive
    : [];
  const audienceCallActiveCount = normalizedAudienceCallActive.length;
  const audienceCallActiveUserIds = new Set(
    normalizedAudienceCallActive
      .map((item) => String(item.user?.id || "").trim())
      .filter(Boolean),
  );
  const audienceCallInvitedUserIds = new Set(
    normalizedAudienceCallInvites
      .map((item) => String(item.user?.id || "").trim())
      .filter(Boolean),
  );
  const inviteViewers = (Array.isArray(audienceCallInviteViewers) ? audienceCallInviteViewers : [])
    .filter((viewer) => viewer?.id && !audienceCallActiveUserIds.has(viewer.id))
    .slice(0, 100);

  return (
    <>
      <SwipeableDrawer
        open={open}
        onClose={onClose}
        ariaLabel={t("live.closeCohost")}
        className="live-mobile-drawer"
        panelClassName="live-mobile-cohost-panel"
      >
        {audienceCallEnabled ? (
          <>
            <div className="live-cohost-head live-audience-call-head">
              <div className="live-audience-call-tabs" role="tablist" aria-label={t("live.audienceCall")}>
                <button
                  type="button"
                  className={audienceTab === "requests" ? "is-active" : ""}
                  role="tab"
                  aria-selected={audienceTab === "requests"}
                  onClick={() => onAudienceTabChange?.("requests")}
                >
                  {t("live.audienceCallRequests")}
                  {audienceCallActiveCount ? ` ${audienceCallActiveCount}/5` : ""}
                </button>
                <button
                  type="button"
                  className={audienceTab === "invite" ? "is-active" : ""}
                  role="tab"
                  aria-selected={audienceTab === "invite"}
                  onClick={() => onAudienceTabChange?.("invite")}
                >
                  {t("live.inviteAudience")}
                </button>
              </div>
              <button
                type="button"
                className="live-audience-call-close"
                onClick={closeAudienceCallMode}
                aria-label={t("live.closeAudienceCall")}
              >
                <EndBroadcastIcon />
              </button>
            </div>
            {audienceTab === "requests" ? (
              <div className="live-audience-call-list">
                {normalizedAudienceCallRequests.length > 0 ? (
                  normalizedAudienceCallRequests.map((request) => {
                    const name = request.user.displayName || t("common.signedInUser");
                    const activeLimitReached = audienceCallActiveCount >= 5
                      && !normalizedAudienceCallActive.some((item) => item.user?.id === request.user.id);
                    return (
                      <div className="live-audience-call-row" key={request.id}>
                        <UserAvatar
                          avatarUrl={request.user.avatarUrl}
                          displayName={name}
                          className="live-cohost-avatar"
                          imgAlt={t("live.userAvatar", { name })}
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
                            aria-label={t("live.audienceCallRequestReject", { name })}
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
                            aria-label={t("live.audienceCallRequestAccept", { name })}
                          >
                            <CheckIcon />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="live-cohost-empty">{t("live.noAudienceCallRequests")}</div>
                )}
              </div>
            ) : (
              <div className="live-audience-call-list">
                {inviteViewers.length > 0 ? (
                  inviteViewers.map((viewer) => {
                    const name = viewer.displayName || t("common.signedInUser");
                    const activeLimitReached = audienceCallActiveCount >= 5;
                    const invited = audienceCallInvitedUserIds.has(viewer.id);
                    return (
                      <div className="live-audience-call-row" key={viewer.id}>
                        <UserAvatar
                          avatarUrl={viewer.avatarUrl}
                          displayName={name}
                          className="live-cohost-avatar"
                          imgAlt={t("live.userAvatar", { name })}
                          imgWidth={38}
                          imgHeight={38}
                          monogramClassName="is-monogram"
                          placeholderClassName="is-placeholder"
                          iconClassName="live-cohost-avatar-icon"
                        />
                        <span className="live-audience-call-name">{name}</span>
                        <button
                          type="button"
                          className="live-audience-call-invite-button"
                          onClick={() => {
                            void inviteAudienceCallViewer(viewer);
                          }}
                          disabled={Boolean(audienceInviteBusyId) || activeLimitReached || invited}
                          aria-label={t("live.inviteAudienceUser", { name })}
                        >
                          {invited ? t("live.invited") : t("live.invite")}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="live-cohost-empty">{t("live.noAudienceToInvite")}</div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="live-cohost-head">
              <strong>{t("live.cohost")}</strong>
            </div>
            <LiveMenuList className="live-cohost-menu" ariaLabel={t("live.cohostSettings")}>
              {active ? (
                <LiveMenuItem
                  className="live-more-menu-item live-cohost-menu-item live-cohost-disconnect-item"
                  aria-label={t("live.disconnectCohost")}
                  onClick={disconnect}
                >
                  <span className="live-more-menu-icon">
                    <CloseIcon />
                  </span>
                  <span className="live-more-menu-label">{t("live.disconnectCohost")}</span>
                </LiveMenuItem>
              ) : null}
              <li className="live-menu-list-item">
                <button
                  type="button"
                  className="live-menu-item live-more-menu-item live-cohost-menu-item"
                  aria-label={t("live.enableAudienceCall")}
                  onClick={() => onAudienceCallEnabledChange?.(true)}
                >
                  <span className="live-more-menu-icon">
                    <AudienceIcon />
                  </span>
                  <span className="live-more-menu-label">{t("live.enableAudienceCall")}</span>
                </button>
              </li>
              <li className="live-menu-list-item">
                <button
                  type="button"
                  className="live-menu-item live-more-menu-item live-more-menu-switch-item live-cohost-menu-item"
                  role="switch"
                  aria-checked={invitesAllowed}
                  aria-label={t("live.allowCohostInvites")}
                  onClick={() => onInvitesAllowedChange?.(!invitesAllowed)}
                >
                  <span className="live-more-menu-icon">
                    <CohostIcon />
                  </span>
                  <span className="live-more-menu-label">{t("live.allowInvites")}</span>
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
                placeholder={t("live.inputUid")}
                autoComplete="off"
                inputMode="text"
              />
              <button type="submit" disabled={!handle.trim() || busy}>
                {t("live.requestCohost")}
              </button>
            </form>
            <div className="live-cohost-recent">
              <div className="live-cohost-recent-head">{t("live.recentCohosts")}</div>
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
                          imgAlt={t("live.userAvatar", { name })}
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
                <div className="live-cohost-empty">{t("live.noRecentCohosts")}</div>
              )}
            </div>
          </>
        )}
      </SwipeableDrawer>
      <LiveCohostInviteDialog invite={invite} onRespond={onInviteRespond} />
    </>
  );
}
