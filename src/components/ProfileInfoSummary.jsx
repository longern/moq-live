import { Mars, Venus } from "lucide-react";
import { buildHostProfileInfoItems } from "../lib/watchSession.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

function getGenderIconType(item, t) {
  const value = String(item || "").trim().toLowerCase();
  if (!value) {
    return "";
  }

  const maleLabel = String(t("profile.gender.male") || "").trim().toLowerCase();
  const femaleLabel = String(t("profile.gender.female") || "").trim().toLowerCase();
  if ([maleLabel, "男", "male", "m"].includes(value)) {
    return "male";
  }
  if ([femaleLabel, "女", "female", "f"].includes(value)) {
    return "female";
  }
  return "";
}

function ProfileInfoItem({ item }) {
  const { t } = useI18n();
  const genderIconType = getGenderIconType(item, t);
  if (genderIconType === "male") {
    return (
      <span className="profile-info-chip is-gender is-male" aria-label={t("profile.gender.male")} title={t("profile.gender.male")}>
        <Mars className="profile-info-chip-gender-icon" aria-hidden="true" />
      </span>
    );
  }
  if (genderIconType === "female") {
    return (
      <span className="profile-info-chip is-gender is-female" aria-label={t("profile.gender.female")} title={t("profile.gender.female")}>
        <Venus className="profile-info-chip-gender-icon" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="profile-info-chip">
      {item}
    </span>
  );
}

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
        <ProfileInfoItem item={item} key={`${item}:${index}`} />
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
