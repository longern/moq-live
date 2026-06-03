import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { LoginDrawer } from "./LoginDrawer.jsx";
import { MobilePanelPresence, useMobilePanelViewport } from "./MobilePanelPresence.jsx";
import { UserAvatar } from "./UserAvatar.jsx";
import { createAppError, getAppErrorMessage } from "../lib/appErrors.js";

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

function getWatchHistoryHref(item) {
  const room = item?.room?.trim();
  return room ? `?r=${encodeURIComponent(room)}` : "?";
}

function ChevronIcon() {
  return <ChevronRight />;
}

function BackIcon() {
  return <ChevronLeft aria-hidden="true" />;
}

function SettingsIcon() {
  return <SlidersHorizontal />;
}

function CheckIcon() {
  return <Check />;
}

function CloseIcon() {
  return <X />;
}

function EditIcon() {
  return <Pencil />;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(createAppError("avatar_image_unreadable"));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(createAppError("avatar_image_process_failed"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function resizeAvatarFile(file, size = 192) {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw createAppError("avatar_resize_unsupported");
  }

  const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const sourceX = Math.max(0, ((image.naturalWidth || image.width) - sourceSize) / 2);
  const sourceY = Math.max(0, ((image.naturalHeight || image.height) - sourceSize) / 2);

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size
  );

  const blob = await canvasToBlob(canvas, "image/webp", 0.9);
  return new File([blob], "avatar.webp", { type: "image/webp" });
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
    <section className="my-section">
      <div className="my-section-head">
        <span className="my-section-title">{title}</span>
        {action}
      </div>
      <div className="my-section-body">{children}</div>
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
  transitionClassName = "",
  children
}) {
  const transitionSuffix = transitionClassName ? ` ${transitionClassName}` : "";

  return (
    <>
      <button
        type="button"
        className={`${backdropClassName}${transitionSuffix}`}
        aria-label={backdropLabel}
        onClick={onClose}
      />
      <aside className={`${panelClassName}${transitionSuffix}`} aria-label={panelLabel}>
        <div className={headClassName}>
          <button
            type="button"
            className={closeButtonClassName}
            aria-label={closeLabel}
            onClick={onClose}
          >
            <BackIcon />
          </button>
          <strong>{title}</strong>
          <span className="panel-head-spacer" aria-hidden="true" />
        </div>
        <div className={bodyClassName}>{children}</div>
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
    <section className="my-account-card">
      <button
        type="button"
        className={`my-profile-row${authUser ? "" : " is-guest"}${authPending ? " is-loading" : ""}`}
        onClick={onOpenProfilePanel}
        disabled={authPending}
        aria-busy={authPending}
      >
        <ProfileAvatar authUser={authUser} />
        <span className="my-profile-copy">
          <strong>{profileName}</strong>
          {profileSubtitle ? <span>{profileSubtitle}</span> : null}
        </span>
        <span className="my-profile-chevron" aria-hidden="true">
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
        <button type="button" className="my-section-link" onClick={onClearWatchHistory}>清空</button>
      ) : null}
    >
      {historyItems.length ? (
        <ul className="my-history-list">
          {historyItems.map((item) => (
            <li key={`${item.room}-${item.watchedAt}`}>
              <a
                href={getWatchHistoryHref(item)}
                className="my-history-row"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenWatchHistoryItem?.(item);
                }}
              >
                <span className="my-history-copy">
                  <strong>{item.room}</strong>
                </span>
                <span className="my-history-meta">
                  <span>{item.displayTime}</span>
                  <span className="my-row-chevron" aria-hidden="true">
                    <ChevronIcon />
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <div className="my-empty-state">
          <span>暂无观看历史</span>
        </div>
      )}
    </SectionBlock>
  );
}

function AdvancedSettingsContent({
  authApiStatus,
  buildLabel,
  logRef,
  logText,
  onRelayUrlInput,
  relayHost,
  relayUrl
}) {
  return (
    <>
      <SectionBlock title="连接">
        <label className="my-field">
          <span>Relay Endpoint</span>
          <input id="url" value={relayUrl} onInput={onRelayUrlInput} />
        </label>
        <div className="my-info-row">
          <strong>当前 Host</strong>
          <span data-relay-host>{relayHost}</span>
        </div>
      </SectionBlock>

      <SectionBlock title="诊断">
        <div className="my-info-row">
          <strong>Auth API</strong>
          <span>{authApiStatus}</span>
        </div>
        <div className="my-info-row">
          <strong>Build</strong>
          <span id="buildSubtitle">{buildLabel}</span>
        </div>
        <article className="my-log-block">
          <h3>开发日志</h3>
          <pre id="log" ref={logRef}>{logText}</pre>
        </article>
      </SectionBlock>
    </>
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
  relayUrl,
  transitionClassName
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
      transitionClassName={transitionClassName}
    >
      <AdvancedSettingsContent
        authApiStatus={authApiStatus}
        buildLabel={buildLabel}
        logRef={logRef}
        logText={logText}
        onRelayUrlInput={onRelayUrlInput}
        relayHost={relayHost}
        relayUrl={relayUrl}
      />
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
    <div className={`account-editable-row${editing ? " is-editing" : ""}`}>
      <div className="account-editable-row-main">
        <span className="account-list-label">{label}</span>

        {editing ? (
          <div className="account-editable-value account-editable-value-editing">
            <input
              value={inputValue}
              maxLength={maxLength}
              onInput={onInput}
              placeholder={placeholder}
            />
            <div className="account-icon-actions">
              <button
                type="button"
                className="account-icon-button"
                aria-label={saveAriaLabel}
                disabled={saveDisabled}
                onClick={onSave}
              >
                <CheckIcon />
              </button>
              <button
                type="button"
                className="account-icon-button"
                aria-label={cancelAriaLabel}
                onClick={onCancelEditing}
              >
                <CloseIcon />
              </button>
            </div>
          </div>
        ) : (
          <div className="account-editable-value account-editable-value-inline">
            <strong>{value}</strong>
            <button
              type="button"
              className="account-icon-button"
              aria-label={editAriaLabel}
              onClick={onStartEditing}
            >
              <EditIcon />
            </button>
          </div>
        )}
      </div>

      <div className={`account-editable-collapse${editing ? " is-open" : ""}`} aria-hidden={!editing}>
        <div className="account-editable-collapse-inner">
          <p className="account-editable-note">{note}</p>
        </div>
      </div>
    </div>
  );
}

function AccountEditDrawer({
  closeLabel,
  error,
  inputValue,
  label,
  maxLength,
  note,
  onCancel,
  onInput,
  onSave,
  placeholder,
  saveDisabled,
  saving,
  status,
  title,
  transitionClassName
}) {
  return (
    <PanelShell
      backdropClassName="auth-panel-backdrop auth-panel-edit-backdrop"
      backdropLabel={closeLabel}
      bodyClassName="account-edit-panel-body"
      closeLabel="返回"
      closeButtonClassName="account-panel-close"
      headClassName="account-panel-head"
      onClose={onCancel}
      panelClassName="auth-panel auth-panel-account auth-panel-edit"
      panelLabel={title}
      title={title}
      transitionClassName={transitionClassName}
    >
      <form
        className="account-edit-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saveDisabled) {
            onSave();
          }
        }}
      >
        <label className="account-edit-field">
          <span>{label}</span>
          <input
            value={inputValue}
            maxLength={maxLength}
            onInput={onInput}
            placeholder={placeholder}
            autoFocus
          />
        </label>
        <p className="account-edit-note">{note}</p>
        {error ? <p className="inline-warning">{error}</p> : null}
        {status ? <p className="status">{status}</p> : null}
        <div className="account-edit-actions">
          <button type="submit" className="primary" disabled={saveDisabled}>
            {saving ? "保存中" : "保存"}
          </button>
        </div>
      </form>
    </PanelShell>
  );
}

function AccountDrawer({
  authUser,
  avatarError,
  avatarInputRef,
  avatarSaving,
  avatarStatus,
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
  onOpenAvatarPicker,
  onSelectAvatar,
  setDisplayNameError,
  setDisplayNameInput,
  setDisplayNameStatus,
  setHandleError,
  setHandleInput,
  setHandleStatus,
  startDisplayNameEditing,
  startHandleEditing,
  submitDisplayName,
  submitHandle,
  transitionClassName
}) {
  return (
    <PanelShell
      backdropClassName="auth-panel-backdrop"
      backdropLabel="关闭账号页面"
      bodyClassName="account-panel-body"
      closeLabel="返回"
      closeButtonClassName="account-panel-close"
      headClassName="account-panel-head"
      onClose={onClose}
      panelClassName="auth-panel auth-panel-account"
      panelLabel="账号页面"
      title="账号"
      transitionClassName={transitionClassName}
    >
      <AccountDetailsContent
        authUser={authUser}
        avatarError={avatarError}
        avatarInputRef={avatarInputRef}
        avatarSaving={avatarSaving}
        avatarStatus={avatarStatus}
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
        onClose={onClose}
        onLogout={onLogout}
        onOpenAvatarPicker={onOpenAvatarPicker}
        onSelectAvatar={onSelectAvatar}
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
    </PanelShell>
  );
}

function AccountDetailsContent({
  authUser,
  avatarError,
  avatarInputRef,
  avatarSaving,
  avatarStatus,
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
  onOpenAvatarPicker,
  onSelectAvatar,
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
    ? "默认主播号可随时设置一次专属地址。"
    : handleCooldownActive
      ? `自定义后 30 天内只能修改一次，下次可修改时间：${new Date(authUser.nextHandleChangeAt).toLocaleString()}`
      : "自定义后 30 天内只能修改一次。";
  const displayNameNote = displayNameCooldownActive
    ? `显示名 7 天内只能修改一次，下次可修改时间：${new Date(authUser.nextDisplayNameChangeAt).toLocaleString()}`
    : "显示名需要唯一，且 7 天内只能修改一次。";

  function handleAvatarItemKeyDown(event) {
    if (avatarSaving) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenAvatarPicker();
    }
  }

  return (
    <div className="my-account-form">
      <div className="account-panel-list">
        <div
          className="account-list-item account-list-item-avatar account-list-item-button"
          role="button"
          tabIndex={avatarSaving ? -1 : 0}
          aria-disabled={avatarSaving}
          aria-label="上传新头像"
          onClick={() => {
            if (!avatarSaving) {
              onOpenAvatarPicker();
            }
          }}
          onKeyDown={handleAvatarItemKeyDown}
        >
          <span className="account-list-label">头像</span>
          <div className="account-list-value account-list-avatar">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="account-avatar-input"
              onChange={onSelectAvatar}
            />
            <div className="account-list-avatar-editable">
              <ProfileAvatar authUser={authUser} />
            </div>
            <span className="account-list-chevron" aria-hidden="true">
              <ChevronIcon />
            </span>
          </div>
        </div>

        <div className="account-list-item">
          <span className="account-list-label">邮箱</span>
          <span className="account-list-value">
            <strong>{authUser.email || "未绑定"}</strong>
          </span>
        </div>

        <AccountEditableField
          cancelAriaLabel="取消编辑主播号"
          editAriaLabel="编辑主播号"
          editing={handleEditing}
          inputValue={handleInput}
          label="主播号"
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
          placeholder="输入唯一主播号"
          saveAriaLabel="保存主播号"
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

      <div className="my-account-form-content">
        {handleError ? <p className="inline-warning">{handleError}</p> : null}
        {handleStatus ? <p className="status">{handleStatus}</p> : null}
        {displayNameError ? <p className="inline-warning">{displayNameError}</p> : null}
        {displayNameStatus ? <p className="status">{displayNameStatus}</p> : null}
        {avatarError ? <p className="inline-warning">{avatarError}</p> : null}
        {avatarStatus ? <p className="status">{avatarStatus}</p> : null}

        <div className="my-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onClose();
              onLogout();
            }}
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}

function DesktopSettingsSidebar({
  activeSection,
  onSelectSection
}) {
  const items = [
    {
      id: "account",
      title: "账号信息"
    },
    {
      id: "history",
      title: "观看历史"
    },
    {
      id: "advanced",
      title: "高级设置"
    }
  ];

  return (
    <nav className="desktop-settings-sidebar" aria-label="个人中心">
      <div className="desktop-settings-list">
        {items.map((item) => {
          const active = activeSection === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`desktop-settings-list-item${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                onSelectSection(item.id);
              }}
            >
              <span>
                <strong>{item.title}</strong>
              </span>
              <span className="my-row-chevron" aria-hidden="true">
                <ChevronIcon />
              </span>
            </button>
          );
        })}
      </div>
    </nav>
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
  onUpdateAvatar,
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
  const [mobileEditPanel, setMobileEditPanel] = useState(null);
  const [desktopSection, setDesktopSection] = useState("account");
  const [avatarError, setAvatarError] = useState("");
  const [avatarStatus, setAvatarStatus] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const avatarInputRef = useRef(null);
  const authPending = authLoading;
  const isMobilePanelViewport = useMobilePanelViewport();

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
      setMobileEditPanel(null);
      setAvatarError("");
      setAvatarStatus("");
      setAvatarSaving(false);
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
    setAvatarError("");
    setAvatarStatus("");
    setAvatarSaving(false);
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
      setMobileEditPanel((current) => (current === "displayName" ? null : current));
    } catch (error) {
      setDisplayNameError(getAppErrorMessage(error));
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
      setHandleStatus("主播号已更新");
      setHandleEditing(false);
      setMobileEditPanel((current) => (current === "handle" ? null : current));
    } catch (error) {
      setHandleError(getAppErrorMessage(error));
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
    if (isMobilePanelViewport) {
      setMobileEditPanel("displayName");
    }
  }

  function startHandleEditing() {
    if (!authUser) {
      return;
    }

    setHandleInput(authUser.handle || "");
    setHandleError("");
    setHandleStatus("");
    setHandleEditing(true);
    if (isMobilePanelViewport) {
      setMobileEditPanel("handle");
    }
  }

  function cancelHandleEditing() {
    setHandleInput(authUser?.handle || "");
    setHandleError("");
    setHandleStatus("");
    setHandleSaving(false);
    setHandleEditing(false);
    setMobileEditPanel((current) => (current === "handle" ? null : current));
  }

  function cancelDisplayNameEditing() {
    setDisplayNameInput(authUser?.displayName || "");
    setDisplayNameError("");
    setDisplayNameStatus("");
    setDisplayNameSaving(false);
    setDisplayNameEditing(false);
    setMobileEditPanel((current) => (current === "displayName" ? null : current));
  }

  function openAvatarPicker() {
    avatarInputRef.current?.click();
  }

  async function submitAvatarFile(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file || !onUpdateAvatar) {
      return;
    }

    setAvatarSaving(true);
    setAvatarError("");
    setAvatarStatus("");

    try {
      const resizedFile = await resizeAvatarFile(file, 192);
      await onUpdateAvatar(resizedFile);
      setAvatarStatus("头像已更新");
    } catch (error) {
      setAvatarError(getAppErrorMessage(error));
    } finally {
      setAvatarSaving(false);
    }
  }

  return (
    <section className="page" data-page="settings" hidden={hidden}>
      <div className="page-grid settings-layout">
        <div className="my-page-shell">
          <div className="my-page-toolbar my-page-toolbar-mobile">
            <div />
            <button
              type="button"
              className="my-page-settings-button"
              aria-label="打开设置"
              onClick={() => {
                setSettingsPanelOpen(true);
              }}
            >
              <SettingsIcon />
            </button>
          </div>

          <div className="my-page-main">
            <aside className="my-page-aside">
              <DesktopSettingsSidebar
                activeSection={desktopSection}
                onSelectSection={setDesktopSection}
              />
              <div className="mobile-settings-profile">
                <ProfileSummaryCard
                  authPending={authPending}
                  authUser={authUser}
                  profileName={profileName}
                  profileSubtitle={profileSubtitle}
                  onOpenProfilePanel={openProfilePanel}
                />
              </div>
            </aside>

            <div className="my-page-content">
              <div className="desktop-settings-content my-page-sections">
                {desktopSection === "account" ? (
                  <SectionBlock title="账号信息">
                    {authUser ? (
                      <AccountDetailsContent
                        authUser={authUser}
                        avatarError={avatarError}
                        avatarInputRef={avatarInputRef}
                        avatarSaving={avatarSaving}
                        avatarStatus={avatarStatus}
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
                        onClose={() => {}}
                        onLogout={onLogout}
                        onOpenAvatarPicker={openAvatarPicker}
                        onSelectAvatar={(event) => {
                          void submitAvatarFile(event);
                        }}
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
                    ) : (
                      <div className="my-empty-state my-login-empty">
                        <span>{authPending ? "正在检查登录状态" : "登录后可以管理头像、主播号和显示名。"}</span>
                        <button
                          type="button"
                          className="my-plain-login-button"
                          onClick={openLoginPanel}
                          disabled={authPending}
                        >
                          继续登录
                        </button>
                      </div>
                    )}
                  </SectionBlock>
                ) : null}

                {desktopSection === "history" ? (
                  <WatchHistorySection
                    historyItems={historyItems}
                    onClearWatchHistory={onClearWatchHistory}
                    onOpenWatchHistoryItem={onOpenWatchHistoryItem}
                  />
                ) : null}

                {desktopSection === "advanced" ? (
                  <AdvancedSettingsContent
                    authApiStatus={authApiStatus}
                    buildLabel={buildLabel}
                    logRef={logRef}
                    logText={logText}
                    onRelayUrlInput={onRelayUrlInput}
                    relayHost={relayHost}
                    relayUrl={relayUrl}
                  />
                ) : null}
              </div>

              <div className="mobile-settings-content my-page-sections">
                <WatchHistorySection
                  historyItems={historyItems}
                  onClearWatchHistory={onClearWatchHistory}
                  onOpenWatchHistoryItem={onOpenWatchHistoryItem}
                />
              </div>
            </div>
          </div>
        </div>

        <MobilePanelPresence open={settingsPanelOpen}>
          {({ transitionClassName }) => (
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
              transitionClassName={transitionClassName}
            />
          )}
        </MobilePanelPresence>

        <MobilePanelPresence open={accountPanelOpen && Boolean(authUser)}>
          {({ transitionClassName }) => (authUser ? (
            <AccountDrawer
              authUser={authUser}
              avatarError={avatarError}
              avatarInputRef={avatarInputRef}
              avatarSaving={avatarSaving}
              avatarStatus={avatarStatus}
              cancelDisplayNameEditing={cancelDisplayNameEditing}
              cancelHandleEditing={cancelHandleEditing}
              displayNameCooldownActive={displayNameCooldownActive}
              displayNameEditing={!isMobilePanelViewport && displayNameEditing}
              displayNameError={displayNameError}
              displayNameInput={displayNameInput}
              displayNameSaving={displayNameSaving}
              displayNameStatus={displayNameStatus}
              displayNameUnchanged={displayNameUnchanged}
              handleCooldownActive={handleCooldownActive}
              handleEditing={!isMobilePanelViewport && handleEditing}
              handleError={handleError}
              handleInput={handleInput}
              handleIsDefault={handleIsDefault}
              handleSaving={handleSaving}
              handleStatus={handleStatus}
              handleUnchanged={handleUnchanged}
              onClose={() => {
                setAccountPanelOpen(false);
                setMobileEditPanel(null);
              }}
              onLogout={onLogout}
              onOpenAvatarPicker={openAvatarPicker}
              onSelectAvatar={(event) => {
                void submitAvatarFile(event);
              }}
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
              transitionClassName={transitionClassName}
            />
          ) : null)}
        </MobilePanelPresence>

        <MobilePanelPresence open={mobileEditPanel === "handle" && Boolean(authUser)}>
          {({ transitionClassName }) => (authUser ? (
            <AccountEditDrawer
              closeLabel="关闭主播号编辑页面"
              error={handleError}
              inputValue={handleInput}
              label="主播号"
              maxLength={24}
              note={(
                <>
                  {handleIsDefault
                    ? "默认主播号可随时设置一次专属地址。"
                    : handleCooldownActive
                      ? `自定义后 30 天内只能修改一次，下次可修改时间：${new Date(authUser.nextHandleChangeAt).toLocaleString()}`
                      : "自定义后 30 天内只能修改一次。"}
                  <br />
                  仅支持小写字母、数字、下划线，长度 6-24，不能为纯数字，且不能以下划线开头或结尾。
                </>
              )}
              onCancel={cancelHandleEditing}
              onInput={(event) => {
                setHandleInput(event.currentTarget.value.toLowerCase());
                setHandleError("");
                setHandleStatus("");
              }}
              onSave={() => {
                void submitHandle();
              }}
              placeholder="输入唯一主播号"
              saveDisabled={handleSaving || !handleInput.trim() || handleUnchanged}
              saving={handleSaving}
              status={handleStatus}
              title="编辑主播号"
              transitionClassName={transitionClassName}
            />
          ) : null)}
        </MobilePanelPresence>

        <MobilePanelPresence open={mobileEditPanel === "displayName" && Boolean(authUser)}>
          {({ transitionClassName }) => (authUser ? (
            <AccountEditDrawer
              closeLabel="关闭显示名编辑页面"
              error={displayNameError}
              inputValue={displayNameInput}
              label="显示名"
              maxLength={32}
              note={displayNameCooldownActive
                ? `显示名 7 天内只能修改一次，下次可修改时间：${new Date(authUser.nextDisplayNameChangeAt).toLocaleString()}`
                : "显示名需要唯一，且 7 天内只能修改一次。"}
              onCancel={cancelDisplayNameEditing}
              onInput={(event) => {
                setDisplayNameInput(event.currentTarget.value);
                setDisplayNameError("");
                setDisplayNameStatus("");
              }}
              onSave={() => {
                void submitDisplayName();
              }}
              placeholder="输入想显示的名称"
              saveDisabled={
                displayNameSaving
                || displayNameCooldownActive
                || !displayNameInput.trim()
                || displayNameUnchanged
              }
              saving={displayNameSaving}
              status={displayNameStatus}
              title="编辑显示名"
              transitionClassName={transitionClassName}
            />
          ) : null)}
        </MobilePanelPresence>

        <MobilePanelPresence open={loginPanelOpen}>
          {({ transitionClassName }) => (
            <LoginDrawer
              authAvailable={authAvailable}
              authLoading={authLoading}
              onClose={() => {
                setLoginPanelOpen(false);
              }}
              onMicrosoftLogin={onMicrosoftLogin}
              transitionClassName={transitionClassName}
            />
          )}
        </MobilePanelPresence>
      </div>
    </section>
  );
}
