import { X } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider.jsx";

export function LiveRouteFrame({ children, closing, shellMode }) {
  return (
    <section
      className={`page page-immersive live-route-frame${closing ? " is-closing" : ""}`}
      data-page="live"
      data-shell={shellMode}
    >
      {children}
    </section>
  );
}

export function LiveRouteActivationContent({ children, onClose }) {
  const { t } = useI18n();

  return (
    <div className="live-route-activation-content" role="status" aria-live="polite">
      <div className="live-page-top">
        <button
          type="button"
          className="live-page-close"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X />
        </button>
      </div>
      <div className="live-route-activation-body">
        {children}
      </div>
    </div>
  );
}
