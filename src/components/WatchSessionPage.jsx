import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  MoreHorizontal,
  X,
} from "lucide-react";
import { ChatPanel } from "./ChatPanel.jsx";
import { LiveAudienceCallOverlay } from "./live/LiveAudienceCallOverlay.jsx";
import { useToast } from "./primitives/FloatingToast.jsx";
import { StatusPill } from "./primitives/StatusPill.jsx";
import {
  WatchAudienceSheet,
  WatchHostProfileSheet,
  WatchMobileMoreSheet,
} from "./watch/WatchSessionSheets.jsx";
import { WatchHostProfileActions } from "./watch/WatchHostProfileActions.jsx";
import { WatchMobileHud } from "./watch/WatchMobileHud.jsx";
import { WatchRoomInfoStrip } from "./watch/WatchRoomInfoStrip.jsx";
import {
  WatchDesktopSharePanel,
  WatchImageShareDialog,
} from "./watch/WatchSharePanels.jsx";
import { WatchPictureInPictureControlsLayer, WatchStage } from "./watch/WatchStage.jsx";
import { formatAudienceCount } from "../lib/audience.js";
import {
  isPortraitMedia,
  shouldUsePortraitImmersiveMode,
} from "../lib/mediaLayout.js";
import {
  buildHostProfileInfoItems,
  getWatchStageLayout,
} from "../lib/watchSession.js";
import { getWatchStageView } from "../lib/watchStageView.js";
import { useCompactViewport, useMediaQuery, usePortraitViewport } from "../hooks/useMediaQuery.js";
import { useWatchHostDistance } from "../hooks/useWatchHostDistance.js";
import { useOverlayPortalTarget } from "../hooks/useOverlayPortalTarget.js";
import { useWatchPictureInPicture } from "../hooks/useWatchPictureInPicture.js";
import { useWatchShareActions } from "../hooks/useWatchShareActions.js";
import { useWatchStageControls } from "../hooks/useWatchStageControls.js";
import { useI18n } from "../i18n/I18nProvider.jsx";

function WatchAudienceCallInviteDialog({ invite, portalTarget, onRespond }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  if (!invite) {
    return null;
  }

  async function respond(accepted) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await onRespond?.(invite, accepted);
    } finally {
      setBusy(false);
    }
  }

  const dialog = (
    <div className="watch-audience-call-invite-layer">
      <section
        className="watch-audience-call-invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("watchSheet.audienceCallInvite")}
      >
        <div className="watch-audience-call-invite-copy">
          <strong>{t("watchSheet.audienceCallInvite")}</strong>
          <span>{t("watchSheet.audienceCallInviteMessage")}</span>
        </div>
        <div className="watch-audience-call-invite-actions">
          <button
            type="button"
            className="watch-audience-call-invite-button reject"
            onClick={() => {
              void respond(false);
            }}
            disabled={busy}
            aria-label={t("watchSheet.audienceCallInviteReject")}
          >
            <X aria-hidden="true" />
          </button>
          <button
            type="button"
            className="watch-audience-call-invite-button accept"
            onClick={() => {
              void respond(true);
            }}
            disabled={busy}
            aria-label={t("watchSheet.audienceCallInviteAccept")}
          >
            <Check aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );

  return portalTarget ? createPortal(dialog, portalTarget) : dialog;
}

export function WatchSessionPage({
  hidden,
  roomLabel,
  roomTitle,
  welcomeMessage,
  siteTitle,
  host = {},
  media = {},
  player = {},
  cohost = {},
  auth = {},
  chat = {},
  actions = {},
  testPlayback
}) {
  const { t } = useI18n();
  const {
    userId: hostUserId,
    handle: hostHandle,
    displayName: hostDisplayName,
    avatarUrl: hostAvatarUrl,
    gender: hostGender = "",
    birthDate: hostBirthDate = "",
    bio: hostBio = "",
    locationProvince: hostLocationProvince = t("profile.locationUnknown"),
    locationAvailable: hostLocationAvailable = false,
    distanceAvailable: hostDistanceAvailable = hostLocationAvailable,
    locationUpdatedAt: hostLocationUpdatedAt = "",
    followerCount: hostFollowerCount = 0,
    followingCount: hostFollowingCount = 0,
    icon: hostIcon,
    following: hostFollowing = false,
    followLoading: hostFollowLoading = false,
    followBusy: hostFollowBusy = false,
    notifyLiveStarted: hostNotifyLiveStarted = false,
    notifyBusy: hostNotifyBusy = false,
  } = host;
  const {
    roomCoverUrl,
    siteIconUrl,
    watchLink,
    stageLoading,
    stageMessage,
  } = media;
  const {
    statusMessage: playerStatusMessage,
    statusKind: playerStatusKind = "idle",
    badge: playerBadge,
    fullscreenActive,
    paused: playerPaused,
    muted: playerMuted,
    showTapToUnmute,
    orientation: playerOrientation,
    stageRef,
    session: playerSession,
    started: playerStarted = false,
    freezeFrameUrl: playerFreezeFrameUrl = "",
    ref: playerRef,
  } = player;
  const {
    players: cohostPlayers = [],
  } = cohost;
  const {
    available: authAvailable,
    loading: authLoading,
    user: authUser,
  } = auth;
  const {
    room: chatRoom,
    roomLabel: chatRoomLabel,
    messages: chatMessages,
    draft: chatDraft,
    connectionState: chatConnectionState,
    onlineCount: chatOnlineCount,
    loggedInViewers: chatLoggedInViewers = [],
    audienceCallEnabled = false,
    audienceCallRequests = [],
    audienceCallInvite = null,
    audienceCallActive = [],
    audienceCallSpeakingUserIds = [],
    audienceCallRealtimeSession = null,
    readOnly: chatReadOnly,
    error: chatError,
    recovering: chatRecovering = false,
  } = chat;
  const {
    onStop,
    onTogglePlayback,
    onToggleMute,
    onDismissTapToUnmute,
    onFullscreen,
    onHostFollowToggle,
    onHostNotifyLiveToggle,
    onChatDraftChange,
    onChatSend,
    onChatRequireLogin,
    onAudienceCallRequest,
    onAudienceCallRequestCancel,
    onAudienceCallInviteRespond,
    onAudienceCallDisconnect,
  } = actions;
  const [moreOpen, setMoreOpen] = useState(false);
  const [hostProfileOpen, setHostProfileOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [fullscreenSideSheetHost, setFullscreenSideSheetHost] = useState(null);
  const stageContentRef = useRef(null);
  const fullscreenSideSheetHostRef = useRef(null);
  const overlayPortalTarget = useOverlayPortalTarget();
  const setFullscreenSideSheetHostNode = useCallback((node) => {
    fullscreenSideSheetHostRef.current = node;
    setFullscreenSideSheetHost(node);
  }, []);
  const { showToast } = useToast();
  const compactViewport = useCompactViewport();
  const portraitViewport = usePortraitViewport();
  const shortLandscapeViewport = useMediaQuery("(max-width: 980px) and (orientation: landscape) and (max-height: 520px)");
  const standaloneDisplayMode = useMediaQuery("(display-mode: standalone), (display-mode: fullscreen)");
  const iosStandaloneDisplayMode = typeof window !== "undefined" && window.navigator?.standalone === true;
  const showMobileMoreFullscreenAction = Boolean(
    compactViewport && !standaloneDisplayMode && !iosStandaloneDisplayMode
  );
  const audienceCallRequestPending = Boolean(
    authUser?.id &&
    Array.isArray(audienceCallRequests) &&
    audienceCallRequests.some((request) => request.user?.id === authUser.id)
  );
  const portraitMedia = isPortraitMedia(playerOrientation);
  const immersivePortrait = shouldUsePortraitImmersiveMode({
    mediaOrientation: playerOrientation,
    portraitViewport,
  });
  const fullscreenLandscapeMedia = Boolean(
    fullscreenActive && !portraitMedia && (compactViewport || portraitViewport || shortLandscapeViewport)
  );
  const audienceCountText = formatAudienceCount(chatOnlineCount);
  const hostFollowerCountText = formatAudienceCount(hostFollowerCount);
  const hostFollowingCountText = formatAudienceCount(hostFollowingCount);
  const loggedInViewers = Array.isArray(chatLoggedInViewers) ? chatLoggedInViewers : [];
  const audienceCallActiveCount = Array.isArray(audienceCallActive)
    ? audienceCallActive.length
    : 0;
  const hostChipLabel = hostDisplayName || roomTitle || roomLabel;
  const showHostFollowButton = Boolean(hostUserId && authUser?.id !== hostUserId);
  const showCohostLayout = cohostPlayers.some((item) => item.session || item.badge?.state === "warm");
  const landscapeImmersive = Boolean(shortLandscapeViewport && !portraitMedia && !showCohostLayout);
  const landscapePortraitSplit = Boolean(shortLandscapeViewport && portraitMedia && !showCohostLayout);
  const immersiveShell = immersivePortrait || fullscreenLandscapeMedia || landscapeImmersive || (portraitViewport && showCohostLayout);
  const longPressOpensMore = Boolean(portraitViewport && !portraitMedia && !fullscreenActive);
  const manualHideControlsEnabled = !longPressOpensMore;
  const showStagePictureInPictureControl = !(compactViewport && !portraitMedia);
  const showStageReturnControl = Boolean(!portraitViewport && !immersiveShell);
  const showStageFullscreenControl = !(fullscreenActive && showStageReturnControl);
  const landscapeSideSheet = fullscreenLandscapeMedia || landscapeImmersive;
  const fullscreenSheetOpen = Boolean(landscapeSideSheet && (moreOpen || hostProfileOpen || audienceOpen));
  const fullscreenSheetPortalTarget = landscapeSideSheet
    ? fullscreenSideSheetHost
    : null;
  const watchSheetPresentation = landscapeSideSheet ? "fullscreen-side" : "drawer";
  const stageControls = useWatchStageControls({
    controlsHoldActive: longPressOpensMore && moreOpen,
    immersiveShell,
    manualHideControlsEnabled,
    playerBadgeState: playerBadge.state,
    playerSession,
  });
  const {
    controlsVisible,
    immersiveControlsHidden,
    handleStageClick,
    handleStageContextMenu,
    handleStageLongPress,
    handleStagePointerLeave,
    handleStagePointerMove,
    revealControls,
  } = stageControls;
  const stageLayout = getWatchStageLayout({
    cohost: showCohostLayout,
    portrait: portraitMedia,
  });
  const immersiveStage = stageLayout === "single-portrait" || stageLayout === "cohost" || landscapeImmersive || fullscreenLandscapeMedia;
  const stageClassName = [
    "stage-frame",
    "watch-stage-frame",
    controlsVisible ? "controls-visible" : "",
    immersiveStage ? "is-immersive-stage" : "",
    landscapeImmersive ? "is-landscape-immersive-stage" : "",
    fullscreenLandscapeMedia ? "is-fullscreen-landscape-media" : "",
    fullscreenSheetOpen ? "is-fullscreen-side-sheet-open" : "",
    stageLayout === "single-portrait" ? "is-portrait" : "",
    stageLayout === "cohost" ? "is-cohost-stage" : "",
  ].filter(Boolean).join(" ");
  const watchLayoutClassName = [
    "page-grid",
    "watch-layout",
    landscapeImmersive ? "media-layout media-landscape-immersive" : "",
    landscapePortraitSplit ? "media-layout media-landscape-portrait-split" : "",
  ].filter(Boolean).join(" ");
  const stageView = getWatchStageView({
    playerSession,
    playerStarted,
    playerStatusMessage,
    playerStatusKind,
    playerBadgeState: playerBadge.state,
    stageLoading,
    stageMessage,
  });
  const {
    hostDistancePending,
    hostDistanceText,
    handleHostLocationClick,
    viewerLocationPermission,
  } = useWatchHostDistance({
    chatRoom,
    hostDistanceAvailable,
    hostLocationAvailable,
    hostLocationUpdatedAt,
    hostProfileOpen,
    showToast,
  });
  const hostProfileInfoItems = buildHostProfileInfoItems({
    gender: hostGender,
    birthDate: hostBirthDate,
    province: hostLocationProvince,
    distanceText: hostDistanceText,
    t,
  });
  const hostLocationClickable = Boolean(
    hostDistanceAvailable
    && hostLocationAvailable
    && viewerLocationPermission !== "granted"
    && viewerLocationPermission !== "checking"
  );
  const {
    closeImageShareModal,
    closeShareMenu,
    copyWatchImage,
    copyWatchLink,
    imageShareClosing,
    imageShareMounted,
    imageShareReady,
    openImageShareModal,
    openScreenshotShareModal,
    openShareMenu,
    saveWatchImage,
    shareButtonRef,
    shareImageLoading,
    shareImageKind,
    shareImageUrl,
    shareMenuOpen,
    shareSupported,
    shareWatchImage,
    shareWatchLink,
  } = useWatchShareActions({
    hostAvatarUrl,
    hostDisplayName,
    onCloseMoreSheet: closeMoreSheet,
    playerRef,
    roomCoverUrl,
    roomLabel,
    roomTitle,
    showToast,
    siteIconUrl,
    siteTitle,
    watchLink,
  });
  const {
    elementPipSupported,
    openPictureInPicture,
    pipWindow,
    pictureInPictureActive,
    videoPipSupported,
  } = useWatchPictureInPicture({
    onCloseMoreSheet: closeMoreSheet,
    playerRef,
    stageContentRef,
    stageRef,
  });

  function openMoreSheet() {
    setHostProfileOpen(false);
    setAudienceOpen(false);
    setMoreOpen(true);
  }

  function closeMoreSheet() {
    setMoreOpen(false);
  }

  function requestAudienceCall() {
    if (!audienceCallEnabled) {
      return;
    }
    if (!authUser?.id) {
      onChatRequireLogin?.();
      closeAudienceSheet();
      closeMoreSheet();
      return;
    }

    const sent = onAudienceCallRequest?.();
    if (sent) {
      showToast("已发送连线申请");
      closeAudienceSheet();
      closeMoreSheet();
    }
  }

  function cancelAudienceCallRequest() {
    const cancelled = onAudienceCallRequestCancel?.();
    if (cancelled) {
      showToast(t("watchSheet.audienceCallRequestCancelled"));
      closeAudienceSheet();
      closeMoreSheet();
    }
  }

  async function respondAudienceCallInvite(invite, accepted) {
    const responded = await onAudienceCallInviteRespond?.(invite?.id, accepted);
    if (responded && !accepted) {
      showToast(t("watchSheet.audienceCallInviteRejected"));
    }
  }

  function disconnectAudienceCall() {
    const disconnected = onAudienceCallDisconnect?.();
    if (disconnected) {
      showToast(t("watchSheet.audienceCallDisconnected"));
      closeAudienceSheet();
      closeMoreSheet();
    }
  }

  function openHostProfile(event) {
    event?.stopPropagation();
    setMoreOpen(false);
    setAudienceOpen(false);
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
      showToast("UID 复制成功");
    } catch {
      showToast("复制失败");
    }
  }

  function renderHostFollowButton(className = "") {
    if (!showHostFollowButton || authLoading || hostFollowLoading) {
      return null;
    }

    return (
      <button
        type="button"
        className={`watch-host-follow-button${hostFollowing ? " is-following" : " is-primary"}${className ? ` ${className}` : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onHostFollowToggle?.();
        }}
        disabled={hostFollowBusy || !authAvailable}
        aria-pressed={authUser ? hostFollowing : undefined}
      >
        {hostFollowing ? "已关注" : "关注"}
      </button>
    );
  }

  function renderHostProfileActions() {
    return (
      <WatchHostProfileActions
        authAvailable={authAvailable}
        followButton={renderHostFollowButton("watch-host-follow-button-profile")}
        followBusy={hostFollowBusy}
        following={hostFollowing}
        notifyBusy={hostNotifyBusy}
        notifyLiveStarted={hostNotifyLiveStarted}
        onNotifyLiveToggle={onHostNotifyLiveToggle}
      />
    );
  }

  function openAudienceSheet() {
    setMoreOpen(false);
    setHostProfileOpen(false);
    setAudienceOpen(true);
  }

  function closeAudienceSheet() {
    setAudienceOpen(false);
  }

  function closeWatchSideSheets() {
    setMoreOpen(false);
    setHostProfileOpen(false);
    setAudienceOpen(false);
  }

  function blurFocusedChatComposer() {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement) || !stageRef?.current?.contains(activeElement)) {
      return;
    }
    if (!activeElement.matches(".chat-composer input, .chat-composer textarea")) {
      return;
    }
    activeElement.blur();
  }

  function handleWatchStageClick(event) {
    blurFocusedChatComposer();

    if (fullscreenSheetOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeWatchSideSheets();
      return;
    }

    handleStageClick(event);
  }

  function handleWatchStageContextMenu(event) {
    if (longPressOpensMore) {
      event.preventDefault();
      openMoreSheet();
      return;
    }

    handleStageContextMenu(event);
  }

  function handleWatchStageLongPress() {
    if (longPressOpensMore) {
      revealControls();
      openMoreSheet();
      return true;
    }

    return handleStageLongPress();
  }

  function renderMobileMoreButton(className = "chat-composer-extra watch-composer-more-extra watch-composer-more-mobile") {
    return (
      <button
        type="button"
        className={`chat-composer-more watch-composer-more${moreOpen ? " is-active" : ""}${className ? ` ${className}` : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          openMoreSheet();
        }}
        aria-label="更多操作"
        aria-expanded={moreOpen}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
    );
  }

  function handleMobileHudBack() {
    if (fullscreenLandscapeMedia) {
      onFullscreen?.();
      return;
    }

    onStop?.();
  }

  function handleStageReturn() {
    if (fullscreenActive) {
      onFullscreen?.();
      return;
    }

    onStop?.();
  }

  function renderMobileHud(className = "", persistent = false) {
    const visible = immersiveShell
      ? !immersiveControlsHidden || playerBadge.state === "error"
      : persistent || controlsVisible || playerBadge.state === "error";

    return (
      <WatchMobileHud
        audienceCountText={audienceCountText}
        className={className}
        followButton={renderHostFollowButton("watch-host-follow-button-mobile")}
        hostAvatarUrl={hostAvatarUrl}
        hostChipLabel={hostChipLabel}
        hostProfileOpen={hostProfileOpen}
        onOpenAudienceSheet={openAudienceSheet}
        onOpenHostProfile={openHostProfile}
        onOpenMoreSheet={openMoreSheet}
        onStop={handleMobileHudBack}
        showMoreButton={false}
        visible={visible}
      />
    );
  }

  const watchStage = (
    <WatchStage
      authAvailable={authAvailable}
      authLoading={authLoading}
      authUser={authUser}
      audienceCallOverlay={(
        <LiveAudienceCallOverlay
          active={audienceCallActive}
          canManage={false}
          enabled={audienceCallEnabled}
          speakingUserIds={audienceCallSpeakingUserIds}
          actionLabel={audienceCallEnabled && !audienceCallRealtimeSession && audienceCallActiveCount < 5
            ? (audienceCallRequestPending
                ? t("watchSheet.audienceCallCancelRequest")
                : t("watchSheet.audienceCall"))
            : ""}
          onAction={audienceCallEnabled && !audienceCallRealtimeSession && audienceCallActiveCount < 5
            ? (audienceCallRequestPending ? cancelAudienceCallRequest : requestAudienceCall)
            : undefined}
        />
      )}
      chatConnectionState={chatConnectionState}
      chatDraft={chatDraft}
      chatError={chatError}
      chatMessages={chatMessages}
      chatOnlineCount={chatOnlineCount}
      chatReadOnly={chatReadOnly}
      chatRecovering={chatRecovering}
      chatRoomLabel={chatRoomLabel}
      chatTrailingAction={renderMobileMoreButton()}
      cohostPlayers={cohostPlayers}
      controlsVisible={controlsVisible}
      elementPipSupported={elementPipSupported}
      fullscreenActive={fullscreenActive}
      handleStageClick={handleWatchStageClick}
      handleStageContextMenu={handleWatchStageContextMenu}
      handleStageLongPress={handleWatchStageLongPress}
      handleStagePointerLeave={handleStagePointerLeave}
      handleStagePointerMove={handleStagePointerMove}
      hostChipLabel={hostChipLabel}
      hostDisplayName={hostDisplayName}
      hostUserId={hostUserId}
      immersiveControlsHidden={immersiveControlsHidden}
      immersiveShell={immersiveShell}
      longPressControlsEnabled={manualHideControlsEnabled || longPressOpensMore}
      mobileHudOverlay={renderMobileHud("stage-mobile-hud-overlay", true)}
      onChatDraftChange={onChatDraftChange}
      onChatRequireLogin={onChatRequireLogin}
      onChatSend={onChatSend}
      onDismissTapToUnmute={onDismissTapToUnmute}
      onFullscreen={onFullscreen}
      onOpenPictureInPicture={openPictureInPicture}
      onReturnToList={handleStageReturn}
      onToggleMute={onToggleMute}
      onTogglePlayback={onTogglePlayback}
      pictureInPictureActive={pictureInPictureActive}
      pictureInPicturePlaceholderLabel={t("watchSheet.pipPlaceholder")}
      playerBadgeState={playerBadge.state}
      playerFreezeFrameUrl={playerFreezeFrameUrl}
      playerMuted={playerMuted}
      playerOrientation={playerOrientation}
      playerPaused={playerPaused}
      playerRef={playerRef}
      playerSession={playerSession}
      revealControls={revealControls}
      showCohostLayout={showCohostLayout}
      showFullscreenControl={showStageFullscreenControl}
      showPictureInPictureControl={showStagePictureInPictureControl}
      showReturnControl={showStageReturnControl}
      showTapToUnmute={showTapToUnmute}
      stageContentRef={stageContentRef}
      stageClassName={stageClassName}
      fullscreenSideSheetHostRef={setFullscreenSideSheetHostNode}
      stageRef={stageRef}
      stageView={stageView}
      suppressStageControls={Boolean(pipWindow)}
      testPlayback={testPlayback}
      videoPipSupported={videoPipSupported}
      welcomeMessage={welcomeMessage}
    />
  );

  return (
    <section
      className="page page-immersive"
      data-page="watch"
      data-joined="true"
      data-immersive={immersiveShell ? "true" : "false"}
      hidden={hidden}
    >
      <div className={watchLayoutClassName}>
        <section className="stage-column">
          {!immersiveShell && !landscapePortraitSplit ? renderMobileHud("stage-mobile-hud-top", true) : null}
          {watchStage}
          <WatchRoomInfoStrip
            copyHostHandle={copyHostHandle}
            hostAvatarUrl={hostAvatarUrl}
            hostBio={hostBio}
            hostChipLabel={hostChipLabel}
            hostDisplayName={hostDisplayName}
            hostDistancePending={hostDistancePending}
            hostFollowerCountText={hostFollowerCountText}
            hostFollowingCountText={hostFollowingCountText}
            hostHandle={hostHandle}
            hostIcon={hostIcon}
            hostLocationClickable={hostLocationClickable}
            hostProfileInfoItems={hostProfileInfoItems}
            onHostLocationClick={handleHostLocationClick}
            openShareMenu={openShareMenu}
            playerBadge={playerBadge}
            renderHostFollowButton={renderHostFollowButton}
            renderHostProfileActions={renderHostProfileActions}
            roomLabel={roomLabel}
            roomTitle={roomTitle}
            shareButtonRef={shareButtonRef}
            shareMenuMounted={shareMenuOpen}
            watchLink={watchLink}
          />
        </section>

        <aside className={`control-column${!immersiveShell ? " watch-control-column-landscape" : ""}`} data-joined="true">
          <div className="info-strip info-strip-mobile">
            <div className="info-item">
              <strong data-room-label>{roomLabel}</strong>
            </div>
            <div className="info-item info-item-pill">
              <StatusPill id="playerBadgeInlineMobile" label={playerBadge.label} state={playerBadge.state} />
            </div>
          </div>
          <ChatPanel
            roomLabel={chatRoomLabel}
            welcomeMessage={welcomeMessage}
            hostUserId={hostUserId}
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
            composerTrailingAction={compactViewport ? renderMobileMoreButton() : null}
            showSendButton={!compactViewport}
          />
        </aside>
      </div>
      <WatchMobileMoreSheet
        open={moreOpen}
        onClose={closeMoreSheet}
        portalTarget={fullscreenSheetPortalTarget}
        presentation={watchSheetPresentation}
        hostAvatarUrl={hostAvatarUrl}
        hostChipLabel={hostChipLabel}
        watchLink={watchLink}
        shareSupported={shareSupported}
        elementPipSupported={elementPipSupported}
        videoPipSupported={videoPipSupported}
        playerSession={playerSession}
        pictureInPictureActive={pictureInPictureActive}
        fullscreenActive={fullscreenActive}
        showFullscreenAction={showMobileMoreFullscreenAction}
        audienceCallEnabled={audienceCallEnabled}
        audienceCallConnected={Boolean(audienceCallRealtimeSession)}
        audienceCallRequestPending={audienceCallRequestPending}
        onShareWatchLink={shareWatchLink}
        onOpenImageShareModal={openImageShareModal}
        onOpenScreenshotShareModal={openScreenshotShareModal}
        onCopyWatchLink={copyWatchLink}
        onAudienceCallRequest={requestAudienceCall}
        onAudienceCallRequestCancel={cancelAudienceCallRequest}
        onAudienceCallDisconnect={disconnectAudienceCall}
        onOpenPictureInPicture={openPictureInPicture}
        onFullscreen={onFullscreen}
      />
      <WatchAudienceCallInviteDialog
        invite={audienceCallInvite}
        portalTarget={overlayPortalTarget}
        onRespond={respondAudienceCallInvite}
      />
      <WatchHostProfileSheet
        open={hostProfileOpen}
        onClose={closeHostProfile}
        portalTarget={fullscreenSheetPortalTarget}
        presentation={watchSheetPresentation}
        hostAvatarUrl={hostAvatarUrl}
        hostChipLabel={hostChipLabel}
        hostDisplayName={hostDisplayName}
        hostBio={hostBio}
        hostProfileInfoItems={hostProfileInfoItems}
        hostLocationClickable={hostLocationClickable}
        hostLocationPending={hostDistancePending}
        onHostLocationClick={handleHostLocationClick}
        onHostHandleCopy={copyHostHandle}
        hostHandle={hostHandle}
        roomLabel={roomLabel}
        hostFollowerCountText={hostFollowerCountText}
        hostFollowingCountText={hostFollowingCountText}
        followButton={renderHostProfileActions()}
      />
      {fullscreenSheetOpen && overlayPortalTarget ? createPortal(
        <button
          type="button"
          className="watch-fullscreen-side-sheet-overlay"
          aria-label="关闭面板"
          onClick={closeWatchSideSheets}
        />,
        overlayPortalTarget
      ) : null}
      {imageShareMounted ? (
        <WatchImageShareDialog
          imageShareClosing={imageShareClosing}
          imageShareReady={imageShareReady}
          imageShareTitle={shareImageKind === "screenshot" ? t("watchSheet.screenshotShare") : t("watchSheet.imageShare")}
          onClose={closeImageShareModal}
          onCopyImage={copyWatchImage}
          onSaveImage={saveWatchImage}
          onShareImage={shareWatchImage}
          roomLabel={roomLabel}
          shareImageAlt={shareImageKind === "screenshot" ? `${roomLabel}直播间截屏分享图` : undefined}
          shareImageLoading={shareImageLoading}
          shareImageUrl={shareImageUrl}
          shareSupported={shareSupported}
          portalTarget={overlayPortalTarget}
        />
      ) : null}
      <WatchAudienceSheet
        open={audienceOpen}
        onClose={closeAudienceSheet}
        portalTarget={fullscreenSheetPortalTarget}
        presentation={watchSheetPresentation}
        audienceCountText={audienceCountText}
        loggedInViewers={loggedInViewers}
      />
      <WatchDesktopSharePanel
        anchorRef={shareButtonRef}
        onClose={closeShareMenu}
        onCopyLink={copyWatchLink}
        onShareLink={shareWatchLink}
        open={shareMenuOpen}
        shareSupported={shareSupported}
        watchLink={watchLink}
      />
      {pipWindow ? createPortal(
        <WatchPictureInPictureControlsLayer
          controlsVisible={controlsVisible}
          elementPipSupported={elementPipSupported}
          fullscreenActive={fullscreenActive}
          handleStagePointerLeave={handleStagePointerLeave}
          handleStagePointerMove={handleStagePointerMove}
          onFullscreen={onFullscreen}
          onOpenPictureInPicture={openPictureInPicture}
          onToggleMute={onToggleMute}
          onTogglePlayback={onTogglePlayback}
          pictureInPictureActive={pictureInPictureActive}
          playerMuted={playerMuted}
          playerPaused={playerPaused}
          playerSession={playerSession}
          revealControls={revealControls}
          videoPipSupported={videoPipSupported}
        />,
        pipWindow.document.body
      ) : null}
    </section>
  );
}
