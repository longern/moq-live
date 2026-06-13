import { buildHostProfileInfoItems } from "../lib/watchSession.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

export function ProfileInfoChips({
  as: Component = "div",
  birthDate = "",
  className = "profile-info-chips",
  distanceText = "",
  gender = "",
  items = null,
  province = "",
}) {
  const { t } = useI18n();
  const profileInfoItems = Array.isArray(items)
    ? items.filter(Boolean)
    : buildHostProfileInfoItems({
      gender,
      birthDate,
      province,
      distanceText,
      t,
    });

  return (
    <Component className={className}>
      {profileInfoItems.map((item, index) => (
        <span className="profile-info-chip" key={`${item}:${index}`}>
          {item}
        </span>
      ))}
    </Component>
  );
}

export function ProfileBio({
  bio = "",
  className = "profile-bio",
  placeholder = "",
}) {
  const { t } = useI18n();
  const normalizedBio = String(bio || "").trim();

  return (
    <p className={`${className}${normalizedBio ? "" : " is-placeholder"}`}>
      {normalizedBio || placeholder || t("profile.noBio")}
    </p>
  );
}
