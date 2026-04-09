export function WatchIdlePage({
  hidden,
  room,
  onRoomInput,
  onStart
}) {
  return (
    <section class="page page-immersive watch-idle-page" data-page="watch" data-joined="false" hidden={hidden}>
      <div class="watch-idle-shell">
        <div class="watch-idle-panel">
          <div class="watch-idle-form">
            <input
              id="namespace"
              value={room}
              placeholder="输入房间 ID"
              aria-label="房间 ID"
              onInput={onRoomInput}
            />
            <button type="button" id="start" onClick={onStart}>加入直播间</button>
          </div>
        </div>
      </div>
    </section>
  );
}
