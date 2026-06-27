import { useEffect, useRef, useState } from "react";
import { formatAudienceCount } from "../lib/audience.js";
import { createApiError, getAppErrorMessage } from "../lib/appErrors.js";
import { buildHostProfileInfoItems } from "../lib/watchSession.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

export function useLazyUserProfileSheet({ errorKey = "profile_load_failed" } = {}) {
  const { t } = useI18n();
  const requestIdRef = useRef(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUser, setProfileUser] = useState(null);
  const [profileError, setProfileError] = useState("");
  const profileUserName = profileUser?.displayName
    || profileUser?.handle
    || profileUser?.email
    || t("common.anonymousUser");
  const profileInfoItems = profileUser
    ? buildHostProfileInfoItems({
      gender: profileUser.gender || "",
      birthDate: profileUser.birthDate || "",
      province: profileUser.locationProvince || "",
      t,
    })
    : [];

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  function closeUserProfile() {
    requestIdRef.current += 1;
    setProfileOpen(false);
    setProfileError("");
  }

  async function openUserProfile(user, { onBeforeOpen } = {}) {
    if (!user?.id) {
      return false;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    onBeforeOpen?.(user);
    setProfileUser(user);
    setProfileOpen(true);
    setProfileError("");

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.id)}/profile`, {
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw createApiError(payload, errorKey, { status: response.status });
      }
      if (requestIdRef.current !== requestId) {
        return true;
      }
      setProfileUser((current) => (
        current?.id === user.id && payload.user
          ? { ...current, ...payload.user }
          : current
      ));
    } catch (error) {
      if (requestIdRef.current === requestId) {
        setProfileError(getAppErrorMessage(error));
      }
    }

    return true;
  }

  async function copyProfileHandle(handleValue) {
    const normalizedHandle = String(handleValue || "").trim();
    if (!normalizedHandle || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(normalizedHandle).catch(() => {});
  }

  return {
    closeUserProfile,
    copyProfileHandle,
    openUserProfile,
    profileError,
    profileOpen,
    profileSheetProps: {
      open: profileOpen,
      onClose: closeUserProfile,
      hostAvatarUrl: profileUser?.avatarUrl || "",
      hostChipLabel: profileUserName,
      hostDisplayName: profileUser?.displayName || profileUserName,
      hostBio: profileUser?.bio || "",
      hostProfileInfoItems: profileInfoItems,
      hostLocationClickable: false,
      hostLocationPending: false,
      onHostHandleCopy: copyProfileHandle,
      hostHandle: profileUser?.handle || "",
      roomLabel: profileUserName,
      hostFollowerCountText: formatAudienceCount(profileUser?.followerCount || 0),
      hostFollowingCountText: formatAudienceCount(profileUser?.followingCount || 0),
    },
    profileUser,
    profileUserName,
  };
}
