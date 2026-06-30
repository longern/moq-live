import { useEffect, useState } from "react";
import { Camera, Copy, QrCode, Share } from "lucide-react";
import { ChatPanel } from "../ChatPanel.jsx";
import { FloatingToast, useToast } from "../primitives/FloatingToast.jsx";
import { StatusPill } from "../primitives/StatusPill.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { WatchHostProfileContent } from "../watch/WatchSessionSheets.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { formatAudienceCount } from "../../lib/audience.js";
import { buildHostProfileInfoItems } from "../../lib/watchSession.js";
import {
  BroadcastIcon,
  CloseIcon,
  EndBroadcastIcon,
  FlipCameraIcon,
  MicrophoneIcon,
  MoreIcon,
  QualityIcon,
  ScreenShareIcon,
  ShareIcon
} from "./liveIcons.jsx";
import { LiveMenuItem, LiveMenuList } from "./LiveMenuList.jsx";
import { LiveAudienceCallOverlay } from "./LiveAudienceCallOverlay.jsx";
import { LiveMoreMenu } from "./LiveMoreMenu.jsx";
import { LivePreviewStage } from "./LivePreviewStage.jsx";
import { LiveQualityMenu } from "./LiveQualityMenu.jsx";

function getCameraStatusLabel(cameraMode, t) {
  if (cameraMode === "off") {
    return t("live.cameraStatusOff");
  }
  return cameraMode === "rear" ? t("live.cameraStatusRear") : t("live.cameraStatusFront");
}

function LiveDesktopPanel({ children, className = "" }) {
  if (!children) {
    return null;
  }

  return <section className={`live-desktop-panel${className ? ` ${className}` : ""}`}>{children}</section>;
}

function CameraPanel({
  cameraMode,
  selectedCameraId,
  cameraOptions,
  isPublishing,
  previewSourceType,
  onCameraChange,
  onCycleCamera,
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="live-desktop-panel-head">
        <strong>{t("live.camera")}</strong>
        <span>{getCameraStatusLabel(cameraMode, t)}</span>
      </div>
      <label>
        {t("live.selectDevice")}
        <select
          id="cameraSelect"
          value={selectedCameraId}
          onChange={onCameraChange}
          disabled={isPublishing && previewSourceType !== "camera"}
        >
          {cameraOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="action-row">
        <button type="button" className="secondary" onClick={onCycleCamera}>
          {t("live.flipCameraFull")}
        </button>
      </div>
    </>
  );
}

function MicrophonePanel({
  selectedMicrophoneId,
  microphoneOptions,
  microphoneEnabled,
  isPublishing,
  onMicrophoneChange,
  onToggleMicrophone,
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="live-desktop-panel-head live-microphone-panel-head">
        <strong>{t("live.microphone")}</strong>
      </div>
      <label className="live-panel-field">
        <span>{t("live.selectDevice")}</span>
        <select id="microphoneSelect" value={selectedMicrophoneId} onChange={onMicrophoneChange} disabled={isPublishing}>
          {microphoneOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="action-row live-panel-actions">
        <button
          type="button"
          className={`live-panel-toggle${microphoneEnabled ? " is-danger" : " is-on"}`}
          onClick={onToggleMicrophone}
        >
          <MicrophoneIcon enabled={microphoneEnabled} />
          <span>{microphoneEnabled ? t("live.closeMicrophone") : t("live.openMicrophone")}</span>
        </button>
      </div>
    </>
  );
}

function LiveDesktopShareMenuItem({
  icon,
  label,
  onClick,
  disabled = false,
  ariaLabel = label,
}) {
  return (
    <LiveMenuItem
      className="live-more-menu-item live-desktop-share-menu-item"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <span className="live-more-menu-icon">{icon}</span>
      <span className="live-more-menu-label">{label}</span>
    </LiveMenuItem>
  );
}

function ShareLinkPanel({
  watchLink,
  onCopyLink,
  onOpenImageShare,
  onOpenScreenshotShare,
  onShare,
  screenshotShareAvailable = false,
  shareSupported,
  onClose,
}) {
  const { t } = useI18n();

  async function handleShareLink() {
    await onShare?.();
    onClose?.();
  }

  async function handleCopyLink() {
    await onCopyLink?.();
    onClose?.();
  }

  function handleImageShare() {
    onClose?.();
    onOpenImageShare?.();
  }

  function handleScreenshotShare() {
    onClose?.();
    onOpenScreenshotShare?.();
  }

  return (
    <div className="live-more-menu-shell" aria-label={t("live.shareRoom")}>
      <div className="live-more-menu-title">{t("live.shareRoom")}</div>
      <LiveMenuList className="live-more-menu-list live-desktop-share-menu-list">
        <LiveDesktopShareMenuItem
          icon={<Share aria-hidden="true" />}
          label={t("live.nativeShare")}
          onClick={handleShareLink}
          disabled={!watchLink || !shareSupported}
          ariaLabel={t("live.shareRoom")}
        />
        <LiveDesktopShareMenuItem
          icon={<QrCode aria-hidden="true" />}
          label={t("live.imageShare")}
          onClick={handleImageShare}
          disabled={!watchLink}
          ariaLabel={t("live.imageShare")}
        />
        <LiveDesktopShareMenuItem
          icon={<Camera aria-hidden="true" />}
          label={t("live.screenshotShare")}
          onClick={handleScreenshotShare}
          disabled={!watchLink || !screenshotShareAvailable}
          ariaLabel={t("live.screenshotShare")}
        />
        <LiveDesktopShareMenuItem
          icon={<Copy aria-hidden="true" />}
          label={t("live.copyLiveLink")}
          onClick={handleCopyLink}
          disabled={!watchLink}
          ariaLabel={t("live.copyLiveLink")}
        />
      </LiveMenuList>
    </div>
  );
}

function MorePanel({
  roomCoverUrl,
  roomCoverLoading,
  roomCoverBusy,
  roomCoverError,
  roomCoverStatus,
  roomCoverInputRef,
  roomTitle,
  roomWelcomeMessage,
  commentSpeechEnabled,
  commentSpeechSupported,
  liveNotificationEnabled,
  locationSharingEnabled,
  locationSharingSupported,
  locationSharingPending,
  onPickCover,
  onOpenCoverPicker,
  onSaveRoomTitle,
  onSaveRoomWelcomeMessage,
  onCommentSpeechEnabledChange,
  onLiveNotificationEnabledChange,
  onLocationSharingEnabledChange,
  roomInfoBlockedReason,
  onRoomInfoBlocked,
  onShare,
  shareSupported,
  watchLink,
  mutedUsers,
  onUnmuteUser,
  onClose,
}) {
  return (
    <LiveMoreMenu
      roomCoverUrl={roomCoverUrl}
      roomCoverLoading={roomCoverLoading}
      roomCoverBusy={roomCoverBusy}
      roomCoverError={roomCoverError}
      roomCoverStatus={roomCoverStatus}
      roomCoverInputRef={roomCoverInputRef}
      roomTitle={roomTitle}
      roomWelcomeMessage={roomWelcomeMessage}
      commentSpeechEnabled={commentSpeechEnabled}
      commentSpeechSupported={commentSpeechSupported}
      liveNotificationEnabled={liveNotificationEnabled}
      locationSharingEnabled={locationSharingEnabled}
      locationSharingSupported={locationSharingSupported}
      locationSharingPending={locationSharingPending}
      onPickCover={onPickCover}
      onOpenCoverPicker={onOpenCoverPicker}
      onSaveRoomTitle={onSaveRoomTitle}
      onSaveRoomWelcomeMessage={onSaveRoomWelcomeMessage}
      onCommentSpeechEnabledChange={onCommentSpeechEnabledChange}
      onLiveNotificationEnabledChange={onLiveNotificationEnabledChange}
      onLocationSharingEnabledChange={onLocationSharingEnabledChange}
      roomInfoBlockedReason={roomInfoBlockedReason}
      onRoomInfoBlocked={onRoomInfoBlocked}
      onShare={onShare}
      shareSupported={shareSupported}
      watchLink={watchLink}
      mutedUsers={mutedUsers}
      onUnmuteUser={onUnmuteUser}
      onClose={onClose}
    />
  );
}

export function LiveDesktopPage({
  view = {},
  room: roomInfo = {},
  share = {},
  publish = {},
  media = {},
  settings = {},
  cohost = {},
  chat = {},
  auth = {},
  audienceCall = {},
  actions = {},
}) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [openPanel, setOpenPanel] = useState("");
  const {
    hidden,
    layoutClassName = "",
    shareSupported,
  } = view;
  const {
    id: room,
    label: roomLabel,
    avatarUrl: roomAvatarUrl,
    coverUrl: roomCoverUrl,
    coverLoading: roomCoverLoading,
    coverBusy: roomCoverBusy,
    coverError: roomCoverError,
    coverStatus: roomCoverStatus,
    coverInputRef: roomCoverInputRef,
    title: roomTitle,
    welcomeMessage: roomWelcomeMessage,
    infoBlockedReason: roomInfoBlockedReason,
  } = roomInfo;
  const {
    target: shareTarget,
    watchLink,
  } = share;
  const {
    blocked: publishBlocked,
    blockedReason: publishBlockedReason,
    badge: publishBadge,
    isPublishing,
    isStarting = false,
  } = publish;
  const {
    cameraOptions,
    microphoneOptions,
    publishQualityOptions = [],
    publishProtocolOptions = [],
    selectedCameraId,
    selectedMicrophoneId,
    publishQualityId,
    publishProtocol,
    relayUrl,
    webRtcPublishUrl,
    webRtcPlaybackUrl,
    cameraEnabled,
    mediaMode,
    microphoneEnabled,
    cameraMode,
    previewActive,
    previewHasVideo,
    previewPending,
    previewSourceType,
    screenShareSupported,
    screenShareActive,
    previewVideoRef,
    mirrorPreview,
    previewOrientation,
    portraitViewport,
  } = media;
  const {
    commentSpeechEnabled,
    commentSpeechSupported,
    liveNotificationEnabled,
    locationSharingEnabled,
    locationSharingSupported,
    locationSharingPending,
  } = settings;
  const {
    messages: chatMessages,
    draft: chatDraft,
    connectionState: chatConnectionState,
    onlineCount: chatOnlineCount,
    readOnly: chatReadOnly,
    error: chatError,
    recovering: chatRecovering = false,
    canRetractMessages = false,
    mutedUsers = [],
  } = chat;
  const {
    enabled: audienceCallEnabled = false,
    active: audienceCallActive = [],
    mutedUserIds: audienceCallMutedUserIds = [],
    speakingUserIds: audienceCallSpeakingUserIds = [],
  } = audienceCall;
  const {
    active: cohostActive = null,
    players: cohostPlayers = [],
  } = cohost;
  const {
    available: authAvailable,
    loading: authLoading,
    user: authUser,
  } = auth;
  const {
    onCameraChange,
    onMicrophoneChange,
    onPublishQualityChange,
    onPublishProtocolChange,
    onRelayUrlChange,
    onWebRtcPublishUrlChange,
    onWebRtcPlaybackUrlChange,
    onCycleCamera,
    onToggleMicrophone,
    onTogglePublish,
    onShare,
    onCopyShareLink,
    onOpenImageShare,
    onOpenScreenshotShare,
    onStartScreenShare,
    onStopScreenShare,
    onChatDraftChange,
    onChatSend,
    onChatMessageMute,
    onChatMessageRetract,
    onChatUserUnmute,
    onChatRequireLogin,
    onSaveRoomTitle,
    onSaveRoomWelcomeMessage,
    onCommentSpeechEnabledChange,
    onLiveNotificationEnabledChange,
    onLocationSharingEnabledChange,
    onPickCover,
    onOpenCoverPicker,
    onRequestClose,
    onSelectLiveMode,
    onRoomInfoBlocked,
    onAudienceCallUserMuteChange,
    onAudienceCallUserDisconnect,
  } = actions;
  const cameraUnavailable = (cameraOptions?.length ?? 0) === 0;
  const hasSingleMicrophone = (microphoneOptions?.length ?? 0) === 1;
  const publishControlActive = isPublishing || isStarting;
  const screenShareUnavailableReason = !screenShareSupported
    ? t("live.screenShareUnsupported")
    : isPublishing
      ? t("live.screenShareLiveLocked")
      : "";
  const screenShareUnavailable = Boolean(screenShareUnavailableReason);
  const screenShareButtonLabel = screenShareUnavailable
    ? screenShareUnavailableReason
    : screenShareActive
      ? t("live.stopScreenShare")
      : t("live.screenShare");
  const desktopHostId = shareTarget || room || roomLabel;
  const hostDisplayName = authUser?.displayName || roomLabel;
  const hostHandle = authUser?.handle || "";
  const hostChipLabel = hostDisplayName || hostHandle || roomLabel;
  const hostProfileInfoItems = buildHostProfileInfoItems({
    gender: authUser?.gender,
    birthDate: authUser?.birthDate,
    province: authUser?.locationProvince || authUser?.lastLocationProvince,
    t,
  });
  const hostFollowerCountText = formatAudienceCount(authUser?.followerCount || 0);
  const hostFollowingCountText = formatAudienceCount(authUser?.followingCount || 0);

  useEffect(() => {
    if (!openPanel) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpenPanel("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  useEffect(() => {
    if ((cameraUnavailable && openPanel === "camera") || openPanel === "screen") {
      setOpenPanel("");
    }
  }, [cameraUnavailable, openPanel]);

  function handleScreenShareClick() {
    setOpenPanel("");
    if (screenShareUnavailable) {
      return;
    }

    if (screenShareActive) {
      onStopScreenShare();
      return;
    }

    onStartScreenShare();
  }

  function handleCameraFlip() {
    if (mediaMode === "voice" || cameraUnavailable) {
      return;
    }

    onCycleCamera();
  }

  function handleMicrophoneClick() {
    if (hasSingleMicrophone) {
      setOpenPanel("");
      onToggleMicrophone();
      return;
    }

    setOpenPanel((current) => (current === "microphone" ? "" : "microphone"));
  }

  async function copyHostHandle(handleValue) {
    const normalizedHandle = String(handleValue || "").trim();
    if (!normalizedHandle) {
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedHandle);
      showToast(t("live.copiedUid"));
    } catch {
      showToast(t("live.copiedFailed"));
    }
  }

  const activePanel = openPanel === "camera" ? (
    <CameraPanel
      cameraMode={cameraMode}
      selectedCameraId={selectedCameraId}
      cameraOptions={cameraOptions}
      isPublishing={isPublishing}
      previewSourceType={previewSourceType}
      onCameraChange={onCameraChange}
      onCycleCamera={onCycleCamera}
    />
  ) : openPanel === "microphone" ? (
    <MicrophonePanel
      selectedMicrophoneId={selectedMicrophoneId}
      microphoneOptions={microphoneOptions}
      microphoneEnabled={microphoneEnabled}
      isPublishing={isPublishing}
      onMicrophoneChange={onMicrophoneChange}
      onToggleMicrophone={onToggleMicrophone}
    />
  ) : openPanel === "quality" ? (
    <LiveQualityMenu
      publishQualityOptions={publishQualityOptions}
      publishQualityId={publishQualityId}
      publishProtocolOptions={publishProtocolOptions}
      publishProtocol={publishProtocol}
      relayUrl={relayUrl}
      webRtcPublishUrl={webRtcPublishUrl}
      webRtcPlaybackUrl={webRtcPlaybackUrl}
      onPublishQualityChange={onPublishQualityChange}
      onPublishProtocolChange={onPublishProtocolChange}
      onRelayUrlChange={onRelayUrlChange}
      onWebRtcPublishUrlChange={onWebRtcPublishUrlChange}
      onWebRtcPlaybackUrlChange={onWebRtcPlaybackUrlChange}
    />
  ) : openPanel === "link" ? (
    <ShareLinkPanel
      watchLink={watchLink}
      onCopyLink={onCopyShareLink}
      onOpenImageShare={onOpenImageShare}
      onOpenScreenshotShare={onOpenScreenshotShare}
      onShare={onShare}
      screenshotShareAvailable={mediaMode === "video" && previewActive && previewHasVideo}
      shareSupported={shareSupported}
      onClose={() => setOpenPanel("")}
    />
  ) : openPanel === "more" ? (
    <MorePanel
      roomCoverUrl={roomCoverUrl}
      roomCoverLoading={roomCoverLoading}
      roomCoverBusy={roomCoverBusy}
      roomCoverError={roomCoverError}
      roomCoverStatus={roomCoverStatus}
      roomCoverInputRef={roomCoverInputRef}
      roomTitle={roomTitle}
      roomWelcomeMessage={roomWelcomeMessage}
      commentSpeechEnabled={commentSpeechEnabled}
      commentSpeechSupported={commentSpeechSupported}
      liveNotificationEnabled={liveNotificationEnabled}
      locationSharingEnabled={locationSharingEnabled}
      locationSharingSupported={locationSharingSupported}
      locationSharingPending={locationSharingPending}
      onPickCover={onPickCover}
      onOpenCoverPicker={onOpenCoverPicker}
      onSaveRoomTitle={onSaveRoomTitle}
      onSaveRoomWelcomeMessage={onSaveRoomWelcomeMessage}
      onCommentSpeechEnabledChange={onCommentSpeechEnabledChange}
      onLiveNotificationEnabledChange={onLiveNotificationEnabledChange}
      onLocationSharingEnabledChange={onLocationSharingEnabledChange}
      roomInfoBlockedReason={roomInfoBlockedReason}
      onRoomInfoBlocked={onRoomInfoBlocked}
      onShare={onShare}
      shareSupported={shareSupported}
      watchLink={watchLink}
      mutedUsers={mutedUsers}
      onUnmuteUser={onChatUserUnmute}
      onClose={() => setOpenPanel("")}
    />
  ) : null;
  const activePanelClassName = [
    openPanel === "microphone" ? "is-microphone-panel" : "",
    openPanel === "more" ? "live-more-menu-panel" : "",
  ].filter(Boolean).join(" ");

  return (
    <section
      className={`page page-immersive live-desktop-page${layoutClassName ? ` ${layoutClassName}` : ""}`}
      data-page="live"
      hidden={hidden}
    >
      <div className="live-page-top">
        <div className="live-desktop-head-left">
          <button
            type="button"
            className={`live-page-close${publishControlActive ? " is-live-control" : ""}`}
            onClick={publishControlActive ? onTogglePublish : onRequestClose}
            aria-label={publishControlActive ? (isStarting ? t("live.cancelStart") : t("live.endBroadcast")) : t("live.closeLivePage")}
          >
            {publishControlActive ? <EndBroadcastIcon /> : <CloseIcon />}
          </button>
          <div className="live-desktop-head-identity">
            <div
              className="live-desktop-host-profile-trigger"
              role="group"
              tabIndex={0}
              aria-label={t("live.viewHostInfo")}
            >
              <UserAvatar
                avatarUrl={roomAvatarUrl}
                displayName={hostChipLabel}
                className="live-desktop-head-avatar"
                imgAlt={hostChipLabel || t("live.hostAvatar")}
                imgWidth={30}
                imgHeight={30}
                monogramClassName="is-monogram"
                placeholderClassName="is-placeholder"
                iconClassName="live-desktop-head-avatar-icon"
              />
              <div
                className="live-desktop-host-profile-popover"
                role="dialog"
                aria-label={t("live.hostInfo")}
              >
                <WatchHostProfileContent
                  hostAvatarUrl={roomAvatarUrl}
                  hostChipLabel={hostChipLabel}
                  hostDisplayName={hostDisplayName}
                  hostBio={authUser?.bio || ""}
                  hostProfileInfoItems={hostProfileInfoItems}
                  hostLocationClickable={false}
                  hostLocationPending={false}
                  onHostHandleCopy={copyHostHandle}
                  hostHandle={hostHandle}
                  roomLabel={roomLabel}
                  hostFollowerCountText={hostFollowerCountText}
                  hostFollowingCountText={hostFollowingCountText}
                  followButton={null}
                />
              </div>
            </div>
            <span>{desktopHostId}</span>
          </div>
        </div>
        {!publishControlActive ? (
          <div className="live-mode-switch" role="group" aria-label={t("live.modeSwitch")}>
            <button
              type="button"
              className={mediaMode === "video" ? "is-active" : ""}
              onClick={() => onSelectLiveMode?.("video")}
              aria-pressed={mediaMode === "video"}
            >
              {t("live.videoMode")}
            </button>
            <button
              type="button"
              className={mediaMode === "voice" ? "is-active" : ""}
              onClick={() => onSelectLiveMode?.("voice")}
              aria-pressed={mediaMode === "voice"}
            >
              {t("live.voiceMode")}
            </button>
          </div>
        ) : null}
        <StatusPill id="publishBadge" label={publishBadge.label} state={publishBadge.state} />
      </div>
      <div className="page-grid live-layout">
        <section className="stage-column">
          <div className="stage-frame live-stage-frame">
            <LivePreviewStage
              previewVideoRef={previewVideoRef}
              previewActive={previewActive}
              previewHasVideo={previewHasVideo}
              previewPending={previewPending}
              mediaMode={mediaMode}
              cameraEnabled={cameraEnabled}
              mirrorPreview={mirrorPreview}
              previewOrientation={previewOrientation}
              portraitViewport={portraitViewport}
              cohostActive={cohostActive}
              cohostPlayers={cohostPlayers}
            />
            <LiveAudienceCallOverlay
              active={audienceCallActive}
              enabled={audienceCallEnabled}
              mutedUserIds={audienceCallMutedUserIds}
              speakingUserIds={audienceCallSpeakingUserIds}
              onDisconnectUser={onAudienceCallUserDisconnect}
              onMuteUserChange={onAudienceCallUserMuteChange}
            />
          </div>
          <div className="live-desktop-overlay">
            {openPanel ? (
              <button
                type="button"
                className="live-desktop-backdrop"
                aria-label={t("live.closeFloatingPanel")}
                onClick={() => setOpenPanel("")}
              />
            ) : null}
            {publishBlockedReason ? (
              <FloatingToast className="live-lock-toast live-desktop-lock-toast">
                {publishBlockedReason}
              </FloatingToast>
            ) : null}
            <div className="live-desktop-dock">
              <LiveDesktopPanel className={activePanelClassName}>{activePanel}</LiveDesktopPanel>

              <div className="live-desktop-actions" role="toolbar" aria-label={t("live.liveControls")}>
                <button
                  type="button"
                  className={`live-dock-button${mediaMode === "voice" ? " is-muted" : ""}${cameraUnavailable ? " is-unavailable has-tooltip" : ""}`}
                  onClick={handleCameraFlip}
                  aria-label={
                    mediaMode === "voice"
                      ? t("live.cameraDisabledInVoiceMode")
                      : cameraUnavailable
                        ? t("live.unavailableCamera")
                        : t("live.flipCameraAria", { mode: cameraMode })
                  }
                  aria-describedby={cameraUnavailable ? "cameraUnavailableTooltip" : undefined}
                  aria-disabled={mediaMode === "voice" || cameraUnavailable ? "true" : undefined}
                  title={cameraUnavailable ? t("live.unavailableCamera") : t("live.flipCameraFull")}
                >
                  <FlipCameraIcon />
                  {cameraUnavailable ? (
                    <span id="cameraUnavailableTooltip" className="live-dock-tooltip" role="tooltip">
                      {t("live.unavailableCamera")}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "microphone" ? " is-active" : ""}${microphoneEnabled ? "" : " is-muted"}`}
                  onClick={handleMicrophoneClick}
                  aria-label={hasSingleMicrophone ? (microphoneEnabled ? t("live.closeMicrophone") : t("live.openMicrophone")) : t("live.microphoneSettings")}
                  aria-expanded={hasSingleMicrophone ? undefined : openPanel === "microphone"}
                  title={hasSingleMicrophone ? (microphoneEnabled ? t("live.closeMicrophone") : t("live.openMicrophone")) : t("live.microphone")}
                >
                  <MicrophoneIcon enabled={microphoneEnabled} />
                </button>
                <button
                  type="button"
                  className={`live-dock-button${screenShareActive ? " is-active" : ""}${screenShareUnavailable ? " is-unavailable has-tooltip" : ""}`}
                  onClick={handleScreenShareClick}
                  aria-label={screenShareButtonLabel}
                  aria-describedby={screenShareUnavailable ? "screenShareUnavailableTooltip" : undefined}
                  aria-disabled={screenShareUnavailable ? "true" : undefined}
                  title={screenShareButtonLabel}
                >
                  <ScreenShareIcon />
                  {screenShareUnavailable ? (
                    <span id="screenShareUnavailableTooltip" className="live-dock-tooltip" role="tooltip">
                      {screenShareUnavailableReason}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={`live-dock-button live-dock-button-primary${isPublishing ? " is-live" : ""}${isStarting ? " is-starting" : ""}`}
                  onClick={onTogglePublish}
                  aria-label={publishControlActive ? (isStarting ? t("live.startingBroadcast") : t("live.endBroadcast")) : t("live.startBroadcast")}
                  title={publishControlActive ? (isStarting ? t("live.startingBroadcast") : t("live.endBroadcast")) : t("live.startBroadcast")}
                  disabled={isStarting || publishBlocked || (!cameraEnabled && !microphoneEnabled)}
                >
                  <BroadcastIcon active={publishControlActive} />
                </button>
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "quality" ? " is-active" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "quality" ? "" : "quality"))}
                  aria-label={t("live.qualitySettings")}
                  aria-expanded={openPanel === "quality"}
                  title={t("live.quality")}
                >
                  <QualityIcon />
                </button>
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "link" ? " is-active" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "link" ? "" : "link"))}
                  aria-label={t("live.linksAndShare")}
                  aria-expanded={openPanel === "link"}
                  title={t("live.links")}
                >
                  <ShareIcon />
                </button>
                <button
                  type="button"
                  className={`live-dock-button${openPanel === "more" ? " is-active" : ""}`}
                  onClick={() => setOpenPanel((current) => (current === "more" ? "" : "more"))}
                  aria-label={t("live.more")}
                  aria-expanded={openPanel === "more"}
                  title={t("live.more")}
                >
                  <MoreIcon />
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="live-chat-column">
          <ChatPanel
            authAvailable={authAvailable}
            authLoading={authLoading}
            authUser={authUser}
            hostUserId={authUser?.id}
            messages={chatMessages}
            draft={chatDraft}
            onDraftChange={onChatDraftChange}
            onSend={onChatSend}
            onRequireLogin={onChatRequireLogin}
            connectionState={chatConnectionState}
            onlineCount={chatOnlineCount}
            readOnly={chatReadOnly}
            chatError={chatError}
            chatRecovering={chatRecovering}
            canRetractMessages={canRetractMessages}
            onMuteMessage={onChatMessageMute}
            onRetractMessage={onChatMessageRetract}
            title={t("chat.title")}
            showWelcome={false}
          />
        </aside>
      </div>
    </section>
  );
}
