import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { DesktopNavigation, MobileNavigation } from "./components/Navigation.jsx";
import { LoginDrawer } from "./components/LoginDrawer.jsx";
import { MobilePanelPresence } from "./components/MobilePanelPresence.jsx";
import { UserAvatar } from "./components/UserAvatar.jsx";
import { SettingsPage } from "./components/SettingsPage.jsx";
import { WatchPage } from "./components/WatchPage.jsx";
import { LiveActivationGate } from "./components/live/LiveActivationGate.jsx";
import { LiveActivationLoading } from "./components/live/LiveActivationLoading.jsx";
import { useAuthController } from "./hooks/useAuthController.js";
import { useChatController } from "./hooks/useChatController.js";
import { useLiveRoomActivation } from "./hooks/useLiveRoomActivation.js";
import { useCompactViewport, usePortraitViewport } from "./hooks/useMediaQuery.js";
import { usePlayerController } from "./hooks/usePlayerController.js";
import { useRouteController } from "./hooks/useRouteController.js";
import { buildWatchLink, getRelayHostValue, writeRoute } from "./lib/routeState.js";
import { clearWatchHistory, persistWatchHistoryEntry, readWatchHistory } from "./lib/watchHistory.js";
import { describePlayerState, RETAINED_PLAYER_LAYOUT_STATES } from "./lib/status.js";
import { getWatchTestChannel } from "./lib/watchTestChannels.js";
import { createApiError, getAppErrorMessage } from "./lib/appErrors.js";
import {
  setPushPermissionReminderDismissed,
  shouldPromptForPushPermission,
  subscribeCurrentUserToWebPush,
} from "./lib/webPush.js";
import {
  DEFAULT_STREAM_PROTOCOL,
  STREAM_PROTOCOL_MOQ,
  STREAM_PROTOCOL_WEBRTC,
  normalizeStreamProtocol,
} from "./lib/streamProtocol.js";

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

function getWatchPlayerLayoutScopeKey({
  normalizedWatchInput,
  watchTestChannel,
  watchingNamespace,
  directWatchNamespace,
  watchHandle,
}) {
  if (!normalizedWatchInput) {
    return "";
  }

  if (watchTestChannel) {
    return `test:${watchTestChannel.id}`;
  }

  if (watchingNamespace) {
    return `namespace:${directWatchNamespace || normalizedWatchInput.toLowerCase()}`;
  }

  return `room:${watchHandle || normalizedWatchInput.toLowerCase()}`;
}

function shouldUseWatchPlayerShell({
  page,
  watchJoined,
  playerSession,
  playerStatusKind,
  playerOrientation,
}) {
  if (page !== "watch" || !watchJoined) {
    return false;
  }

  if (playerSession) {
    return true;
  }

  return (
    playerOrientation === "portrait" &&
    RETAINED_PLAYER_LAYOUT_STATES.has(playerStatusKind)
  );
}

function getDesiredWatchPlaybackTarget({
  page,
  watchRouteCommitted,
  watchingNamespace,
  directWatchNamespace,
  resolvedWatchRoomId,
  roomStateReady,
  isLive,
  playbackReady,
  protocol,
  relayUrl,
  namespace,
  webRtcUrl,
  startedAt,
}) {
  if (page !== "watch" || !watchRouteCommitted) {
    return null;
  }

  if (watchingNamespace) {
    if (!directWatchNamespace) {
      return null;
    }
    const roomId = `namespace:${directWatchNamespace.toLowerCase()}`;
    return {
      roomId,
      startedAt: "__namespace__",
      protocol: STREAM_PROTOCOL_MOQ,
      relayUrl,
      namespace,
      webRtcUrl: "",
    };
  }

  if (!resolvedWatchRoomId || !roomStateReady || !isLive || !playbackReady) {
    return null;
  }

  const targetStartedAt = startedAt || "__live__";
  return {
    roomId: resolvedWatchRoomId,
    startedAt: targetStartedAt,
    protocol,
    relayUrl,
    namespace,
    webRtcUrl,
  };
}

function playerSessionMatchesWatchTarget(playerSession, target) {
  if (!playerSession || !target || playerSession.protocol !== target.protocol) {
    return false;
  }

  if (target.protocol === STREAM_PROTOCOL_WEBRTC) {
    return (
      playerSession.webRtcUrl === target.webRtcUrl &&
      playerSession.namespace === target.namespace
    );
  }

  return (
    playerSession.relayUrl === target.relayUrl &&
    playerSession.namespace === target.namespace
  );
}

function watchPlaybackRecordMatches(record, target) {
  return (
    record.roomId === target.roomId &&
    record.startedAt === target.startedAt &&
    record.protocol === target.protocol
  );
}

let liveRouteModulePromise = null;

function loadLiveRoute() {
  if (!liveRouteModulePromise) {
    liveRouteModulePromise = import("./components/LiveRoute.jsx")
      .then((module) => ({ default: module.LiveRoute }))
      .catch((error) => {
        liveRouteModulePromise = null;
        throw error;
      });
  }

  return liveRouteModulePromise;
}

const LiveRoute = lazy(loadLiveRoute);

const LIVE_ROUTE_FRAME_EXIT_MS = 280;

function LiveRouteFrame({ children, closing, shellMode }) {
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

function LiveRouteActivationContent({ children, onClose }) {
  return (
    <div className="live-route-activation-content" role="status" aria-live="polite">
      <div className="live-page-top">
        <button
          type="button"
          className="live-page-close"
          onClick={onClose}
          aria-label="退出开播页"
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

export function App() {
  const siteTitle = __APP_TITLE__;
  const [logText, setLogText] = useState("");
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
  const [settingsLoginPanelRequestKey, setSettingsLoginPanelRequestKey] = useState(0);
  const [watchHistoryItems, setWatchHistoryItems] = useState(() => readWatchHistory());
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [liveRouteReady, setLiveRouteReady] = useState(false);
  const [liveRouteClosing, setLiveRouteClosing] = useState(false);
  const [livePageMounted, setLivePageMounted] = useState(
    () => new URLSearchParams(window.location.search).get("p") === "l"
  );
  const [liveBackdropPage, setLiveBackdropPage] = useState(() => {
    const initialPage = new URLSearchParams(window.location.search).get("p");
    return initialPage === "s" ? "settings" : "watch";
  });
  const [watchRouteCommitted, setWatchRouteCommitted] = useState(() => Boolean(new URLSearchParams(window.location.search).get("r")?.trim()));
  const logRef = useRef(null);
  const authMenuRef = useRef(null);
  const authMenuCloseTimerRef = useRef(null);
  const liveRouteCloseTimerRef = useRef(null);
  const handledWatchPlaybackRef = useRef({ roomId: "", startedAt: "", protocol: "" });
  const handledCohostPlaybackRef = useRef({ roomId: "", startedAt: "", protocol: "" });
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

  function preloadLiveRoute() {
    void loadLiveRoute().catch((error) => {
      log(`preload live route failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }

  const compactViewport = useCompactViewport();
  const portraitViewport = usePortraitViewport();
  const liveRouteShellMode = compactViewport || portraitViewport ? "mobile" : "desktop";

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

  useEffect(() => () => {
    if (liveRouteCloseTimerRef.current) {
      clearTimeout(liveRouteCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const startPreload = () => {
      if (!cancelled) {
        preloadLiveRoute();
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(startPreload, { timeout: 4500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(startPreload, 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
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
    refreshAuthState,
    startMicrosoftLogin,
    logout,
    updateDisplayName,
    updateHandle,
    updateAvatar
  } = useAuthController({ log });
  const {
    liveActivation,
    liveChatRoomId,
    liveRoomDetails,
    setLiveRoomDetails,
    activateLiveRoom,
  } = useLiveRoomActivation({
    page,
    userId: authState.user?.id || "",
    log,
  });

  const [watchRoomResolution, setWatchRoomResolution] = useState({
    loading: false,
    error: "",
    roomId: "",
    hostUserId: "",
    hostHandle: "",
    hostDisplayName: "",
    hostAvatarUrl: "",
    hostGender: "",
    hostBirthDate: "",
    hostBio: "",
    lastLocationProvince: "",
    lastLocationUpdatedAt: "",
    hostFollowerCount: 0,
    hostFollowingCount: 0,
    title: "",
    welcomeMessage: "",
    coverUrl: ""
  });
  const [watchFollowState, setWatchFollowState] = useState({
    hostUserId: "",
    following: false,
    notifyLiveStarted: false,
    followerCount: 0,
    followingCount: 0,
    loading: false,
    busy: false,
    notifyBusy: false,
    error: ""
  });
  const [watchStreamEnded, setWatchStreamEnded] = useState(false);
  const [topbarWatchRoom, setTopbarWatchRoom] = useState("");
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [pushPromptDismissChecked, setPushPromptDismissChecked] = useState(false);
  const [pushPromptBusy, setPushPromptBusy] = useState(false);
  const [pushPromptError, setPushPromptError] = useState("");

  const watchPlaybackRelayUrlRef = useRef("");
  const watchPlaybackNamespaceRef = useRef("");
  const watchPlaybackProtocolRef = useRef(DEFAULT_STREAM_PROTOCOL);
  const watchPlaybackWebRtcUrlRef = useRef("");
  const cohostPlaybackRelayUrlRef = useRef("");
  const cohostPlaybackNamespaceRef = useRef("");
  const cohostPlaybackProtocolRef = useRef(DEFAULT_STREAM_PROTOCOL);
  const cohostPlaybackWebRtcUrlRef = useRef("");

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
  const watchPlayerLayoutScopeKey = getWatchPlayerLayoutScopeKey({
    normalizedWatchInput,
    watchTestChannel,
    watchingNamespace,
    directWatchNamespace,
    watchHandle,
  });

  const player = usePlayerController({
    initialAutorun: false,
    relayUrlRef: watchPlaybackRelayUrlRef,
    roomRef: watchPlaybackNamespaceRef,
    streamProtocolRef: watchPlaybackProtocolRef,
    webRtcUrlRef: watchPlaybackWebRtcUrlRef,
    setLogText,
    log,
    syntheticSessionRef,
    layoutScopeKey: watchPlayerLayoutScopeKey,
  });
  const cohostPlayer = usePlayerController({
    initialAutorun: false,
    relayUrlRef: cohostPlaybackRelayUrlRef,
    roomRef: cohostPlaybackNamespaceRef,
    streamProtocolRef: cohostPlaybackProtocolRef,
    webRtcUrlRef: cohostPlaybackWebRtcUrlRef,
    setLogText,
    log,
    syntheticSessionRef,
    layoutScopeKey: `${watchPlayerLayoutScopeKey}:cohost`,
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
  const resolvedWatchProtocol = watchingTestChannel || watchingNamespace
    ? STREAM_PROTOCOL_MOQ
    : normalizeStreamProtocol(chat.roomMeta.stream.protocol);
  const resolvedWatchWebRtcUrl = watchingTestChannel || watchingNamespace
    ? ""
    : chat.roomMeta.stream.webRtcUrl || "";
  const watchUsesMoqPlayback = resolvedWatchProtocol === STREAM_PROTOCOL_MOQ;
  const watchUsesWebRtcPlayback = resolvedWatchProtocol === STREAM_PROTOCOL_WEBRTC;
  const resolvedWatchPlaybackReady = watchUsesMoqPlayback
    ? Boolean(resolvedWatchRelayUrl && resolvedWatchNamespace)
    : Boolean(resolvedWatchWebRtcUrl);
  const cohostActive = !watchingTestChannel && !watchingNamespace ? chat.cohostActive : null;
  const cohostStream = cohostActive?.stream || null;
  const resolvedCohostProtocol = normalizeStreamProtocol(cohostStream?.protocol);
  const resolvedCohostRelayUrl = cohostStream?.relayUrl || "";
  const resolvedCohostNamespace = cohostStream?.namespace || "";
  const resolvedCohostWebRtcUrl = cohostStream?.webRtcUrl || "";
  const cohostPlaybackReady = resolvedCohostProtocol === STREAM_PROTOCOL_MOQ
    ? Boolean(resolvedCohostRelayUrl && resolvedCohostNamespace)
    : Boolean(resolvedCohostWebRtcUrl);
  const watchJoined = page === "watch" && watchRouteCommitted && Boolean(normalizedWatchInput);
  const watchStageLoading = !watchingTestChannel
    && (
      watchingNamespace
        ? Boolean(directWatchNamespace)
        : watchRoomResolution.loading
          || (!watchRoomResolution.error && (!resolvedWatchRoomId || !chat.roomStateReady))
          || (chat.streamState.isLive && !resolvedWatchPlaybackReady)
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
              ? (resolvedWatchPlaybackReady ? "" : "加载中")
              : watchStreamEnded
                ? "直播已结束"
                : "尚未开播";

  watchPlaybackRelayUrlRef.current = resolvedWatchRelayUrl;
  watchPlaybackNamespaceRef.current = resolvedWatchNamespace;
  watchPlaybackProtocolRef.current = resolvedWatchProtocol;
  watchPlaybackWebRtcUrlRef.current = resolvedWatchWebRtcUrl;
  cohostPlaybackRelayUrlRef.current = resolvedCohostRelayUrl;
  cohostPlaybackNamespaceRef.current = resolvedCohostNamespace;
  cohostPlaybackProtocolRef.current = resolvedCohostProtocol;
  cohostPlaybackWebRtcUrlRef.current = resolvedCohostWebRtcUrl;

  const watchRoomLabel = watchingTestChannel
    ? watchTestChannel.label
    : watchingNamespace
    ? (directWatchNamespace ? `ns:${directWatchNamespace}` : "等待输入 namespace")
    : watchRoomResolution.hostDisplayName
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
    : watchRoomResolution.hostDisplayName
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
    : watchRoomResolution.hostDisplayName
      || watchRoomResolution.hostHandle
      || watchHandle
      || "";
  const watchHostUserId = watchingNamespace || watchingTestChannel
    ? ""
    : watchRoomResolution.hostUserId || "";
  const watchHostAvatarUrl = watchingNamespace || watchingTestChannel ? "" : watchRoomResolution.hostAvatarUrl || "";
  const watchHostLocationProvince = watchingNamespace || watchingTestChannel
    ? "位置未知"
    : chat.streamState.isLive
      ? chat.roomLocation.province || watchRoomResolution.lastLocationProvince || "位置未知"
      : watchRoomResolution.lastLocationProvince || "位置未知";
  const watchHostLocationAvailable = !watchingNamespace
    && !watchingTestChannel
    && (
      chat.streamState.isLive
        ? chat.roomLocation.hasLocation === true || Boolean(watchRoomResolution.lastLocationProvince)
        : Boolean(watchRoomResolution.lastLocationProvince)
    );
  const watchHostDistanceAvailable = !watchingNamespace
    && !watchingTestChannel
    && chat.streamState.isLive
    && chat.roomLocation.hasLocation === true;
  const watchHostLocationUpdatedAt = watchingNamespace || watchingTestChannel
    ? ""
    : chat.streamState.isLive
      ? chat.roomLocation.updatedAt || ""
      : watchRoomResolution.lastLocationUpdatedAt || "";
  const watchHostFollowerCount =
    watchFollowState.hostUserId === watchHostUserId
      ? watchFollowState.followerCount
      : watchRoomResolution.hostFollowerCount;
  const watchHostFollowingCount =
    watchFollowState.hostUserId === watchHostUserId
      ? watchFollowState.followingCount
      : watchRoomResolution.hostFollowingCount;
  const watchRoomCoverUrl = watchingNamespace || watchingTestChannel ? "" : watchRoomResolution.coverUrl || "";
  const watchWelcomeMessage = watchingNamespace || watchingTestChannel ? "" : watchRoomResolution.welcomeMessage || "";
  const siteIconUrl = "/icons/icon-192.png";
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
  const effectivePlayerStarted = watchingTestChannel ? true : player.playerStarted;
  const effectivePlayerFreezeFrameUrl = watchingTestChannel ? "" : player.playerFreezeFrameUrl;
  const effectivePlayerOrientation = watchTestChannel?.orientation ?? player.playerOrientation;
  const effectivePlayerStatusKind = watchingTestChannel ? "live" : player.playerStatusKind;
  const effectivePlayerStatus = watchTestChannel?.statusMessage ?? player.playerStatus;
  const playerBadge = describePlayerState(effectivePlayerStatusKind);
  const buildLabel = `Build ${__BUILD_HASH__}`;
  const watchPlayerShellActive = shouldUseWatchPlayerShell({
    page,
    watchJoined,
    playerSession: effectivePlayerSession,
    playerStatusKind: effectivePlayerStatusKind,
    playerOrientation: effectivePlayerOrientation,
  });
  const watchRoomShellActive = page === "watch" && watchJoined;
  const mobileWatchJoinedClass = watchRoomShellActive ? " app-container-watch-joined" : "";
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
  const showWatchPage = page === "watch" || (page === "live" && liveBackdropPage === "watch");
  const showSettingsPage = page === "settings" || (page === "live" && liveBackdropPage === "settings");

  useEffect(() => {
    if (!showSettingsPage || authState.loading || !authState.user?.id) {
      return;
    }

    void refreshAuthState();
  }, [showSettingsPage, authState.loading, authState.user?.id]);

  useEffect(() => {
    if (page === "live") {
      setLivePageMounted(true);
    }
  }, [page]);

  function selectPagePreservingLiveBackdrop(nextPage, options) {
    if (nextPage === "live" && pageRef.current !== "live") {
      setLivePageMounted(true);
      setLiveRouteReady(false);
      setLiveRouteClosing(false);
      preloadLiveRoute();
      setLiveBackdropPage(pageRef.current === "settings" ? "settings" : "watch");
    }

    selectPage(nextPage, options);
  }

  function openSettingsLogin(options) {
    setAuthMenuOpen(false);
    pendingProtectedPageRef.current = null;
    selectPagePreservingLiveBackdrop("settings", options);
    setSettingsLoginPanelRequestKey((current) => current + 1);
  }

  function returnToWatchHomeNow() {
    if (liveRouteCloseTimerRef.current) {
      clearTimeout(liveRouteCloseTimerRef.current);
      liveRouteCloseTimerRef.current = null;
    }
    setLiveRouteClosing(false);
    pendingProtectedPageRef.current = null;
    autorunRef.current = false;
    setLoginPromptOpen(false);
    closeAuthMenu();
    setWatchRouteCommitted(false);
    setWatchRoomValue("");
    selectPagePreservingLiveBackdrop("watch", { updateAutorun: false });
    void player.stopPlayer();
  }

  function returnToWatchHome() {
    if (pageRef.current !== "live") {
      returnToWatchHomeNow();
      return;
    }

    if (liveRouteCloseTimerRef.current) {
      clearTimeout(liveRouteCloseTimerRef.current);
    }
    setLiveRouteClosing(true);
    liveRouteCloseTimerRef.current = window.setTimeout(() => {
      liveRouteCloseTimerRef.current = null;
      returnToWatchHomeNow();
    }, LIVE_ROUTE_FRAME_EXIT_MS);
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
      selectPagePreservingLiveBackdrop(nextPage, options);
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
    selectPagePreservingLiveBackdrop(nextPage, options);
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

  async function toggleWatchFollow() {
    const targetUserId = watchHostUserId;
    if (!targetUserId || authState.user?.id === targetUserId || watchFollowState.busy) {
      return;
    }

    if (!authState.user?.id) {
      setLoginPromptOpen(true);
      return;
    }

    const currentlyFollowing =
      watchFollowState.hostUserId === targetUserId && watchFollowState.following;
    setWatchFollowState((current) => ({
      hostUserId: targetUserId,
      following: current.hostUserId === targetUserId ? current.following : false,
      notifyLiveStarted: current.hostUserId === targetUserId ? current.notifyLiveStarted : false,
      followerCount: current.hostUserId === targetUserId ? current.followerCount : watchRoomResolution.hostFollowerCount,
      followingCount: current.hostUserId === targetUserId ? current.followingCount : watchRoomResolution.hostFollowingCount,
      loading: false,
      busy: true,
      notifyBusy: false,
      error: ""
    }));

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(targetUserId)}/follow`, {
        method: currentlyFollowing ? "DELETE" : "POST",
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw createApiError(payload, "follow_update_failed", { status: response.status });
      }
      setWatchFollowState({
        hostUserId: targetUserId,
        following: Boolean(payload.following),
        notifyLiveStarted: Boolean(payload.following && payload.notifyLiveStarted),
        followerCount: Math.max(0, Number(payload.followerCount ?? watchRoomResolution.hostFollowerCount)),
        followingCount: Math.max(0, Number(payload.followingCount ?? watchRoomResolution.hostFollowingCount)),
        loading: false,
        busy: false,
        notifyBusy: false,
        error: ""
      });
      if (!currentlyFollowing && payload.following && shouldPromptForPushPermission()) {
        setPushPromptDismissChecked(false);
        setPushPromptError("");
        setPushPromptOpen(true);
      }
    } catch (error) {
      const message = getAppErrorMessage(error);
      setWatchFollowState((current) => ({
        hostUserId: targetUserId,
        following: current.hostUserId === targetUserId ? current.following : currentlyFollowing,
        notifyLiveStarted: current.hostUserId === targetUserId ? current.notifyLiveStarted : false,
        followerCount: current.hostUserId === targetUserId ? current.followerCount : watchRoomResolution.hostFollowerCount,
        followingCount: current.hostUserId === targetUserId ? current.followingCount : watchRoomResolution.hostFollowingCount,
        loading: false,
        busy: false,
        notifyBusy: false,
        error: message
      }));
      log(`follow update failed: ${message}`);
    }
  }

  async function toggleWatchLiveNotification() {
    const targetUserId = watchHostUserId;
    if (
      !targetUserId ||
      authState.user?.id === targetUserId ||
      watchFollowState.hostUserId !== targetUserId ||
      !watchFollowState.following ||
      watchFollowState.notifyBusy
    ) {
      return;
    }

    if (!authState.user?.id) {
      setLoginPromptOpen(true);
      return;
    }

    const nextNotifyLiveStarted = !watchFollowState.notifyLiveStarted;
    setWatchFollowState((current) => ({
      hostUserId: targetUserId,
      following: current.hostUserId === targetUserId ? current.following : false,
      notifyLiveStarted: current.hostUserId === targetUserId ? current.notifyLiveStarted : false,
      followerCount: current.hostUserId === targetUserId ? current.followerCount : watchRoomResolution.hostFollowerCount,
      followingCount: current.hostUserId === targetUserId ? current.followingCount : watchRoomResolution.hostFollowingCount,
      loading: false,
      busy: false,
      notifyBusy: true,
      error: ""
    }));

    try {
      const response = await fetch(`/api/users/${encodeURIComponent(targetUserId)}/follow`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ notifyLiveStarted: nextNotifyLiveStarted })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw createApiError(payload, "follow_update_failed", { status: response.status });
      }
      setWatchFollowState({
        hostUserId: targetUserId,
        following: Boolean(payload.following),
        notifyLiveStarted: Boolean(payload.following && payload.notifyLiveStarted),
        followerCount: Math.max(0, Number(payload.followerCount ?? watchRoomResolution.hostFollowerCount)),
        followingCount: Math.max(0, Number(payload.followingCount ?? watchRoomResolution.hostFollowingCount)),
        loading: false,
        busy: false,
        notifyBusy: false,
        error: ""
      });
      if (nextNotifyLiveStarted && payload.following && payload.notifyLiveStarted && shouldPromptForPushPermission()) {
        setPushPromptDismissChecked(false);
        setPushPromptError("");
        setPushPromptOpen(true);
      }
    } catch (error) {
      const message = getAppErrorMessage(error);
      setWatchFollowState((current) => ({
        hostUserId: targetUserId,
        following: current.hostUserId === targetUserId ? current.following : true,
        notifyLiveStarted: current.hostUserId === targetUserId ? current.notifyLiveStarted : !nextNotifyLiveStarted,
        followerCount: current.hostUserId === targetUserId ? current.followerCount : watchRoomResolution.hostFollowerCount,
        followingCount: current.hostUserId === targetUserId ? current.followingCount : watchRoomResolution.hostFollowingCount,
        loading: false,
        busy: false,
        notifyBusy: false,
        error: message
      }));
      log(`live notification preference update failed: ${message}`);
    }
  }

  function closePushPrompt() {
    if (pushPromptDismissChecked) {
      setPushPermissionReminderDismissed(true);
    }
    setPushPromptOpen(false);
    setPushPromptError("");
    setPushPromptBusy(false);
  }

  async function enablePushNotifications() {
    setPushPromptBusy(true);
    setPushPromptError("");
    try {
      const subscribed = await subscribeCurrentUserToWebPush();
      if (pushPromptDismissChecked || subscribed) {
        setPushPermissionReminderDismissed(true);
      }
      setPushPromptOpen(false);
    } catch (error) {
      setPushPromptError("通知开启失败，请稍后再试");
      log(`push subscription failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPushPromptBusy(false);
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
    selectPagePreservingLiveBackdrop("watch", { updateAutorun: false });
  }, []);

  useEffect(() => {
    if (page !== "watch" || !watchRouteCommitted || watchingTestChannel || watchingNamespace || !watchHandle) {
      setWatchRoomResolution({
        loading: false,
        error: "",
        roomId: "",
        hostUserId: "",
        hostHandle: "",
        hostDisplayName: "",
        hostAvatarUrl: "",
        hostGender: "",
        hostBirthDate: "",
        hostBio: "",
        lastLocationProvince: "",
        lastLocationUpdatedAt: "",
        hostFollowerCount: 0,
        hostFollowingCount: 0,
        title: "",
        welcomeMessage: "",
        coverUrl: ""
      });
      return;
    }

    let cancelled = false;

    async function resolveWatchRoom() {
      setWatchRoomResolution((current) => {
        if (current.hostHandle === watchHandle && current.roomId) {
          return {
            ...current,
            loading: false,
            error: "",
          };
        }
        return {
          loading: true,
          error: "",
          roomId: "",
          hostUserId: "",
          hostHandle: "",
          hostDisplayName: "",
          hostAvatarUrl: "",
          hostGender: "",
          hostBirthDate: "",
          hostBio: "",
          lastLocationProvince: "",
          lastLocationUpdatedAt: "",
          hostFollowerCount: 0,
          hostFollowingCount: 0,
          title: "",
          welcomeMessage: "",
          coverUrl: ""
        };
      });

      try {
        const response = await fetch(`/api/rooms/resolve?handle=${encodeURIComponent(watchHandle)}`, {
          credentials: "same-origin"
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw createApiError(payload, "room_resolve_failed", { status: response.status });
        }

        if (cancelled) {
          return;
        }

        setWatchRoomResolution({
          loading: false,
          error: "",
          roomId: payload.room?.id || "",
          hostUserId: payload.room?.host?.id || "",
          hostHandle: payload.room?.host?.handle || watchHandle,
          hostDisplayName: payload.room?.host?.displayName || "",
          hostAvatarUrl: payload.room?.host?.avatarUrl || "",
          hostGender: payload.room?.host?.gender || "",
          hostBirthDate: payload.room?.host?.birthDate || "",
          hostBio: payload.room?.host?.bio || "",
          lastLocationProvince: payload.room?.lastLocationProvince || "",
          lastLocationUpdatedAt: payload.room?.lastLocationUpdatedAt || "",
          hostFollowerCount: Math.max(0, Number(payload.room?.host?.followerCount || 0)),
          hostFollowingCount: Math.max(0, Number(payload.room?.host?.followingCount || 0)),
          title: payload.room?.title || "",
          welcomeMessage: payload.room?.welcomeMessage || "",
          coverUrl: payload.room?.coverUrl || ""
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = getAppErrorMessage(error);
        setWatchRoomResolution({
          loading: false,
          error: message,
          roomId: "",
          hostUserId: "",
          hostHandle: "",
          hostDisplayName: "",
          hostAvatarUrl: "",
          hostGender: "",
          hostBirthDate: "",
          hostBio: "",
          lastLocationProvince: "",
          lastLocationUpdatedAt: "",
          hostFollowerCount: 0,
          hostFollowingCount: 0,
          title: "",
          welcomeMessage: "",
          coverUrl: ""
        });
        log(`watch resolve failed: ${message}`);
      }
    }

    void resolveWatchRoom();

    return () => {
      cancelled = true;
    };
  }, [chat.streamState.isLive, page, watchHandle, watchRouteCommitted, watchingNamespace, watchingTestChannel]);

  useEffect(() => {
    if (authState.loading) {
      return;
    }

    const targetUserId = watchHostUserId;
    const viewerUserId = authState.user?.id || "";
    if (!watchJoined || !targetUserId || targetUserId === viewerUserId) {
      setWatchFollowState({
        hostUserId: targetUserId,
        following: false,
        notifyLiveStarted: false,
        followerCount: watchRoomResolution.hostFollowerCount,
        followingCount: watchRoomResolution.hostFollowingCount,
        loading: false,
        busy: false,
        notifyBusy: false,
        error: ""
      });
      return;
    }

    if (!viewerUserId) {
      setWatchFollowState({
        hostUserId: targetUserId,
        following: false,
        notifyLiveStarted: false,
        followerCount: watchRoomResolution.hostFollowerCount,
        followingCount: watchRoomResolution.hostFollowingCount,
        loading: false,
        busy: false,
        notifyBusy: false,
        error: ""
      });
      return;
    }

    let cancelled = false;
    setWatchFollowState((current) => ({
      hostUserId: targetUserId,
      following: current.hostUserId === targetUserId ? current.following : false,
      notifyLiveStarted: current.hostUserId === targetUserId ? current.notifyLiveStarted : false,
      followerCount: current.hostUserId === targetUserId ? current.followerCount : watchRoomResolution.hostFollowerCount,
      followingCount: current.hostUserId === targetUserId ? current.followingCount : watchRoomResolution.hostFollowingCount,
      loading: true,
      busy: false,
      notifyBusy: false,
      error: ""
    }));

    async function loadFollowState() {
      try {
        const response = await fetch(`/api/users/${encodeURIComponent(targetUserId)}/follow`, {
          credentials: "same-origin"
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw createApiError(payload, "follow_status_failed", { status: response.status });
        }
        if (cancelled) {
          return;
        }
        setWatchFollowState({
          hostUserId: targetUserId,
          following: Boolean(payload.following),
          notifyLiveStarted: Boolean(payload.following && payload.notifyLiveStarted),
          followerCount: Math.max(0, Number(payload.followerCount ?? watchRoomResolution.hostFollowerCount)),
          followingCount: Math.max(0, Number(payload.followingCount ?? watchRoomResolution.hostFollowingCount)),
          loading: false,
          busy: false,
          notifyBusy: false,
          error: ""
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = getAppErrorMessage(error);
        setWatchFollowState({
          hostUserId: targetUserId,
          following: false,
          notifyLiveStarted: false,
          followerCount: watchRoomResolution.hostFollowerCount,
          followingCount: watchRoomResolution.hostFollowingCount,
          loading: false,
          busy: false,
          notifyBusy: false,
          error: message
        });
        log(`follow status failed: ${message}`);
      }
    }

    void loadFollowState();

    return () => {
      cancelled = true;
    };
  }, [
    authState.loading,
    authState.user?.id,
    watchHostUserId,
    watchJoined,
    watchRoomResolution.hostFollowerCount,
    watchRoomResolution.hostFollowingCount
  ]);

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
    const currentSession = player.playerSession;
    const desiredWatchPlayback = getDesiredWatchPlaybackTarget({
      page,
      watchRouteCommitted,
      watchingNamespace,
      directWatchNamespace,
      resolvedWatchRoomId,
      roomStateReady: chat.roomStateReady,
      isLive: chat.streamState.isLive,
      playbackReady: resolvedWatchPlaybackReady,
      protocol: resolvedWatchProtocol,
      relayUrl: resolvedWatchRelayUrl,
      namespace: resolvedWatchNamespace,
      webRtcUrl: resolvedWatchWebRtcUrl,
      startedAt: chat.streamState.startedAt,
    });

    if (!desiredWatchPlayback) {
      if (!currentSession) {
        return;
      }

      if (page !== "watch" || !watchRoom) {
        handledWatchPlaybackRef.current = { roomId: "", startedAt: "", protocol: "" };
        void player.stopPlayer();
        return;
      }

      const streamEnded =
        watchRouteCommitted &&
        !watchingNamespace &&
        resolvedWatchRoomId &&
        chat.roomStateReady &&
        !chat.streamState.isLive;
      if (streamEnded) {
        handledWatchPlaybackRef.current = { roomId: "", startedAt: "", protocol: "" };
        void player.stopPlayer({
          finalStatus: "直播已结束",
          finalKind: "ended",
          logMessage: "stopped player because stream ended",
        });
      }
      return;
    }

    const current = handledWatchPlaybackRef.current;
    const sessionMatchesTarget = playerSessionMatchesWatchTarget(
      currentSession,
      desiredWatchPlayback,
    );
    const targetAlreadyHandled = watchPlaybackRecordMatches(
      current,
      desiredWatchPlayback,
    );
    const shouldRestartCurrentPlayback =
      current.roomId === desiredWatchPlayback.roomId &&
      Boolean(current.startedAt) &&
      current.startedAt !== desiredWatchPlayback.startedAt &&
      current.protocol === desiredWatchPlayback.protocol;

    if (!currentSession || !sessionMatchesTarget || shouldRestartCurrentPlayback) {
      handledWatchPlaybackRef.current = {
        roomId: desiredWatchPlayback.roomId,
        startedAt: desiredWatchPlayback.startedAt,
        protocol: desiredWatchPlayback.protocol,
      };
      void player.startPlayer();
      return;
    }

    if (!targetAlreadyHandled) {
      handledWatchPlaybackRef.current = {
        roomId: desiredWatchPlayback.roomId,
        startedAt: desiredWatchPlayback.startedAt,
        protocol: desiredWatchPlayback.protocol,
      };
    }
  }, [
    chat.roomStateReady,
    chat.streamState.isLive,
    chat.streamState.startedAt,
    directWatchNamespace,
    page,
    player.playerSession,
    resolvedWatchNamespace,
    resolvedWatchPlaybackReady,
    resolvedWatchProtocol,
    resolvedWatchRelayUrl,
    resolvedWatchRoomId,
    resolvedWatchWebRtcUrl,
    watchRoom,
    watchRouteCommitted,
    watchingNamespace,
  ]);

  useEffect(() => {
    const currentSession = cohostPlayer.playerSession;
    const desiredCohostPlayback = getDesiredWatchPlaybackTarget({
      page,
      watchRouteCommitted,
      watchingNamespace: false,
      directWatchNamespace: "",
      resolvedWatchRoomId: cohostActive?.peerRoomId || "",
      roomStateReady: chat.roomStateReady,
      isLive: Boolean(cohostActive),
      playbackReady: cohostPlaybackReady,
      protocol: resolvedCohostProtocol,
      relayUrl: resolvedCohostRelayUrl,
      namespace: resolvedCohostNamespace,
      webRtcUrl: resolvedCohostWebRtcUrl,
      startedAt: cohostActive?.acceptedAt || "",
    });

    if (!desiredCohostPlayback) {
      if (currentSession) {
        handledCohostPlaybackRef.current = { roomId: "", startedAt: "", protocol: "" };
        void cohostPlayer.stopPlayer();
      }
      return;
    }

    const current = handledCohostPlaybackRef.current;
    const sessionMatchesTarget = playerSessionMatchesWatchTarget(
      currentSession,
      desiredCohostPlayback,
    );
    const targetAlreadyHandled = watchPlaybackRecordMatches(
      current,
      desiredCohostPlayback,
    );
    const shouldRestartCurrentPlayback =
      current.roomId === desiredCohostPlayback.roomId &&
      Boolean(current.startedAt) &&
      current.startedAt !== desiredCohostPlayback.startedAt &&
      current.protocol === desiredCohostPlayback.protocol;

    if (!currentSession || !sessionMatchesTarget || shouldRestartCurrentPlayback) {
      handledCohostPlaybackRef.current = {
        roomId: desiredCohostPlayback.roomId,
        startedAt: desiredCohostPlayback.startedAt,
        protocol: desiredCohostPlayback.protocol,
      };
      void cohostPlayer.startPlayer();
      return;
    }

    if (!targetAlreadyHandled) {
      handledCohostPlaybackRef.current = {
        roomId: desiredCohostPlayback.roomId,
        startedAt: desiredCohostPlayback.startedAt,
        protocol: desiredCohostPlayback.protocol,
      };
    }
  }, [
    chat.roomStateReady,
    cohostActive,
    cohostPlaybackReady,
    cohostPlayer.playerSession,
    page,
    resolvedCohostNamespace,
    resolvedCohostProtocol,
    resolvedCohostRelayUrl,
    resolvedCohostWebRtcUrl,
    watchRouteCommitted,
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

  const liveGateActive = page === "live" && (
    authState.loading
    || (Boolean(authState.user?.id) && (
      liveActivation.loading
      || !liveActivation.checked
      || liveActivation.missing
      || Boolean(liveActivation.error)
    ))
  );
  let liveActivationContent = null;

  if (page === "live" && authState.loading) {
    liveActivationContent = <LiveActivationLoading />;
  }

  if (!liveActivationContent && page === "live" && authState.user?.id) {
    if (liveActivation.loading || !liveActivation.checked) {
      liveActivationContent = <LiveActivationLoading />;
    } else if (liveActivation.missing) {
      liveActivationContent = (
        <LiveActivationGate
          title="开通直播功能"
          message="开通后会为你的账号创建直播间，并用于主播分享、封面和聊天室管理。"
          error={liveActivation.error}
          busy={liveActivation.creating}
          primaryLabel="开通"
          secondaryLabel="暂不开通"
          onPrimary={() => {
            void activateLiveRoom();
          }}
          onSecondary={returnToWatchHome}
        />
      );
    } else if (liveActivation.error) {
      liveActivationContent = <LiveActivationLoading />;
    }
  }

  const liveRouteCanRender = livePageMounted && !liveGateActive;
  const liveRouteLoadingContent = livePageMounted && !liveRouteReady && !liveGateActive
    ? <LiveActivationLoading />
    : null;
  const liveActivationShellContent = liveActivationContent || liveRouteLoadingContent;
  const liveRouteFrameActive = page === "live" && (Boolean(liveActivationShellContent) || liveRouteCanRender);

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
            {siteIconUrl ? (
              <img className="brand-icon" src={siteIconUrl} alt="" aria-hidden="true" />
            ) : null}
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
            <DesktopNavigation
              currentPage={page}
              onSelect={(nextPage) => selectPageWithGuard(nextPage)}
              onPreloadLive={preloadLiveRoute}
            />
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
                          selectPagePreservingLiveBackdrop("settings", { updateAutorun: false });
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
            siteTitle={siteTitle}
            hidden={!showWatchPage}
            watchJoined={watchJoined}
            roomLabel={watchRoomLabel}
            roomTitle={watchRoomTitle}
            welcomeMessage={watchWelcomeMessage}
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
            host={{
              userId: watchHostUserId,
              handle: watchRoomResolution.hostHandle,
              displayName: watchHostDisplayName,
              avatarUrl: watchHostAvatarUrl,
              gender: watchRoomResolution.hostGender,
              birthDate: watchRoomResolution.hostBirthDate,
              bio: watchRoomResolution.hostBio,
              locationProvince: watchHostLocationProvince,
              locationAvailable: watchHostLocationAvailable,
              distanceAvailable: watchHostDistanceAvailable,
              locationUpdatedAt: watchHostLocationUpdatedAt,
              followerCount: watchHostFollowerCount,
              followingCount: watchHostFollowingCount,
              icon: watchHostIcon,
              following: watchFollowState.hostUserId === watchHostUserId && watchFollowState.following,
              followLoading: authState.loading ||
                (
                  watchFollowState.hostUserId === watchHostUserId &&
                  watchFollowState.loading
                ),
              followBusy: watchFollowState.hostUserId === watchHostUserId && watchFollowState.busy,
              notifyLiveStarted: watchFollowState.hostUserId === watchHostUserId && watchFollowState.notifyLiveStarted,
              notifyBusy: watchFollowState.hostUserId === watchHostUserId && watchFollowState.notifyBusy,
            }}
            media={{
              roomCoverUrl: watchRoomCoverUrl,
              siteIconUrl,
              watchLink: watchPageLink,
              stageLoading: watchStageLoading,
              stageMessage: watchStageMessage,
            }}
            player={{
              statusMessage: effectivePlayerStatus,
              statusKind: effectivePlayerStatusKind,
              badge: playerBadge,
              fullscreenActive: player.fullscreenActive,
              paused: watchingTestChannel ? false : player.playerPaused,
              muted: watchingTestChannel ? true : player.playerMuted,
              showTapToUnmute: watchingTestChannel ? false : player.showTapToUnmute,
              orientation: effectivePlayerOrientation,
              stageRef: player.watchStageRef,
              session: effectivePlayerSession,
              started: effectivePlayerStarted,
              freezeFrameUrl: effectivePlayerFreezeFrameUrl,
              ref: player.playerRef,
            }}
            cohost={{
              active: cohostActive,
              session: cohostPlayer.playerSession,
              started: cohostPlayer.playerStarted,
              muted: cohostPlayer.playerMuted,
              ref: cohostPlayer.playerRef,
              status: cohostPlayer.playerStatus,
              badge: describePlayerState(cohostPlayer.playerStatusKind),
              orientation: cohostPlayer.playerOrientation,
            }}
            testPlayback={watchTestChannel}
            auth={{
              available: authState.available,
              loading: authState.loading,
              user: authState.user,
            }}
            chat={{
              room: watchChatRoom,
              roomLabel: watchChatRoomLabel,
              messages: chat.messages,
              draft: chat.draft,
              connectionState: chat.connectionState,
              onlineCount: chat.onlineCount,
              loggedInViewers: chat.loggedInViewers,
              readOnly: chat.readOnly,
              error: chat.chatError,
              recovering: chat.recoveringFromPageLifecycle,
            }}
            actions={{
              onStop: () => {
                autorunRef.current = false;
                setWatchRouteCommitted(false);
                setWatchRoomValue("");
                selectPageWithGuard("watch", { updateAutorun: false });
                void player.stopPlayer();
                void cohostPlayer.stopPlayer();
              },
              onTogglePlayback: () => {
                void player.togglePlayerPlayback().catch((error) => {
                  log(`toggle playback failed: ${error instanceof Error ? error.message : String(error)}`);
                });
              },
              onToggleMute: () => {
                void player.togglePlayerMute().catch((error) => {
                  log(`toggle mute failed: ${error instanceof Error ? error.message : String(error)}`);
                });
              },
              onDismissTapToUnmute: () => {
                void player.dismissTapToUnmute().catch((error) => {
                  log(`tap to unmute failed: ${error instanceof Error ? error.message : String(error)}`);
                });
              },
              onFullscreen: () => {
                void player.fullscreenPlayer().catch((error) => {
                  log(`fullscreen failed: ${error instanceof Error ? error.message : String(error)}`);
                });
              },
              onHostFollowToggle: toggleWatchFollow,
              onHostNotifyLiveToggle: toggleWatchLiveNotification,
              onChatDraftChange: (event) => {
                chat.setDraft(event.currentTarget.value);
              },
              onChatSend: () => {
                chat.sendMessage();
              },
              onChatRequireLogin: () => {
                setLoginPromptOpen(true);
              },
            }}
          />

          {liveRouteFrameActive ? (
            <LiveRouteFrame closing={liveRouteClosing} shellMode={liveRouteShellMode}>
              {liveActivationShellContent ? (
                <LiveRouteActivationContent onClose={returnToWatchHome}>
                  {liveActivationShellContent}
                </LiveRouteActivationContent>
              ) : null}

              {liveRouteCanRender ? (
                <Suspense fallback={null}>
                  <LiveRoute
                    hidden={page !== "live"}
                    page={page}
                    pageRef={pageRef}
                    relayUrl={relayUrl}
                    relayUrlRef={relayUrlRef}
                    liveRoom={liveRoom}
                    liveRoomRef={liveRoomRef}
                    liveChatRoomId={liveChatRoomId}
                    liveRoomDetails={liveRoomDetails}
                    setLiveRoomDetails={setLiveRoomDetails}
                    setLiveRoomValue={setLiveRoomValue}
                    setRelayUrlValue={setRelayUrlValue}
                    selectPageWithGuard={selectPageWithGuard}
                    authState={authState}
                    log={log}
                    siteIconUrl={siteIconUrl}
                    siteTitle={siteTitle}
                    onRequireLogin={() => {
                      setLoginPromptOpen(true);
                    }}
                    onReturnHome={returnToWatchHome}
                    syntheticSessionRef={syntheticSessionRef}
                    onRouteReady={() => {
                      setLiveRouteReady(true);
                    }}
                  />
                </Suspense>
              ) : null}
            </LiveRouteFrame>
          ) : null}

          <SettingsPage
            hidden={!showSettingsPage}
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
            onOpenFollowUserRoom={(target) => {
              beginWatch(target);
            }}
            watchHistoryItems={watchHistoryItems}
            onOpenWatchHistoryItem={openWatchHistoryItem}
            onClearWatchHistory={() => {
              setWatchHistoryItems(clearWatchHistory());
            }}
            onRefreshAuth={refreshAuthState}
            loginPanelRequestKey={settingsLoginPanelRequestKey}
            logText={logText}
            logRef={logRef}
          />
        </main>
      </div>

      {watchRoomShellActive ? null : (
        <MobileNavigation
          currentPage={page}
          onSelect={(nextPage) => selectPageWithGuard(nextPage)}
          onPreloadLive={preloadLiveRoute}
        />
      )}
      {pushPromptOpen ? (
        <div className="push-permission-layer" role="presentation">
          <button
            type="button"
            className="push-permission-backdrop"
            aria-label="关闭通知权限提示"
            onClick={closePushPrompt}
          />
          <div className="push-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="push-permission-title">
            <button
              type="button"
              className="push-permission-close"
              aria-label="关闭通知权限提示"
              onClick={closePushPrompt}
            >
              <X aria-hidden="true" />
            </button>
            <div className="push-permission-copy">
              <strong id="push-permission-title">开启开播通知</strong>
              <span>接收开播通知，不错过每一个精彩瞬间。</span>
            </div>
            <label className="push-permission-check">
              <input
                type="checkbox"
                checked={pushPromptDismissChecked}
                onChange={(event) => {
                  setPushPromptDismissChecked(event.currentTarget.checked);
                }}
              />
              <span>不再提醒</span>
            </label>
            {pushPromptError ? <p className="push-permission-error">{pushPromptError}</p> : null}
            <div className="push-permission-actions">
              <button type="button" className="secondary" onClick={closePushPrompt}>
                稍后
              </button>
              <button type="button" className="primary" onClick={enablePushNotifications} disabled={pushPromptBusy}>
                {pushPromptBusy ? "开启中" : "开启通知"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
