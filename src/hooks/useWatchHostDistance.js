import { useEffect, useRef, useState } from "react";
import { getViewerPosition } from "../lib/watchSession.js";

export function useWatchHostDistance({
  chatRoom,
  hostDistanceAvailable,
  hostLocationAvailable,
  hostLocationUpdatedAt,
  hostProfileOpen,
  showToast,
}) {
  const [hostDistanceText, setHostDistanceText] = useState("");
  const [hostDistancePending, setHostDistancePending] = useState(false);
  const [viewerLocationPermission, setViewerLocationPermission] = useState("checking");
  const requestRef = useRef(0);
  const autoKeyRef = useRef("");

  async function requestHostDistance({ userInitiated = false } = {}) {
    if (!hostLocationAvailable || !chatRoom) {
      if (userInitiated) {
        showToast("主播位置未知");
      }
      return false;
    }
    if (!hostDistanceAvailable) {
      if (userInitiated) {
        showToast("主播未开播，暂不可查看距离");
      }
      return false;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setHostDistancePending(true);
    try {
      const position = await getViewerPosition();
      if (requestRef.current !== requestId) {
        return false;
      }

      const response = await fetch(`/api/chat/${encodeURIComponent(chatRoom)}/location/distance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        if (payload.code === "location_unavailable" || payload.code === "distance_unavailable") {
          setHostDistanceText("");
          if (userInitiated) {
            showToast(payload.code === "distance_unavailable" ? "主播未开播，暂不可查看距离" : "主播位置未知");
          }
          return false;
        }
        throw new Error(payload.error || payload.code || "location distance failed");
      }

      setHostDistanceText(String(payload.distanceText || "").trim());
      return true;
    } catch {
      if (userInitiated) {
        showToast("无法获取你的位置");
      }
      return false;
    } finally {
      if (requestRef.current === requestId) {
        setHostDistancePending(false);
      }
    }
  }

  useEffect(() => {
    requestRef.current += 1;
    autoKeyRef.current = "";
    setHostDistanceText("");
    setHostDistancePending(false);
    setViewerLocationPermission("checking");
  }, [chatRoom, hostDistanceAvailable, hostLocationAvailable, hostLocationUpdatedAt]);

  useEffect(() => {
    if (!hostProfileOpen) {
      return undefined;
    }

    if (
      typeof navigator === "undefined"
      || !navigator.permissions
      || typeof navigator.permissions.query !== "function"
    ) {
      setViewerLocationPermission("prompt");
      return undefined;
    }

    let cancelled = false;
    void navigator.permissions.query({ name: "geolocation" }).then((permissionStatus) => {
      if (cancelled) {
        return;
      }

      const syncPermission = () => {
        setViewerLocationPermission(permissionStatus.state);
      };
      syncPermission();
      permissionStatus.onchange = syncPermission;

      if (permissionStatus.state !== "granted") {
        return;
      }

      if (!hostDistanceAvailable || !hostLocationAvailable || !chatRoom) {
        return;
      }

      const locationKey = `${chatRoom}:${hostLocationUpdatedAt || "location"}`;
      if (autoKeyRef.current === locationKey) {
        return;
      }

      autoKeyRef.current = locationKey;
      void requestHostDistance({ userInitiated: false });
    }).catch(() => {
      if (!cancelled) {
        setViewerLocationPermission("prompt");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [chatRoom, hostDistanceAvailable, hostLocationAvailable, hostLocationUpdatedAt, hostProfileOpen]);

  async function handleHostLocationClick() {
    await requestHostDistance({ userInitiated: true });
  }

  return {
    hostDistancePending,
    hostDistanceText,
    handleHostLocationClick,
    viewerLocationPermission,
  };
}
