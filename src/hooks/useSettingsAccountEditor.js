import { useEffect, useRef, useState } from "react";
import { getAppErrorMessage } from "../lib/appErrors.js";
import { resizeAvatarFile } from "../lib/imageResize.js";

export function useSettingsAccountEditor({
  authUser,
  isMobilePanelViewport,
  locale,
  onUpdateAvatar,
  onUpdateBio,
  onUpdateBirthDate,
  onUpdateDisplayName,
  onUpdateGender,
  onUpdateHandle,
  showToast,
  setMobileEditPanel,
  t,
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
  const [genderInput, setGenderInput] = useState("");
  const [genderError, setGenderError] = useState("");
  const [genderStatus, setGenderStatus] = useState("");
  const [genderSaving, setGenderSaving] = useState(false);
  const [genderEditing, setGenderEditing] = useState(false);
  const [birthDateInput, setBirthDateInput] = useState("");
  const [birthDateError, setBirthDateError] = useState("");
  const [birthDateStatus, setBirthDateStatus] = useState("");
  const [birthDateSaving, setBirthDateSaving] = useState(false);
  const [birthDateEditing, setBirthDateEditing] = useState(false);
  const [bioInput, setBioInput] = useState("");
  const [bioError, setBioError] = useState("");
  const [bioStatus, setBioStatus] = useState("");
  const [bioSaving, setBioSaving] = useState(false);
  const [bioEditing, setBioEditing] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarStatus, setAvatarStatus] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const avatarInputRef = useRef(null);

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
      setGenderInput("");
      setGenderError("");
      setGenderStatus("");
      setGenderSaving(false);
      setGenderEditing(false);
      setBirthDateInput("");
      setBirthDateError("");
      setBirthDateStatus("");
      setBirthDateSaving(false);
      setBirthDateEditing(false);
      setBioInput("");
      setBioError("");
      setBioStatus("");
      setBioSaving(false);
      setBioEditing(false);
      setAvatarError("");
      setAvatarStatus("");
      setAvatarSaving(false);
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
    setGenderInput(authUser.gender || "other");
    setGenderError("");
    setGenderStatus("");
    setGenderSaving(false);
    setGenderEditing(false);
    setBirthDateInput(authUser.birthDate || "");
    setBirthDateError("");
    setBirthDateStatus("");
    setBirthDateSaving(false);
    setBirthDateEditing(false);
    setBioInput(authUser.bio || "");
    setBioError("");
    setBioStatus("");
    setBioSaving(false);
    setBioEditing(false);
    setAvatarError("");
    setAvatarStatus("");
    setAvatarSaving(false);
  }, [authUser?.id]);

  const displayNameCooldownActive = Boolean(
    authUser?.nextDisplayNameChangeAt && Date.parse(authUser.nextDisplayNameChangeAt) > Date.now()
  );
  const normalizedCurrentDisplayName = (authUser?.displayName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase(locale);
  const normalizedDraftDisplayName = displayNameInput.trim().replace(/\s+/g, " ").toLocaleLowerCase(locale);
  const displayNameUnchanged = normalizedDraftDisplayName && normalizedDraftDisplayName === normalizedCurrentDisplayName;
  const normalizedCurrentBio = (authUser?.bio || "").trim();
  const normalizedDraftBio = bioInput.trim();
  const bioUnchanged = normalizedDraftBio === normalizedCurrentBio;
  const currentGender = authUser?.gender || "";
  const genderUnchanged = genderInput === currentGender;
  const normalizedCurrentBirthDate = (authUser?.birthDate || "").trim();
  const normalizedDraftBirthDate = birthDateInput.trim();
  const birthDateUnchanged = normalizedDraftBirthDate === normalizedCurrentBirthDate;
  const normalizedCurrentHandle = authUser?.handle || "";
  const normalizedDraftHandle = handleInput.trim().toLocaleLowerCase();
  const handleUnchanged = normalizedDraftHandle && normalizedDraftHandle === normalizedCurrentHandle;
  const handleIsDefault = /^pid_[a-z0-9]{8}$/.test(authUser?.handle || "");
  const handleCooldownActive = Boolean(
    authUser?.nextHandleChangeAt && Date.parse(authUser.nextHandleChangeAt) > Date.now()
  );
  const handleReadOnly = !handleIsDefault && handleCooldownActive;

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
      setDisplayNameStatus(t("accountPanel.displayNameUpdated"));
      setDisplayNameEditing(false);
      setMobileEditPanel((current) => (current === "displayName" ? null : current));
    } catch (error) {
      setDisplayNameError(getAppErrorMessage(error));
    } finally {
      setDisplayNameSaving(false);
    }
  }

  async function submitBio() {
    if (!authUser || !onUpdateBio) {
      return;
    }

    setBioSaving(true);
    setBioError("");
    setBioStatus("");

    try {
      const payload = await onUpdateBio(bioInput);
      const nextValue = payload.user?.bio || "";
      setBioInput(nextValue);
      setBioStatus(t("accountPanel.bioUpdated"));
      setBioEditing(false);
      setMobileEditPanel((current) => (current === "bio" ? null : current));
    } catch (error) {
      setBioError(getAppErrorMessage(error));
    } finally {
      setBioSaving(false);
    }
  }

  async function submitGender(nextGender = genderInput, { closeImmediately = false } = {}) {
    if (!authUser || !onUpdateGender) {
      return;
    }

    if (closeImmediately) {
      setGenderEditing(false);
      setMobileEditPanel((current) => (current === "gender" ? null : current));
    }
    setGenderSaving(true);
    setGenderError("");
    setGenderStatus("");

    try {
      const payload = await onUpdateGender(nextGender);
      const nextValue = payload.user?.gender || "";
      setGenderInput(nextValue);
      setGenderStatus(t("accountPanel.genderUpdated"));
      if (!closeImmediately) {
        setGenderEditing(false);
        setMobileEditPanel((current) => (current === "gender" ? null : current));
      }
    } catch (error) {
      const message = getAppErrorMessage(error);
      if (closeImmediately) {
        setGenderInput(authUser.gender || "other");
        showToast?.(message);
      } else {
        setGenderError(message);
      }
    } finally {
      setGenderSaving(false);
    }
  }

  async function submitBirthDate({ closeImmediately = false } = {}) {
    if (!authUser || !onUpdateBirthDate) {
      return;
    }

    if (closeImmediately) {
      setBirthDateEditing(false);
      setMobileEditPanel((current) => (current === "birthDate" ? null : current));
    }
    setBirthDateSaving(true);
    setBirthDateError("");
    setBirthDateStatus("");

    try {
      const payload = await onUpdateBirthDate(birthDateInput);
      const nextValue = payload.user?.birthDate || "";
      setBirthDateInput(nextValue);
      setBirthDateStatus(t("accountPanel.birthDateUpdated"));
      if (!closeImmediately) {
        setBirthDateEditing(false);
        setMobileEditPanel((current) => (current === "birthDate" ? null : current));
      }
    } catch (error) {
      const message = getAppErrorMessage(error);
      if (closeImmediately) {
        setBirthDateInput(authUser.birthDate || "");
        showToast?.(message);
      } else {
        setBirthDateError(message);
      }
    } finally {
      setBirthDateSaving(false);
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
      setHandleStatus(t("accountPanel.handleUpdated"));
      setHandleEditing(false);
      setMobileEditPanel((current) => (current === "handle" ? null : current));
    } catch (error) {
      setHandleError(getAppErrorMessage(error));
    } finally {
      setHandleSaving(false);
    }
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

  function startBioEditing() {
    if (!authUser) {
      return;
    }

    setBioInput(authUser.bio || "");
    setBioError("");
    setBioStatus("");
    setBioEditing(true);
    if (isMobilePanelViewport) {
      setMobileEditPanel("bio");
    }
  }

  function startBirthDateEditing() {
    if (!authUser) {
      return;
    }

    setBirthDateInput(authUser.birthDate || "");
    setBirthDateError("");
    setBirthDateStatus("");
    setBirthDateEditing(true);
    if (isMobilePanelViewport) {
      setMobileEditPanel("birthDate");
    }
  }

  function startGenderEditing() {
    if (!authUser) {
      return;
    }

    setGenderInput(authUser.gender || "other");
    setGenderError("");
    setGenderStatus("");
    setGenderEditing(true);
    if (isMobilePanelViewport) {
      setMobileEditPanel("gender");
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

  function cancelGenderEditing() {
    setGenderInput(authUser?.gender || "");
    setGenderError("");
    setGenderStatus("");
    setGenderSaving(false);
    setGenderEditing(false);
    setMobileEditPanel((current) => (current === "gender" ? null : current));
  }

  function cancelBirthDateEditing() {
    setBirthDateInput(authUser?.birthDate || "");
    setBirthDateError("");
    setBirthDateStatus("");
    setBirthDateSaving(false);
    setBirthDateEditing(false);
    setMobileEditPanel((current) => (current === "birthDate" ? null : current));
  }

  function cancelBioEditing() {
    setBioInput(authUser?.bio || "");
    setBioError("");
    setBioStatus("");
    setBioSaving(false);
    setBioEditing(false);
    setMobileEditPanel((current) => (current === "bio" ? null : current));
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
      setAvatarStatus(t("accountPanel.avatarUpdated"));
    } catch (error) {
      setAvatarError(getAppErrorMessage(error));
    } finally {
      setAvatarSaving(false);
    }
  }

  const statusProps = {
    avatarError,
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
  };

  return {
    avatarInputRef,
    openAvatarPicker,
    submitAvatarFile,
    desktopAccountProps: {
      authUser,
      avatarInputRef,
      avatarSaving,
      birthDateEditing,
      birthDateInput,
      birthDateSaving,
      cancelBirthDateEditing,
      cancelDisplayNameEditing,
      cancelGenderEditing,
      cancelBioEditing,
      cancelHandleEditing,
      displayNameCooldownActive,
      displayNameEditing,
      displayNameInput,
      displayNameSaving,
      genderEditing,
      genderInput,
      genderSaving,
      bioEditing,
      bioInput,
      bioSaving,
      handleCooldownActive,
      handleEditing,
      handleInput,
      handleIsDefault,
      handleSaving,
      onOpenAvatarPicker: openAvatarPicker,
      onSelectAvatar: (event) => {
        void submitAvatarFile(event);
      },
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
      submitDisplayName,
      submitGender,
      submitBirthDate,
      submitBio,
      submitHandle,
      ...statusProps,
    },
    accountDrawerProps: {
      authUser,
      avatarInputRef,
      avatarSaving,
      onOpenAvatarPicker: openAvatarPicker,
      onSelectAvatar: (event) => {
        void submitAvatarFile(event);
      },
      startDisplayNameEditing,
      startGenderEditing,
      startBirthDateEditing,
      startBioEditing,
      startHandleEditing,
      ...statusProps,
    },
    mobileEditProps: {
      bioInput,
      bioSaving,
      bioUnchanged,
      birthDateInput,
      birthDateSaving,
      birthDateUnchanged,
      cancelBioEditing,
      cancelBirthDateEditing,
      cancelDisplayNameEditing,
      cancelGenderEditing,
      cancelHandleEditing,
      displayNameCooldownActive,
      displayNameInput,
      displayNameSaving,
      displayNameUnchanged,
      genderInput,
      genderSaving,
      genderUnchanged,
      handleCooldownActive,
      handleInput,
      handleIsDefault,
      handleReadOnly,
      handleSaving,
      handleUnchanged,
      setBioError,
      setBioInput,
      setBioStatus,
      setBirthDateError,
      setBirthDateInput,
      setBirthDateStatus,
      setDisplayNameError,
      setDisplayNameInput,
      setDisplayNameStatus,
      setGenderInput,
      setHandleError,
      setHandleInput,
      setHandleStatus,
      submitBio,
      submitBirthDate,
      submitDisplayName,
      submitGender,
      submitHandle,
      ...statusProps,
    },
  };
}
