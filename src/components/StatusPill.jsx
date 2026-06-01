export function StatusPill({ id, label, state }) {
  return (
    <span className="state-pill" id={id} data-state={state}>
      {label}
    </span>
  );
}
