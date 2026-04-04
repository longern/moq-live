export function StatusPill({ id, label, state }) {
  return (
    <span class="state-pill" id={id} data-state={state}>
      {label}
    </span>
  );
}
