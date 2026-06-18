import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MoreHorizontal,
} from "lucide-react";
import { ChatPanel } from "./ChatPanel.jsx";
import { ToastViewport, useToast } from "./primitives/FloatingToast.jsx";
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
    active: cohostActive = null,
    session: cohostPlayerSession = null,
    started: cohostPlayerStarted = false,
    muted: cohostPlayerMuted = true,
    ref: cohostPlayerRef,
    status: cohostPlayerStatus = "",
    badge: cohostPlayerBadge = { state: "idle" },
    orientation: cohostPlayerOrientation,
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
  } = actions;
  const [moreOpen, setMoreOpen] = useState(false);
  const [hostProfileOpen, setHostProfileOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [fullscreenSideSheetHost, setFullscreenSideSheetHost] = useState(null);
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
  const hostChipLabel = hostDisplayName || roomTitle || roomLabel;
  const showHostFollowButton = Boolean(hostUserId && authUser?.id !== hostUserId);
  const showCohostLayout = Boolean(cohostActive && (cohostPlayerSession || cohostPlayerBadge.state === "warm"));
  const landscapeImmersive = Boolean(shortLandscapeViewport && !portraitMedia && !showCohostLayout);
  const immersiveShell = immersivePortrait || fullscreenLandscapeMedia || landscapeImmersive || (portraitViewport && showCohostLayout);
  const longPressOpensMore = Boolean(portraitViewport && !portraitMedia && !fullscreenActive);
  const manualHideControlsEnabled = !longPressOpensMore;
  const showStagePictureInPictureControl = !(compactViewport && !portraitMedia);
  const fullscreenSheetOpen = Boolean(fullscreenLandscapeMedia && (moreOpen || hostProfileOpen || audienceOpen));
  const fullscreenSheetPortalTarget = fullscreenLandscapeMedia
    ? fullscreenSideSheetHost
    : null;
  const watchSheetPresentation = fullscreenLandscapeMedia ? "fullscreen-side" : "drawer";
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
    openShareMenu,
    saveWatchImage,
    shareButtonRef,
    shareImageLoading,
    shareImageUrl,
    shareMenuMounted,
    shareMenuPosition,
    shareMenuVisible,
    shareSupported,
    shareWatchImage,
    shareWatchLink,
  } = useWatchShareActions({
    hostAvatarUrl,
    hostDisplayName,
    onCloseMoreSheet: closeMoreSheet,
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
      chatConnectionState={chatConnectionState}
      chatDraft={chatDraft}
      chatError={chatError}
      chatMessages={chatMessages}
      chatOnlineCount={chatOnlineCount}
      chatReadOnly={chatReadOnly}
      chatRecovering={chatRecovering}
      chatRoomLabel={chatRoomLabel}
      chatTrailingAction={renderMobileMoreButton()}
      cohostActive={cohostActive}
      cohostPlayerBadge={cohostPlayerBadge}
      cohostPlayerMuted={cohostPlayerMuted}
      cohostPlayerOrientation={cohostPlayerOrientation}
      cohostPlayerRef={cohostPlayerRef}
      cohostPlayerSession={cohostPlayerSession}
      cohostPlayerStatus={cohostPlayerStatus}
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
      onToggleMute={onToggleMute}
      onTogglePlayback={onTogglePlayback}
      pictureInPictureActive={pictureInPictureActive}
      playerBadgeState={playerBadge.state}
      playerFreezeFrameUrl={playerFreezeFrameUrl}
      playerMuted={playerMuted}
      playerOrientation={playerOrientation}
      playerPaused={playerPaused}
      playerRef={playerRef}
      playerSession={playerSession}
      revealControls={revealControls}
      showCohostLayout={showCohostLayout}
      showPictureInPictureControl={showStagePictureInPictureControl}
      showTapToUnmute={showTapToUnmute}
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
          {!immersiveShell ? renderMobileHud("stage-mobile-hud-top", true) : null}
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
            shareMenuMounted={shareMenuMounted}
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
        onShareWatchLink={shareWatchLink}
        onOpenImageShareModal={openImageShareModal}
        onCopyWatchLink={copyWatchLink}
        onOpenPictureInPicture={openPictureInPicture}
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
      {hidden ? null : <ToastViewport className="watch-session-toast" portalTarget={overlayPortalTarget} />}
      {imageShareMounted ? (
        <WatchImageShareDialog
          imageShareClosing={imageShareClosing}
          imageShareReady={imageShareReady}
          onClose={closeImageShareModal}
          onCopyImage={copyWatchImage}
          onSaveImage={saveWatchImage}
          onShareImage={shareWatchImage}
          roomLabel={roomLabel}
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
        left={shareMenuPosition.left}
        onClose={closeShareMenu}
        onCopyLink={copyWatchLink}
        onShareLink={shareWatchLink}
        open={shareMenuMounted}
        shareSupported={shareSupported}
        top={shareMenuPosition.top}
        visible={shareMenuVisible}
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
