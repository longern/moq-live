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

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M9 5.5L15.5 12 9 18.5" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5.5L8.5 12 15 18.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
      <circle cx="9" cy="7" r="1.8" />
      <circle cx="15" cy="12" r="1.8" />
      <circle cx="11" cy="17" r="1.8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z" />
      <path d="M12.5 7l4.5 4.5" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="2" y="2" width="9" height="9" fill="#f25022" />
      <rect x="13" y="2" width="9" height="9" fill="#7fba00" />
      <rect x="2" y="13" width="9" height="9" fill="#00a4ef" />
      <rect x="13" y="13" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function ProfileAvatar({ authUser }) {
  return (
    <UserAvatar
      avatarUrl={authUser?.avatarUrl}
      displayName={authUser?.displayName}
      email={authUser?.email}
      className="my-profile-avatar"
      imgAlt={authUser?.displayName || "用户头像"}
      monogramClassName="is-monogram"
      placeholderClassName="is-placeholder"
    />
  );
}

function SectionBlock({ title, action = null, children }) {
  return (
    <section class="my-section">
      <div class="my-section-head">
        <span class="my-section-title">{title}</span>
        {action}
      </div>
      <div class="my-section-body">{children}</div>
    </section>
  );
}

function PanelShell({
  backdropClassName,
  backdropLabel,
  bodyClassName,
  closeLabel,
  closeButtonClassName,
  headClassName,
  onClose,
  panelClassName,
  panelLabel,
  title,
  children
}) {
  return (
    <>
      <button
        type="button"
        class={backdropClassName}
        aria-label={backdropLabel}
        onClick={onClose}
      />
      <aside class={panelClassName} aria-label={panelLabel}>
        <div class={headClassName}>
          <button
            type="button"
            class={closeButtonClassName}
            aria-label={closeLabel}
            onClick={onClose}
          >
            <BackIcon />
          </button>
          <strong>{title}</strong>
          <span class="panel-head-spacer" aria-hidden="true" />
        </div>
        <div class={bodyClassName}>{children}</div>
      </aside>
    </>
  );
}

function ProfileSummaryCard({
  authPending,
  authUser,
  profileName,
  profileSubtitle,
  onOpenProfilePanel
}) {
  return (
    <section class="my-account-card">
      <button
        type="button"
        class={`my-profile-row${authUser ? "" : " is-guest"}${authPending ? " is-loading" : ""}`}
        onClick={onOpenProfilePanel}
        disabled={authPending}
        aria-busy={authPending}
      >
        <ProfileAvatar authUser={authUser} />
        <span class="my-profile-copy">
          <strong>{profileName}</strong>
          {profileSubtitle ? <span>{profileSubtitle}</span> : null}
        </span>
        <span class="my-profile-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>
    </section>
  );
}

function WatchHistorySection({ historyItems, onClearWatchHistory, onOpenWatchHistoryItem }) {
  return (
    <SectionBlock
      title="观看历史"
      action={historyItems.length ? (
        <button type="button" class="my-section-link" onClick={onClearWatchHistory}>清空</button>
      ) : null}
    >
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
              <ChevronIcon />
            </span>
          </span>
        </button>
      )) : (
        <div class="my-empty-state">
          <span>暂无观看历史</span>
        </div>
      )}
    </SectionBlock>
  );
}

function SettingsDrawer({
  authApiStatus,
  buildLabel,
  logRef,
  logText,
  onClose,
  onRelayUrlInput,
  relayHost,
  relayUrl
}) {
  return (
    <PanelShell
      backdropClassName="settings-panel-backdrop"
      backdropLabel="关闭设置面板"
      bodyClassName="settings-panel-body"
      closeLabel="返回"
      closeButtonClassName="settings-panel-close"
      headClassName="settings-panel-head"
      onClose={onClose}
      panelClassName="settings-panel"
      panelLabel="设置面板"
      title="设置"
    >
      <SectionBlock title="连接">
        <label class="my-field">
          <span>Relay Endpoint</span>
          <input id="url" value={relayUrl} onInput={onRelayUrlInput} />
        </label>
        <div class="my-info-row">
          <strong>当前 Host</strong>
          <span data-relay-host>{relayHost}</span>
        </div>
      </SectionBlock>

      <SectionBlock title="诊断">
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
      </SectionBlock>
    </PanelShell>
  );
}

function AccountEditableField({
  cancelAriaLabel,
  editAriaLabel,
  editing,
  inputValue,
  label,
  maxLength,
  note,
  onCancelEditing,
  onInput,
  onSave,
  onStartEditing,
  placeholder,
  saveAriaLabel,
  saveDisabled,
  value
}) {
  return (
    <div class={`account-list-item account-list-item-display${editing ? " is-editing" : ""}`}>
      <span class="account-list-label">{label}</span>

      {editing ? (
        <div class="account-list-value account-list-value-editing">
          <input
            value={inputValue}
            maxLength={maxLength}
            onInput={onInput}
            placeholder={placeholder}
          />
          <div class="account-icon-actions">
            <button
              type="button"
              class="account-icon-button"
              aria-label={saveAriaLabel}
              disabled={saveDisabled}
              onClick={onSave}
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              class="account-icon-button"
              aria-label={cancelAriaLabel}
              onClick={onCancelEditing}
            >
              <CloseIcon />
            </button>
          </div>
          <p class="account-list-note">{note}</p>
        </div>
      ) : (
        <div class="account-list-value account-list-value-inline">
          <strong>{value}</strong>
          <button
            type="button"
            class="account-icon-button"
            aria-label={editAriaLabel}
            onClick={onStartEditing}
          >
            <EditIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function AccountDrawer({
  authUser,
  cancelDisplayNameEditing,
  cancelHandleEditing,
  displayNameCooldownActive,
  displayNameEditing,
  displayNameError,
  displayNameInput,
  displayNameSaving,
  displayNameStatus,
  displayNameUnchanged,
  handleCooldownActive,
  handleEditing,
  handleError,
  handleInput,
  handleIsDefault,
  handleSaving,
  handleStatus,
  handleUnchanged,
  onClose,
  onLogout,
  setDisplayNameError,
  setDisplayNameInput,
  setDisplayNameStatus,
  setHandleError,
  setHandleInput,
  setHandleStatus,
  startDisplayNameEditing,
  startHandleEditing,
  submitDisplayName,
  submitHandle
}) {
  const handleNote = handleIsDefault
    ? "默认 handle 可随时设置一次专属地址。"
    : handleCooldownActive
      ? `自定义后 30 天内只能修改一次，下次可修改时间：${new Date(authUser.nextHandleChangeAt).toLocaleString()}`
      : "自定义后 30 天内只能修改一次。";
  const displayNameNote = displayNameCooldownActive
    ? `显示名 7 天内只能修改一次，下次可修改时间：${new Date(authUser.nextDisplayNameChangeAt).toLocaleString()}`
    : "显示名需要唯一，且 7 天内只能修改一次。";

  return (
    <PanelShell
      backdropClassName="auth-panel-backdrop"
      backdropLabel="关闭账号页面"
      bodyClassName="auth-panel-body"
      closeLabel="返回"
      closeButtonClassName="auth-panel-close"
      headClassName="auth-panel-head auth-panel-account-head"
      onClose={onClose}
      panelClassName="auth-panel auth-panel-account"
      panelLabel="账号页面"
      title="账号"
    >
      <div class="my-account-form">
        <div class="account-panel-list">
          <div class="account-list-item account-list-item-avatar">
            <span class="account-list-label">头像</span>
            <span class="account-list-value account-list-avatar">
              <ProfileAvatar authUser={authUser} />
            </span>
          </div>

          <div class="account-list-item">
            <span class="account-list-label">邮箱</span>
            <span class="account-list-value">
              <strong>{authUser.email || "未绑定"}</strong>
            </span>
          </div>

          <AccountEditableField
            cancelAriaLabel="取消编辑 handle"
            editAriaLabel="编辑 handle"
            editing={handleEditing}
            inputValue={handleInput}
            label="Handle"
            maxLength={24}
            note={(
              <>
                {handleNote}
                <br />
                仅支持小写字母、数字、下划线，长度 6-24，不能为纯数字，且不能以下划线开头或结尾。
              </>
            )}
            onCancelEditing={cancelHandleEditing}
            onInput={(event) => {
              setHandleInput(event.currentTarget.value.toLowerCase());
              setHandleError("");
              setHandleStatus("");
            }}
            onSave={() => {
              void submitHandle();
            }}
            onStartEditing={startHandleEditing}
            placeholder="输入唯一 handle"
            saveAriaLabel="保存 handle"
            saveDisabled={handleSaving || !handleInput.trim() || handleUnchanged}
            value={authUser.handle || "未设置"}
          />

          <AccountEditableField
            cancelAriaLabel="取消编辑显示名"
            editAriaLabel="编辑显示名"
            editing={displayNameEditing}
            inputValue={displayNameInput}
            label="显示名"
            maxLength={32}
            note={displayNameNote}
            onCancelEditing={cancelDisplayNameEditing}
            onInput={(event) => {
              setDisplayNameInput(event.currentTarget.value);
              setDisplayNameError("");
              setDisplayNameStatus("");
            }}
            onSave={() => {
              void submitDisplayName();
            }}
            onStartEditing={startDisplayNameEditing}
            placeholder="输入想显示的名称"
            saveAriaLabel="保存显示名"
            saveDisabled={
              displayNameSaving
              || displayNameCooldownActive
              || !displayNameInput.trim()
              || displayNameUnchanged
            }
            value={authUser.displayName || "未设置"}
          />
        </div>

        {handleError ? <p class="inline-warning">{handleError}</p> : null}
        {handleStatus ? <p class="status">{handleStatus}</p> : null}
        {displayNameError ? <p class="inline-warning">{displayNameError}</p> : null}
        {displayNameStatus ? <p class="status">{displayNameStatus}</p> : null}

        <div class="my-actions">
          <button
            type="button"
            class="secondary"
            onClick={() => {
              onClose();
              onLogout();
            }}
          >
            退出登录
          </button>
        </div>
      </div>
    </PanelShell>
  );
}

function LoginDrawer({ authAvailable, authLoading, onClose, onMicrosoftLogin }) {
  return (
    <PanelShell
      backdropClassName="auth-panel-backdrop"
      backdropLabel="关闭登录页面"
      bodyClassName="auth-panel-body auth-panel-login-body"
      closeLabel="返回"
      closeButtonClassName="auth-panel-close"
      headClassName="auth-panel-head auth-panel-login-head"
      onClose={onClose}
      panelClassName="auth-panel auth-panel-login"
      panelLabel="登录页面"
      title="登录"
    >
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
          <MicrosoftIcon />
        </span>
        <span>{authLoading ? "鉴权检查中" : "继续登录"}</span>
      </button>

      {!authAvailable ? <p class="inline-warning">Auth API 未连接，当前环境无法完成登录。</p> : null}
    </PanelShell>
  );
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
  onUpdateHandle,
  onRelayUrlInput,
  watchHistoryItems,
  onOpenWatchHistoryItem,
  onClearWatchHistory,
  loginPanelRequestKey = 0,
  logText,
  logRef
}) {
  const [handleInput, setHandleInput] = useState("");
  const [handleError, setHandleError] = useState("");
  const [handleStatus, setHandleStatus] = useState("");
  const [handleSaving, setHandleSaving] = useState(false);
  const [handleEditing, setHandleEditing] = useState(false);
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
      setHandleInput("");
      setHandleError("");
      setHandleStatus("");
      setHandleSaving(false);
      setHandleEditing(false);
      setDisplayNameInput("");
      setDisplayNameError("");
      setDisplayNameStatus("");
      setDisplayNameSaving(false);
      setDisplayNameEditing(false);
      setAccountPanelOpen(false);
      return;
    }

    setHandleInput(authUser.handle || "");
    setHandleError("");
    setHandleStatus("");
    setHandleSaving(false);
    setHandleEditing(false);
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
  const normalizedCurrentHandle = authUser?.handle || "";
  const normalizedDraftHandle = handleInput.trim().toLocaleLowerCase();
  const handleUnchanged = normalizedDraftHandle && normalizedDraftHandle === normalizedCurrentHandle;
  const handleIsDefault = /^pid_[a-z0-9]{8}$/.test(authUser?.handle || "");
  const handleCooldownActive = Boolean(
    authUser?.nextHandleChangeAt && Date.parse(authUser.nextHandleChangeAt) > Date.now()
  );
  const profileName = authPending ? "账号加载中" : authUser?.displayName || authUser?.email || "登录";
  const profileSubtitle = authPending ? "正在检查登录状态" : authUser ? (authUser.email || "已登录") : null;
  const authApiStatus = authAvailable ? "已连接" : "未连接";
  const historyItems = useMemo(() => (watchHistoryItems ?? []).map((item) => ({
    ...item,
    displayTime: formatHistoryTime(item.watchedAt)
  })), [watchHistoryItems]);

  async function submitDisplayName() {
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

  async function submitHandle() {
    if (!authUser || !onUpdateHandle) {
      return;
    }

    setHandleSaving(true);
    setHandleError("");
    setHandleStatus("");

    try {
      const payload = await onUpdateHandle(handleInput.trim().toLocaleLowerCase());
      const nextValue = payload.user?.handle || handleInput.trim().toLocaleLowerCase();
      setHandleInput(nextValue);
      setHandleStatus("Handle 已更新");
      setHandleEditing(false);
    } catch (error) {
      setHandleError(error instanceof Error ? error.message : String(error));
    } finally {
      setHandleSaving(false);
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

  function startHandleEditing() {
    if (!authUser) {
      return;
    }

    setHandleInput(authUser.handle || "");
    setHandleError("");
    setHandleStatus("");
    setHandleEditing(true);
  }

  function cancelHandleEditing() {
    setHandleInput(authUser?.handle || "");
    setHandleError("");
    setHandleStatus("");
    setHandleSaving(false);
    setHandleEditing(false);
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
              <SettingsIcon />
            </button>
          </div>

          <div class="my-page-main">
            <aside class="my-page-aside">
              <ProfileSummaryCard
                authPending={authPending}
                authUser={authUser}
                profileName={profileName}
                profileSubtitle={profileSubtitle}
                onOpenProfilePanel={openProfilePanel}
              />
            </aside>

            <div class="my-page-content">
              <div class="my-page-sections">
                <WatchHistorySection
                  historyItems={historyItems}
                  onClearWatchHistory={onClearWatchHistory}
                  onOpenWatchHistoryItem={onOpenWatchHistoryItem}
                />
              </div>
            </div>
          </div>
        </div>

        {settingsPanelOpen ? (
          <SettingsDrawer
            authApiStatus={authApiStatus}
            buildLabel={buildLabel}
            logRef={logRef}
            logText={logText}
            onClose={() => {
              setSettingsPanelOpen(false);
            }}
            onRelayUrlInput={onRelayUrlInput}
            relayHost={relayHost}
            relayUrl={relayUrl}
          />
        ) : null}

        {accountPanelOpen && authUser ? (
          <AccountDrawer
            authUser={authUser}
            cancelDisplayNameEditing={cancelDisplayNameEditing}
            cancelHandleEditing={cancelHandleEditing}
            displayNameCooldownActive={displayNameCooldownActive}
            displayNameEditing={displayNameEditing}
            displayNameError={displayNameError}
            displayNameInput={displayNameInput}
            displayNameSaving={displayNameSaving}
            displayNameStatus={displayNameStatus}
            displayNameUnchanged={displayNameUnchanged}
            handleCooldownActive={handleCooldownActive}
            handleEditing={handleEditing}
            handleError={handleError}
            handleInput={handleInput}
            handleIsDefault={handleIsDefault}
            handleSaving={handleSaving}
            handleStatus={handleStatus}
            handleUnchanged={handleUnchanged}
            onClose={() => {
              setAccountPanelOpen(false);
            }}
            onLogout={onLogout}
            setDisplayNameError={setDisplayNameError}
            setDisplayNameInput={setDisplayNameInput}
            setDisplayNameStatus={setDisplayNameStatus}
            setHandleError={setHandleError}
            setHandleInput={setHandleInput}
            setHandleStatus={setHandleStatus}
            startDisplayNameEditing={startDisplayNameEditing}
            startHandleEditing={startHandleEditing}
            submitDisplayName={submitDisplayName}
            submitHandle={submitHandle}
          />
        ) : null}

        {loginPanelOpen ? (
          <LoginDrawer
            authAvailable={authAvailable}
            authLoading={authLoading}
            onClose={() => {
              setLoginPanelOpen(false);
            }}
            onMicrosoftLogin={onMicrosoftLogin}
          />
        ) : null}
      </div>
    </section>
  );
}
