import { LiveMenuItem, LiveMenuList } from "./LiveMenuList.jsx";

export function LiveQualityMenu({
  publishQualityOptions = [],
  publishQualityId,
  onPublishQualityChange,
  onAfterSelect,
}) {
  function handleSelect(optionId) {
    onPublishQualityChange?.(optionId);
    onAfterSelect?.();
  }

  return (
    <>
      <div className="live-quality-panel-head">
        <strong>画质</strong>
      </div>
      <LiveMenuList className="live-quality-list" role="listbox" ariaLabel="直播画质">
        {publishQualityOptions.map((option) => (
          <LiveMenuItem
            key={option.id}
            className="live-quality-option"
            active={publishQualityId === option.id}
            onClick={() => handleSelect(option.id)}
            role="option"
            aria-selected={publishQualityId === option.id}
          >
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            <span className="live-quality-check" aria-hidden="true">
              {publishQualityId === option.id ? "✓" : ""}
            </span>
          </LiveMenuItem>
        ))}
      </LiveMenuList>
    </>
  );
}
