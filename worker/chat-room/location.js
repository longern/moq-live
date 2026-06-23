import {
  BIG_DATA_CLOUD_FREE_REVERSE_GEOCODE_URL,
  BIG_DATA_CLOUD_REVERSE_GEOCODE_URL,
  BIG_DATA_CLOUD_TIMEOUT_MS,
} from "./constants.js";
import {
  sanitizeAccuracy,
  sanitizeCoordinate,
  sanitizeIsoTimestamp,
  sanitizeLocationProvince,
} from "./sanitize.js";

export function getDefaultRoomLocation() {
  return {
    enabled: false,
    latitude: null,
    longitude: null,
    accuracy: null,
    updatedAt: null,
    province: "",
    provinceResolvedAt: null,
    geocodingAttempted: false,
  };
}

export function normalizeRoomLocation(location) {
  if (!location?.enabled) {
    return getDefaultRoomLocation();
  }

  const latitude = sanitizeCoordinate(location.latitude, -90, 90);
  const longitude = sanitizeCoordinate(location.longitude, -180, 180);
  if (latitude === null || longitude === null) {
    return getDefaultRoomLocation();
  }

  return {
    enabled: true,
    latitude,
    longitude,
    accuracy: sanitizeAccuracy(location.accuracy),
    updatedAt:
      sanitizeIsoTimestamp(location.updatedAt) ?? new Date().toISOString(),
    province: sanitizeLocationProvince(location.province),
    provinceResolvedAt: sanitizeIsoTimestamp(location.provinceResolvedAt),
    geocodingAttempted: location.geocodingAttempted === true,
  };
}

export function normalizeRoomLocationInput(location) {
  const normalized = normalizeRoomLocation(location);
  return normalized.enabled
    ? {
        ...normalized,
        province: "",
        provinceResolvedAt: null,
        geocodingAttempted: false,
      }
    : normalized;
}

export function applyStoredRoomLocationResolution(nextLocation, currentLocation) {
  if (
    !nextLocation.enabled ||
    !currentLocation?.enabled ||
    currentLocation.geocodingAttempted !== true
  ) {
    return nextLocation;
  }

  return {
    ...nextLocation,
    province: sanitizeLocationProvince(currentLocation.province),
    provinceResolvedAt: sanitizeIsoTimestamp(
      currentLocation.provinceResolvedAt,
    ),
    geocodingAttempted: true,
  };
}

export function getPublicRoomLocation(location) {
  const normalized = normalizeRoomLocation(location);
  return {
    hasLocation: normalized.enabled,
    province: normalized.enabled ? normalized.province : "",
    updatedAt: normalized.enabled ? normalized.updatedAt : null,
  };
}

export function calculateDistanceMeters(left, right) {
  const earthRadiusMeters = 6_371_000;
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const sinLatitude = Math.sin(deltaLatitude / 2);
  const sinLongitude = Math.sin(deltaLongitude / 2);
  const rawValue =
    sinLatitude * sinLatitude +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      sinLongitude *
      sinLongitude;
  const value = Math.min(1, Math.max(0, rawValue));
  return Math.max(
    0,
    Math.round(
      earthRadiusMeters *
        2 *
        Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)),
    ),
  );
}

export function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function formatDistanceText(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "";
  }

  if (distanceMeters < 100) {
    return "<100 m";
  }

  if (distanceMeters < 1_000) {
    return `${Math.round(distanceMeters / 10) * 10} m`;
  }

  if (distanceMeters < 100_000) {
    const kilometers = distanceMeters / 1_000;
    return `${kilometers < 10 ? kilometers.toFixed(1) : Math.round(kilometers)} km`;
  }

  return `${Math.round(distanceMeters / 1_000)} km`;
}

export async function reverseGeocodeProvince(latitude, longitude, env) {
  const bigDataCloudApiKey = String(env?.BIGDATACLOUD_API_KEY ?? "").trim();
  if (bigDataCloudApiKey) {
    const authenticatedProvince = await reverseGeocodeProvinceWithBigDataCloud(
      latitude,
      longitude,
      BIG_DATA_CLOUD_REVERSE_GEOCODE_URL,
      bigDataCloudApiKey,
    );
    if (authenticatedProvince) {
      return authenticatedProvince;
    }
  }

  return reverseGeocodeProvinceWithBigDataCloud(
    latitude,
    longitude,
    BIG_DATA_CLOUD_FREE_REVERSE_GEOCODE_URL,
  );
}

export async function reverseGeocodeProvinceWithBigDataCloud(
  latitude,
  longitude,
  endpoint,
  apiKey = "",
) {
  const url = new URL(endpoint);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("localityLanguage", "zh");
  if (apiKey) {
    url.searchParams.set("key", apiKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, BIG_DATA_CLOUD_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return "";
    }

    const payload = await response.json().catch(() => null);
    return sanitizeLocationProvince(
      payload?.principalSubdivision ||
        payload?.city ||
        payload?.countryName ||
        "",
    );
  } catch (error) {
    console.warn(
      "BigDataCloud reverse geocode failed",
      error instanceof Error ? error.message : String(error),
    );
    return "";
  } finally {
    clearTimeout(timeoutId);
  }
}

export function areRoomLocationsEqual(left, right) {
  return (
    Boolean(left?.enabled) === Boolean(right?.enabled) &&
    Number(left?.latitude) === Number(right?.latitude) &&
    Number(left?.longitude) === Number(right?.longitude) &&
    Number(left?.accuracy) === Number(right?.accuracy) &&
    String(left?.updatedAt ?? "") === String(right?.updatedAt ?? "") &&
    String(left?.province ?? "") === String(right?.province ?? "") &&
    String(left?.provinceResolvedAt ?? "") ===
      String(right?.provinceResolvedAt ?? "") &&
    Boolean(left?.geocodingAttempted) === Boolean(right?.geocodingAttempted)
  );
}
