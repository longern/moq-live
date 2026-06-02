import { useEffect, useRef, useState } from "react";
import { lazy, Suspense } from "react";
import { DesktopNavigation, MobileNavigation } from "./components/Navigation.jsx";
import { LoginDrawer } from "./components/LoginDrawer.jsx";
import { MobilePanelPresence } from "./components/MobilePanelPresence.jsx";
import { UserAvatar } from "./components/UserAvatar.jsx";
import { SettingsPage } from "./components/SettingsPage.jsx";
import { WatchPage } from "./components/WatchPage.jsx";
import { useAuthController } from "./hooks/useAuthController.js";
import { useChatController } from "./hooks/useChatController.js";
import { usePlayerController } from "./hooks/usePlayerController.js";
import { useRouteController } from "./hooks/useRouteController.js";
import { buildWatchLink, getRelayHostValue, writeRoute } from "./lib/routeState.js";
import { clearWatchHistory, persistWatchHistoryEntry, readWatchHistory } from "./lib/watchHistory.js";
import { describePlayerState } from "./lib/status.js";
import { getWatchTestChannel } from "./lib/watchTestChannels.js";

const LiveRoute = lazy(() =>
  import("./components/LiveRoute.jsx").then((module) => ({ default: module.LiveRoute }))
);

function getAvatarLabel(authState) {
  if (!authState.user) {
    return "匿名";
  }

  return authState.user.displayName || authState.user.email || "用户";
}

function isNamespaceWatchTarget(value) {
  return value.trim().toLowerCase().startsWith("ns:");
}

function getNamespaceWatchValue(value) {
  if (!isNamespaceWatchTarget(value)) {
    return "";
  }

  return value.trim().slice(3).trim();
}

function getHandleWatchValue(value) {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function LivePageFallback({ hidden }) {
  return (
    <section className="page" data-page="live" hidden={hidden}>
      <div className="page-grid live-layout">
        <section className="control-column" aria-busy="true">
          <div className="placeholder">
            <span className="live-circular-progress" role="progressbar" aria-label="正在加载开播页" />
          </div>
        </section>
      </div>
    </section>
  );
}

export function App() {
  const siteTitle = __APP_TITLE__;
  const [logText, setLogText] = useState("");
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [settingsLoginPanelRequestKey, setSettingsLoginPanelRequestKey] = useState(0);
  const [watchHistoryItems, setWatchHistoryItems] = useState(() => readWatchHistory());
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [livePageMounted, setLivePageMounted] = useState(
    () => new URLSearchParams(window.location.search).get("p") === "l"
  );
  const [watchRouteCommitted, setWatchRouteCommitted] = useState(() => Boolean(new URLSearchParams(window.location.search).get("r")?.trim()));
  const logRef = useRef(null);
  const authMenuRef = useRef(null);
  const authMenuCloseTimerRef = useRef(null);
  const handledWatchStreamStartRef = useRef({ roomId: "", startedAt: "" });
  const watchLiveSeenRef = useRef({ roomId: "", hasBeenLive: false });
  const pendingProtectedPageRef = useRef(null);
  const syntheticSessionRef = useRef(null);
  const previousRouteRef = useRef({
    page: new URLSearchParams(window.location.search).get("p") === "l"
      ? "live"
      : new URLSearchParams(window.location.search).get("p") === "s"
        ? "settings"
        : "watch",
    watchRoom: new URLSearchParams(window.location.search).get("r")?.trim() ?? "",
    watchRouteCommitted: Boolean(new URLSearchParams(window.location.search).get("r")?.trim())
  });

  function log(message) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setLogText((current) => `${current}${line}\n`);
  }

  useEffect(() => {
    window.__MOQ_APP_LOG__ = (message) => {
      log(String(message));
    };

    return () => {
      if (window.__MOQ_APP_LOG__ === log) {
        delete window.__MOQ_APP_LOG__;
      } else {
        delete window.__MOQ_APP_LOG__;
      }
    };
  }, []);

  useEffect(() => {
    window.__MOQ_APP_LOG__ = log;
    return () => {
      if (window.__MOQ_APP_LOG__ === log) {
        delete window.__MOQ_APP_LOG__;
      }
    };
  }, []);

  const {
    initialAutorun,
    page,
    relayUrl,
    watchRoom,
    liveRoom,
    autorunRef,
    pageRef,
    relayUrlRef,
    watchRoomRef,
    liveRoomRef,
    setWatchRoomValue,
    setLiveRoomValue,
    setRelayUrlValue,
    selectPage
  } = useRouteController();

  const {
    authState,
    startMicrosoftLogin,
    logout,
    updateDisplayName,
    updateHandle,
    updateAvatar
  } = useAuthController({ log });

  const [watchRoomResolution, setWatchRoomResolution] = useState({
    loading: false,
    error: "",
    roomId: "",
    hostHandle: "",
    hostDisplayName: "",
    title: ""
  });
  const [watchStreamEnded, setWatchStreamEnded] = useState(false);
  const [topbarWatchRoom, setTopbarWatchRoom] = useState("");

  const watchPlaybackRelayUrlRef = useRef("");
  const watchPlaybackNamespaceRef = useRef("");

  const normalizedWatchInput = watchRoom.trim();
  const watchTestChannel = getWatchTestChannel(normalizedWatchInput);
  const watchingTestChannel = Boolean(watchTestChannel);
  const watchingNamespace = !watchingTestChannel && isNamespaceWatchTarget(normalizedWatchInput);
  const directWatchNamespace = getNamespaceWatchValue(normalizedWatchInput);
  const watchHandle = watchingNamespace || watchingTestChannel ? "" : getHandleWatchValue(normalizedWatchInput);
  const resolvedWatchRoomId = watchingNamespace || watchingTestChannel ? "" : watchRoomResolution.roomId;
  const watchChatRoom = watchingTestChannel
    ? ""
    : watchingNamespace
      ? directWatchNamespace
      : resolvedWatchRoomId;

  const player = usePlayerController({
    initialAutorun: false,
    relayUrlRef: watchPlaybackRelayUrlRef,
    roomRef: watchPlaybackNamespaceRef,
    setLogText,
    log,
    syntheticSessionRef
  });
  const watchChatEnabled = page === "watch" && !watchingTestChannel && Boolean(watchChatRoom) && !authState.loading;

  const chat = useChatController({
    room: watchChatRoom,
    enabled: watchChatEnabled,
    authKey: authState.user?.id ?? "anonymous",
    role: "viewer",
    log
  });

  const resolvedWatchRelayUrl = watchingTestChannel
    ? ""
    : watchingNamespace
    ? relayUrl
    : chat.roomMeta.stream.relayUrl || "";
  const resolvedWatchNamespace = watchingTestChannel
    ? watchTestChannel.id
    : watchingNamespace
    ? directWatchNamespace
    : chat.roomMeta.stream.namespace || "";
  const watchJoined = page === "watch" && watchRouteCommitted && Boolean(normalizedWatchInput);
  const watchStageLoading = !watchingTestChannel
    && (
      watchingNamespace
        ? Boolean(directWatchNamespace)
        : watchRoomResolution.loading
          || (!watchRoomResolution.error && (!resolvedWatchRoomId || !chat.roomStateReady))
    );
  const watchStageMessage = watchingTestChannel
    ? ""
    : watchingNamespace
    ? (directWatchNamespace ? "正在连接公共频道。" : "等待输入公共频道号。")
    : watchRoomResolution.loading
      ? "加载中"
      : watchRoomResolution.error
        ? `进入失败：${watchRoomResolution.error}`
        : !resolvedWatchRoomId ||!chat.roomStateReady
          ? "加载中"
            : chat.streamState.isLive
              ? ""
              : watchStreamEnded
                ? "直播已结束"
                : "直播暂未开始";

  watchPlaybackRelayUrlRef.current = resolvedWatchRelayUrl;
  watchPlaybackNamespaceRef.current = resolvedWatchNamespace;

  const watchRoomLabel = watchingTestChannel
    ? watchTestChannel.label
    : watchingNamespace
    ? (directWatchNamespace ? `ns:${directWatchNamespace}` : "等待输入 namespace")
    : chat.roomMeta.host.displayName
      || watchRoomResolution.hostDisplayName
      || chat.roomMeta.host.handle
      || watchRoomResolution.hostHandle
      || chat.roomMeta.title
      || watchRoomResolution.title
      || watchHandle
      || watchRoom
      || "等待输入主播号";
  const watchChatRoomLabel = watchingTestChannel
    ? watchTestChannel.label
    : watchingNamespace
    ? (directWatchNamespace ? `ns:${directWatchNamespace}` : "")
    : chat.roomMeta.host.displayName
      || watchRoomResolution.hostDisplayName
      || chat.roomMeta.host.handle
      || watchRoomResolution.hostHandle
      || watchHandle
      || "";
  const watchRoomTitle = watchingTestChannel
    ? watchTestChannel.title
    : watchingNamespace
    ? (directWatchNamespace ? `公共频道 ${directWatchNamespace}` : "公共频道")
    : chat.roomMeta.title
      || watchRoomResolution.title
      || (watchChatRoomLabel ? `${watchChatRoomLabel}的直播间` : watchRoomLabel);
  const watchHostDisplayName = watchingTestChannel
    ? watchTestChannel.hostDisplayName
    : watchingNamespace
    ? ""
    : chat.roomMeta.host.displayName
      || watchRoomResolution.hostDisplayName
      || chat.roomMeta.host.handle
      || watchRoomResolution.hostHandle
      || watchHandle
      || "";
  const watchHostAvatarUrl = watchingNamespace || watchingTestChannel ? "" : chat.roomMeta.host.avatarUrl || "";
  const watchHostIcon = watchingNamespace ? "public-channel" : "";
  const watchShareTarget = watchingTestChannel
    ? ""
    : watchingNamespace
    ? (directWatchNamespace ? `ns:${directWatchNamespace}` : "")
    : watchRoomResolution.hostHandle || watchHandle || watchRoom;
  const watchPageLink = buildWatchLink(relayUrl, watchShareTarget);
  const relayHost = getRelayHostValue(relayUrl);
  const testPlayerSession = watchingTestChannel
    ? {
        key: watchTestChannel.sessionKey,
        token: -1,
        relayUrl: "",
        namespace: watchTestChannel.id,
      }
    : null;
  const effectivePlayerSession = testPlayerSession ?? player.playerSession;
  const effectivePlayerOrientation = watchTestChannel?.orientation ?? player.playerOrientation;
  const effectivePlayerStatusKind = watchingTestChannel ? "live" : player.playerStatusKind;
  const effectivePlayerStatus = watchTestChannel?.statusMessage ?? player.playerStatus;
  const playerBadge = describePlayerState(effectivePlayerStatusKind);
  const buildLabel = `Build ${__BUILD_HASH__}`;
  const mobileWatchSessionActive = page === "watch" && Boolean(effectivePlayerSession);
  const mobileWatchJoinedClass = mobileWatchSessionActive ? " app-container-watch-joined" : "";
  const requireLoginForLive = false;
  const avatarLabel = getAvatarLabel(authState);
  const avatarStateClass = authState.loading
    ? " is-loading"
    : authState.user
      ? " is-authenticated"
      : !authState.available
        ? " is-unavailable"
        : "";
  const avatarTitle = authState.loading
    ? "正在检查登录状态"
    : authState.user
      ? (authState.user.email || authState.user.displayName || "已登录")
      : !authState.available
        ? "Auth API 未连接"
        : "匿名用户";

  useEffect(() => {
    if (page === "live") {
      setLivePageMounted(true);
    }
  }, [page]);

  function openSettingsLogin(options) {
    setAuthMenuOpen(false);
    pendingProtectedPageRef.current = null;
    selectPage("settings", options);
    setSettingsLoginPanelRequestKey((current) => current + 1);
  }

  function returnToWatchHome() {
    pendingProtectedPageRef.current = null;
    autorunRef.current = false;
    setLoginPromptOpen(false);
    closeAuthMenu();
    setWatchRouteCommitted(false);
    setWatchRoomValue("");
    selectPage("watch", { updateAutorun: false });
    void player.stopPlayer();
  }

  function closeAuthMenu() {
    if (authMenuCloseTimerRef.current) {
      clearTimeout(authMenuCloseTimerRef.current);
      authMenuCloseTimerRef.current = null;
    }
    setAuthMenuOpen(false);
  }

  function openAuthMenu() {
    if (authMenuCloseTimerRef.current) {
      clearTimeout(authMenuCloseTimerRef.current);
      authMenuCloseTimerRef.current = null;
    }
    setAuthMenuOpen(true);
  }

  function scheduleCloseAuthMenu() {
    if (authMenuCloseTimerRef.current) {
      clearTimeout(authMenuCloseTimerRef.current);
    }
    authMenuCloseTimerRef.current = setTimeout(() => {
      authMenuCloseTimerRef.current = null;
      setAuthMenuOpen(false);
    }, 160);
  }

  function selectPageWithGuard(nextPage, options) {
    if (!requireLoginForLive || nextPage !== "live") {
      pendingProtectedPageRef.current = null;
      selectPage(nextPage, options);
      return;
    }

    if (authState.loading) {
      pendingProtectedPageRef.current = { nextPage, options };
      return;
    }

    if (!authState.user) {
      openSettingsLogin(options);
      return;
    }

    pendingProtectedPageRef.current = null;
    selectPage(nextPage, options);
  }

  function beginWatch(nextWatchTarget = watchRoom) {
    const normalizedTarget = nextWatchTarget.trim();
    if (!normalizedTarget) {
      return;
    }

    const testChannel = getWatchTestChannel(normalizedTarget);
    if (testChannel) {
      // Dev-only local test streams deliberately bypass room resolution.
    } else if (isNamespaceWatchTarget(normalizedTarget)) {
      if (!getNamespaceWatchValue(normalizedTarget)) {
        return;
      }
    } else if (!getHandleWatchValue(normalizedTarget)) {
      return;
    }

    if (nextWatchTarget !== watchRoom) {
      setWatchRoomValue(normalizedTarget);
    }

    autorunRef.current = true;
    setWatchRouteCommitted(true);
    selectPageWithGuard("watch", { updateAutorun: false });

    if (!isNamespaceWatchTarget(normalizedTarget)) {
      void player.stopPlayer();
    }
  }

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logText]);

  useEffect(() => () => {
    if (authMenuCloseTimerRef.current) {
      clearTimeout(authMenuCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (authState.user) {
      setLoginPromptOpen(false);
    }
  }, [authState.user]);

  useEffect(() => {
    const handlePopState = () => {
      const routeRoom = new URLSearchParams(window.location.search).get("r")?.trim() ?? "";
      setWatchRouteCommitted(Boolean(routeRoom));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    const routeWatchRoom = page === "watch" && watchRouteCommitted ? watchRoom.trim() : "";
    const previousRoute = previousRouteRef.current;
    const historyMode = page === "watch"
      && watchRouteCommitted
      && Boolean(routeWatchRoom)
      && (
        previousRoute.page !== "watch"
        || !previousRoute.watchRouteCommitted
        || !previousRoute.watchRoom
      )
      ? "push"
      : "replace";

    writeRoute(
      {
        page,
        watchRoom: routeWatchRoom,
        liveRoom
      },
      { historyMode }
    );

    previousRouteRef.current = {
      page,
      watchRoom: routeWatchRoom,
      watchRouteCommitted
    };
  }, [liveRoom, page, watchRoom, watchRouteCommitted]);

  useEffect(() => {
    if (!initialAutorun) {
      return;
    }

    autorunRef.current = true;
    selectPage("watch", { updateAutorun: false });
  }, []);

  useEffect(() => {
    if (page !== "watch" || !watchRouteCommitted || watchingTestChannel || watchingNamespace || !watchHandle) {
      setWatchRoomResolution({
        loading: false,
        error: "",
        roomId: "",
        hostHandle: "",
        hostDisplayName: "",
        title: ""
      });
      return;
    }

    let cancelled = false;

    async function resolveWatchRoom() {
      setWatchRoomResolution({
        loading: true,
        error: "",
        roomId: "",
        hostHandle: "",
        hostDisplayName: "",
        title: ""
      });

      try {
        const response = await fetch(`/api/rooms/resolve?handle=${encodeURIComponent(watchHandle)}`, {
          credentials: "same-origin"
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error || `room resolve failed with ${response.status}`);
        }

        if (cancelled) {
          return;
        }

        setWatchRoomResolution({
          loading: false,
          error: "",
          roomId: payload.room?.id || "",
          hostHandle: payload.room?.host?.handle || watchHandle,
          hostDisplayName: payload.room?.host?.displayName || "",
          title: payload.room?.title || ""
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setWatchRoomResolution({
          loading: false,
          error: message,
          roomId: "",
          hostHandle: "",
          hostDisplayName: "",
          title: ""
        });
        log(`watch resolve failed: ${message}`);
      }
    }

    void resolveWatchRoom();

    return () => {
      cancelled = true;
    };
  }, [page, watchHandle, watchRouteCommitted, watchingNamespace, watchingTestChannel]);

  useEffect(() => {
    if (page !== "watch" || !watchRouteCommitted || watchingNamespace || !resolvedWatchRoomId) {
      watchLiveSeenRef.current = { roomId: "", hasBeenLive: false };
      setWatchStreamEnded(false);
      return;
    }

    watchLiveSeenRef.current = { roomId: resolvedWatchRoomId, hasBeenLive: false };
    setWatchStreamEnded(false);
  }, [page, resolvedWatchRoomId, watchRouteCommitted, watchingNamespace]);

  useEffect(() => {
    if (
      page !== "watch"
      || !watchRouteCommitted
      || watchingTestChannel
      || watchingNamespace
      || !resolvedWatchRoomId
      || !chat.roomStateReady
    ) {
      return;
    }

    if (chat.streamState.isLive) {
      watchLiveSeenRef.current = {
        roomId: resolvedWatchRoomId,
        hasBeenLive: true
      };
      setWatchStreamEnded(false);
      return;
    }

    const current = watchLiveSeenRef.current;
    if (current.roomId === resolvedWatchRoomId && current.hasBeenLive) {
      setWatchStreamEnded(true);
    }
  }, [
    chat.roomStateReady,
    chat.streamState.isLive,
    page,
    resolvedWatchRoomId,
    watchRouteCommitted,
    watchingNamespace,
    watchingTestChannel
  ]);

  useEffect(() => {
    if (!requireLoginForLive || authState.loading || !pendingProtectedPageRef.current) {
      return;
    }

    const pendingPage = pendingProtectedPageRef.current;
    pendingProtectedPageRef.current = null;
    selectPageWithGuard(pendingPage.nextPage, pendingPage.options);
  }, [authState.loading, authState.user, requireLoginForLive]);

  useEffect(() => {
    if (!requireLoginForLive || authState.loading || authState.user || page !== "live") {
      return;
    }

    openSettingsLogin({ updateAutorun: false });
  }, [authState.loading, authState.user, page, requireLoginForLive]);

  useEffect(() => {
    if (!player.playerSession) {
      return;
    }

    if (page === "watch" && watchRoom) {
      return;
    }

    void player.stopPlayer();
  }, [page, player.playerSession, watchRoom]);

  useEffect(() => {
    if (
      page !== "watch"
      || !watchRouteCommitted
      || !watchingNamespace
      || !directWatchNamespace
    ) {
      return;
    }

    if (
      !player.playerSession
      || player.playerSession.relayUrl !== resolvedWatchRelayUrl
      || player.playerSession.namespace !== resolvedWatchNamespace
    ) {
      void player.startPlayer();
    }
  }, [
    directWatchNamespace,
    page,
    player.playerSession,
    resolvedWatchNamespace,
    resolvedWatchRelayUrl,
    watchRouteCommitted,
    watchingNamespace
  ]);

  useEffect(() => {
    if (
      page !== "watch"
      || !watchRouteCommitted
      || watchingNamespace
      || !resolvedWatchRoomId
      || !chat.roomStateReady
      || !chat.streamState.isLive
      || !chat.roomMeta.stream.relayUrl
      || !chat.roomMeta.stream.namespace
    ) {
      return;
    }

    if (
      !player.playerSession
      || player.playerSession.relayUrl !== chat.roomMeta.stream.relayUrl
      || player.playerSession.namespace !== chat.roomMeta.stream.namespace
    ) {
      void player.startPlayer();
    }
  }, [
    chat.roomMeta.stream.namespace,
    chat.roomMeta.stream.relayUrl,
    chat.roomStateReady,
    chat.streamState.isLive,
    page,
    player.playerSession,
    resolvedWatchRoomId,
    watchRouteCommitted,
    watchingNamespace
  ]);

  useEffect(() => {
    if (
      page !== "watch"
      || !watchRouteCommitted
      || watchingNamespace
      || !resolvedWatchRoomId
      || !chat.streamState.isLive
      || !chat.roomMeta.stream.relayUrl
      || !chat.roomMeta.stream.namespace
    ) {
      return;
    }

    const startedAt = chat.streamState.startedAt || "__live__";
    const current = handledWatchStreamStartRef.current;
    if (current.roomId === resolvedWatchRoomId && current.startedAt === startedAt) {
      return;
    }

    handledWatchStreamStartRef.current = {
      roomId: resolvedWatchRoomId,
      startedAt
    };
    void player.startPlayer();
  }, [
    chat.roomMeta.stream.namespace,
    chat.roomMeta.stream.relayUrl,
    chat.streamState.isLive,
    chat.streamState.startedAt,
    page,
    resolvedWatchRoomId,
    watchRouteCommitted,
    watchingNamespace
  ]);

  useEffect(() => {
    if (
      page !== "watch"
      || !watchRouteCommitted
      || watchingNamespace
      || !resolvedWatchRoomId
      || !chat.roomStateReady
      || chat.streamState.isLive
      || !player.playerSession
    ) {
      return;
    }

    handledWatchStreamStartRef.current = { roomId: "", startedAt: "" };
    void player.stopPlayer({
      finalStatus: "直播已结束",
      finalKind: "ended",
      logMessage: "stopped player because stream ended",
    });
  }, [
    chat.roomStateReady,
    chat.streamState.isLive,
    page,
    player.playerSession,
    resolvedWatchRoomId,
    watchRouteCommitted,
    watchingNamespace
  ]);

  useEffect(() => {
    window.__moqTest = {
      startPlayer: async () => {
        await player.startPlayer();
      },
      stopPlayer: async () => {
        await player.stopPlayer();
      },
      getState: () => ({
        playerStatus: player.playerStatus,
        namespace: pageRef.current === "live" ? liveRoomRef.current : watchRoomRef.current,
        watchNamespace: watchRoomRef.current,
        liveNamespace: liveRoomRef.current
      }),
      compareScreenshotSignature: async (dataUrl) => player.compareSyntheticPlaybackFromDataUrl(dataUrl)
    };

    return () => {
      delete window.__moqTest;
    };
  }, [player.playerStatus, watchRoom, liveRoom]);

  useEffect(() => {
    const watchTarget = watchRoom.trim();
    if (!player.playerSession?.namespace?.trim() || !watchTarget) {
      return;
    }

    setWatchHistoryItems(persistWatchHistoryEntry({
      room: watchTarget,
      relayUrl,
      relayHost
    }));
  }, [player.playerSession?.key, relayUrl, relayHost, watchRoom]);

  function openWatchHistoryItem(item) {
    setRelayUrlValue(item.relayUrl || relayUrl);
    beginWatch(item.room);
  }

  return (
    <>
      <div className={`app-container${mobileWatchJoinedClass}`}>
        <header className="topbar">
          <a
            href={window.location.pathname}
            className="brand brand-button"
            onClick={(event) => {
              event.preventDefault();
              returnToWatchHome();
            }}
            aria-label={`返回${siteTitle}收看页`}
          >
            <span className="brand-title">{siteTitle}</span>
          </a>

          <div className="topbar-right">
            <form
              className="topbar-watch-form"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                const nextWatchRoom = topbarWatchRoom.trim();
                if (!nextWatchRoom) {
                  return;
                }
                beginWatch(nextWatchRoom);
                setTopbarWatchRoom("");
              }}
            >
              <input
                id="topbar-watch-room"
                name="watch_room"
                type="text"
                value={topbarWatchRoom}
                placeholder="输入主播号"
                aria-label="输入主播号进入直播间"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck="false"
                enterKeyHint="go"
                onInput={(event) => {
                  setTopbarWatchRoom(event.currentTarget.value);
                }}
              />
            </form>
            <DesktopNavigation currentPage={page} onSelect={(nextPage) => selectPageWithGuard(nextPage)} />
            <div className="auth-toolbar">
              <div
                ref={authMenuRef}
                className="auth-menu-shell"
                onMouseEnter={openAuthMenu}
                onMouseLeave={scheduleCloseAuthMenu}
                onFocus={openAuthMenu}
                onBlur={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (nextTarget instanceof Node && authMenuRef.current?.contains(nextTarget)) {
                    return;
                  }
                  scheduleCloseAuthMenu();
                }}
              >
                <button
                  type="button"
                  className="auth-avatar-button"
                  aria-haspopup="menu"
                  aria-expanded={authMenuOpen ? "true" : "false"}
                  aria-label={authState.user ? `账户菜单：${avatarLabel}` : "账户菜单：匿名用户"}
                  title={avatarTitle}
                  onClick={() => {
                    setAuthMenuOpen((current) => !current);
                  }}
                >
                  <UserAvatar
                    avatarUrl={authState.user?.avatarUrl}
                    displayName={authState.user?.displayName}
                    email={authState.user?.email}
                    className={`auth-avatar${avatarStateClass}`}
                    imgAlt={authState.user?.displayName || "用户头像"}
                    imgWidth={40}
                    imgHeight={40}
                    loading={authState.loading}
                    loadingClassName="auth-avatar-loading-spinner"
                    iconClassName="auth-avatar-icon"
                  />
                </button>

                <div className={`auth-menu-dropdown${authMenuOpen ? " is-open" : ""}`} role="menu" aria-label="账户">
                  {authState.user ? (
                    <>
                      <button
                        type="button"
                        className="auth-menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeAuthMenu();
                          selectPage("settings", { updateAutorun: false });
                        }}
                      >
                        个人中心
                      </button>
                      <button
                        type="button"
                        className="auth-menu-item"
                        role="menuitem"
                        onClick={() => {
                          closeAuthMenu();
                          void logout();
                        }}
                      >
                        退出登录
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="auth-menu-item"
                      role="menuitem"
                      onClick={() => {
                        closeAuthMenu();
                        startMicrosoftLogin();
                      }}
                      disabled={authState.loading || !authState.available}
                      title={!authState.available ? "Auth API 未连接" : undefined}
                    >
                      立即登录
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="page-shell">
          <WatchPage
            hidden={page !== "watch"}
            watchJoined={watchJoined}
            roomLabel={watchRoomLabel}
            roomTitle={watchRoomTitle}
            hostDisplayName={watchHostDisplayName}
            hostAvatarUrl={watchHostAvatarUrl}
            hostIcon={watchHostIcon}
            watchLink={watchPageLink}
            stageLoading={watchStageLoading}
            stageMessage={watchStageMessage}
            chatRoom={watchChatRoom}
            chatRoomLabel={watchChatRoomLabel}
            playerStatus={effectivePlayerStatus}
            playerBadge={playerBadge}
            fullscreenActive={player.fullscreenActive}
            playerPaused={watchingTestChannel ? false : player.playerPaused}
            playerMuted={watchingTestChannel ? true : player.playerMuted}
            showTapToUnmute={watchingTestChannel ? false : player.showTapToUnmute}
            playerOrientation={effectivePlayerOrientation}
            room={watchRoom}
            onRoomInput={(event) => {
              setWatchRoomValue(event.currentTarget.value);
            }}
            onStart={() => {
              beginWatch();
            }}
            onOpenRoom={(nextRoom) => {
              beginWatch(nextRoom);
            }}
            onStop={() => {
              autorunRef.current = false;
              setWatchRouteCommitted(false);
              setWatchRoomValue("");
              selectPageWithGuard("watch", { updateAutorun: false });
              void player.stopPlayer();
            }}
            onTogglePlayback={() => {
              void player.togglePlayerPlayback().catch((error) => {
                log(`toggle playback failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            onToggleMute={() => {
              void player.togglePlayerMute().catch((error) => {
                log(`toggle mute failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            onDismissTapToUnmute={() => {
              void player.dismissTapToUnmute().catch((error) => {
                log(`tap to unmute failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            onFullscreen={() => {
              void player.fullscreenPlayer().catch((error) => {
                log(`fullscreen failed: ${error instanceof Error ? error.message : String(error)}`);
              });
            }}
            stageRef={player.watchStageRef}
            playerSession={effectivePlayerSession}
            playerRef={player.playerRef}
            testPlayback={watchTestChannel}
            authAvailable={authState.available}
            authLoading={authState.loading}
            authUser={authState.user}
            chatMessages={chat.messages}
            chatDraft={chat.draft}
            chatConnectionState={chat.connectionState}
            chatOnlineCount={chat.onlineCount}
            chatReadOnly={chat.readOnly}
            chatError={chat.chatError}
            onChatDraftChange={(event) => {
              chat.setDraft(event.currentTarget.value);
            }}
            onChatSend={() => {
              chat.sendMessage();
            }}
            onChatRequireLogin={() => {
              setLoginPromptOpen(true);
            }}
          />

          {livePageMounted ? (
            <Suspense fallback={<LivePageFallback hidden={page !== "live"} />}>
              <LiveRoute
                hidden={page !== "live"}
                page={page}
                pageRef={pageRef}
                relayUrl={relayUrl}
                relayUrlRef={relayUrlRef}
                liveRoom={liveRoom}
                liveRoomRef={liveRoomRef}
                setLiveRoomValue={setLiveRoomValue}
                selectPageWithGuard={selectPageWithGuard}
                authState={authState}
                log={log}
                onRequireLogin={() => {
                  setLoginPromptOpen(true);
                }}
                syntheticSessionRef={syntheticSessionRef}
              />
            </Suspense>
          ) : null}

          <SettingsPage
            hidden={page !== "settings"}
            relayUrl={relayUrl}
            relayHost={relayHost}
            buildLabel={buildLabel}
            authAvailable={authState.available}
            authLoading={authState.loading}
            authUser={authState.user}
            onMicrosoftLogin={startMicrosoftLogin}
            onLogout={() => {
              void logout();
            }}
            onUpdateDisplayName={(displayName) => updateDisplayName(displayName)}
            onUpdateHandle={(handle) => updateHandle(handle)}
            onUpdateAvatar={(file) => updateAvatar(file)}
            onRelayUrlInput={(event) => {
              autorunRef.current = false;
              setRelayUrlValue(event.currentTarget.value);
            }}
            watchHistoryItems={watchHistoryItems}
            onOpenWatchHistoryItem={openWatchHistoryItem}
            onClearWatchHistory={() => {
              setWatchHistoryItems(clearWatchHistory());
            }}
            loginPanelRequestKey={settingsLoginPanelRequestKey}
            logText={logText}
            logRef={logRef}
          />
        </main>
      </div>

      {mobileWatchSessionActive ? null : (
        <MobileNavigation currentPage={page} onSelect={(nextPage) => selectPageWithGuard(nextPage)} />
      )}
      <MobilePanelPresence open={loginPromptOpen}>
        {({ transitionClassName }) => (
          <LoginDrawer
            authAvailable={authState.available}
            authLoading={authState.loading}
            onClose={() => {
              setLoginPromptOpen(false);
            }}
            onMicrosoftLogin={startMicrosoftLogin}
            transitionClassName={transitionClassName}
          />
        )}
      </MobilePanelPresence>
    </>
  );
}
