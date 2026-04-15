import { useEffect, useMemo, useState } from "preact/hooks";
import { UserAvatar } from "./UserAvatar.jsx";

function formatHistoryTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function SettingsPage({
  hidden,
  relayUrl,
  relayHost,
  buildLabel,
  authAvailable,
  authLoading,
  authUser,
  onMicrosoftLogin,
  onLogout,
  onUpdateDisplayName,
  onRelayUrlInput,
  watchHistoryItems,
  onOpenWatchHistoryItem,
  onClearWatchHistory,
  loginPanelRequestKey = 0,
  logText,
  logRef
}) {
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [displayNameError, setDisplayNameError] = useState("");
  const [displayNameStatus, setDisplayNameStatus] = useState("");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameEditing, setDisplayNameEditing] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [loginPanelOpen, setLoginPanelOpen] = useState(false);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const authPending = authLoading;

  useEffect(() => {
    if (!authUser) {
      setDisplayNameInput("");
      setDisplayNameError("");
      setDisplayNameStatus("");
      setDisplayNameSaving(false);
      setDisplayNameEditing(false);
      setAccountPanelOpen(false);
      return;
    }

    setDisplayNameInput(authUser.displayName || "");
    setDisplayNameError("");
    setDisplayNameStatus("");
    setDisplayNameSaving(false);
    setDisplayNameEditing(false);
    setLoginPanelOpen(false);
  }, [authUser?.id]);

  useEffect(() => {
    if (!loginPanelRequestKey || authPending || authUser) {
      return;
    }

    setAccountPanelOpen(false);
    setLoginPanelOpen(true);
  }, [authPending, authUser, loginPanelRequestKey]);

  const displayNameCooldownActive = Boolean(
    authUser?.nextDisplayNameChangeAt && Date.parse(authUser.nextDisplayNameChangeAt) > Date.now()
  );
  const normalizedCurrentDisplayName = (authUser?.displayName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const normalizedDraftDisplayName = displayNameInput.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const displayNameUnchanged = normalizedDraftDisplayName && normalizedDraftDisplayName === normalizedCurrentDisplayName;
  const profileName = authPending ? "账号加载中" : authUser?.displayName || authUser?.email || "登录";
  const profileSubtitle = authPending ? "正在检查登录状态" : authUser ? (authUser.email || "已登录") : null;
  const authApiStatus = authAvailable ? "已连接" : "未连接";
  const historyItems = useMemo(() => (watchHistoryItems ?? []).map((item) => ({
    ...item,
    displayTime: formatHistoryTime(item.watchedAt)
  })), [watchHistoryItems]);

  async function submitDisplayName(event) {
    event.preventDefault();
    if (!authUser || !onUpdateDisplayName) {
      return;
    }

    setDisplayNameSaving(true);
    setDisplayNameError("");
    setDisplayNameStatus("");

    try {
      const payload = await onUpdateDisplayName(displayNameInput);
      const nextValue = payload.user?.displayName || displayNameInput;
      setDisplayNameInput(nextValue);
      setDisplayNameStatus("显示名已更新");
      setDisplayNameEditing(false);
    } catch (error) {
      setDisplayNameError(error instanceof Error ? error.message : String(error));
    } finally {
      setDisplayNameSaving(false);
    }
  }

  function openLoginPanel() {
    if (authPending) {
      return;
    }

    setLoginPanelOpen(true);
  }

  function openProfilePanel() {
    if (authPending) {
      return;
    }

    if (authUser) {
      setAccountPanelOpen(true);
      return;
    }

    openLoginPanel();
  }

  function startDisplayNameEditing() {
    if (!authUser) {
      return;
    }

    setDisplayNameInput(authUser.displayName || "");
    setDisplayNameError("");
    setDisplayNameStatus("");
    setDisplayNameEditing(true);
  }

  function cancelDisplayNameEditing() {
    setDisplayNameInput(authUser?.displayName || "");
    setDisplayNameError("");
    setDisplayNameStatus("");
    setDisplayNameSaving(false);
    setDisplayNameEditing(false);
  }

  return (
    <section class="page" data-page="settings" hidden={hidden}>
      <div class="page-grid settings-layout">
        <div class="my-page-shell">
          <div class="my-page-toolbar">
            <div />
            <button
              type="button"
              class="my-page-settings-button"
              aria-label="打开设置"
              onClick={() => {
                setSettingsPanelOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d="M4 7h16" />
                <path d="M4 12h16" />
                <path d="M4 17h16" />
                <circle cx="9" cy="7" r="1.8" />
                <circle cx="15" cy="12" r="1.8" />
                <circle cx="11" cy="17" r="1.8" />
              </svg>
            </button>
          </div>

          <div class="my-page-main">
            <aside class="my-page-aside">
              <section class="my-account-card">
                <button
                  type="button"
                  class={`my-profile-row${authUser ? "" : " is-guest"}${authPending ? " is-loading" : ""}`}
                  onClick={openProfilePanel}
                  disabled={authPending}
                  aria-busy={authPending}
                >
                  <UserAvatar
                    avatarUrl={authUser?.avatarUrl}
                    displayName={authUser?.displayName}
                    email={authUser?.email}
                    className="my-profile-avatar"
                    imgAlt={authUser?.displayName || "用户头像"}
                    monogramClassName="is-monogram"
                    placeholderClassName="is-placeholder"
                  />
                  <span class="my-profile-copy">
                    <strong>{profileName}</strong>
                    {profileSubtitle ? <span>{profileSubtitle}</span> : null}
                  </span>
                  <span class="my-profile-chevron" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M9 5.5L15.5 12 9 18.5" />
                    </svg>
                  </span>
                </button>
              </section>
            </aside>

            <div class="my-page-content">
              <div class="my-page-sections">
                <section class="my-section">
                  <div class="my-section-head">
                    <span class="my-section-title">观看历史</span>
                    {historyItems.length ? (
                      <button type="button" class="my-section-link" onClick={onClearWatchHistory}>清空</button>
                    ) : null}
                  </div>
                  <div class="my-section-body">
                    {historyItems.length ? historyItems.map((item) => (
                      <button
                        key={`${item.room}-${item.watchedAt}`}
                        type="button"
                        class="my-history-row"
                        onClick={() => {
                          onOpenWatchHistoryItem?.(item);
                        }}
                      >
                        <span class="my-history-copy">
                          <strong>{item.room}</strong>
                        </span>
                        <span class="my-history-meta">
                          <span>{item.displayTime}</span>
                          <span class="my-row-chevron" aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path d="M9 5.5L15.5 12 9 18.5" />
                            </svg>
                          </span>
                        </span>
                      </button>
                    )) : (
                      <div class="my-empty-state">
                        <span>暂无观看历史</span>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>

        {settingsPanelOpen ? (
          <>
            <button
              type="button"
              class="settings-panel-backdrop"
              aria-label="关闭设置面板"
              onClick={() => {
                setSettingsPanelOpen(false);
              }}
            />
            <aside class="settings-panel" aria-label="设置面板">
              <div class="settings-panel-head">
                <button
                  type="button"
                  class="settings-panel-close"
                  aria-label="返回"
                  onClick={() => {
                    setSettingsPanelOpen(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 5.5L8.5 12 15 18.5" />
                  </svg>
                </button>
                <strong>设置</strong>
                <span class="panel-head-spacer" aria-hidden="true" />
              </div>

              <div class="settings-panel-body">
                <section class="my-section">
                  <div class="my-section-head">
                    <span class="my-section-title">连接</span>
                  </div>
                  <div class="my-section-body">
                    <label class="my-field">
                      <span>Relay Endpoint</span>
                      <input id="url" value={relayUrl} onInput={onRelayUrlInput} />
                    </label>
                    <div class="my-info-row">
                      <strong>当前 Host</strong>
                      <span data-relay-host>{relayHost}</span>
                    </div>
                  </div>
                </section>

                <section class="my-section">
                  <div class="my-section-head">
                    <span class="my-section-title">诊断</span>
                  </div>
                  <div class="my-section-body">
                    <div class="my-info-row">
                      <strong>Auth API</strong>
                      <span>{authApiStatus}</span>
                    </div>
                    <div class="my-info-row">
                      <strong>Build</strong>
                      <span id="buildSubtitle">{buildLabel}</span>
                    </div>
                    <article class="my-log-block">
                      <h3>开发日志</h3>
                      <pre id="log" ref={logRef}>{logText}</pre>
                    </article>
                  </div>
                </section>
              </div>
            </aside>
          </>
        ) : null}

        {accountPanelOpen && authUser ? (
          <>
            <button
              type="button"
              class="auth-panel-backdrop"
              aria-label="关闭账号页面"
              onClick={() => {
                setAccountPanelOpen(false);
              }}
            />
            <aside class="auth-panel auth-panel-account" aria-label="账号页面">
              <div class="auth-panel-head auth-panel-account-head">
                <button
                  type="button"
                  class="auth-panel-close"
                  aria-label="返回"
                  onClick={() => {
                    setAccountPanelOpen(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 5.5L8.5 12 15 18.5" />
                  </svg>
                </button>
                <strong>账号</strong>
                <span class="panel-head-spacer" aria-hidden="true" />
              </div>

              <div class="auth-panel-body">
                <form class="my-account-form" onSubmit={(event) => {
                  void submitDisplayName(event);
                }}
                >
                  <div class="account-panel-list">
                    <div class="account-list-item account-list-item-avatar">
                      <span class="account-list-label">头像</span>
                      <span class="account-list-value account-list-avatar">
                        <UserAvatar
                          avatarUrl={authUser?.avatarUrl}
                          displayName={authUser?.displayName}
                          email={authUser?.email}
                          className="my-profile-avatar"
                          imgAlt={authUser?.displayName || "用户头像"}
                          monogramClassName="is-monogram"
                          placeholderClassName="is-placeholder"
                        />
                      </span>
                    </div>

                    <div class="account-list-item">
                      <span class="account-list-label">邮箱</span>
                      <span class="account-list-value">
                        <strong>{authUser.email || "未绑定"}</strong>
                      </span>
                    </div>

                    <div class={`account-list-item account-list-item-display${displayNameEditing ? " is-editing" : ""}`}>
                      <span class="account-list-label">显示名</span>

                      {displayNameEditing ? (
                        <div class="account-list-value account-list-value-editing">
                          <input
                            value={displayNameInput}
                            maxLength={32}
                            onInput={(event) => {
                              setDisplayNameInput(event.currentTarget.value);
                              setDisplayNameError("");
                              setDisplayNameStatus("");
                            }}
                            placeholder="输入想显示的名称"
                          />
                          <div class="account-icon-actions">
                            <button
                              type="submit"
                              class="account-icon-button"
                              aria-label="保存显示名"
                              disabled={
                                displayNameSaving
                                || displayNameCooldownActive
                                || !displayNameInput.trim()
                                || displayNameUnchanged
                              }
                            >
                              <svg viewBox="0 0 24 24">
                                <path d="M5 12.5l4.2 4.2L19 7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              class="account-icon-button"
                              aria-label="取消编辑显示名"
                              onClick={cancelDisplayNameEditing}
                            >
                              <svg viewBox="0 0 24 24">
                                <path d="M6 6l12 12" />
                                <path d="M18 6L6 18" />
                              </svg>
                            </button>
                          </div>
                          <p class="account-list-note">
                            {displayNameCooldownActive
                              ? `显示名 7 天内只能修改一次，下次可修改时间：${new Date(authUser.nextDisplayNameChangeAt).toLocaleString()}`
                              : "显示名需要唯一，且 7 天内只能修改一次。"}
                          </p>
                        </div>
                      ) : (
                        <div class="account-list-value account-list-value-inline">
                          <strong>{authUser.displayName || "未设置"}</strong>
                          <button
                            type="button"
                            class="account-icon-button"
                            aria-label="编辑显示名"
                            onClick={startDisplayNameEditing}
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z" />
                              <path d="M12.5 7l4.5 4.5" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {displayNameError ? <p class="inline-warning">{displayNameError}</p> : null}
                  {displayNameStatus ? <p class="status">{displayNameStatus}</p> : null}
                  <div class="my-actions">
                    <button
                      type="button"
                      class="secondary"
                      onClick={() => {
                        setAccountPanelOpen(false);
                        onLogout();
                      }}
                    >
                      退出登录
                    </button>
                  </div>
                </form>
              </div>
            </aside>
          </>
        ) : null}

        {loginPanelOpen ? (
          <>
            <button
              type="button"
              class="auth-panel-backdrop"
              aria-label="关闭登录页面"
              onClick={() => {
                setLoginPanelOpen(false);
              }}
            />
            <aside class="auth-panel auth-panel-login" aria-label="登录页面">
              <div class="auth-panel-head auth-panel-login-head">
                <button
                  type="button"
                  class="auth-panel-close"
                  aria-label="返回"
                  onClick={() => {
                    setLoginPanelOpen(false);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 5.5L8.5 12 15 18.5" />
                  </svg>
                </button>
                <strong>登录</strong>
                <span class="panel-head-spacer" aria-hidden="true" />
              </div>

              <div class="auth-panel-body auth-panel-login-body">
                <div class="auth-panel-copy auth-panel-login-copy">
                  <h2>登录账号</h2>
                </div>

                <button
                  type="button"
                  class="login-provider-button"
                  onClick={onMicrosoftLogin}
                  disabled={!authAvailable || authLoading}
                >
                  <span class="login-provider-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <rect x="2" y="2" width="9" height="9" fill="#f25022" />
                      <rect x="13" y="2" width="9" height="9" fill="#7fba00" />
                      <rect x="2" y="13" width="9" height="9" fill="#00a4ef" />
                      <rect x="13" y="13" width="9" height="9" fill="#ffb900" />
                    </svg>
                  </span>
                  <span>{authLoading ? "鉴权检查中" : "继续登录"}</span>
                </button>

                {!authAvailable ? <p class="inline-warning">Auth API 未连接，当前环境无法完成登录。</p> : null}
              </div>
            </aside>
          </>
        ) : null}
      </div>
    </section>
  );
}
