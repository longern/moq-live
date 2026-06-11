import { isPortraitMedia } from "./mediaLayout.js";

export function getViewerPosition() {
  if (
    typeof navigator === "undefined"
    || !navigator.geolocation
    || typeof navigator.geolocation.getCurrentPosition !== "function"
  ) {
    return Promise.reject(new Error("geolocation unavailable"));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: 10_000,
    });
  });
}

export function buildHostLocationLabel(province) {
  const normalizedProvince = province === "未知" ? "" : province;
  return normalizedProvince || "位置未知";
}

export function formatHostGender(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (["male", "m", "man", "男", "男性"].includes(normalized)) {
    return "男";
  }
  if (["female", "f", "woman", "女", "女性"].includes(normalized)) {
    return "女";
  }
  if (["other", "nonbinary", "non-binary", "其他"].includes(normalized)) {
    return "其他";
  }
  return "";
}

export function formatHostAge(birthDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate || "").trim());
  if (!match) {
    return "";
  }

  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]);
  const birthDay = Number(match[3]);
  if (
    !Number.isInteger(birthYear)
    || !Number.isInteger(birthMonth)
    || !Number.isInteger(birthDay)
    || birthMonth < 1
    || birthMonth > 12
    || birthDay < 1
    || birthDay > 31
  ) {
    return "";
  }
  const birth = new Date(birthYear, birthMonth - 1, birthDay);
  if (
    birth.getFullYear() !== birthYear
    || birth.getMonth() !== birthMonth - 1
    || birth.getDate() !== birthDay
  ) {
    return "";
  }

  const today = new Date();
  let age = today.getFullYear() - birthYear;
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
    age -= 1;
  }

  return age >= 0 && age <= 130 ? `${age}岁` : "";
}

export function buildHostProfileInfoItems({ gender, birthDate, province, distanceText }) {
  return [
    formatHostGender(gender),
    formatHostAge(birthDate),
    buildHostLocationLabel(province),
    distanceText ? `距你 ${distanceText}` : "",
  ].filter(Boolean);
}

export function getWatchStageLayout({ cohost, portrait }) {
  if (cohost) {
    return "cohost";
  }
  return portrait ? "single-portrait" : "single-landscape";
}

export function getWatchPlayerTileClassName({ loading = false, orientation = "" } = {}) {
  return [
    "watch-player-tile",
    loading ? "is-loading-first-frame" : "",
    isPortraitMedia(orientation) ? "is-media-portrait" : "is-media-landscape",
  ].filter(Boolean).join(" ");
}
