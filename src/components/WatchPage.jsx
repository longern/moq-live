import { useEffect, useRef, useState } from "preact/hooks";
import { StatusPill } from "./StatusPill.jsx";

export function WatchPage({
  hidden,
  roomLabel,
  watchLink,
  playerStatus,
  playerBadge,
  fullscreenActive,
  playerPaused,
  playerMuted,
  playerOrientation,
  room,
  onRoomInput,
  onStart,
  onStop,
  onTogglePlayback,
  onToggleMute,
  onFullscreen,
  stageRef,
  playerSession,
  playerRef
}) {
  const joined = Boolean(playerSession);
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef(null);
  const touchModeRef = useRef(false);

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function hideControls() {
    clearHideTimer();
    setControlsVisible(false);
  }

  function scheduleHide(delay = 1600) {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
      hideTimerRef.current = null;
    }, delay);
  }

  useEffect(() => {
    touchModeRef.current = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  }, []);

  useEffect(() => {
    if (!playerSession || playerBadge.state === "error") {
      hideControls();
      return;
    }

    if (touchModeRef.current) {
      scheduleHide(2200);
      return;
    }

    setControlsVisible(true);
    scheduleHide();

    return () => {
      clearHideTimer();
    };
  }, [playerSession, playerBadge.state]);

  function revealControls() {
    if (!playerSession || playerBadge.state === "error") {
      return;
    }

    setControlsVisible(true);
    scheduleHide(touchModeRef.current ? 2200 : 1600);
  }

  function handleStagePointerMove() {
    if (touchModeRef.current) {
      return;
    }
    revealControls();
  }

  function handleStagePointerLeave() {
    if (touchModeRef.current || !controlsVisible) {
      return;
    }
    scheduleHide(500);
  }

  function handleStageClick() {
    if (!touchModeRef.current || !playerSession || playerBadge.state === "error") {
      return;
    }
    if (controlsVisible) {
      hideControls();
      return;
    }
    revealControls();
  }

  return (
    <section class="page page-immersive" data-page="watch" data-joined={joined ? "true" : "false"} hidden={hidden}>
      <div class="page-grid watch-layout">
        <section class="stage-column">
          <div
            ref={stageRef}
            class={`stage-frame watch-stage-frame${controlsVisible ? " controls-visible" : ""}${playerOrientation === "portrait" ? " is-portrait" : ""}`}
            onMouseMove={handleStagePointerMove}
            onMouseLeave={handleStagePointerLeave}
            onClick={handleStageClick}
          >
            <div id="playerMount">
              {playerSession ? (
                <video-moq
                  ref={playerRef}
                  class="player-moq"
                  src={playerSession.relayUrl}
                  namespace={playerSession.namespace}
                />
              ) : (
                <div class="placeholder">
                  <p>输入房间 ID 开始观看</p>
                </div>
              )}
            </div>
            {playerBadge.state === "error" ? (
              <div class="stage-error">
                <p>{playerStatus}</p>
              </div>
            ) : null}
            {playerSession ? (
              <div class={`stage-mobile-hud${controlsVisible || playerBadge.state === "error" ? " is-visible" : ""}`}>
                <div class="stage-mobile-hud-left">
                  <button
                    type="button"
                    class="stage-mobile-leave"
                    onClick={(event) => {
                      event.stopPropagation();
                      onStop();
                    }}
                    aria-label="离开直播间"
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M10 17H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" />
                      <path d="M14 8l4 4-4 4" />
                      <path d="M18 12H9" />
                    </svg>
                  </button>
                  <div class="stage-mobile-meta stage-mobile-meta-left">
                    <strong>{roomLabel}</strong>
                  </div>
                </div>
                <StatusPill id="playerBadgeOverlay" label={playerBadge.label} state={playerBadge.state} />
              </div>
            ) : null}
            {playerSession && playerBadge.state !== "error" ? (
              <div class={`stage-controls${controlsVisible ? " is-visible" : ""}`}>
                <div class="stage-controls-fade" />
                <button
                  type="button"
                  class="stage-control-button stage-control-primary"
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePlayback();
                    revealControls();
                  }}
                  aria-label={playerPaused ? "继续播放" : "暂停播放"}
                >
                  {playerPaused ? (
                    <svg viewBox="0 0 24 24">
                      <path d="M8 6v12l10-6Z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24">
                      <path d="M9 6v12" />
                      <path d="M15 6v12" />
                    </svg>
                  )}
                </button>
                <div class="stage-controls-right">
                  <button
                    type="button"
                    class="stage-control-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleMute();
                      revealControls();
                    }}
                    aria-label={playerMuted ? "取消静音" : "静音"}
                  >
                    {playerMuted ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
                        <path d="m16 9 5 5" />
                        <path d="m21 9-5 5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24">
                        <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
                        <path d="M15.5 9.5a4 4 0 0 1 0 5" />
                        <path d="M18 7a7.5 7.5 0 0 1 0 10" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    class="stage-control-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onFullscreen();
                      revealControls();
                    }}
                    aria-label={fullscreenActive ? "退出全屏" : "全屏播放"}
                  >
                    {fullscreenActive ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M9 4H4v5" />
                        <path d="m4 4 6 6" />
                        <path d="M15 4h5v5" />
                        <path d="m20 4-6 6" />
                        <path d="M9 20H4v-5" />
                        <path d="m4 20 6-6" />
                        <path d="M15 20h5v-5" />
                        <path d="m20 20-6-6" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24">
                        <path d="M8 4H4v4" />
                        <path d="m4 4 5 5" />
                        <path d="M16 4h4v4" />
                        <path d="m20 4-5 5" />
                        <path d="M8 20H4v-4" />
                        <path d="m4 20 5-5" />
                        <path d="M16 20h4v-4" />
                        <path d="m20 20-5-5" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div class="info-strip">
            <div class="info-item">
              <strong data-room-label>{roomLabel}</strong>
            </div>
            <div class="info-item info-item-pill">
              <StatusPill id="playerBadgeInline" label={playerBadge.label} state={playerBadge.state} />
            </div>
          </div>
        </section>

        <aside class="control-column" data-joined={joined ? "true" : "false"}>
          <div class="info-strip info-strip-mobile">
            <div class="info-item">
              <strong data-room-label>{roomLabel}</strong>
            </div>
            <div class="info-item info-item-pill">
              <StatusPill id="playerBadgeInlineMobile" label={playerBadge.label} state={playerBadge.state} />
            </div>
          </div>
          <section class="control-block">
            {!joined ? (
              <>
                <label>
                  房间 ID
                  <input
                    id="namespace"
                    value={room}
                    placeholder="例如：live-f8c2a1"
                    onInput={onRoomInput}
                  />
                </label>
                <div class="action-row">
                  <button type="button" id="start" onClick={onStart}>加入直播间</button>
                </div>
              </>
            ) : (
              <div class="action-row">
                <button type="button" class="secondary" id="stop" onClick={onStop}>离开直播间</button>
              </div>
            )}
          </section>

          <section class="control-block">
            <div class="summary-item">
              <strong>观看链接</strong>
              <span data-watch-link>{watchLink}</span>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
