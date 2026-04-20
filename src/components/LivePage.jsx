import { useEffect, useRef, useState } from "preact/hooks";
import { LiveDesktopPage } from "./live/LiveDesktopPage.jsx";
import { LiveMobilePage } from "./live/LiveMobilePage.jsx";

export function LivePage({
  hidden,
  roomLabel,
  shareTarget,
  watchLink,
  publishBlocked,
  publishBlockedReason,
  publishBadge,
  cameraOptions,
  microphoneOptions,
  selectedCameraId,
  selectedMicrophoneId,
  cameraEnabled,
  microphoneEnabled,
  cameraMode,
  isPublishing,
  previewActive,
  previewHasVideo,
  previewSourceType,
  screenShareSupported,
  screenShareActive,
  syntheticPublishing,
  previewVideoRef,
  onCameraChange,
  onMicrophoneChange,
  onCycleCamera,
  onToggleMicrophone,
  onTogglePublish,
  onStartPublish,
  onStopPublish,
  onShare,
  onStartScreenShare,
  onStopScreenShare,
  onStartSynthetic,
  onStopSynthetic,
  chatMessages,
  chatDraft,
  chatConnectionState,
  chatOnlineCount,
  chatReadOnly,
  chatError,
  authAvailable,
  authLoading,
  authUser,
  onChatDraftChange,
  onChatSend,
  onChatRequireLogin
}) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  const [roomCoverUrl, setRoomCoverUrl] = useState("");
  const [roomCoverLoading, setRoomCoverLoading] = useState(false);
  const [roomCoverBusy, setRoomCoverBusy] = useState(false);
  const [roomCoverError, setRoomCoverError] = useState("");
  const [roomCoverStatus, setRoomCoverStatus] = useState("");
  const roomCoverInputRef = useRef(null);
  const shareSupported = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const mirrorPreview = previewSourceType === "camera" && cameraMode === "front";

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const sync = () => {
      setIsMobile(media.matches);
    };

    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (!authUser?.id || hidden) {
      setRoomCoverUrl("");
      setRoomCoverLoading(false);
      setRoomCoverBusy(false);
      setRoomCoverError("");
      setRoomCoverStatus("");
      return;
    }

    let cancelled = false;

    async function loadRoomCover() {
      setRoomCoverLoading(true);
      setRoomCoverError("");

      try {
        const response = await fetch("/api/me/room", {
          credentials: "same-origin"
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || `room endpoint returned ${response.status}`);
        }

        if (cancelled) {
          return;
        }

        setRoomCoverUrl(payload.room?.coverUrl || "");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRoomCoverError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setRoomCoverLoading(false);
        }
      }
    }

    void loadRoomCover();

    return () => {
      cancelled = true;
    };
  }, [authUser?.id, hidden]);

  function openRoomCoverPicker() {
    roomCoverInputRef.current?.click();
  }

  async function handleRoomCoverPick(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    setRoomCoverBusy(true);
    setRoomCoverError("");
    setRoomCoverStatus("");

    try {
      const formData = new FormData();
      formData.set("cover", file);
      const response = await fetch("/api/me/room/cover", {
        method: "POST",
        credentials: "same-origin",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || `cover upload failed with ${response.status}`);
      }

      setRoomCoverUrl(payload.room?.coverUrl || "");
      setRoomCoverStatus("直播封面已更新");
    } catch (error) {
      setRoomCoverError(error instanceof Error ? error.message : String(error));
    } finally {
      setRoomCoverBusy(false);
    }
  }

  const pageProps = {
    hidden,
    roomLabel,
    shareTarget,
    watchLink,
    publishBlocked,
    publishBlockedReason,
    publishBadge,
    cameraOptions,
    microphoneOptions,
    selectedCameraId,
    selectedMicrophoneId,
    cameraEnabled,
    microphoneEnabled,
    cameraMode,
    isPublishing,
    previewActive,
    previewHasVideo,
    previewSourceType,
    screenShareSupported,
    screenShareActive,
    syntheticPublishing,
    previewVideoRef,
    mirrorPreview,
    onCameraChange,
    onMicrophoneChange,
    onCycleCamera,
    onToggleMicrophone,
    onTogglePublish,
    onStartPublish,
    onStopPublish,
    onShare,
    onStartScreenShare,
    onStopScreenShare,
    onStartSynthetic,
    onStopSynthetic,
    chatMessages,
    chatDraft,
    chatConnectionState,
    chatOnlineCount,
    chatReadOnly,
    chatError,
    authAvailable,
    authLoading,
    authUser,
    onChatDraftChange,
    onChatSend,
    onChatRequireLogin,
    shareSupported,
    roomCoverUrl,
    roomCoverLoading,
    roomCoverBusy,
    roomCoverError,
    roomCoverStatus,
    roomCoverInputRef,
    onPickCover: handleRoomCoverPick,
    onOpenCoverPicker: openRoomCoverPicker
  };

  if (isMobile) {
    return <LiveMobilePage {...pageProps} />;
  }

  return <LiveDesktopPage {...pageProps} />;
}
