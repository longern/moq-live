import { useEffect, useRef, useState } from "react";
import { createApiError, getAppErrorMessage } from "../lib/appErrors.js";

function getDefaultLiveChatRoomResolution() {
  return {
    loading: false,
    error: "",
    roomId: "",
  };
}

function getDefaultLiveActivation() {
  return {
    checked: false,
    missing: false,
    loading: false,
    creating: false,
    error: "",
  };
}

export function useLiveRoomActivation({ page, userId, log }) {
  const [liveChatRoomResolution, setLiveChatRoomResolution] = useState(
    getDefaultLiveChatRoomResolution,
  );
  const [liveRoomDetails, setLiveRoomDetails] = useState(null);
  const [liveActivation, setLiveActivation] = useState(getDefaultLiveActivation);
  const lastUserIdRef = useRef("");
  const logRef = useRef(log);

  logRef.current = log;

  useEffect(() => {
    if (lastUserIdRef.current === userId) {
      return;
    }

    lastUserIdRef.current = userId || "";
    setLiveChatRoomResolution(getDefaultLiveChatRoomResolution());
    setLiveRoomDetails(null);
    setLiveActivation(getDefaultLiveActivation());
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLiveChatRoomResolution(getDefaultLiveChatRoomResolution());
      setLiveRoomDetails(null);
      setLiveActivation(getDefaultLiveActivation());
      return;
    }

    if (page !== "live") {
      return;
    }

    if (liveActivation.checked) {
      return;
    }

    let cancelled = false;

    async function resolveLiveChatRoom() {
      setLiveChatRoomResolution({
        loading: true,
        error: "",
        roomId: "",
      });
      setLiveActivation((current) => ({
        ...current,
        checked: false,
        missing: false,
        loading: true,
        error: "",
      }));

      try {
        const response = await fetch("/api/me/room", {
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (response.status === 404 && payload.code === "room_not_found") {
            if (cancelled) {
              return;
            }

            setLiveChatRoomResolution({
              loading: false,
              error: "",
              roomId: "",
            });
            setLiveRoomDetails(null);
            setLiveActivation({
              checked: true,
              missing: true,
              loading: false,
              creating: false,
              error: "",
            });
            return;
          }
          throw createApiError(payload, "room_resolve_failed", { status: response.status });
        }

        if (cancelled) {
          return;
        }

        setLiveChatRoomResolution({
          loading: false,
          error: "",
          roomId: payload.room?.id || "",
        });
        setLiveRoomDetails(payload.room || null);
        setLiveActivation({
          checked: true,
          missing: false,
          loading: false,
          creating: false,
          error: "",
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = getAppErrorMessage(error);
        setLiveChatRoomResolution({
          loading: false,
          error: message,
          roomId: "",
        });
        setLiveRoomDetails(null);
        setLiveActivation({
          checked: true,
          missing: false,
          loading: false,
          creating: false,
          error: message,
        });
        logRef.current?.(`live room resolve failed: ${message}`);
      }
    }

    void resolveLiveChatRoom();

    return () => {
      cancelled = true;
    };
  }, [userId, liveActivation.checked, page]);

  async function activateLiveRoom() {
    setLiveActivation((current) => ({
      ...current,
      creating: true,
      error: "",
    }));

    try {
      const response = await fetch("/api/me/room", {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw createApiError(payload, "room_creation_failed", { status: response.status });
      }

      setLiveChatRoomResolution({
        loading: false,
        error: "",
        roomId: payload.room?.id || "",
      });
      setLiveRoomDetails(payload.room || null);
      setLiveActivation({
        checked: true,
        missing: false,
        loading: false,
        creating: false,
        error: "",
      });
    } catch (error) {
      const message = getAppErrorMessage(error);
      setLiveActivation((current) => ({
        ...current,
        creating: false,
        error: message,
      }));
      logRef.current?.(`live room activation failed: ${message}`);
    }
  }

  return {
    liveActivation,
    liveChatRoomId: userId ? liveChatRoomResolution.roomId : "",
    liveRoomDetails,
    setLiveRoomDetails,
    activateLiveRoom,
  };
}
