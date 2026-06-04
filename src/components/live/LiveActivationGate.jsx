export function LiveActivationGate({
  title,
  message,
  error,
  busy,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}) {
  return (
    <div className="live-activation-panel">
      <div className="live-activation-copy">
        <span>直播功能</span>
        <h2>{title}</h2>
        <p>{message}</p>
        {error ? <p className="live-activation-error">{error}</p> : null}
      </div>
      <div className="live-activation-actions">
        {primaryLabel ? (
          <button type="button" className="primary" onClick={onPrimary} disabled={busy}>
            {busy ? "处理中" : primaryLabel}
          </button>
        ) : null}
        {secondaryLabel ? (
          <button type="button" className="live-activation-secondary" onClick={onSecondary} disabled={busy}>
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
