import {
  ChevronRight,
  Pencil,
} from "lucide-react";
import { ProfileBio } from "../ProfileInfoSummary.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { SettingsPanelShell } from "./SettingsPanelShell.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

function ChevronIcon() {
  return <ChevronRight />;
}

function EditIcon() {
  return <Pencil />;
}

export function SettingsProfileAvatar({
  authUser,
  imgWidth,
  imgHeight,
  loading = false,
}) {
  const { t } = useI18n();

  return (
    <UserAvatar
      avatarUrl={authUser?.avatarUrl}
      displayName={authUser?.displayName}
      email={authUser?.email}
      className="my-profile-avatar"
      imgAlt={authUser?.displayName || t("common.userAvatar")}
      imgWidth={imgWidth}
      imgHeight={imgHeight}
      loading={loading}
      loadingClassName="auth-avatar-loading-spinner"
      monogramClassName="is-monogram"
      placeholderClassName="is-placeholder"
    />
  );
}

function AccountEditableField({
  editing,
  inputValue,
  label,
  maxLength,
  multiline = false,
  note,
  onInput,
  placeholder,
  readOnly = false,
  value,
  valueNode = null,
}) {
  const displayValue = valueNode || <strong>{value}</strong>;

  return (
    <div className={`account-editable-row${editing ? " is-editing" : ""}`}>
      {editing ? (
        <div className="account-editable-row-main">
          <span className="account-list-label">{label}</span>
          <div className="account-editable-value account-editable-value-editing">
            {multiline ? (
              <textarea
                value={inputValue}
                maxLength={maxLength}
                onInput={onInput}
                placeholder={placeholder}
                readOnly={readOnly}
                rows={3}
              />
            ) : (
              <input
                value={inputValue}
                maxLength={maxLength}
                onInput={onInput}
                placeholder={placeholder}
                readOnly={readOnly}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="account-editable-row-main">
          <span className="account-list-label">{label}</span>
          <div className="account-editable-value account-editable-value-inline">
            {displayValue}
          </div>
        </div>
      )}

      <div className={`account-editable-collapse${editing ? " is-open" : ""}`} aria-hidden={!editing}>
        <div className="account-editable-collapse-inner">
          <p className="account-editable-note">{note}</p>
        </div>
      </div>
    </div>
  );
}

function MobileAccountNavigationRow({
  ariaLabel,
  label,
  onClick,
  value,
  valueNode = null,
}) {
  return (
    <button
      type="button"
      className="account-editable-row account-editable-row-button"
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <span className="account-list-label">{label}</span>
      <div className="account-editable-value account-editable-value-inline">
        {valueNode || <strong>{value}</strong>}
        <span className="account-list-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </div>
    </button>
  );
}

function AccountStatusMessages({
  avatarError,
  avatarStatus,
  bioError,
  bioStatus,
  displayNameError,
  displayNameStatus,
  handleError,
  handleStatus,
}) {
  return (
    <div className="my-account-form-content">
      {handleError ? <p className="inline-warning">{handleError}</p> : null}
      {handleStatus ? <p className="status">{handleStatus}</p> : null}
      {displayNameError ? <p className="inline-warning">{displayNameError}</p> : null}
      {displayNameStatus ? <p className="status">{displayNameStatus}</p> : null}
      {bioError ? <p className="inline-warning">{bioError}</p> : null}
      {bioStatus ? <p className="status">{bioStatus}</p> : null}
      {avatarError ? <p className="inline-warning">{avatarError}</p> : null}
      {avatarStatus ? <p className="status">{avatarStatus}</p> : null}
    </div>
  );
}

export function AccountEditDrawer({
  closeLabel,
  error,
  inputValue,
  label,
  maxLength,
  multiline = false,
  note,
  onCancel,
  onInput,
  onSave,
  placeholder,
  readOnly = false,
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
          {multiline ? (
            <textarea
              value={inputValue}
              maxLength={maxLength}
              onInput={onInput}
              placeholder={placeholder}
              readOnly={readOnly}
              rows={4}
              autoFocus
            />
          ) : (
            <input
              value={inputValue}
              maxLength={maxLength}
              onInput={onInput}
              placeholder={placeholder}
              readOnly={readOnly}
              autoFocus
            />
          )}
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
  displayNameError,
  displayNameStatus,
  bioError,
  bioStatus,
  handleError,
  handleStatus,
  onClose,
  onOpenAvatarPicker,
  onSelectAvatar,
  startDisplayNameEditing,
  startBioEditing,
  startHandleEditing,
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
      title={t("accountPanel.profileTitle")}
      transitionClassName={transitionClassName}
    >
      <MobileAccountDetailsContent
        authUser={authUser}
        avatarError={avatarError}
        avatarInputRef={avatarInputRef}
        avatarSaving={avatarSaving}
        avatarStatus={avatarStatus}
        displayNameError={displayNameError}
        displayNameStatus={displayNameStatus}
        bioError={bioError}
        bioStatus={bioStatus}
        handleError={handleError}
        handleStatus={handleStatus}
        onOpenAvatarPicker={onOpenAvatarPicker}
        onSelectAvatar={onSelectAvatar}
        startDisplayNameEditing={startDisplayNameEditing}
        startBioEditing={startBioEditing}
        startHandleEditing={startHandleEditing}
      />
    </SettingsPanelShell>
  );
}

function MobileAccountDetailsContent({
  authUser,
  avatarError,
  avatarInputRef,
  avatarSaving,
  avatarStatus,
  bioError,
  bioStatus,
  displayNameError,
  displayNameStatus,
  handleError,
  handleStatus,
  onOpenAvatarPicker,
  onSelectAvatar,
  startDisplayNameEditing,
  startBioEditing,
  startHandleEditing,
}) {
  const { t } = useI18n();

  return (
    <div className="my-account-form">
      <div className="mobile-account-avatar-row">
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="account-avatar-input"
          onChange={onSelectAvatar}
        />
        <button
          type="button"
          className="mobile-account-avatar-button"
          aria-label={t("accountPanel.uploadAvatar")}
          disabled={avatarSaving}
          onClick={() => {
            if (!avatarSaving) {
              onOpenAvatarPicker();
            }
          }}
        >
          <SettingsProfileAvatar authUser={authUser} imgWidth={96} imgHeight={96} />
        </button>
      </div>

      <div className="account-panel-list">
        <div className="account-list-item">
          <span className="account-list-label">{t("accountPanel.email")}</span>
          <span className="account-list-value">
            <strong>{authUser.email || t("common.notBound")}</strong>
          </span>
        </div>

        <MobileAccountNavigationRow
          ariaLabel={t("accountPanel.editHandle")}
          label={t("accountPanel.handle")}
          onClick={startHandleEditing}
          value={authUser.handle || t("common.notSet")}
        />
        <MobileAccountNavigationRow
          ariaLabel={t("accountPanel.editDisplayName")}
          label={t("accountPanel.displayName")}
          onClick={startDisplayNameEditing}
          value={authUser.displayName || t("common.notSet")}
        />
        <MobileAccountNavigationRow
          ariaLabel={t("accountPanel.editBio")}
          label={t("accountPanel.bio")}
          onClick={startBioEditing}
          value={authUser.bio || t("profile.noBio")}
          valueNode={<ProfileBio className="profile-bio account-profile-bio" bio={authUser.bio} />}
        />
      </div>

      <AccountStatusMessages
        avatarError={avatarError}
        avatarStatus={avatarStatus}
        bioError={bioError}
        bioStatus={bioStatus}
        displayNameError={displayNameError}
        displayNameStatus={displayNameStatus}
        handleError={handleError}
        handleStatus={handleStatus}
      />
    </div>
  );
}

export function DesktopAccountDetailsContent({
  authUser,
  avatarError,
  avatarInputRef,
  avatarSaving,
  avatarStatus,
  cancelDisplayNameEditing,
  cancelBioEditing,
  cancelHandleEditing,
  displayNameCooldownActive,
  displayNameEditing,
  displayNameError,
  displayNameInput,
  displayNameSaving,
  displayNameStatus,
  bioEditing,
  bioError,
  bioInput,
  bioSaving,
  bioStatus,
  handleCooldownActive,
  handleEditing,
  handleError,
  handleInput,
  handleIsDefault,
  handleSaving,
  handleStatus,
  onOpenAvatarPicker,
  onSelectAvatar,
  setDisplayNameError,
  setDisplayNameInput,
  setDisplayNameStatus,
  setBioError,
  setBioInput,
  setBioStatus,
  setHandleError,
  setHandleInput,
  setHandleStatus,
  startDisplayNameEditing,
  startBioEditing,
  startHandleEditing,
  submitDisplayName,
  submitBio,
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
  const profileEditing = handleEditing || displayNameEditing || bioEditing;
  const normalizedHandleInput = handleInput.trim().toLowerCase();
  const normalizedCurrentHandle = (authUser.handle || "").toLowerCase();
  const normalizedCurrentDisplayName = (authUser.displayName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase(locale);
  const normalizedDraftDisplayName = displayNameInput.trim().replace(/\s+/g, " ").toLocaleLowerCase(locale);
  const normalizedCurrentBio = (authUser.bio || "").trim();
  const normalizedDraftBio = bioInput.trim();
  const handleReadOnly = !handleIsDefault && handleCooldownActive;
  const displayNameReadOnly = displayNameCooldownActive;
  const handleChanged = normalizedHandleInput !== normalizedCurrentHandle;
  const displayNameChanged = normalizedDraftDisplayName !== normalizedCurrentDisplayName;
  const bioChanged = normalizedDraftBio !== normalizedCurrentBio;
  const editableHandleChanged = !handleReadOnly && handleChanged;
  const editableDisplayNameChanged = !displayNameReadOnly && displayNameChanged;
  const profileChanged = editableHandleChanged || editableDisplayNameChanged || bioChanged;
  const profileSaving = handleSaving || displayNameSaving || bioSaving;
  const profileSaveInvalid =
    (editableHandleChanged && !normalizedHandleInput)
    || (editableDisplayNameChanged && !displayNameInput.trim());
  const profileSaveDisabled = profileSaving || profileSaveInvalid || !profileChanged;

  function startProfileEditing() {
    startHandleEditing();
    startDisplayNameEditing();
    startBioEditing();
  }

  function cancelProfileEditing() {
    cancelHandleEditing();
    cancelDisplayNameEditing();
    cancelBioEditing();
  }

  async function submitProfile() {
    if (profileSaveDisabled) {
      return;
    }

    if (!editableHandleChanged) {
      cancelHandleEditing();
    }
    if (!editableDisplayNameChanged) {
      cancelDisplayNameEditing();
    }
    if (!bioChanged) {
      cancelBioEditing();
    }

    if (editableHandleChanged) {
      await submitHandle();
    }
    if (editableDisplayNameChanged) {
      await submitDisplayName();
    }
    if (bioChanged) {
      await submitBio();
    }
  }

  return (
    <div className="my-account-form is-desktop-form">
      {!profileEditing ? (
        <div className="desktop-account-profile-row">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="account-avatar-input"
            onChange={onSelectAvatar}
          />
          <button
            type="button"
            className="desktop-account-avatar-button"
            aria-label={t("accountPanel.uploadAvatar")}
            disabled={avatarSaving}
            onClick={() => {
              if (!avatarSaving) {
                onOpenAvatarPicker();
              }
            }}
          >
            <SettingsProfileAvatar authUser={authUser} imgWidth={96} imgHeight={96} />
            <span className="desktop-account-avatar-overlay" aria-hidden="true">
              <EditIcon />
            </span>
          </button>
          <span className="desktop-account-profile-copy">
            <strong>{authUser.displayName || t("common.notSet")}</strong>
          </span>
          <span className="desktop-account-edit-profile-container">
            <button
              type="button"
              className="desktop-account-edit-profile-button"
              onClick={startProfileEditing}
            >
              {t("accountPanel.editProfile")}
            </button>
          </span>
        </div>
      ) : null}

      <div className="account-panel-list">
        <div className="account-list-item">
          <span className="account-list-label">{t("accountPanel.email")}</span>
          <span className="account-list-value">
            <strong>{authUser.email || t("common.notBound")}</strong>
          </span>
        </div>

        <AccountEditableField
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
          onInput={(event) => {
            setHandleInput(event.currentTarget.value.toLowerCase());
            setHandleError("");
            setHandleStatus("");
          }}
          placeholder={t("accountPanel.handlePlaceholder")}
          readOnly={handleReadOnly}
          value={authUser.handle || t("common.notSet")}
        />

        <AccountEditableField
          editing={displayNameEditing}
          inputValue={displayNameInput}
          label={t("accountPanel.displayName")}
          maxLength={32}
          note={displayNameNote}
          onInput={(event) => {
            setDisplayNameInput(event.currentTarget.value);
            setDisplayNameError("");
            setDisplayNameStatus("");
          }}
          placeholder={t("accountPanel.displayNamePlaceholder")}
          readOnly={displayNameReadOnly}
          value={authUser.displayName || t("common.notSet")}
        />

        <AccountEditableField
          editing={bioEditing}
          inputValue={bioInput}
          label={t("accountPanel.bio")}
          maxLength={160}
          multiline
          note={t("accountPanel.bioNote")}
          onInput={(event) => {
            setBioInput(event.currentTarget.value);
            setBioError("");
            setBioStatus("");
          }}
          placeholder={t("profile.noBio")}
          value={authUser.bio || t("profile.noBio")}
          valueNode={<ProfileBio className="profile-bio account-profile-bio" bio={authUser.bio} />}
        />
      </div>

      {profileEditing ? (
        <div className="desktop-account-actions">
          <button
            type="button"
            className="primary desktop-account-save-button"
            disabled={profileSaveDisabled}
            onClick={() => {
              void submitProfile();
            }}
          >
            {profileSaving ? t("common.saving") : t("common.save")}
          </button>
          <button
            type="button"
            className="desktop-account-cancel-button"
            onClick={cancelProfileEditing}
            disabled={profileSaving}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : null}

      <AccountStatusMessages
        avatarError={avatarError}
        avatarStatus={avatarStatus}
        bioError={bioError}
        bioStatus={bioStatus}
        displayNameError={displayNameError}
        displayNameStatus={displayNameStatus}
        handleError={handleError}
        handleStatus={handleStatus}
      />
    </div>
  );
}
