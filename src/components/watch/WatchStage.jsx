import { lazy, Suspense } from "react";
import {
  ChevronLeft,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { ChatPanel } from "../ChatPanel.jsx";
import { LoadingSpinner } from "../primitives/LoadingSpinner.jsx";
import { LongPressTarget } from "../primitives/LongPressTarget.jsx";
import { STREAM_PROTOCOL_WEBRTC } from "../../lib/streamProtocol.js";
import { getWatchPlayerTileClassName } from "../../lib/watchSession.js";

const WatchTestCanvas = import.meta.env.DEV
  ? lazy(() => import("../WatchTestCanvas.jsx").then((module) => ({ default: module.WatchTestCanvas })))
  : null;

const STAGE_LONG_PRESS_IGNORE_SELECTOR = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "[role=\"button\"]",
  ".chat-panel-block",
  ".stage-controls",
  ".stage-return-button",
  ".stage-mobile-hud",
  ".stage-unmute-prompt",
].join(",");

function WatchPrimaryPlayer({
  hostDisplayName,
  hostChipLabel,
  playerMuted,
  playerOrientation,
  playerRef,
  playerSession,
  stageView,
  showCohostLayout,
  testPlayback,
}) {
  return (
    <div className={getWatchPlayerTileClassName({
      loading: stageView.showInitialPlaybackSpinner,
      orientation: playerOrientation,
    })}>
      <div className="watch-player-media">
        {playerSession && testPlayback && WatchTestCanvas ? (
          <Suspense fallback={null}>
            <WatchTestCanvas
              playback={testPlayback}
              playerRef={playerRef}
              playerSession={playerSession}
            />
          </Suspense>
        ) : playerSession ? (
          playerSession.protocol === STREAM_PROTOCOL_WEBRTC ? (
            <video
              ref={playerRef}
              className="player-webrtc"
              autoPlay
              playsInline
              muted={playerMuted}
              aria-label={`${hostDisplayName || hostChipLabel} 直播画面`}
            />
          ) : (
            <canvas
              ref={playerRef}
              className="player-moq"
              width="1280"
              height="720"
              aria-label={`${playerSession.namespace} 直播画面`}
            />
          )
        ) : (
          <div className="placeholder">
            {stageView.placeholderLoading ? (
              <LoadingSpinner className="stage-loading-spinner" />
            ) : stageView.placeholderMessage ? (
              <p>{stageView.placeholderMessage}</p>
            ) : null}
          </div>
        )}
        {stageView.showInitialPlaybackSpinner ? (
          <div className="placeholder stage-first-frame-loading" aria-hidden="true">
            <LoadingSpinner className="stage-loading-spinner" />
          </div>
        ) : null}
        {showCohostLayout ? <span className="watch-player-label">{hostDisplayName || hostChipLabel}</span> : null}
      </div>
    </div>
  );
}

export function WatchPictureInPictureControlsLayer({
  controlsVisible,
  elementPipSupported,
  fullscreenActive,
  handleStagePointerLeave,
  handleStagePointerMove,
  onFullscreen,
  onOpenPictureInPicture,
  onToggleMute,
  onTogglePlayback,
  pictureInPictureActive,
  playerMuted,
  playerPaused,
  playerSession,
  revealControls,
  videoPipSupported,
}) {
  return (
    <div
      className="watch-pip-controls-layer"
      onMouseMove={handleStagePointerMove}
      onMouseLeave={handleStagePointerLeave}
    >
      <WatchStageControls
        controlsVisible={controlsVisible}
        elementPipSupported={elementPipSupported}
        fullscreenActive={fullscreenActive}
        onFullscreen={onFullscreen}
        onOpenPictureInPicture={onOpenPictureInPicture}
        onToggleMute={onToggleMute}
        onTogglePlayback={onTogglePlayback}
        pictureInPictureActive={pictureInPictureActive}
        playerMuted={playerMuted}
        playerPaused={playerPaused}
        playerSession={playerSession}
        revealControls={revealControls}
        showFullscreenControl={false}
        videoPipSupported={videoPipSupported}
      />
    </div>
  );
}

function WatchCohostPlayer({
  cohostActive,
  cohostPlayerBadge,
  cohostPlayerMuted,
  cohostPlayerOrientation,
  cohostPlayerRef,
  cohostPlayerSession,
  cohostPlayerStatus,
}) {
  if (!cohostActive) {
    return null;
  }

  const peerLabel = cohostActive.peer.displayName || cohostActive.peer.handle;

  return (
    <div className={getWatchPlayerTileClassName({ orientation: cohostPlayerOrientation })}>
      <div className="watch-player-media">
        {cohostPlayerSession ? (
          cohostPlayerSession.protocol === STREAM_PROTOCOL_WEBRTC ? (
            <video
              ref={cohostPlayerRef}
              className="player-webrtc"
              autoPlay
              playsInline
              muted={cohostPlayerMuted}
              aria-label={`${peerLabel} 直播画面`}
            />
          ) : (
            <canvas
              ref={cohostPlayerRef}
              className="player-moq"
              width="1280"
              height="720"
              aria-label={`${cohostPlayerSession.namespace} 直播画面`}
            />
          )
        ) : (
          <div className="placeholder">
            {cohostPlayerBadge.state === "warm" ? (
              <LoadingSpinner className="stage-loading-spinner" />
            ) : (
              <p>{cohostPlayerStatus || "连线画面加载中"}</p>
            )}
          </div>
        )}
        <span className="watch-player-label">{peerLabel}</span>
      </div>
    </div>
  );
}

function WatchStageControls({
  controlsVisible,
  elementPipSupported,
  fullscreenActive,
  onFullscreen,
  onOpenPictureInPicture,
  onToggleMute,
  onTogglePlayback,
  pictureInPictureActive,
  playerMuted,
  playerPaused,
  playerSession,
  revealControls,
  showPictureInPictureControl = true,
  showFullscreenControl = true,
  videoPipSupported,
}) {
  return (
    <div className={`stage-controls${controlsVisible ? " is-visible" : ""}`}>
      <div className="stage-controls-fade" />
      <button
        type="button"
        className="stage-control-button stage-control-primary"
        onClick={(event) => {
          event.stopPropagation();
          onTogglePlayback();
          revealControls();
        }}
        aria-label={playerPaused ? "继续播放" : "暂停播放"}
      >
        {playerPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
      </button>
      <div className="stage-controls-right">
        <button
          type="button"
          className="stage-control-button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleMute();
            revealControls();
          }}
          aria-label={playerMuted ? "取消静音" : "静音"}
        >
          {playerMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </button>
        {showPictureInPictureControl ? (
          <button
            type="button"
            className="stage-control-button"
            onClick={(event) => {
              event.stopPropagation();
              void onOpenPictureInPicture();
              revealControls();
            }}
            disabled={!(elementPipSupported || videoPipSupported) || !playerSession}
            aria-label={pictureInPictureActive ? "关闭小窗播放" : "小窗播放"}
          >
            <PictureInPicture2 aria-hidden="true" />
          </button>
        ) : null}
        {showFullscreenControl ? (
          <button
            type="button"
            className="stage-control-button"
            onClick={(event) => {
              event.stopPropagation();
              onFullscreen();
              revealControls();
            }}
            aria-label={fullscreenActive ? "退出全屏" : "全屏播放"}
          >
            {fullscreenActive ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function WatchStage({
  authAvailable,
  authLoading,
  authUser,
  audienceCallOverlay = null,
  chatDraft,
  chatError,
  chatConnectionState,
  chatMessages,
  chatOnlineCount,
  chatReadOnly,
  chatRecovering,
  chatRoomLabel,
  chatTrailingAction,
  cohostPlayers = [],
  controlsVisible,
  elementPipSupported,
  fullscreenActive,
  handleStageClick,
  handleStageContextMenu,
  handleStageLongPress,
  handleStagePointerLeave,
  handleStagePointerMove,
  hostChipLabel,
  hostDisplayName,
  hostUserId,
  immersiveControlsHidden,
  immersiveShell,
  longPressControlsEnabled = true,
  mobileHudOverlay,
  onChatDraftChange,
  onChatRequireLogin,
  onChatSend,
  onDismissTapToUnmute,
  onFullscreen,
  onOpenPictureInPicture,
  onReturnToList,
  onToggleMute,
  onTogglePlayback,
  pictureInPictureActive,
  pictureInPicturePlaceholderLabel = "",
  playerFreezeFrameUrl,
  playerMuted,
  playerOrientation,
  playerPaused,
  playerRef,
  playerSession,
  playerBadgeState,
  revealControls,
  showCohostLayout,
  showFullscreenControl = true,
  showPictureInPictureControl = true,
  showReturnControl = false,
  showTapToUnmute,
  stageContentRef,
  stageClassName,
  fullscreenSideSheetHostRef,
  stageRef,
  stageView,
  suppressStageControls = false,
  testPlayback,
  videoPipSupported,
  welcomeMessage,
}) {
  const returnControlVisible = controlsVisible || playerBadgeState === "error";

  return (
    <LongPressTarget
      ref={stageRef}
      className={stageClassName}
      longPressEnabled={Boolean(
        playerSession
          && playerBadgeState !== "error"
          && longPressControlsEnabled
          && (immersiveShell || controlsVisible)
      )}
      longPressIgnoreSelector={STAGE_LONG_PRESS_IGNORE_SELECTOR}
      onLongPress={handleStageLongPress}
      onMouseMove={handleStagePointerMove}
      onMouseLeave={handleStagePointerLeave}
      onClick={handleStageClick}
      onContextMenu={handleStageContextMenu}
    >
      <div
        className={`watch-pip-placeholder${pictureInPictureActive ? " is-visible" : ""}`}
        aria-hidden="true"
      >
        {pictureInPicturePlaceholderLabel}
      </div>
      <div ref={stageContentRef} className="watch-fullscreen-media-layout">
        <div className="watch-fullscreen-media-pane">
          <div id="playerMount" className={showCohostLayout ? "watch-player-mount is-cohost" : "watch-player-mount"}>
            <WatchPrimaryPlayer
              hostDisplayName={hostDisplayName}
              hostChipLabel={hostChipLabel}
              playerMuted={playerMuted}
              playerOrientation={playerOrientation}
              playerRef={playerRef}
              playerSession={playerSession}
              showCohostLayout={showCohostLayout}
              stageView={stageView}
              testPlayback={testPlayback}
            />
            {showCohostLayout ? (
              cohostPlayers.map((item) => (
                <WatchCohostPlayer
                  key={item.active?.id || item.active?.peerRoomId}
                  cohostActive={item.active}
                  cohostPlayerBadge={item.badge}
                  cohostPlayerMuted={item.muted}
                  cohostPlayerOrientation={item.orientation}
                  cohostPlayerRef={item.ref}
                  cohostPlayerSession={item.session}
                  cohostPlayerStatus={item.status}
                />
              ))
            ) : null}
          </div>
          {playerFreezeFrameUrl ? (
            <img
              className="stage-freeze-frame"
              src={playerFreezeFrameUrl}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          {stageView.statusOverlayKind ? (
            <div className={`stage-error${stageView.statusOverlayKind === "status" ? " stage-status-overlay" : ""}`}>
              <p>{stageView.statusOverlayMessage}</p>
            </div>
          ) : null}
          {showReturnControl && onReturnToList ? (
            <button
              type="button"
              className={`stage-return-button${returnControlVisible ? " is-visible" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                onReturnToList();
              }}
              aria-label="返回直播列表"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
          ) : null}
          {showTapToUnmute && playerSession && playerBadgeState !== "error" ? (
            <button
              type="button"
              className="stage-unmute-prompt"
              onClick={(event) => {
                event.stopPropagation();
                onDismissTapToUnmute();
                if (!immersiveShell) {
                  revealControls();
                }
              }}
            >
              点按以取消静音
            </button>
          ) : null}
          {immersiveShell ? mobileHudOverlay : null}
          {audienceCallOverlay}
          {immersiveShell ? (
            <div
              className={`watch-portrait-chat-overlay${immersiveControlsHidden ? " is-hidden" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
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
                variant="floating"
                className="chat-panel-watch-overlay"
                composerTrailingAction={chatTrailingAction}
                showSendButton={false}
              />
            </div>
          ) : null}
          {stageView.showPlaybackControls && !immersiveShell && !suppressStageControls ? (
            <WatchStageControls
              controlsVisible={controlsVisible}
              elementPipSupported={elementPipSupported}
              fullscreenActive={fullscreenActive}
              onFullscreen={onFullscreen}
              onOpenPictureInPicture={onOpenPictureInPicture}
              onToggleMute={onToggleMute}
              onTogglePlayback={onTogglePlayback}
              pictureInPictureActive={pictureInPictureActive}
              playerMuted={playerMuted}
              playerPaused={playerPaused}
              playerSession={playerSession}
              revealControls={revealControls}
              showFullscreenControl={showFullscreenControl}
              showPictureInPictureControl={showPictureInPictureControl}
              videoPipSupported={videoPipSupported}
            />
          ) : null}
        </div>
        <div
          ref={fullscreenSideSheetHostRef}
          className="watch-fullscreen-side-sheet-host"
        />
      </div>
    </LongPressTarget>
  );
}
