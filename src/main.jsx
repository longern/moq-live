import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "./components/primitives/FloatingToast.jsx";
import { I18nProvider } from "./i18n/I18nProvider.jsx";
import "./styles.css";

const App = lazy(() => import("./App.jsx").then((module) => ({ default: module.App })));
const AdminApp = lazy(() => import("./components/admin/AdminApp.jsx"));

function isAdminRoute() {
  return window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/");
}

function RootApp() {
  return (
    <Suspense fallback={null}>
      {isAdminRoute() ? <AdminApp /> : <App />}
    </Suspense>
  );
}

createRoot(document.getElementById("app")).render(
  <I18nProvider>
    <ToastProvider>
      <RootApp />
    </ToastProvider>
  </I18nProvider>
);
