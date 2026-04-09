const navItems = [
  {
    id: "watch",
    label: "收看",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    )
  },
  {
    id: "live",
    label: "开播",
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="4" y="6" width="12" height="12" rx="2" />
        <path d="m16 10 4-2.5v9L16 14" />
        <circle cx="8" cy="10" r="1.2" />
      </svg>
    )
  },
  {
    id: "settings",
    label: "设置",
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="M4.9 4.9l2.1 2.1" />
        <path d="m17 17 2.1 2.1" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="m4.9 19.1 2.1-2.1" />
        <path d="M17 7l2.1-2.1" />
        <circle cx="12" cy="12" r="4" />
      </svg>
    )
  }
];

function NavButton({ item, currentPage, onSelect, mobile = false }) {
  const active = currentPage === item.id;

  return (
    <button
      type="button"
      class={`nav-button${active ? " is-active" : ""}`}
      data-nav-target={item.id}
      aria-selected={String(active)}
      onClick={() => onSelect(item.id)}
    >
      {mobile ? (
        <>
          <span class="nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span class="nav-label">{item.label}</span>
        </>
      ) : (
        item.label
      )}
    </button>
  );
}

export function DesktopNavigation({ currentPage, onSelect }) {
  return (
    <nav class="desktop-nav" aria-label="Primary">
      {navItems.map((item) => (
        <NavButton key={item.id} item={item} currentPage={currentPage} onSelect={onSelect} />
      ))}
    </nav>
  );
}

export function MobileNavigation({ currentPage, onSelect }) {
  return (
    <nav class="mobile-nav" aria-label="Primary">
      {navItems.map((item) => (
        <NavButton key={item.id} item={item} currentPage={currentPage} onSelect={onSelect} mobile />
      ))}
    </nav>
  );
}
