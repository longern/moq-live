import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "../ChatPanel.jsx";
import { FloatingToast } from "../primitives/FloatingToast.jsx";
import { LongPressTarget } from "../primitives/LongPressTarget.jsx";
import { SwipeableDrawer } from "../primitives/SwipeableDrawer.jsx";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { WatchHostProfileSheet } from "../watch/WatchSessionSheets.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";
import { formatAudienceCount } from "../../lib/audience.js";
import { buildHostProfileInfoItems } from "../../lib/watchSession.js";
import {
  AudioVideoSettingsIcon,
  AudienceIcon,
  ChatIcon,
  CloseIcon,
  CohostIcon,
  EndBroadcastIcon,
  FlipCameraIcon,
  MicrophoneIcon,
  MoreIcon,
  QualityIcon,
  ShareIcon
} from "./liveIcons.jsx";
import { LiveMobileAudienceSheet } from "./LiveMobileAudienceSheet.jsx";
import { LiveAudienceCallOverlay } from "./LiveAudienceCallOverlay.jsx";
import { LiveMobileCohostPanel } from "./LiveMobileCohostPanel.jsx";
import { LiveMobileMediaSettingsPanel } from "./LiveMobileMediaSettingsPanel.jsx";
import { LiveMoreMenu } from "./LiveMoreMenu.jsx";
import { LivePreviewStage } from "./LivePreviewStage.jsx";
import { LiveQualityMenu } from "./LiveQualityMenu.jsx";
import { LiveShareSheet } from "./LiveShareSheet.jsx";

export function LiveMobilePage({
  view = {},
  room = {},
  share = {},
  publish = {},
  media = {},
  settings = {},
  cohost = {},
  audienceCall = {},
  chat = {},
  auth = {},
  actions = {},
}) {
  const { t } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [hostProfileOpen, setHostProfileOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [qualityDrawerOpen, setQualityDrawerOpen] = useState(false);
  const [mediaSettingsOpen, setMediaSettingsOpen] = useState(false);
  const [cohostDrawerOpen, setCohostDrawerOpen] = useState(false);
  const [audienceCallPanelTab, setAudienceCallPanelTab] = useState("requests");
  const [cameraNoticeVisible, setCameraNoticeVisible] = useState(false);
  const [cameraNoticeMessage, setCameraNoticeMessage] = useState("");
  const [overlaysHidden, setOverlaysHidden] = useState(false);
  const cameraNoticeTimerRef = useRef(null);
  const {
    hidden,
    layoutClassName = "",
    shellMode = "compact",
    shareSupported,
  } = view;
  const {
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
  } = room;
  const {
    watchLink,
  } = share;
  const {
    blocked: publishBlocked,
    blockedReason: publishBlockedReason,
    isPublishing,
    isStarting = false,
  } = publish;
  const {
    cameraOptions = [],
    publishQualityOptions = [],
    publishProtocolOptions = [],
    publishQualityId,
    publishProtocol,
    relayUrl,
    webRtcPublishUrl,
    webRtcPlaybackUrl,
    cameraEnabled,
    cameraMode,
    mediaMode,
    microphoneEnabled,
    previewVideoRef,
    previewActive,
    previewHasVideo,
    previewPending,
    mirrorPreview,
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
    invitesAllowed: cohostInvitesAllowed = true,
    invite: cohostInvite = null,
    active: cohostActive = null,
    playerSession: cohostPlayerSession = null,
    playerMuted: cohostPlayerMuted = true,
    playerRef: cohostPlayerRef,
    playerStatus: cohostPlayerStatus = "",
    recentHosts: cohostRecentHosts = [],
  } = cohost;
  const {
    enabled: audienceCallEnabled = false,
    requests: audienceCallRequests = [],
    invites: audienceCallInvites = [],
    active: audienceCallActive = [],
    mutedUserIds: audienceCallMutedUserIds = [],
    speakingUserIds: audienceCallSpeakingUserIds = [],
  } = audienceCall;
  const audienceCallActiveCount = Array.isArray(audienceCallActive)
    ? audienceCallActive.length
    : 0;
  const {
    messages: chatMessages,
    draft: chatDraft,
    connectionState: chatConnectionState,
    onlineCount: chatOnlineCount,
    loggedInViewers: chatLoggedInViewers = [],
    readOnly: chatReadOnly,
    error: chatError,
    recovering: chatRecovering = false,
    canRetractMessages = false,
    mutedUsers = [],
  } = chat;
  const {
    available: authAvailable,
    loading: authLoading,
    user: authUser,
  } = auth;
  const {
    onCycleCamera,
    onToggleCamera,
    onToggleMicrophone,
    onPublishQualityChange,
    onPublishProtocolChange,
    onRelayUrlChange,
    onWebRtcPublishUrlChange,
    onWebRtcPlaybackUrlChange,
    onTogglePublish,
    onShare,
    onCopyShareLink,
    onOpenImageShare,
    onOpenScreenshotShare,
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
    onCohostInvitesAllowedChange,
    onCohostDisconnect,
    onCohostInviteRequest,
    onCohostInviteRespond,
    onAudienceCallEnabledChange,
    onAudienceCallRequestRespond,
    onAudienceCallInviteViewer,
    onAudienceCallUserMuteChange,
    onAudienceCallUserDisconnect,
    onRoomInfoBlocked,
    onPickCover,
    onOpenCoverPicker,
    onRequestClose,
    onSelectLiveMode,
  } = actions;
  const cameraUnavailable = (cameraOptions?.length ?? 0) === 0;
  const publishControlActive = isPublishing || isStarting;
  const immersiveShell = shellMode === "immersive";
  const voiceMode = mediaMode === "voice";
  const splitChatPanel = !voiceMode && !immersiveShell;
  const hasInlineChatComposer = splitChatPanel;
  const showChatDrawerEntry = !hasInlineChatComposer;
  const showPassiveChatPreview = showChatDrawerEntry;
  const showLiveHeader = publishControlActive;
  const showModeSwitch = !publishControlActive;
  const showStartButton = !isPublishing;
  const showCameraControl = !voiceMode;
  const showMediaSettingsControl = immersiveShell && isPublishing;
  const showCohostControl = showMediaSettingsControl;
  const canHideOverlays = immersiveShell && isPublishing;
  const audienceCountText = formatAudienceCount(chatOnlineCount);
  const loggedInViewers = Array.isArray(chatLoggedInViewers) ? chatLoggedInViewers : [];
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

  useEffect(() => () => {
    if (cameraNoticeTimerRef.current) {
      clearTimeout(cameraNoticeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!showChatDrawerEntry) {
      setChatDrawerOpen(false);
    }
  }, [showChatDrawerEntry]);

  useEffect(() => {
    if (!showLiveHeader) {
      setAudienceOpen(false);
    }
  }, [showLiveHeader]);

  useEffect(() => {
    if (!showMediaSettingsControl) {
      setMediaSettingsOpen(false);
      setCohostDrawerOpen(false);
    }
  }, [showMediaSettingsControl]);

  useEffect(() => {
    if (!canHideOverlays) {
      setOverlaysHidden(false);
    }
  }, [canHideOverlays]);

  function openMoreSheet() {
    setChatDrawerOpen(false);
    setAudienceOpen(false);
    setShareOpen(false);
    setQualityDrawerOpen(false);
    setMediaSettingsOpen(false);
    setCohostDrawerOpen(false);
    setMoreOpen(true);
  }

  function closeMoreSheet() {
    setMoreOpen(false);
  }

  function openChatDrawer() {
    if (!showChatDrawerEntry) {
      return;
    }
    setMoreOpen(false);
    setAudienceOpen(false);
    setShareOpen(false);
    setQualityDrawerOpen(false);
    setMediaSettingsOpen(false);
    setCohostDrawerOpen(false);
    setChatDrawerOpen(true);
  }

  function closeChatDrawer() {
    setChatDrawerOpen(false);
  }

  function openAudienceSheet() {
    if (!showLiveHeader) {
      return;
    }
    setMoreOpen(false);
    setChatDrawerOpen(false);
    setShareOpen(false);
    setQualityDrawerOpen(false);
    setMediaSettingsOpen(false);
    setCohostDrawerOpen(false);
    setAudienceOpen(true);
  }

  function closeAudienceSheet() {
    setAudienceOpen(false);
  }

  function openHostProfile(event) {
    event?.stopPropagation();
    setMoreOpen(false);
    setChatDrawerOpen(false);
    setAudienceOpen(false);
    setShareOpen(false);
    setQualityDrawerOpen(false);
    setMediaSettingsOpen(false);
    setCohostDrawerOpen(false);
    setHostProfileOpen(true);
  }

  function closeHostProfile() {
    setHostProfileOpen(false);
  }

  async function copyHostHandle(handleValue) {
    const normalizedHandle = String(handleValue || "").trim();
    if (!normalizedHandle) {
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedHandle);
      showLiveMobileNotice(t("live.copiedUid"));
    } catch {
      showLiveMobileNotice(t("live.copiedFailed"));
    }
  }

  function openShareSheet() {
    setMoreOpen(false);
    setChatDrawerOpen(false);
    setAudienceOpen(false);
    setHostProfileOpen(false);
    setQualityDrawerOpen(false);
    setMediaSettingsOpen(false);
    setCohostDrawerOpen(false);
    setShareOpen(true);
  }

  function closeShareSheet() {
    setShareOpen(false);
  }

  function openQualitySheet() {
    setMoreOpen(false);
    setChatDrawerOpen(false);
    setAudienceOpen(false);
    setShareOpen(false);
    setHostProfileOpen(false);
    setMediaSettingsOpen(false);
    setCohostDrawerOpen(false);
    setQualityDrawerOpen(true);
  }

  function closeQualitySheet() {
    setQualityDrawerOpen(false);
  }

  function openMediaSettingsSheet() {
    setMoreOpen(false);
    setChatDrawerOpen(false);
    setAudienceOpen(false);
    setShareOpen(false);
    setQualityDrawerOpen(false);
    setHostProfileOpen(false);
    setCohostDrawerOpen(false);
    setMediaSettingsOpen(true);
  }

  function closeMediaSettingsSheet() {
    setMediaSettingsOpen(false);
  }

  function openCohostSheet() {
    if (!showCohostControl) {
      return;
    }

    setMoreOpen(false);
    setChatDrawerOpen(false);
    setAudienceOpen(false);
    setShareOpen(false);
    setQualityDrawerOpen(false);
    setMediaSettingsOpen(false);
    setHostProfileOpen(false);
    setCohostDrawerOpen(true);
  }

  function openAudienceCallInviteSheet() {
    if (!showCohostControl) {
      return;
    }
    setAudienceCallPanelTab("invite");
    setMoreOpen(false);
    setChatDrawerOpen(false);
    setShareOpen(false);
    setQualityDrawerOpen(false);
    setMediaSettingsOpen(false);
    setHostProfileOpen(false);
    setCohostDrawerOpen(true);
  }

  function closeCohostSheet() {
    setCohostDrawerOpen(false);
  }

  function isPreviewSurfaceEvent(event) {
    const target = event.target;
    return target instanceof Element && Boolean(target.closest(".publisher-host"));
  }

  function handleStageClick(event) {
    if (!canHideOverlays || !overlaysHidden || !isPreviewSurfaceEvent(event)) {
      return;
    }

    setOverlaysHidden(false);
  }

  function handleStageContextMenu(event) {
    if (!canHideOverlays || !isPreviewSurfaceEvent(event)) {
      return;
    }

    event.preventDefault();
    setOverlaysHidden(true);
  }

  function handleStageLongPress(event) {
    if (!canHideOverlays || !isPreviewSurfaceEvent(event)) {
      return false;
    }

    setOverlaysHidden(true);
    return true;
  }

  function showLiveMobileNotice(message) {
    setCameraNoticeVisible(true);
    setCameraNoticeMessage(message);
    if (cameraNoticeTimerRef.current) {
      clearTimeout(cameraNoticeTimerRef.current);
    }
    cameraNoticeTimerRef.current = window.setTimeout(() => {
      setCameraNoticeVisible(false);
      cameraNoticeTimerRef.current = null;
    }, 1800);
  }

  function handleCameraAction() {
    if (voiceMode) {
      return;
    }

    if (cameraUnavailable) {
      showLiveMobileNotice(t("live.unavailableCamera"));
      return;
    }

    onCycleCamera();
  }

  const hostAvatar = (
    <UserAvatar
      avatarUrl={roomAvatarUrl}
      displayName={hostChipLabel}
      className="live-mobile-head-avatar"
      imgAlt={hostChipLabel || t("live.hostAvatar")}
      imgWidth={32}
      imgHeight={32}
      monogramClassName="is-monogram"
      placeholderClassName="is-placeholder"
      iconClassName="live-mobile-head-avatar-icon"
    />
  )

  return (
    <section
      className={`page page-immersive live-mobile-page${layoutClassName ? ` ${layoutClassName}` : ""}`}
      data-page="live"
      data-media={mediaMode}
      data-shell={shellMode}
      data-overlays-hidden={overlaysHidden ? "true" : "false"}
      hidden={hidden}
    >
      <div className="live-mobile-shell">
        <div className="live-mobile-head">
          <div className="live-mobile-head-left">
            <button
              type="button"
              className={`live-page-close live-mobile-overlay-hideable${publishControlActive ? " is-live-control" : ""}`}
              onClick={publishControlActive ? onTogglePublish : onRequestClose}
              aria-label={publishControlActive ? (isStarting ? t("live.cancelStart") : t("live.endBroadcast")) : t("live.closeLivePage")}
            >
              {publishControlActive ? <EndBroadcastIcon /> : <CloseIcon />}
            </button>
            {showLiveHeader ? (
              <button
                type="button"
                className="live-mobile-room-chip live-mobile-room-chip-head live-mobile-overlay-hideable"
                onClick={openHostProfile}
                aria-label={t("live.viewHostInfo")}
              >
                {hostAvatar}
                <span className="live-mobile-room">{roomLabel}</span>
              </button>
            ) : (
              <button
                type="button"
                className="live-mobile-host-avatar-button live-mobile-overlay-hideable"
                onClick={openHostProfile}
                aria-label={t("live.viewHostInfo")}
              >
                {hostAvatar}
              </button>
            )}
          </div>
          <div className="live-mobile-head-center live-mobile-overlay-hideable">
            {showModeSwitch ? (
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
          </div>
          <div className="live-mobile-head-right live-mobile-overlay-hideable">
            {showLiveHeader ? (
              <button
                type="button"
                className="live-mobile-audience-chip"
                onClick={(event) => {
                  event.stopPropagation();
                  openAudienceSheet();
                }}
                aria-label={t("live.onlineAudienceAria", { count: audienceCountText })}
              >
                <AudienceIcon />
                <span>{audienceCountText}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="live-mobile-head-share"
              onClick={(event) => {
                event.stopPropagation();
                if (shareOpen) {
                  closeShareSheet();
                  return;
                }
                openShareSheet();
              }}
              aria-label={t("live.shareRoom")}
              aria-expanded={shareOpen}
              disabled={!watchLink}
            >
              <ShareIcon />
            </button>
          </div>
        </div>
        <LongPressTarget
          className="stage-frame live-stage-frame live-stage-frame-mobile"
          longPressEnabled={canHideOverlays}
          onLongPress={handleStageLongPress}
          onClick={handleStageClick}
          onContextMenu={handleStageContextMenu}
        >
          <LivePreviewStage
            previewVideoRef={previewVideoRef}
            previewActive={previewActive}
            previewHasVideo={previewHasVideo}
            previewPending={previewPending}
            mediaMode={mediaMode}
            cameraEnabled={cameraEnabled}
            mirrorPreview={mirrorPreview}
            cohostActive={cohostActive}
            cohostPlayerSession={cohostPlayerSession}
            cohostPlayerMuted={cohostPlayerMuted}
            cohostPlayerRef={cohostPlayerRef}
            cohostPlayerStatus={cohostPlayerStatus}
          />
          {publishBlockedReason ? (
            <FloatingToast className="live-lock-toast live-mobile-lock-toast">
              {publishBlockedReason}
            </FloatingToast>
          ) : null}
          {cameraNoticeVisible ? (
            <FloatingToast className="live-mobile-toast">{cameraNoticeMessage}</FloatingToast>
          ) : null}
          <LiveAudienceCallOverlay
            active={audienceCallActive}
            enabled={audienceCallEnabled}
            mutedUserIds={audienceCallMutedUserIds}
            speakingUserIds={audienceCallSpeakingUserIds}
            hidden={overlaysHidden}
            actionLabel={audienceCallEnabled && audienceCallActiveCount < 5 ? t("live.inviteAudienceCall") : ""}
            actionAriaLabel={audienceCallEnabled && audienceCallActiveCount < 5 ? t("live.inviteAudience") : ""}
            onAction={audienceCallEnabled && audienceCallActiveCount < 5 ? openAudienceCallInviteSheet : undefined}
            onDisconnectUser={onAudienceCallUserDisconnect}
            onMuteUserChange={onAudienceCallUserMuteChange}
          />
          <div className="live-mobile-bottom-stack live-mobile-overlay-hideable">
            {showPassiveChatPreview ? (
              <div className="live-mobile-chat-overlay">
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
                  variant="floating"
                  className="chat-panel-live-mobile"
                  title={t("chat.title")}
                  showComposer={false}
                  showWelcome={false}
                />
              </div>
            ) : null}
            <div className="live-mobile-actions">
              <div className="live-mobile-utility-row" aria-label={t("live.liveUtilityActions")}>
                {showMediaSettingsControl ? (
                  <button
                    type="button"
                    className={`live-fab live-fab-icon${mediaSettingsOpen ? " is-active" : ""}`}
                    onClick={mediaSettingsOpen ? closeMediaSettingsSheet : openMediaSettingsSheet}
                    aria-label={mediaSettingsOpen ? t("live.closeMediaSettings") : t("live.mediaSettings")}
                    aria-expanded={mediaSettingsOpen}
                  >
                    <AudioVideoSettingsIcon />
                  </button>
                ) : null}
                {showCohostControl ? (
                  <button
                    type="button"
                    className={`live-fab live-fab-icon${cohostDrawerOpen ? " is-active" : ""}${cohostActive ? " is-connected" : ""}`}
                    onClick={cohostDrawerOpen ? closeCohostSheet : openCohostSheet}
                    aria-label={cohostDrawerOpen ? t("live.closeCohost") : t("live.cohost")}
                    aria-expanded={cohostDrawerOpen}
                  >
                    <CohostIcon />
                  </button>
                ) : null}
                {!showMediaSettingsControl && showCameraControl ? (
                  <button
                    type="button"
                    className={`live-fab live-fab-icon${cameraUnavailable ? " is-unavailable" : ""}`}
                    onClick={handleCameraAction}
                    aria-label={cameraUnavailable
                      ? t("live.unavailableCamera")
                      : t("live.flipCameraAria", { mode: cameraMode })}
                    aria-disabled={cameraUnavailable ? "true" : undefined}
                  >
                    <FlipCameraIcon />
                  </button>
                ) : null}
                {!showMediaSettingsControl ? (
                  <button
                    type="button"
                    className={`live-fab live-fab-icon${microphoneEnabled ? "" : " is-muted"}`}
                    onClick={onToggleMicrophone}
                    aria-label={microphoneEnabled ? t("live.closeMicrophone") : t("live.openMicrophone")}
                  >
                    <MicrophoneIcon enabled={microphoneEnabled} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`live-fab live-fab-icon${qualityDrawerOpen ? " is-active" : ""}`}
                  onClick={qualityDrawerOpen ? closeQualitySheet : openQualitySheet}
                  aria-label={qualityDrawerOpen ? t("live.closeQualitySettings") : t("live.qualitySettings")}
                  aria-expanded={qualityDrawerOpen}
                >
                  <QualityIcon />
                </button>
                {showChatDrawerEntry ? (
                  <button
                    type="button"
                    className={`live-fab live-fab-icon${chatDrawerOpen ? " is-active" : ""}`}
                    onClick={() => {
                      if (chatDrawerOpen) {
                        closeChatDrawer();
                        return;
                      }
                      openChatDrawer();
                    }}
                    aria-label={chatDrawerOpen ? t("common.closePanel") : t("chat.title")}
                    aria-expanded={chatDrawerOpen}
                  >
                    <ChatIcon />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`live-fab live-fab-icon${moreOpen ? " is-active" : ""}`}
                  onClick={() => {
                    if (moreOpen) {
                      closeMoreSheet();
                      return;
                    }
                    openMoreSheet();
                  }}
                  aria-label={moreOpen ? t("common.closePanel") : t("live.more")}
                >
                  <MoreIcon />
                </button>
              </div>
              {showStartButton ? (
                <button
                  type="button"
                  className={`live-fab live-fab-primary${isStarting ? " is-starting" : ""}`}
                  onClick={onTogglePublish}
                  disabled={isStarting || publishBlocked || (!cameraEnabled && !microphoneEnabled)}
                  aria-label={isStarting ? t("live.startingBroadcast") : t("live.startBroadcast")}
                >
                  {t("live.startBroadcast")}
                </button>
              ) : null}
            </div>
          </div>
        </LongPressTarget>

        {splitChatPanel ? (
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
            className="chat-panel-live-split"
          />
        ) : null}

        {showChatDrawerEntry ? (
          <SwipeableDrawer
            open={chatDrawerOpen}
            onClose={closeChatDrawer}
            ariaLabel={t("common.closePanel")}
            className="live-mobile-drawer live-mobile-chat-drawer"
            panelClassName="live-mobile-chat-panel"
          >
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
              className="chat-panel-live-drawer"
            />
          </SwipeableDrawer>
        ) : null}

        {showLiveHeader ? (
          <LiveMobileAudienceSheet
            open={audienceOpen}
            onClose={closeAudienceSheet}
            audienceCountText={audienceCountText}
            loggedInViewers={loggedInViewers}
          />
        ) : null}

        <WatchHostProfileSheet
          open={hostProfileOpen}
          onClose={closeHostProfile}
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

        <LiveMobileMediaSettingsPanel
          open={mediaSettingsOpen}
          onClose={closeMediaSettingsSheet}
          cameraUnavailable={cameraUnavailable}
          cameraMode={cameraMode}
          cameraEnabled={cameraEnabled}
          microphoneEnabled={microphoneEnabled}
          previewVideoRef={previewVideoRef}
          onCycleCamera={onCycleCamera}
          onToggleCamera={onToggleCamera}
          onToggleMicrophone={onToggleMicrophone}
          onUnavailableCamera={() => showLiveMobileNotice(t("live.unavailableCamera"))}
        />

        <LiveMobileCohostPanel
          open={cohostDrawerOpen}
          onClose={closeCohostSheet}
          active={cohostActive}
          invitesAllowed={cohostInvitesAllowed}
          invite={cohostInvite}
          recentHosts={cohostRecentHosts}
          audienceCallEnabled={audienceCallEnabled}
          audienceCallRequests={audienceCallRequests}
          audienceCallInvites={audienceCallInvites}
          audienceCallActive={audienceCallActive}
          audienceCallInviteViewers={loggedInViewers}
          audienceTab={audienceCallPanelTab}
          onDisconnect={onCohostDisconnect}
          onInvitesAllowedChange={onCohostInvitesAllowedChange}
          onInviteRequest={onCohostInviteRequest}
          onInviteRespond={onCohostInviteRespond}
          onAudienceCallEnabledChange={onAudienceCallEnabledChange}
          onAudienceCallRequestRespond={onAudienceCallRequestRespond}
          onAudienceCallInviteViewer={onAudienceCallInviteViewer}
          onAudienceTabChange={setAudienceCallPanelTab}
        />

        <SwipeableDrawer
          open={qualityDrawerOpen}
          onClose={closeQualitySheet}
          ariaLabel={t("live.closeQualitySettings")}
          className="live-mobile-drawer"
          panelClassName="live-mobile-quality-panel"
        >
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
            onAfterSelect={closeQualitySheet}
          />
        </SwipeableDrawer>

        <LiveShareSheet
          open={shareOpen}
          onClose={closeShareSheet}
          onCopyLink={onCopyShareLink}
          onOpenImageShare={() => {
            closeShareSheet();
            onOpenImageShare?.();
          }}
          onOpenScreenshotShare={() => {
            closeShareSheet();
            onOpenScreenshotShare?.();
          }}
          onShareLink={onShare}
          screenshotShareAvailable={mediaMode === "video" && previewActive && previewHasVideo}
          shareSupported={shareSupported}
          watchLink={watchLink}
        />

        <SwipeableDrawer
          open={moreOpen}
          onClose={closeMoreSheet}
          ariaLabel={t("common.closePanel")}
          className="live-mobile-drawer"
          panelClassName="live-mobile-more-panel live-more-menu-panel"
        >
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
            onUnmuteUser={onChatUserUnmute}
            onClose={closeMoreSheet}
          />
        </SwipeableDrawer>
      </div>
    </section>
  );
}
