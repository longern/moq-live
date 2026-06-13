import { CircleUserRound, Eye, Video } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider.jsx";

const navItems = [
  {
    id: "watch",
    labelKey: "nav.watch",
    icon: <Eye />
  },
  {
    id: "live",
    labelKey: "nav.live",
    icon: <Video />
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    icon: <CircleUserRound />
  }
];

function NavButton({ item, currentPage, onSelect, onPreloadLive, mobile = false }) {
  const { t } = useI18n();
  const label = t(item.labelKey);
  const active = currentPage === item.id;
  const preloadProps = item.id === "live"
    ? {
        onPointerDown: onPreloadLive,
        onFocus: onPreloadLive,
      }
    : {};

  return (
    <button
      type="button"
      className={`nav-button${active ? " is-active" : ""}`}
      data-nav-target={item.id}
      aria-selected={String(active)}
      onClick={() => onSelect(item.id)}
      {...preloadProps}
    >
      {mobile ? (
        <>
          <span className="nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="nav-label">{label}</span>
        </>
      ) : (
        label
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

function NavLink({ item, currentPage, onSelect, onPreloadLive }) {
  const { t } = useI18n();
  const active = currentPage === item.id;
  const preloadProps = item.id === "live"
    ? {
        onPointerEnter: onPreloadLive,
        onFocus: onPreloadLive,
      }
    : {};

  return (
    <a
      href={getNavHref(item.id)}
      className={`nav-button${active ? " is-active" : ""}`}
      data-nav-target={item.id}
      aria-current={active ? "page" : undefined}
      {...preloadProps}
      onClick={(event) => {
        event.preventDefault();
        onSelect(item.id);
      }}
    >
      {t(item.labelKey)}
    </a>
  );
}

export function DesktopNavigation({ currentPage, onSelect, onPreloadLive }) {
  return (
    <nav className="desktop-nav" aria-label="Primary">
      {navItems.filter((item) => item.id !== "settings").map((item) => (
        <NavLink
          key={item.id}
          item={item}
          currentPage={currentPage}
          onSelect={onSelect}
          onPreloadLive={onPreloadLive}
        />
      ))}
    </nav>
  );
}

export function MobileNavigation({ currentPage, onSelect, onPreloadLive }) {
  return (
    <nav className="mobile-nav" aria-label="Primary">
      {navItems.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          currentPage={currentPage}
          onSelect={onSelect}
          onPreloadLive={onPreloadLive}
          mobile
        />
      ))}
    </nav>
  );
}
