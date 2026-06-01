import { CircleUserRound, Eye, Video } from "lucide-react";

const navItems = [
  {
    id: "watch",
    label: "收看",
    icon: <Eye />
  },
  {
    id: "live",
    label: "开播",
    icon: <Video />
  },
  {
    id: "settings",
    label: "我的",
    icon: <CircleUserRound />
  }
];

function NavButton({ item, currentPage, onSelect, mobile = false }) {
  const active = currentPage === item.id;

  return (
    <button
      type="button"
      className={`nav-button${active ? " is-active" : ""}`}
      data-nav-target={item.id}
      aria-selected={String(active)}
      onClick={() => onSelect(item.id)}
    >
      {mobile ? (
        <>
          <span className="nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="nav-label">{item.label}</span>
        </>
      ) : (
        item.label
      )}
    </button>
  );
}

function getNavHref(pageId) {
  const url = new URL(window.location.href);
  url.search = "";
  if (pageId === "live") {
    url.searchParams.set("p", "l");
  } else if (pageId === "settings") {
    url.searchParams.set("p", "s");
  }
  return `${url.pathname}${url.search}`;
}

function NavLink({ item, currentPage, onSelect }) {
  const active = currentPage === item.id;

  return (
    <a
      href={getNavHref(item.id)}
      className={`nav-button${active ? " is-active" : ""}`}
      data-nav-target={item.id}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        onSelect(item.id);
      }}
    >
      {item.label}
    </a>
  );
}

export function DesktopNavigation({ currentPage, onSelect }) {
  return (
    <nav className="desktop-nav" aria-label="Primary">
      {navItems.filter((item) => item.id !== "settings").map((item) => (
        <NavLink key={item.id} item={item} currentPage={currentPage} onSelect={onSelect} />
      ))}
    </nav>
  );
}

export function MobileNavigation({ currentPage, onSelect }) {
  return (
    <nav className="mobile-nav" aria-label="Primary">
      {navItems.map((item) => (
        <NavButton key={item.id} item={item} currentPage={currentPage} onSelect={onSelect} mobile />
      ))}
    </nav>
  );
}
