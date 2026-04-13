import { useEffect, useState } from "preact/hooks";

export function SettingsPage({
  hidden,
  relayUrl,
  relayHost,
  buildLabel,
  authAvailable,
  authLoading,
  authUser,
  onMicrosoftLogin,
  onLogout,
  onUpdateDisplayName,
  onRelayUrlInput,
  logText,
  logRef
}) {
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [displayNameError, setDisplayNameError] = useState("");
  const [displayNameStatus, setDisplayNameStatus] = useState("");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("account");
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false);

  useEffect(() => {
    if (!authUser) {
      setDisplayNameInput("");
      setDisplayNameError("");
      setDisplayNameStatus("");
      setDisplayNameSaving(false);
      return;
    }

    setDisplayNameInput(authUser.displayName || "");
    setDisplayNameError("");
    setDisplayNameStatus("");
    setDisplayNameSaving(false);
  }, [authUser?.id]);

  const displayNameCooldownActive = Boolean(
    authUser?.nextDisplayNameChangeAt && Date.parse(authUser.nextDisplayNameChangeAt) > Date.now()
  );
  const normalizedCurrentDisplayName = (authUser?.displayName || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const normalizedDraftDisplayName = displayNameInput.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  const displayNameUnchanged = normalizedDraftDisplayName && normalizedDraftDisplayName === normalizedCurrentDisplayName;

  async function submitDisplayName(event) {
    event.preventDefault();
    if (!authUser || !onUpdateDisplayName) {
      return;
    }

    setDisplayNameSaving(true);
    setDisplayNameError("");
    setDisplayNameStatus("");

    try {
      const payload = await onUpdateDisplayName(displayNameInput);
      const nextValue = payload.user?.displayName || displayNameInput;
      setDisplayNameInput(nextValue);
      setDisplayNameStatus("显示名已更新");
    } catch (error) {
      setDisplayNameError(error instanceof Error ? error.message : String(error));
    } finally {
      setDisplayNameSaving(false);
    }
  }

  const sections = {
    account: {
      id: "account",
      title: "个人资料",
      detailTitle: "个人资料",
      description: "管理显示名和登录状态"
    },
    connection: {
      id: "connection",
      title: "连接与网络",
      detailTitle: "连接与网络",
      description: "管理 Relay Endpoint 和当前 Host"
    },
    diagnostics: {
      id: "diagnostics",
      title: "诊断与日志",
      detailTitle: "诊断与日志",
      description: "查看 Build 和开发日志"
    }
  };

  const groups = [
    {
      title: "账户",
      items: [sections.account]
    },
    {
      title: "通用",
      items: [sections.connection]
    },
    {
      title: "功能",
      items: [sections.diagnostics]
    }
  ];

  const currentSection = sections[activeSection] || sections.account;
  const profileName = authUser?.displayName || authUser?.email || "登录";

  return (
    <section class="page" data-page="settings" hidden={hidden}>
      <div class="page-grid settings-layout">
        <div class={`settings-shell${mobileSectionOpen ? " is-detail-open" : ""}`}>
          <div class="settings-overview card">
            <div class="settings-overview-head">
              <h2>设置</h2>
              <p>选择一个设置项进入详情。</p>
            </div>

            <button
              type="button"
              class="settings-profile-row"
              onClick={() => {
                if (!authUser) {
                  onMicrosoftLogin();
                  return;
                }
                setActiveSection("account");
                setMobileSectionOpen(true);
              }}
            >
              <span class="settings-profile-avatar" aria-hidden="true">
                {authUser?.avatarUrl ? (
                  <img src={authUser.avatarUrl} alt={authUser.displayName || "用户头像"} />
                ) : authUser?.displayName ? (
                  <span>{authUser.displayName.trim().slice(0, 1).toUpperCase()}</span>
                ) : (
                  <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="8" r="3.25" />
                    <path d="M5.5 19.5c1.8-3.2 4.1-4.8 6.5-4.8s4.7 1.6 6.5 4.8" />
                  </svg>
                )}
              </span>
              <span class="settings-profile-copy">
                <strong>{profileName}</strong>
              </span>
              <span class="settings-row-chevron" aria-hidden="true">›</span>
            </button>

            <div class="settings-overview-groups">
              {groups.map((group) => (
                <section key={group.title} class="settings-group">
                  <span class="settings-group-title">{group.title}</span>
                  <div class="settings-list" role="list">
                    {group.items.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        class={`settings-row${currentSection.id === section.id ? " is-active" : ""}`}
                        onClick={() => {
                          setActiveSection(section.id);
                          setMobileSectionOpen(true);
                        }}
                      >
                        <span class="settings-row-main">
                          <strong>{section.title}</strong>
                        </span>
                        <span class="settings-row-trailing">
                          <span class="settings-row-chevron" aria-hidden="true">›</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div class="settings-detail-panel card">
            <div class="settings-detail-head">
              <button
                type="button"
                class="settings-back-button"
                onClick={() => {
                  setMobileSectionOpen(false);
                }}
              >
                <span aria-hidden="true">‹</span>
                <span class="settings-back-label">返回</span>
              </button>
              <h2>{currentSection.detailTitle}</h2>
              <p>{currentSection.description}</p>
            </div>

            {currentSection.id === "account" ? (
              <div class="settings-stack">
                <div class="summary-item">
                  <strong>当前状态</strong>
                  <span>
                    {!authAvailable
                      ? "Auth API 未连接"
                      : authUser
                        ? `${authUser.displayName || authUser.email || "已登录"}${authUser.email ? ` · ${authUser.email}` : ""}`
                        : "未登录"}
                  </span>
                </div>
                <div class="action-row">
                  {authUser ? (
                    <button type="button" class="secondary" onClick={onLogout}>退出登录</button>
                  ) : (
                    <button type="button" onClick={onMicrosoftLogin} disabled={!authAvailable || authLoading}>
                      {authLoading ? "鉴权检查中" : "使用微软账户登录"}
                    </button>
                  )}
                </div>
                {authUser ? (
                  <form class="stack" onSubmit={(event) => {
                    void submitDisplayName(event);
                  }}
                  >
                    <label>
                      显示名
                      <input
                        value={displayNameInput}
                        maxLength={32}
                        onInput={(event) => {
                          setDisplayNameInput(event.currentTarget.value);
                          setDisplayNameError("");
                          setDisplayNameStatus("");
                        }}
                        placeholder="输入想显示的名称"
                      />
                    </label>
                    <div class="summary-item">
                      <strong>修改规则</strong>
                      <span>
                        {displayNameCooldownActive
                          ? `显示名 7 天内只能修改一次，下次可修改时间：${new Date(authUser.nextDisplayNameChangeAt).toLocaleString()}`
                          : "显示名需要唯一，且 7 天内只能修改一次。"}
                      </span>
                    </div>
                    {displayNameError ? <p class="inline-warning">{displayNameError}</p> : null}
                    {displayNameStatus ? <p class="status">{displayNameStatus}</p> : null}
                    <div class="action-row">
                      <button
                        type="submit"
                        disabled={
                          displayNameSaving
                          || displayNameCooldownActive
                          || !displayNameInput.trim()
                          || displayNameUnchanged
                        }
                      >
                        {displayNameSaving ? "保存中" : "保存显示名"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : null}

            {currentSection.id === "connection" ? (
              <div class="settings-stack">
                <label>
                  Relay Endpoint
                  <input id="url" value={relayUrl} onInput={onRelayUrlInput} />
                </label>
                <div class="summary-item">
                  <strong>当前 Host</strong>
                  <span data-relay-host>{relayHost}</span>
                </div>
                <div class="summary-item">
                  <strong>当前目标</strong>
                  <span>{relayUrl || "未设置"}</span>
                </div>
              </div>
            ) : null}

            {currentSection.id === "diagnostics" ? (
              <div class="settings-stack">
                <div class="summary-item">
                  <strong>Build</strong>
                  <span id="buildSubtitle">{buildLabel}</span>
                </div>
                <article class="stack">
                  <h3>开发日志</h3>
                  <pre id="log" ref={logRef}>{logText}</pre>
                </article>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
