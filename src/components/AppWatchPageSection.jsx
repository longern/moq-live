import { WatchPage } from "./WatchPage.jsx";
import { describePlayerState } from "../lib/status.js";

export function AppWatchPageSection({ context }) {
  const {
    authState,
    autorunRef,
    beginWatch,
    chat,
    cohostActive,
    cohostPlayer,
    effectivePlayerFreezeFrameUrl,
    effectivePlayerOrientation,
    effectivePlayerSession,
    effectivePlayerStarted,
    effectivePlayerStatus,
    effectivePlayerStatusKind,
    log,
    player,
    playerBadge,
    selectPageWithGuard,
    setLoginPromptOpen,
    setWatchRoomValue,
    setWatchRouteCommitted,
    showWatchPage,
    siteIconUrl,
    siteTitle,
    t,
    toggleWatchFollow,
    toggleWatchLiveNotification,
    watchChatRoom,
    watchChatRoomLabel,
    watchFollowState,
    watchHostAvatarUrl,
    watchHostDisplayName,
    watchHostDistanceAvailable,
    watchHostFollowerCount,
    watchHostFollowingCount,
    watchHostIcon,
    watchHostLocationAvailable,
    watchHostLocationProvince,
    watchHostLocationUpdatedAt,
    watchHostUserId,
    watchJoined,
    watchingTestChannel,
    watchPageLink,
    watchRoom,
    watchRoomCoverUrl,
    watchRoomLabel,
    watchRoomResolution,
    watchRoomTitle,
    watchStageLoading,
    watchStageMessage,
    watchTestChannel,
    watchWelcomeMessage,
  } = context;

  return (
    <WatchPage
      siteTitle={siteTitle}
      hidden={!showWatchPage}
      watchJoined={watchJoined}
      roomLabel={watchRoomLabel}
      roomTitle={watchRoomTitle}
      welcomeMessage={watchWelcomeMessage}
      room={watchRoom}
      onRoomInput={(event) => {
        setWatchRoomValue(event.currentTarget.value);
      }}
      onStart={() => {
        beginWatch();
      }}
      onOpenRoom={(nextRoom) => {
        beginWatch(nextRoom);
      }}
      host={{
        userId: watchHostUserId,
        handle: watchRoomResolution.hostHandle,
        displayName: watchHostDisplayName,
        avatarUrl: watchHostAvatarUrl,
        gender: watchRoomResolution.hostGender,
        birthDate: watchRoomResolution.hostBirthDate,
        bio: watchRoomResolution.hostBio,
        locationProvince: watchHostLocationProvince,
        locationAvailable: watchHostLocationAvailable,
        distanceAvailable: watchHostDistanceAvailable,
        locationUpdatedAt: watchHostLocationUpdatedAt,
        followerCount: watchHostFollowerCount,
        followingCount: watchHostFollowingCount,
        icon: watchHostIcon,
        following: watchFollowState.hostUserId === watchHostUserId && watchFollowState.following,
        followLoading: authState.loading ||
          (
            watchFollowState.hostUserId === watchHostUserId &&
            watchFollowState.loading
          ),
        followBusy: watchFollowState.hostUserId === watchHostUserId && watchFollowState.busy,
        notifyLiveStarted: watchFollowState.hostUserId === watchHostUserId && watchFollowState.notifyLiveStarted,
        notifyBusy: watchFollowState.hostUserId === watchHostUserId && watchFollowState.notifyBusy,
      }}
      media={{
        roomCoverUrl: watchRoomCoverUrl,
        siteIconUrl,
        watchLink: watchPageLink,
        stageLoading: watchStageLoading,
        stageMessage: watchStageMessage,
      }}
      player={{
        statusMessage: effectivePlayerStatus,
        statusKind: effectivePlayerStatusKind,
        badge: playerBadge,
        fullscreenActive: player.fullscreenActive,
        paused: watchingTestChannel ? false : player.playerPaused,
        muted: watchingTestChannel ? true : player.playerMuted,
        showTapToUnmute: watchingTestChannel ? false : player.showTapToUnmute,
        orientation: effectivePlayerOrientation,
        stageRef: player.watchStageRef,
        session: effectivePlayerSession,
        started: effectivePlayerStarted,
        freezeFrameUrl: effectivePlayerFreezeFrameUrl,
        ref: player.playerRef,
      }}
      cohost={{
        active: cohostActive,
        session: cohostPlayer.playerSession,
        started: cohostPlayer.playerStarted,
        muted: cohostPlayer.playerMuted,
        ref: cohostPlayer.playerRef,
        status: cohostPlayer.playerStatus,
        badge: describePlayerState(cohostPlayer.playerStatusKind, t),
        orientation: cohostPlayer.playerOrientation,
      }}
      testPlayback={watchTestChannel}
      auth={{
        available: authState.available,
        loading: authState.loading,
        user: authState.user,
      }}
      chat={{
        room: watchChatRoom,
        roomLabel: watchChatRoomLabel,
        messages: chat.messages,
        draft: chat.draft,
        connectionState: chat.connectionState,
        onlineCount: chat.onlineCount,
        loggedInViewers: chat.loggedInViewers,
        audienceCallEnabled: chat.audienceCallEnabled,
        audienceCallRealtimeSession: chat.audienceCallRealtimeSession,
        readOnly: chat.readOnly,
        error: chat.chatError,
        recovering: chat.recoveringFromPageLifecycle,
      }}
      actions={{
        onStop: () => {
          chat.disconnect?.();
          autorunRef.current = false;
          setWatchRouteCommitted(false);
          setWatchRoomValue("");
          selectPageWithGuard("watch", { updateAutorun: false });
          void player.stopPlayer();
          void cohostPlayer.stopPlayer();
        },
        onTogglePlayback: () => {
          void player.togglePlayerPlayback().catch((error) => {
            log(`toggle playback failed: ${error instanceof Error ? error.message : String(error)}`);
          });
        },
        onToggleMute: () => {
          void player.togglePlayerMute().catch((error) => {
            log(`toggle mute failed: ${error instanceof Error ? error.message : String(error)}`);
          });
        },
        onDismissTapToUnmute: () => {
          void player.dismissTapToUnmute().catch((error) => {
            log(`tap to unmute failed: ${error instanceof Error ? error.message : String(error)}`);
          });
        },
        onFullscreen: () => {
          void player.fullscreenPlayer().catch((error) => {
            log(`fullscreen failed: ${error instanceof Error ? error.message : String(error)}`);
          });
        },
        onHostFollowToggle: toggleWatchFollow,
        onHostNotifyLiveToggle: toggleWatchLiveNotification,
        onChatDraftChange: (event) => {
          chat.setDraft(event.currentTarget.value);
        },
        onChatSend: () => {
          chat.sendMessage();
        },
        onChatRequireLogin: () => {
          setLoginPromptOpen(true);
        },
        onAudienceCallRequest: () => {
          return chat.requestAudienceCall?.() ?? false;
        },
        onAudienceCallDisconnect: () => {
          return chat.leaveAudienceCall?.() ?? false;
        },
      }}
    />
  );
}
