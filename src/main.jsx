import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { ToastProvider } from "./components/FloatingToast.jsx";
import { I18nProvider } from "./i18n/I18nProvider.jsx";
import "./styles.css";

createRoot(document.getElementById("app")).render(
  <I18nProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </I18nProvider>
);
