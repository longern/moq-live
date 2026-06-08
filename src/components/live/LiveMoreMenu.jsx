import { useEffect, useState } from "react";
import { getAppErrorMessage } from "../../lib/appErrors.js";
import { LiveMenuItem, LiveMenuList } from "./LiveMenuList.jsx";
import {
  ChatIcon,
  CoverIcon,
  MenuChevronIcon,
  ShareIcon,
  TitleIcon,
} from "./liveIcons.jsx";

function LiveMoreMenuItem({
  icon,
  label,
  onClick,
  disabled = false,
  ariaLabel = label,
}) {
  return (
    <LiveMenuItem
      className="live-more-menu-item"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <span className="live-more-menu-icon">{icon}</span>
      <span className="live-more-menu-label">{label}</span>
      <MenuChevronIcon />
    </LiveMenuItem>
  );
}

export function LiveMoreMenu({
  roomCoverUrl,
  roomCoverBusy,
  roomCoverLoading,
  roomCoverError,
  roomCoverStatus,
  roomCoverInputRef,
  roomTitle,
  roomWelcomeMessage,
  onPickCover,
  onOpenCoverPicker,
  onSaveRoomTitle,
  onSaveRoomWelcomeMessage,
  roomInfoBlockedReason = "",
  onRoomInfoBlocked,
  onShare,
  shareSupported,
  watchLink,
  onClose,
}) {
  const [activeEditor, setActiveEditor] = useState("");
  const [titleDraft, setTitleDraft] = useState(roomTitle || "");
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState("");
  const [titleStatus, setTitleStatus] = useState("");
  const [welcomeDraft, setWelcomeDraft] = useState(roomWelcomeMessage || "");
  const [welcomeSaving, setWelcomeSaving] = useState(false);
  const [welcomeError, setWelcomeError] = useState("");
  const [welcomeStatus, setWelcomeStatus] = useState("");
  const coverBusy = roomCoverBusy || roomCoverLoading;
  const titleUnchanged = titleDraft.trim().replace(/\s+/g, " ") === (roomTitle || "").trim().replace(/\s+/g, " ");
  const welcomeUnchanged = welcomeDraft.trim().replace(/\s+/g, " ") === (roomWelcomeMessage || "").trim().replace(/\s+/g, " ");

  useEffect(() => {
    setTitleDraft(roomTitle || "");
    setTitleError("");
    setTitleStatus("");
  }, [roomTitle]);

  useEffect(() => {
    setWelcomeDraft(roomWelcomeMessage || "");
    setWelcomeError("");
    setWelcomeStatus("");
  }, [roomWelcomeMessage]);

  function handleShare() {
    onShare();
    onClose?.();
  }

  async function handleTitleSubmit(event) {
    event.preventDefault();
    if (!onSaveRoomTitle || titleSaving || titleUnchanged) {
      return;
    }
    if (roomInfoBlockedReason) {
      onRoomInfoBlocked?.();
      return;
    }

    setTitleSaving(true);
    setTitleError("");
    setTitleStatus("");

    try {
      const result = await onSaveRoomTitle(titleDraft);
      if (!result) {
        return;
      }
      setTitleStatus("直播标题已保存");
    } catch (error) {
      setTitleError(getAppErrorMessage(error));
    } finally {
      setTitleSaving(false);
    }
  }

  async function handleWelcomeSubmit(event) {
    event.preventDefault();
    if (!onSaveRoomWelcomeMessage || welcomeSaving || welcomeUnchanged) {
      return;
    }
    if (roomInfoBlockedReason) {
      onRoomInfoBlocked?.();
      return;
    }

    setWelcomeSaving(true);
    setWelcomeError("");
    setWelcomeStatus("");

    try {
      const result = await onSaveRoomWelcomeMessage(welcomeDraft);
      if (!result) {
        return;
      }
      setWelcomeStatus("欢迎语已保存");
    } catch (error) {
      setWelcomeError(getAppErrorMessage(error));
    } finally {
      setWelcomeSaving(false);
    }
  }

  const editorTitle = activeEditor === "cover"
    ? "直播封面"
    : activeEditor === "welcome"
      ? "欢迎语"
      : "直播标题";

  return (
    <>
      <input
        ref={roomCoverInputRef}
        className="live-cover-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        onChange={onPickCover}
      />
      <div className={`live-more-menu-shell${activeEditor ? " is-editing" : ""}`} aria-label="更多直播操作">
        <div className="live-more-menu-track">
          <div className="live-more-menu-screen">
            <div className="live-more-menu-title">直播设置</div>
            <LiveMenuList className="live-more-menu-list">
              <LiveMoreMenuItem
                icon={<CoverIcon />}
                label="直播封面"
                onClick={() => setActiveEditor("cover")}
              />
              <LiveMoreMenuItem
                icon={<TitleIcon />}
                label="直播标题"
                onClick={() => setActiveEditor("title")}
              />
              <LiveMoreMenuItem
                icon={<ShareIcon />}
                label="分享"
                onClick={handleShare}
                disabled={!shareSupported || !watchLink}
                ariaLabel="分享直播间"
              />
              <LiveMoreMenuItem
                icon={<ChatIcon />}
                label="欢迎语"
                onClick={() => setActiveEditor("welcome")}
              />
            </LiveMenuList>
          </div>

          <div className="live-more-menu-screen live-more-editor-screen">
            <div className="live-more-editor-head">
              <button
                type="button"
                className="live-more-editor-back"
                onClick={() => setActiveEditor("")}
                aria-label="返回更多菜单"
              >
                <MenuChevronIcon />
              </button>
              <strong>{editorTitle}</strong>
            </div>

            {activeEditor === "cover" ? (
              <div className="live-more-cover-form">
                <button
                  type="button"
                  className={`live-cover-preview${coverBusy ? " is-disabled" : ""}`}
                  onClick={coverBusy ? undefined : onOpenCoverPicker}
                  disabled={coverBusy}
                  aria-label="上传直播封面"
                >
                  {roomCoverUrl ? (
                    <img src={roomCoverUrl} alt="直播封面预览" />
                  ) : (
                    <span className="live-cover-preview-placeholder">
                      {roomCoverLoading ? "加载中" : "未设置封面"}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="live-more-primary-action"
                  onClick={onOpenCoverPicker}
                  disabled={coverBusy}
                >
                  {roomCoverBusy ? "上传中" : "更换封面"}
                </button>
                <p className="live-cover-note">建议固定为 1280×720，支持 JPG、PNG、WebP、AVIF，文件不超过 5MB。</p>
                {roomCoverError ? <p className="inline-warning">{roomCoverError}</p> : null}
                {roomCoverStatus ? <p className="status">{roomCoverStatus}</p> : null}
              </div>
            ) : activeEditor === "welcome" ? (
              <form className="live-more-title-form" onSubmit={handleWelcomeSubmit}>
                <label className="live-more-title-field">
                  <span>欢迎语</span>
                  <textarea
                    value={welcomeDraft}
                    onChange={(event) => {
                      setWelcomeDraft(event.currentTarget.value);
                      setWelcomeError("");
                      setWelcomeStatus("");
                    }}
                    maxLength={160}
                    placeholder="填写进入直播间时显示的欢迎语"
                    disabled={welcomeSaving}
                    rows={4}
                  />
                </label>
                <div className="live-more-title-count">{Array.from(welcomeDraft).length}/160</div>
                <button
                  type="submit"
                  className="live-more-primary-action"
                  disabled={welcomeSaving || welcomeUnchanged}
                >
                  {welcomeSaving ? "保存中" : "保存欢迎语"}
                </button>
                {welcomeError ? <p className="inline-warning">{welcomeError}</p> : null}
                {welcomeStatus ? <p className="status">{welcomeStatus}</p> : null}
              </form>
            ) : (
              <form className="live-more-title-form" onSubmit={handleTitleSubmit}>
                <label className="live-more-title-field">
                  <span>直播标题</span>
                  <input
                    value={titleDraft}
                    onChange={(event) => {
                      setTitleDraft(event.currentTarget.value);
                      setTitleError("");
                      setTitleStatus("");
                    }}
                    maxLength={80}
                    placeholder="填写直播标题"
                    disabled={titleSaving}
                  />
                </label>
                <div className="live-more-title-count">{Array.from(titleDraft).length}/80</div>
                <button
                  type="submit"
                  className="live-more-primary-action"
                  disabled={titleSaving || titleUnchanged}
                >
                  {titleSaving ? "保存中" : "保存标题"}
                </button>
                {titleError ? <p className="inline-warning">{titleError}</p> : null}
                {titleStatus ? <p className="status">{titleStatus}</p> : null}
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
