import { StatusPill } from "./StatusPill.jsx";

export function WatchPage({
  hidden,
  roomLabel,
  watchLink,
  playerStatus,
  playerBadge,
  room,
  onRoomInput,
  onStart,
  onStop,
  playerSession,
  playerRef
}) {
  return (
    <section class="page page-immersive" data-page="watch" hidden={hidden}>
      <div class="page-grid watch-layout">
        <section class="stage-column">
          <div class="stage-frame watch-stage-frame">
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
          </div>
          <div class="info-strip">
            <div class="info-item">
              <span>房间 ID</span>
              <strong data-room-label>{roomLabel}</strong>
            </div>
            <div class="info-item">
              <span>状态</span>
              <strong data-player-status>{playerStatus}</strong>
            </div>
          </div>
        </section>

        <aside class="control-column">
          <section class="control-block">
            <div class="control-head">
              <h3>收看</h3>
              <StatusPill id="playerBadge" label={playerBadge.label} state={playerBadge.state} />
            </div>
            <label>
              房间 ID
              <input id="namespace" value={room} placeholder="例如：live-f8c2a1" onInput={onRoomInput} />
            </label>
            <div class="action-row">
              <button type="button" id="start" onClick={onStart}>加入直播间</button>
              <button type="button" class="secondary" id="stop" onClick={onStop}>离开直播间</button>
            </div>
            <p class="status" id="status">{playerStatus}</p>
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
