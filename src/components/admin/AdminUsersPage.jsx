import { useEffect, useMemo, useState } from "react";
import { UserAvatar } from "../primitives/UserAvatar.jsx";
import { useI18n } from "../../i18n/I18nProvider.jsx";

const ADMIN_USERS_PAGE_SIZE = 20;

function formatDateTime(value, locale) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AdminUsersPage() {
  const { locale, t } = useI18n();
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({
    hasNext: false,
    limit: ADMIN_USERS_PAGE_SIZE,
    offset: 0,
  });
  const pageIndex = Math.floor((pagination.offset || 0) / (pagination.limit || ADMIN_USERS_PAGE_SIZE)) + 1;
  const canGoPrev = offset > 0;
  const canGoNext = pagination.hasNext;

  const searchParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(ADMIN_USERS_PAGE_SIZE));
    params.set("offset", String(offset));
    return params;
  }, [offset]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/users?${searchParams.toString()}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || `Request failed with ${response.status}`);
        }
        setUsers(Array.isArray(payload.users) ? payload.users : []);
        setPagination({
          hasNext: payload.pagination?.hasNext === true,
          limit: Math.max(1, Number(payload.pagination?.limit || ADMIN_USERS_PAGE_SIZE)),
          offset: Math.max(0, Number(payload.pagination?.offset || 0)),
        });
      } catch (loadError) {
        if (loadError?.name !== "AbortError") {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
          setUsers([]);
          setPagination((current) => ({ ...current, hasNext: false }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadUsers();
    return () => controller.abort();
  }, [searchParams]);

  return (
    <section className="admin-users-page">
      <header className="admin-section-header">
        <div>
          <h1>{t("admin.users")}</h1>
        </div>
      </header>

      <div className="admin-list-toolbar">
        <span>{t("admin.pageStatus", { page: pageIndex })}</span>
      </div>

      {error ? <div className="admin-error">{error}</div> : null}

      <div className="admin-user-list" aria-busy={loading ? "true" : "false"}>
        {loading ? <div className="admin-loading">{t("common.loading")}</div> : null}
        {!loading && users.length === 0 && !error ? (
          <div className="admin-empty">{t("admin.noUsers")}</div>
        ) : null}
        {users.map((user) => {
          const name = user.displayName || user.handle || user.email || user.id;
          return (
            <article className="admin-user-row" key={user.id}>
              <UserAvatar
                avatarUrl={user.avatarUrl}
                displayName={name}
                className="admin-user-avatar"
                imgAlt={t("admin.userAvatar", { name })}
                imgWidth={40}
                imgHeight={40}
                monogramClassName="is-monogram"
                placeholderClassName="is-placeholder"
                iconClassName="admin-user-avatar-icon"
              />
              <div className="admin-user-main">
                <strong>{name}</strong>
                <span>{user.handle ? `@${user.handle}` : user.email || user.id}</span>
              </div>
              <div className="admin-user-meta">
                <span>{t("admin.registeredAt")}</span>
                <strong>{formatDateTime(user.createdAt, locale)}</strong>
              </div>
              <div className="admin-user-meta">
                <span>{t("admin.lastLoginAt")}</span>
                <strong>{formatDateTime(user.lastLoginAt, locale) || t("common.notSet")}</strong>
              </div>
            </article>
          );
        })}
      </div>

      <div className="admin-pagination">
        <button
          type="button"
          className="admin-secondary-button"
          disabled={!canGoPrev || loading}
          onClick={() => setOffset(Math.max(0, offset - pagination.limit))}
        >
          {t("admin.previousPage")}
        </button>
        <button
          type="button"
          className="admin-secondary-button"
          disabled={!canGoNext || loading}
          onClick={() => setOffset(offset + pagination.limit)}
        >
          {t("admin.nextPage")}
        </button>
      </div>
    </section>
  );
}
