export function LiveCoverManager({
  roomCoverUrl,
  roomCoverLoading,
  roomCoverBusy,
  roomCoverError,
  roomCoverStatus,
  roomCoverInputRef,
  onPickCover,
  onOpenPicker,
  showNote = false
}) {
  function handleKeyDown(event) {
    if (roomCoverBusy || roomCoverLoading) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenPicker();
    }
  }

  return (
    <>
      <input
        ref={roomCoverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        class="live-cover-input"
        onChange={onPickCover}
      />
      <div class="live-cover-card">
        <strong>直播封面</strong>
        <div
          class={`live-cover-preview${roomCoverBusy || roomCoverLoading ? " is-disabled" : ""}`}
          role="button"
          tabIndex={roomCoverBusy || roomCoverLoading ? -1 : 0}
          aria-disabled={roomCoverBusy || roomCoverLoading}
          aria-label="上传直播封面"
          onClick={() => {
            if (!roomCoverBusy && !roomCoverLoading) {
              onOpenPicker();
            }
          }}
          onKeyDown={handleKeyDown}
        >
          {roomCoverUrl ? (
            <img src={roomCoverUrl} alt="直播封面预览" />
          ) : (
            <span class="live-cover-preview-placeholder">{roomCoverLoading ? "加载中" : "未设置封面"}</span>
          )}
        </div>
        {showNote ? <p class="live-cover-note">建议固定为 1280×720，支持 JPG、PNG、WebP、AVIF，文件不超过 5MB。</p> : null}
        {roomCoverError ? <p class="inline-warning">{roomCoverError}</p> : null}
        {roomCoverStatus ? <p class="status">{roomCoverStatus}</p> : null}
      </div>
    </>
  );
}
