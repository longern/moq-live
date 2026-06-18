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

const GENDER_OPTIONS = ["male", "female", "other"];

export function formatAccountGender(value, t) {
  const gender = String(value || "").trim().toLowerCase();
  if (!gender) {
    return t("common.notSet");
  }
  return t(`profile.gender.${gender}`) || t("common.notSet");
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
  inputType = "text",
  label,
  maxLength,
  multiline = false,
  note,
  onInput,
  onSelectChange,
  placeholder,
  readOnly = false,
  selectOptions = null,
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
            ) : selectOptions ? (
              <select value={inputValue} onChange={onSelectChange} disabled={readOnly}>
                {selectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={inputType}
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

      {note ? (
        <div className={`account-editable-collapse${editing ? " is-open" : ""}`} aria-hidden={!editing}>
          <div className="account-editable-collapse-inner">
            <p className="account-editable-note">{note}</p>
          </div>
        </div>
      ) : null}
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
  birthDateError,
  birthDateStatus,
  genderError,
  genderStatus,
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
      {genderError ? <p className="inline-warning">{genderError}</p> : null}
      {genderStatus ? <p className="status">{genderStatus}</p> : null}
      {birthDateError ? <p className="inline-warning">{birthDateError}</p> : null}
      {birthDateStatus ? <p className="status">{birthDateStatus}</p> : null}
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
  inputType = "text",
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
              type={inputType}
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
  birthDateError,
  birthDateStatus,
  genderError,
  genderStatus,
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
  startGenderEditing,
  startBirthDateEditing,
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
        birthDateError={birthDateError}
        birthDateStatus={birthDateStatus}
        genderError={genderError}
        genderStatus={genderStatus}
        displayNameError={displayNameError}
        displayNameStatus={displayNameStatus}
        bioError={bioError}
        bioStatus={bioStatus}
        handleError={handleError}
        handleStatus={handleStatus}
        onOpenAvatarPicker={onOpenAvatarPicker}
        onSelectAvatar={onSelectAvatar}
        startDisplayNameEditing={startDisplayNameEditing}
        startGenderEditing={startGenderEditing}
        startBirthDateEditing={startBirthDateEditing}
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
  birthDateError,
  birthDateStatus,
  genderError,
  genderStatus,
  bioError,
  bioStatus,
  displayNameError,
  displayNameStatus,
  handleError,
  handleStatus,
  onOpenAvatarPicker,
  onSelectAvatar,
  startDisplayNameEditing,
  startGenderEditing,
  startBirthDateEditing,
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
          ariaLabel={t("accountPanel.editGender")}
          label={t("accountPanel.gender")}
          onClick={startGenderEditing}
          value={formatAccountGender(authUser.gender, t)}
        />
        <MobileAccountNavigationRow
          ariaLabel={t("accountPanel.editBirthDate")}
          label={t("accountPanel.birthDate")}
          onClick={startBirthDateEditing}
          value={authUser.birthDate || t("common.notSet")}
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
  birthDateEditing,
  birthDateError,
  birthDateInput,
  birthDateSaving,
  birthDateStatus,
  cancelBirthDateEditing,
  cancelDisplayNameEditing,
  cancelGenderEditing,
  cancelBioEditing,
  cancelHandleEditing,
  displayNameCooldownActive,
  displayNameEditing,
  displayNameError,
  displayNameInput,
  displayNameSaving,
  displayNameStatus,
  genderEditing,
  genderError,
  genderInput,
  genderSaving,
  genderStatus,
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
  setBirthDateError,
  setBirthDateInput,
  setBirthDateStatus,
  setDisplayNameError,
  setDisplayNameInput,
  setDisplayNameStatus,
  setGenderError,
  setGenderInput,
  setGenderStatus,
  setBioError,
  setBioInput,
  setBioStatus,
  setHandleError,
  setHandleInput,
  setHandleStatus,
  startBirthDateEditing,
  startDisplayNameEditing,
  startGenderEditing,
  startBioEditing,
  startHandleEditing,
  submitBirthDate,
  submitDisplayName,
  submitGender,
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
  const profileEditing = handleEditing || displayNameEditing || genderEditing || birthDateEditing || bioEditing;
  const normalizedHandleInput = handleInput.trim().toLowerCase();
  const normalizedCurrentHandle = (authUser.handle || "").toLowerCase();
  const normalizedCurrentDisplayName = (authUser.displayName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase(locale);
  const normalizedDraftDisplayName = displayNameInput.trim().replace(/\s+/g, " ").toLocaleLowerCase(locale);
  const currentGender = authUser.gender || "";
  const normalizedCurrentBirthDate = (authUser.birthDate || "").trim();
  const normalizedDraftBirthDate = birthDateInput.trim();
  const normalizedCurrentBio = (authUser.bio || "").trim();
  const normalizedDraftBio = bioInput.trim();
  const handleReadOnly = !handleIsDefault && handleCooldownActive;
  const displayNameReadOnly = displayNameCooldownActive;
  const handleChanged = normalizedHandleInput !== normalizedCurrentHandle;
  const displayNameChanged = normalizedDraftDisplayName !== normalizedCurrentDisplayName;
  const genderChanged = genderInput !== currentGender;
  const birthDateChanged = normalizedDraftBirthDate !== normalizedCurrentBirthDate;
  const bioChanged = normalizedDraftBio !== normalizedCurrentBio;
  const editableHandleChanged = !handleReadOnly && handleChanged;
  const editableDisplayNameChanged = !displayNameReadOnly && displayNameChanged;
  const profileChanged = editableHandleChanged || editableDisplayNameChanged || genderChanged || birthDateChanged || bioChanged;
  const profileSaving = handleSaving || displayNameSaving || genderSaving || birthDateSaving || bioSaving;
  const profileSaveInvalid =
    (editableHandleChanged && !normalizedHandleInput)
    || (editableDisplayNameChanged && !displayNameInput.trim());
  const profileSaveDisabled = profileSaving || profileSaveInvalid || !profileChanged;

  function startProfileEditing() {
    startHandleEditing();
    startDisplayNameEditing();
    startGenderEditing();
    startBirthDateEditing();
    startBioEditing();
  }

  function cancelProfileEditing() {
    cancelHandleEditing();
    cancelDisplayNameEditing();
    cancelGenderEditing();
    cancelBirthDateEditing();
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
    if (!genderChanged) {
      cancelGenderEditing();
    }
    if (!bioChanged) {
      cancelBioEditing();
    }
    if (!birthDateChanged) {
      cancelBirthDateEditing();
    }

    if (editableHandleChanged) {
      await submitHandle();
    }
    if (editableDisplayNameChanged) {
      await submitDisplayName();
    }
    if (genderChanged) {
      await submitGender();
    }
    if (birthDateChanged) {
      await submitBirthDate();
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
          editing={genderEditing}
          inputValue={genderInput}
          label={t("accountPanel.gender")}
          onSelectChange={(event) => {
            setGenderInput(event.currentTarget.value);
            setGenderError("");
            setGenderStatus("");
          }}
          selectOptions={
            GENDER_OPTIONS.map((gender) => ({
              value: gender,
              label: t(`profile.gender.${gender}`),
            }))
          }
          value={formatAccountGender(authUser.gender, t)}
        />

        <AccountEditableField
          editing={birthDateEditing}
          inputType="date"
          inputValue={birthDateInput}
          label={t("accountPanel.birthDate")}
          onInput={(event) => {
            setBirthDateInput(event.currentTarget.value);
            setBirthDateError("");
            setBirthDateStatus("");
          }}
          value={authUser.birthDate || t("common.notSet")}
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
        birthDateError={birthDateError}
        birthDateStatus={birthDateStatus}
        genderError={genderError}
        genderStatus={genderStatus}
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
