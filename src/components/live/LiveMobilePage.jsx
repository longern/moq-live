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
  CheckIcon,
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
import { LiveMoreMenu } from "./LiveMoreMenu.jsx";
import { LiveMenuItem, LiveMenuList } from "./LiveMenuList.jsx";
import { LivePreviewStage } from "./LivePreviewStage.jsx";
import { LiveQualityMenu } from "./LiveQualityMenu.jsx";
import { LiveShareSheet } from "./LiveShareSheet.jsx";
import { LiveSwitch } from "./LiveSwitch.jsx";

export function LiveMobilePage({
  view = {},
  room = {},
  share = {},
  publish = {},
  media = {},
  settings = {},
  cohost = {},
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
  const [cohostHandle, setCohostHandle] = useState("");
  const [cohostBusy, setCohostBusy] = useState(false);
  const [cohostResponseBusy, setCohostResponseBusy] = useState(false);
  const [cameraNoticeVisible, setCameraNoticeVisible] = useState(false);
  const [cameraNoticeMessage, setCameraNoticeMessage] = useState("未检测到可用摄像头");
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
    recentHosts: cohostRecentHosts = [],
  } = cohost;
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

  useEffect(() => {
    if (!cohostDrawerOpen) {
      setCohostHandle("");
    }
  }, [cohostDrawerOpen]);

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
      showLiveMobileNotice("UID 复制成功");
    } catch {
      showLiveMobileNotice("复制失败");
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

  async function submitCohostInvite(nextHandle = cohostHandle) {
    const handle = nextHandle.trim().replace(/^@+/, "");
    if (!handle || cohostBusy) {
      return;
    }

    setCohostBusy(true);
    const ok = await onCohostInviteRequest?.(handle);
    setCohostBusy(false);
    if (ok) {
      setCohostHandle("");
      setCohostDrawerOpen(false);
    }
  }

  async function respondToCohostInvite(accepted) {
    if (!cohostInvite || cohostResponseBusy) {
      return;
    }

    setCohostResponseBusy(true);
    await onCohostInviteRespond?.(cohostInvite, accepted);
    setCohostResponseBusy(false);
  }

  function disconnectCohost() {
    onCohostDisconnect?.();
    setCohostDrawerOpen(false);
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
      showLiveMobileNotice("未检测到可用摄像头");
      return;
    }

    onCycleCamera();
  }

  const hostAvatar = (
    <UserAvatar
      avatarUrl={roomAvatarUrl}
      displayName={hostChipLabel}
      className="live-mobile-head-avatar"
      imgAlt={hostChipLabel || "主播头像"}
      imgWidth={24}
      imgHeight={24}
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
              aria-label={publishControlActive ? (isStarting ? "取消开播" : "结束直播") : "退出开播页"}
            >
              {publishControlActive ? <EndBroadcastIcon /> : <CloseIcon />}
            </button>
            {showLiveHeader ? (
              <button
                type="button"
                className="live-mobile-room-chip live-mobile-room-chip-head live-mobile-overlay-hideable"
                onClick={openHostProfile}
                aria-label="查看主播信息"
              >
                {hostAvatar}
                <span className="live-mobile-room">{roomLabel}</span>
              </button>
            ) : (
              <button
                type="button"
                className="live-mobile-host-avatar-button live-mobile-overlay-hideable"
                onClick={openHostProfile}
                aria-label="查看主播信息"
              >
                {hostAvatar}
              </button>
            )}
          </div>
          <div className="live-mobile-head-center live-mobile-overlay-hideable">
            {showModeSwitch ? (
              <div className="live-mode-switch" role="group" aria-label="开播模式">
                <button
                  type="button"
                  className={mediaMode === "video" ? "is-active" : ""}
                  onClick={() => onSelectLiveMode?.("video")}
                  aria-pressed={mediaMode === "video"}
                >
                  视频
                </button>
                <button
                  type="button"
                  className={mediaMode === "voice" ? "is-active" : ""}
                  onClick={() => onSelectLiveMode?.("voice")}
                  aria-pressed={mediaMode === "voice"}
                >
                  语音
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
                aria-label={`${audienceCountText}人在线，查看在线用户`}
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
              aria-label="分享直播间"
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
            mirrorPreview={mirrorPreview}
          />
          {publishBlockedReason ? (
            <div className="live-mobile-warning">{publishBlockedReason}</div>
          ) : null}
          {cameraNoticeVisible ? (
            <FloatingToast className="live-mobile-toast">{cameraNoticeMessage}</FloatingToast>
          ) : null}
          <div className="live-mobile-bottom-stack live-mobile-overlay-hideable">
            {showPassiveChatPreview ? (
              <div className="live-mobile-chat-overlay">
                <ChatPanel
                  authAvailable={authAvailable}
                  authLoading={authLoading}
                  authUser={authUser}
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
                  title="评论"
                  showComposer={false}
                  showWelcome={false}
                />
              </div>
            ) : null}
            <div className="live-mobile-actions">
              <div className="live-mobile-utility-row" aria-label="开播辅助操作">
                {showMediaSettingsControl ? (
                  <button
                    type="button"
                    className={`live-fab live-fab-icon${mediaSettingsOpen ? " is-active" : ""}`}
                    onClick={mediaSettingsOpen ? closeMediaSettingsSheet : openMediaSettingsSheet}
                    aria-label={mediaSettingsOpen ? "关闭音画设置" : "音画设置"}
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
                    aria-label={cohostDrawerOpen ? "关闭连线" : "连线"}
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
                      ? "未检测到可用摄像头"
                      : `翻转摄像头，当前${cameraMode === "rear" ? "后摄" : "前摄"}`}
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
                    aria-label={microphoneEnabled ? "关闭麦克风" : "打开麦克风"}
                  >
                    <MicrophoneIcon enabled={microphoneEnabled} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`live-fab live-fab-icon${qualityDrawerOpen ? " is-active" : ""}`}
                  onClick={qualityDrawerOpen ? closeQualitySheet : openQualitySheet}
                  aria-label={qualityDrawerOpen ? "关闭画质设置" : "画质设置"}
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
                    aria-label={chatDrawerOpen ? "关闭评论" : "打开评论"}
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
                  aria-label={moreOpen ? "关闭更多操作" : "打开更多操作"}
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
                  aria-label={isStarting ? "正在开始直播" : "开始直播"}
                >
                  开始直播
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
            title="评论"
            showWelcome={false}
            className="chat-panel-live-split"
          />
        ) : null}

        {showChatDrawerEntry ? (
          <SwipeableDrawer
            open={chatDrawerOpen}
            onClose={closeChatDrawer}
            ariaLabel="关闭评论"
            className="live-mobile-drawer live-mobile-chat-drawer"
            panelClassName="live-mobile-chat-panel"
          >
            <ChatPanel
              authAvailable={authAvailable}
              authLoading={authLoading}
              authUser={authUser}
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
              title="评论"
              showWelcome={false}
              className="chat-panel-live-drawer"
            />
          </SwipeableDrawer>
        ) : null}

        {showLiveHeader ? (
          <SwipeableDrawer
            open={audienceOpen}
            onClose={closeAudienceSheet}
            ariaLabel="关闭在线用户"
            className="live-mobile-drawer live-mobile-audience-drawer"
            panelClassName="live-mobile-audience-panel"
          >
            <div className="live-audience-head">
              <strong>在线用户</strong>
              <span>{audienceCountText} 人</span>
            </div>
            {loggedInViewers.length > 0 ? (
              <div className="live-audience-list">
                {loggedInViewers.map((viewer) => {
                  const displayName = viewer.displayName || "已登录用户";
                  return (
                    <div className="live-audience-row" key={viewer.id}>
                      <UserAvatar
                        avatarUrl={viewer.avatarUrl}
                        displayName={displayName}
                        className="live-audience-avatar"
                        imgAlt={`${displayName}头像`}
                        imgWidth={48}
                        imgHeight={48}
                        monogramClassName="is-monogram"
                        placeholderClassName="is-placeholder"
                        iconClassName="live-audience-avatar-icon"
                      />
                      <span>{displayName}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="live-audience-empty">暂无在线用户</div>
            )}
          </SwipeableDrawer>
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

        <SwipeableDrawer
          open={mediaSettingsOpen}
          onClose={closeMediaSettingsSheet}
          ariaLabel="关闭音画设置"
          className="live-mobile-drawer"
          panelClassName="live-mobile-media-panel"
        >
          <div className="live-mobile-media-panel-head">
            <strong>音画设置</strong>
          </div>
          <div className="live-mobile-media-toolbar">
            <div className="live-mobile-media-toolbar-left" role="group" aria-label="快捷音画控制">
              <button
                type="button"
                className={`live-media-icon-button${cameraUnavailable ? " is-unavailable" : ""}`}
                onClick={handleCameraAction}
                aria-label={cameraUnavailable
                  ? "未检测到可用摄像头"
                  : `翻转摄像头，当前${cameraMode === "rear" ? "后摄" : "前摄"}`}
                aria-disabled={cameraUnavailable ? "true" : undefined}
              >
                <FlipCameraIcon />
              </button>
              <button
                type="button"
                className={`live-media-icon-button${microphoneEnabled ? "" : " is-muted"}`}
                onClick={onToggleMicrophone}
                aria-label={microphoneEnabled ? "关闭麦克风" : "打开麦克风"}
              >
                <MicrophoneIcon enabled={microphoneEnabled} />
              </button>
            </div>
          </div>
        </SwipeableDrawer>

        <SwipeableDrawer
          open={cohostDrawerOpen}
          onClose={closeCohostSheet}
          ariaLabel="关闭连线"
          className="live-mobile-drawer"
          panelClassName="live-mobile-cohost-panel"
        >
          <div className="live-cohost-head">
            <strong>连线</strong>
          </div>
          <LiveMenuList className="live-cohost-menu" ariaLabel="连线设置">
            {cohostActive ? (
              <LiveMenuItem
                className="live-more-menu-item live-cohost-menu-item live-cohost-disconnect-item"
                aria-label="断开连线"
                onClick={disconnectCohost}
              >
                <span className="live-more-menu-icon">
                  <CloseIcon />
                </span>
                <span className="live-more-menu-label">断开连线</span>
              </LiveMenuItem>
            ) : null}
            <li className="live-menu-list-item">
              <button
                type="button"
                className="live-menu-item live-more-menu-item live-more-menu-switch-item live-cohost-menu-item"
                role="switch"
                aria-checked={cohostInvitesAllowed}
                aria-label="允许其他主播邀请连线"
                onClick={() => onCohostInvitesAllowedChange?.(!cohostInvitesAllowed)}
              >
                <span className="live-more-menu-icon">
                  <CohostIcon />
                </span>
                <span className="live-more-menu-label">允许邀请</span>
                <LiveSwitch checked={cohostInvitesAllowed} />
              </button>
            </li>
          </LiveMenuList>
          <form
            className="live-cohost-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCohostInvite();
            }}
          >
            <input
              value={cohostHandle}
              onChange={(event) => setCohostHandle(event.currentTarget.value)}
              placeholder="输入 UID"
              autoComplete="off"
              inputMode="text"
            />
            <button type="submit" disabled={!cohostHandle.trim() || cohostBusy}>
              申请
            </button>
          </form>
          <div className="live-cohost-recent">
            <div className="live-cohost-recent-head">最近连线</div>
            {cohostRecentHosts.length > 0 ? (
              <div className="live-cohost-recent-list">
                {cohostRecentHosts.map((host) => {
                  const name = host.displayName || host.handle;
                  return (
                    <button
                      type="button"
                      className="live-cohost-recent-row"
                      key={host.handle}
                      disabled={cohostBusy}
                      onClick={() => {
                        void submitCohostInvite(host.handle);
                      }}
                    >
                      <UserAvatar
                        avatarUrl={host.avatarUrl}
                        displayName={name}
                        className="live-cohost-avatar"
                        imgAlt={`${name}头像`}
                        imgWidth={38}
                        imgHeight={38}
                        monogramClassName="is-monogram"
                        placeholderClassName="is-placeholder"
                        iconClassName="live-cohost-avatar-icon"
                      />
                      <span>{name}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="live-cohost-empty">暂无最近连线</div>
            )}
          </div>
        </SwipeableDrawer>

        <SwipeableDrawer
          open={qualityDrawerOpen}
          onClose={closeQualitySheet}
          ariaLabel="关闭画质设置"
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
          ariaLabel="关闭更多操作"
          className="live-mobile-drawer"
          panelClassName="live-mobile-more-panel"
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
        {cohostInvite ? (
          <div className="live-cohost-invite-layer">
            <section
              className="live-cohost-invite-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="连线邀请"
            >
              <div className="live-cohost-invite-copy">
                <strong>{cohostInvite.requester.displayName || cohostInvite.requester.handle}</strong>
                <span>申请与你连线</span>
              </div>
              <div className="live-cohost-invite-actions">
                <button
                  type="button"
                  className="live-cohost-invite-button reject"
                  onClick={() => {
                    void respondToCohostInvite(false);
                  }}
                  disabled={cohostResponseBusy}
                  aria-label="拒绝连线邀请"
                >
                  <CloseIcon />
                </button>
                <button
                  type="button"
                  className="live-cohost-invite-button accept"
                  onClick={() => {
                    void respondToCohostInvite(true);
                  }}
                  disabled={cohostResponseBusy}
                  aria-label="接受连线邀请"
                >
                  <CheckIcon />
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </section>
  );
}
