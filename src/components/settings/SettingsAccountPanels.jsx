import {
  Check,
  ChevronRight,
  Pencil,
  X,
} from "lucide-react";
import { UserAvatar } from "../UserAvatar.jsx";
import { SettingsPanelShell } from "./SettingsPanelShell.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

function ChevronIcon() {
  return <ChevronRight />;
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

export function SettingsProfileAvatar({ authUser }) {
  const { t } = useI18n();

  return (
    <UserAvatar
      avatarUrl={authUser?.avatarUrl}
      displayName={authUser?.displayName}
      email={authUser?.email}
      className="my-profile-avatar"
      imgAlt={authUser?.displayName || t("common.userAvatar")}
      monogramClassName="is-monogram"
      placeholderClassName="is-placeholder"
    />
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
  value,
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

export function AccountEditDrawer({
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
  transitionClassName,
}) {
  const { t } = useI18n();

  return (
    <SettingsPanelShell
      backdropClassName="auth-panel-backdrop auth-panel-edit-backdrop"
      backdropLabel={closeLabel}
      bodyClassName="account-edit-panel-body"
      closeLabel={t("common.back")}
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
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </SettingsPanelShell>
  );
}

export function AccountDrawer({
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
  transitionClassName,
}) {
  const { t } = useI18n();

  return (
    <SettingsPanelShell
      backdropClassName="auth-panel-backdrop"
      backdropLabel={t("accountPanel.closeAccountPage")}
      bodyClassName="account-panel-body"
      closeLabel={t("common.back")}
      closeButtonClassName="account-panel-close"
      headClassName="account-panel-head"
      onClose={onClose}
      panelClassName="auth-panel auth-panel-account"
      panelLabel={t("accountPanel.accountPage")}
      title={t("settings.account")}
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
    </SettingsPanelShell>
  );
}

export function AccountDetailsContent({
  authUser,
  desktopLayout = false,
  showLogout = true,
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
}) {
  const { locale, t } = useI18n();
  const handleNote = handleIsDefault
    ? t("accountPanel.handleDefaultNote")
    : handleCooldownActive
      ? t("accountPanel.handleCooldownNote", { time: new Date(authUser.nextHandleChangeAt).toLocaleString(locale) })
      : t("accountPanel.handleNote");
  const displayNameNote = displayNameCooldownActive
    ? t("accountPanel.displayNameCooldownNote", { time: new Date(authUser.nextDisplayNameChangeAt).toLocaleString(locale) })
    : t("accountPanel.displayNameNote");

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
    <div className={`my-account-form${desktopLayout ? " is-desktop-form" : ""}`}>
      <div className="account-panel-list">
        <div
          className="account-list-item account-list-item-avatar account-list-item-button"
          role="button"
          tabIndex={avatarSaving ? -1 : 0}
          aria-disabled={avatarSaving}
          aria-label={t("accountPanel.uploadAvatar")}
          onClick={() => {
            if (!avatarSaving) {
              onOpenAvatarPicker();
            }
          }}
          onKeyDown={handleAvatarItemKeyDown}
        >
          <span className="account-list-label">{t("accountPanel.avatar")}</span>
          <div className="account-list-value account-list-avatar">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="account-avatar-input"
              onChange={onSelectAvatar}
            />
            <div className="account-list-avatar-editable">
              <SettingsProfileAvatar authUser={authUser} />
            </div>
            <span className="account-list-chevron" aria-hidden="true">
              {desktopLayout ? <EditIcon /> : <ChevronIcon />}
            </span>
          </div>
        </div>

        <div className="account-list-item">
          <span className="account-list-label">{t("accountPanel.email")}</span>
          <span className="account-list-value">
            <strong>{authUser.email || t("common.notBound")}</strong>
          </span>
        </div>

        <AccountEditableField
          cancelAriaLabel={t("accountPanel.cancelEditHandle")}
          editAriaLabel={t("accountPanel.editHandle")}
          editing={handleEditing}
          inputValue={handleInput}
          label={t("accountPanel.handle")}
          maxLength={24}
          note={(
            <>
              {handleNote}
              <br />
              {t("accountPanel.handleRule")}
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
          placeholder={t("accountPanel.handlePlaceholder")}
          saveAriaLabel={t("accountPanel.saveHandle")}
          saveDisabled={handleSaving || !handleInput.trim() || handleUnchanged}
          value={authUser.handle || t("common.notSet")}
        />

        <AccountEditableField
          cancelAriaLabel={t("accountPanel.cancelEditDisplayName")}
          editAriaLabel={t("accountPanel.editDisplayName")}
          editing={displayNameEditing}
          inputValue={displayNameInput}
          label={t("accountPanel.displayName")}
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
          placeholder={t("accountPanel.displayNamePlaceholder")}
          saveAriaLabel={t("accountPanel.saveDisplayName")}
          saveDisabled={
            displayNameSaving
            || displayNameCooldownActive
            || !displayNameInput.trim()
            || displayNameUnchanged
          }
          value={authUser.displayName || t("common.notSet")}
        />
      </div>

      <div className="my-account-form-content">
        {handleError ? <p className="inline-warning">{handleError}</p> : null}
        {handleStatus ? <p className="status">{handleStatus}</p> : null}
        {displayNameError ? <p className="inline-warning">{displayNameError}</p> : null}
        {displayNameStatus ? <p className="status">{displayNameStatus}</p> : null}
        {avatarError ? <p className="inline-warning">{avatarError}</p> : null}
        {avatarStatus ? <p className="status">{avatarStatus}</p> : null}

        {showLogout ? (
          <div className="my-account-actions">
            <button
              type="button"
              className="my-plain-danger-button"
              onClick={() => {
                onClose();
                onLogout();
              }}
            >
              {t("account.logout")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
