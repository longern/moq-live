export function CameraIcon({ mode }) {
  if (mode === "off") {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 7h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4z" />
        <path d="m16 11 4-2.5v7L16 13" />
        <path d="m5 5 14 14" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24">
      <path d="M4 7h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4z" />
      <path d="m16 11 4-2.5v7L16 13" />
      <path d={mode === "rear" ? "M9 10h4M11 8l2 2-2 2" : "M13 10H9m2 2-2-2 2-2"} />
    </svg>
  );
}

export function MicrophoneIcon({ enabled }) {
  if (!enabled) {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M12 4a2 2 0 0 1 2 2v4" />
        <path d="M10 10V6a2 2 0 0 1 3.4-1.4" />
        <path d="M16 10a4 4 0 0 1-6.8 2.8" />
        <path d="M8 10a4 4 0 0 0 1 2.6" />
        <path d="M12 18v3" />
        <path d="M8 21h8" />
        <path d="m4 4 16 16" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 4a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V6a2 2 0 0 1 2-2Z" />
      <path d="M8 10a4 4 0 0 0 8 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

export function BroadcastIcon({ active }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24">
        <path d="M9 6v12" />
        <path d="M15 6v12" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

export function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function ScreenShareIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="3" y="4.5" width="18" height="12.5" rx="2.5" />
      <path d="M8 20h8" />
      <path d="M12 17v3" />
      <path d="m10 9 2-2 2 2" />
      <path d="M12 7v6" />
      <path d="M9 12.5h6" />
    </svg>
  );
}

export function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M10 13.5 8.5 15a3 3 0 1 1-4.2-4.2l3-3A3 3 0 0 1 11.5 12" />
      <path d="m14 10.5 1.5-1.5a3 3 0 0 1 4.2 4.2l-3 3A3 3 0 0 1 12.5 12" />
      <path d="M9.5 14.5 14.5 9.5" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="6" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18" cy="12" r="1.8" />
    </svg>
  );
}
