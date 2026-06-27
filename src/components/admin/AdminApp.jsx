import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Home, Menu, UsersRound, X } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider.jsx";

const AdminUsersPage = lazy(() => import("./AdminUsersPage.jsx"));
const ADMIN_MOBILE_NAV_EXIT_MS = 220;

const ADMIN_NAV_ITEMS = [
  {
    id: "users",
    icon: <UsersRound aria-hidden="true" />,
    labelKey: "admin.users",
  },
];

export default function AdminApp() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileNavMounted, setMobileNavMounted] = useState(false);
  const [mobileNavVisible, setMobileNavVisible] = useState(false);
  const mobileNavCloseTimerRef = useRef(null);
  const mobileNavOpenFrameRef = useRef(null);

  useEffect(() => {
    if (mobileNavOpen) {
      if (mobileNavCloseTimerRef.current) {
        window.clearTimeout(mobileNavCloseTimerRef.current);
        mobileNavCloseTimerRef.current = null;
      }
      if (mobileNavOpenFrameRef.current) {
        cancelAnimationFrame(mobileNavOpenFrameRef.current);
        mobileNavOpenFrameRef.current = null;
      }
      setMobileNavMounted(true);
      setMobileNavVisible(false);
      return undefined;
    }

    if (!mobileNavMounted) {
      setMobileNavVisible(false);
      return undefined;
    }

    setMobileNavVisible(false);
    if (mobileNavOpenFrameRef.current) {
      cancelAnimationFrame(mobileNavOpenFrameRef.current);
      mobileNavOpenFrameRef.current = null;
    }
    if (mobileNavCloseTimerRef.current) {
      window.clearTimeout(mobileNavCloseTimerRef.current);
    }
    mobileNavCloseTimerRef.current = window.setTimeout(() => {
      setMobileNavMounted(false);
      mobileNavCloseTimerRef.current = null;
    }, ADMIN_MOBILE_NAV_EXIT_MS);

    return undefined;
  }, [mobileNavMounted, mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen || !mobileNavMounted) {
      return undefined;
    }

    mobileNavOpenFrameRef.current = requestAnimationFrame(() => {
      mobileNavOpenFrameRef.current = requestAnimationFrame(() => {
        setMobileNavVisible(true);
        mobileNavOpenFrameRef.current = null;
      });
    });

    return () => {
      if (mobileNavOpenFrameRef.current) {
        cancelAnimationFrame(mobileNavOpenFrameRef.current);
        mobileNavOpenFrameRef.current = null;
      }
    };
  }, [mobileNavMounted, mobileNavOpen]);

  useEffect(() => () => {
    if (mobileNavCloseTimerRef.current) {
      window.clearTimeout(mobileNavCloseTimerRef.current);
    }
    if (mobileNavOpenFrameRef.current) {
      cancelAnimationFrame(mobileNavOpenFrameRef.current);
    }
  }, []);

  useEffect(() => {
    if (!mobileNavOpen || !mobileNavMounted) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavMounted, mobileNavOpen]);

  function selectSection(sectionId) {
    setActiveSection(sectionId);
    setMobileNavOpen(false);
  }

  const nav = (
    <nav className="admin-sidebar-nav" aria-label={t("admin.navigation")}>
      <ul className="live-menu-list settings-menu-list admin-sidebar-menu">
      {ADMIN_NAV_ITEMS.map((item) => (
        <li className="live-menu-list-item" key={item.id}>
          <button
            type="button"
            className={`live-menu-item live-more-menu-item settings-menu-item${activeSection === item.id ? " is-active" : ""}`}
            onClick={() => selectSection(item.id)}
          >
            <span className="live-more-menu-icon settings-menu-icon" aria-hidden="true">{item.icon}</span>
            <span className="live-more-menu-label">{t(item.labelKey)}</span>
          </button>
        </li>
      ))}
      </ul>
    </nav>
  );
  const homeLink = (
    <ul className="live-menu-list settings-menu-list admin-sidebar-home">
      <li className="live-menu-list-item">
        <a className="live-menu-item live-more-menu-item settings-menu-item" href="/">
          <span className="live-more-menu-icon settings-menu-icon" aria-hidden="true">
            <Home aria-hidden="true" />
          </span>
          <span className="live-more-menu-label">{t("admin.backToSite")}</span>
        </a>
      </li>
    </ul>
  );

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <strong>{t("admin.title")}</strong>
          <span>{t("admin.subtitle")}</span>
        </div>
        {nav}
        {homeLink}
      </aside>

      <header className="admin-mobile-topbar">
        <button
          type="button"
          className="admin-mobile-menu-button"
          onClick={() => setMobileNavOpen(true)}
          aria-label={t("admin.openNavigation")}
        >
          <Menu aria-hidden="true" />
        </button>
        <strong>{t("admin.title")}</strong>
      </header>

      {mobileNavMounted ? (
        <div className={`admin-mobile-nav-layer${mobileNavVisible ? " is-open" : ""}`}>
          <button
            type="button"
            className="admin-mobile-nav-backdrop"
            aria-label={t("admin.closeNavigation")}
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="admin-mobile-nav">
            <div className="admin-brand">
              <strong>{t("admin.title")}</strong>
              <button
                type="button"
                className="admin-mobile-menu-button"
                onClick={() => setMobileNavOpen(false)}
                aria-label={t("admin.closeNavigation")}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            {nav}
            {homeLink}
          </aside>
        </div>
      ) : null}

      <main className="admin-main">
        <Suspense fallback={<div className="admin-loading">{t("common.loading")}</div>}>
          {activeSection === "users" ? <AdminUsersPage /> : null}
          {!activeSection ? (
            <section className="admin-empty-state">
              <h1>{t("admin.title")}</h1>
              <p>{t("admin.pickSection")}</p>
            </section>
          ) : null}
        </Suspense>
      </main>
    </div>
  );
}
