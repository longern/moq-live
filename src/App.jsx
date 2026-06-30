import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { MobileNavigation } from "./components/Navigation.jsx";
import { AppTopbar } from "./components/AppTopbar.jsx";
import { LoginDrawer } from "./components/LoginDrawer.jsx";
import { PushPermissionPrompt } from "./components/PushPermissionPrompt.jsx";
import { RegistrationDisplayNameModal } from "./components/RegistrationDisplayNameModal.jsx";
import { MobilePanelPresence } from "./components/MobilePanelPresence.jsx";
import { SettingsPage } from "./components/SettingsPage.jsx";
import { AppWatchPageSection } from "./components/AppWatchPageSection.jsx";
import { LiveActivationGate } from "./components/live/LiveActivationGate.jsx";
import { LiveActivationLoading } from "./components/live/LiveActivationLoading.jsx";
import { LiveRouteActivationContent, LiveRouteFrame } from "./components/LiveRouteShell.jsx";
import { ToastViewport } from "./components/primitives/FloatingToast.jsx";
import { useAuthController } from "./hooks/useAuthController.js";
import { usePushPermissionPromptController } from "./hooks/usePushPermissionPromptController.js";
import { useRegistrationDisplayNamePrompt } from "./hooks/useRegistrationDisplayNamePrompt.js";
import { useChatController } from "./hooks/useChatController.js";
import { useCohostPlayerControllers } from "./hooks/useCohostPlayerControllers.js";
import { useLiveRoomActivation } from "./hooks/useLiveRoomActivation.js";
import { useCompactViewport, useMediaQuery, usePortraitViewport } from "./hooks/useMediaQuery.js";
import { usePlayerController } from "./hooks/usePlayerController.js";
import { useRouteController } from "./hooks/useRouteController.js";
import { buildWatchLink, getInitialWatchRouteRoom, getRelayHostValue, writeRoute } from "./lib/routeState.js";
import {
  createInitialWatchFollowState,
  createInitialWatchRoomResolution,
  getAvatarLabel,
  getDesiredWatchPlaybackTarget,
  getHandleWatchValue,
  getNamespaceWatchValue,
  getWatchPlayerLayoutScopeKey,
  isNamespaceWatchTarget,
  playerSessionMatchesWatchTarget,
  watchPlaybackRecordMatches,
  shouldUseWatchPlayerShell,
} from "./lib/appViewState.js";
import { clearWatchHistory, persistWatchHistoryEntry, readWatchHistory } from "./lib/watchHistory.js";
import { describePlayerState } from "./lib/status.js";
import { getWatchTestChannel } from "./lib/watchTestChannels.js";
import { createApiError, getAppErrorMessage } from "./lib/appErrors.js";
import { useI18n } from "./i18n/I18nProvider.jsx";
import {
  shouldPromptForPushPermission,
} from "./lib/webPush.js";
import {
  DEFAULT_STREAM_PROTOCOL,
  STREAM_PROTOCOL_MOQ,
  normalizeStreamProtocol,
} from "./lib/streamProtocol.js";

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

function getAppToastClassName({ liveRouteActive, liveShellMode, settingsVisible }) {
  if (liveRouteActive) {
    return `live-page-toast live-page-toast-${liveShellMode === "mobile" ? "mobile" : "desktop"}`;
  }
  if (settingsVisible) {
    return "settings-page-toast";
  }
  return "watch-session-toast";
}

function normalizeWatchRoomFallback(fallback, watchTarget) {
  if (!fallback) {
    return null;
  }

  const targetKey = getHandleWatchValue(String(watchTarget || ""));
  const hostHandle = String(fallback.hostHandle || fallback.handle || "").trim();
  const hostDisplayName = String(fallback.hostDisplayName || fallback.displayName || "").trim();
  const hostAvatarUrl = String(fallback.hostAvatarUrl || fallback.avatarUrl || "").trim();
  const hostUserId = String(fallback.hostUserId || fallback.userId || "").trim();
  const title = String(fallback.title || fallback.roomTitle || "").trim();
  if (!targetKey || (!hostHandle && !hostDisplayName && !hostAvatarUrl && !hostUserId && !title)) {
    return null;
  }

  return {
    targetKey,
    hostUserId,
    hostHandle,
    hostHandleKey: getHandleWatchValue(hostHandle),
    hostDisplayName,
    hostAvatarUrl,
    title,
  };
}

export function App() {
  const { locale, t } = useI18n();
  const siteTitle = __APP_TITLE__;
  const [logText, setLogText] = useState("");
  const [loginPromptOpen, setLoginPromptOpen] = useState(false);
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
  const [watchRouteCommitted, setWatchRouteCommitted] = useState(() => Boolean(getInitialWatchRouteRoom().trim()));
  const logRef = useRef(null);
  const authMenuRef = useRef(null);
  const authMenuCloseTimerRef = useRef(null);
  const liveRouteCloseTimerRef = useRef(null);
  const liveRouteHistoryPushedRef = useRef(false);
  const suppressNextLivePopAnimationRef = useRef(false);
  const handledWatchPlaybackRef = useRef({ roomId: "", startedAt: "", protocol: "" });
  const watchLiveSeenRef = useRef({ roomId: "", hasBeenLive: false });
  const previousRouteRef = useRef({
    page: new URLSearchParams(window.location.search).get("p") === "l"
      ? "live"
      : new URLSearchParams(window.location.search).get("p") === "s"
        ? "settings"
        : "watch",
    watchRoom: getInitialWatchRouteRoom().trim(),
    watchRouteCommitted: Boolean(getInitialWatchRouteRoom().trim())
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
  const shortLandscapeViewport = useMediaQuery("(max-width: 980px) and (orientation: landscape) and (max-height: 520px)");
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

  function handleBeforeRoutePopState({ current, next }) {
    if (current.page !== "live" || next.page === "live") {
      return 0;
    }

    if (suppressNextLivePopAnimationRef.current) {
      suppressNextLivePopAnimationRef.current = false;
      return 0;
    }

    if (liveRouteCloseTimerRef.current) {
      clearTimeout(liveRouteCloseTimerRef.current);
      liveRouteCloseTimerRef.current = null;
    }
    setLiveRouteClosing(true);

    return LIVE_ROUTE_FRAME_EXIT_MS;
  }

  function handleAfterRoutePopState({ next }) {
    setLiveRouteClosing(false);
    setWatchRouteCommitted(Boolean(next.watchRoom));
  }

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
  } = useRouteController({
    onBeforePopState: handleBeforeRoutePopState,
    onAfterPopState: handleAfterRoutePopState,
  });

  const {
    authState,
    registrationPrompt,
    dismissRegistrationPrompt,
    refreshAuthState,
    startLogin,
    logout,
    updateDisplayName,
    updateHandle,
    updateBio,
    updateGender,
    updateBirthDate,
    updateAvatar
  } = useAuthController({ log });
  const registrationDisplayName = useRegistrationDisplayNamePrompt({
    dismissRegistrationPrompt,
    locale,
    updateDisplayName,
  });
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

  const [watchRoomResolution, setWatchRoomResolution] = useState(createInitialWatchRoomResolution);
  const [watchRoomFallback, setWatchRoomFallback] = useState(null);
  const [watchFollowState, setWatchFollowState] = useState(createInitialWatchFollowState);
  const [watchStreamEnded, setWatchStreamEnded] = useState(false);
  const [topbarWatchRoom, setTopbarWatchRoom] = useState("");
  const pushPrompt = usePushPermissionPromptController({ t });

  const watchPlaybackRelayUrlRef = useRef("");
  const watchPlaybackNamespaceRef = useRef("");
  const watchPlaybackProtocolRef = useRef(DEFAULT_STREAM_PROTOCOL);
  const watchPlaybackWebRtcUrlRef = useRef("");

  const normalizedWatchInput = watchRoom.trim();
  const watchTestChannel = getWatchTestChannel(normalizedWatchInput);
  const watchingTestChannel = Boolean(watchTestChannel);
  const watchingNamespace = !watchingTestChannel && isNamespaceWatchTarget(normalizedWatchInput);
  const directWatchNamespace = getNamespaceWatchValue(normalizedWatchInput);
  const watchHandle = watchingNamespace || watchingTestChannel ? "" : getHandleWatchValue(normalizedWatchInput);
  const activeWatchRoomFallback = !watchingNamespace
    && !watchingTestChannel
    && watchRoomFallback
    && watchRoomFallback.targetKey === watchHandle
    && (!watchRoomFallback.hostHandleKey || watchRoomFallback.hostHandleKey === watchHandle)
    ? watchRoomFallback
    : null;
  const resolvedWatchRoomId = watchingNamespace || watchingTestChannel ? "" : watchRoomResolution.roomId;
  const watchSessionActive = page === "watch" && watchRouteCommitted && Boolean(normalizedWatchInput);
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
    layoutScopeKey: watchPlayerLayoutScopeKey,
  });
  const watchChatEnabled =
    watchSessionActive &&
    !watchingTestChannel &&
    Boolean(watchChatRoom) &&
    !authState.loading;

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
  const resolvedWatchPlaybackReady = watchUsesMoqPlayback
    ? Boolean(resolvedWatchRelayUrl && resolvedWatchNamespace)
    : Boolean(resolvedWatchWebRtcUrl);
  const cohostActive = !watchingTestChannel && !watchingNamespace ? chat.cohostActive : [];
  const cohostPlayers = useCohostPlayerControllers({
    active: cohostActive,
    enabled: page === "watch" && watchRouteCommitted && chat.roomStateReady,
    layoutScopeKey: watchPlayerLayoutScopeKey,
    setLogText,
    log,
  });
  const watchJoined = watchSessionActive;
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
      ? (directWatchNamespace ? t("watch.connectPublicChannel") : t("watch.waitPublicChannel"))
      : watchRoomResolution.loading
        ? t("common.loading")
        : watchRoomResolution.error
          ? t("watch.enterFailed", { error: watchRoomResolution.error })
          : !resolvedWatchRoomId || !chat.roomStateReady
            ? t("common.loading")
            : chat.streamState.isLive
              ? (resolvedWatchPlaybackReady ? "" : t("common.loading"))
              : watchStreamEnded
                ? t("watch.ended")
                : t("watch.offair");

  watchPlaybackRelayUrlRef.current = resolvedWatchRelayUrl;
  watchPlaybackNamespaceRef.current = resolvedWatchNamespace;
  watchPlaybackProtocolRef.current = resolvedWatchProtocol;
  watchPlaybackWebRtcUrlRef.current = resolvedWatchWebRtcUrl;

  const watchRoomLabel = watchingTestChannel
    ? watchTestChannel.label
    : watchingNamespace
      ? (directWatchNamespace ? `ns:${directWatchNamespace}` : t("watch.waitNamespace"))
      : watchRoomResolution.hostDisplayName
      || activeWatchRoomFallback?.hostDisplayName
      || watchRoomResolution.hostHandle
      || activeWatchRoomFallback?.hostHandle
      || chat.roomMeta.title
      || watchRoomResolution.title
      || watchHandle
      || watchRoom
      || t("watch.waitHostHandle");
  const watchChatRoomLabel = watchingTestChannel
    ? watchTestChannel.label
    : watchingNamespace
      ? (directWatchNamespace ? `ns:${directWatchNamespace}` : "")
      : watchRoomResolution.hostDisplayName
      || activeWatchRoomFallback?.hostDisplayName
      || watchRoomResolution.hostHandle
      || activeWatchRoomFallback?.hostHandle
      || watchHandle
      || "";
  const watchRoomTitle = watchingTestChannel
    ? watchTestChannel.title
    : watchingNamespace
      ? t("watch.publicChannel", { namespace: directWatchNamespace })
      : chat.roomMeta.title
      || watchRoomResolution.title
      || activeWatchRoomFallback?.title
      || (watchChatRoomLabel ? t("watch.roomOf", { room: watchChatRoomLabel }) : watchRoomLabel);
  const watchHostDisplayName = watchingTestChannel
    ? watchTestChannel.hostDisplayName
    : watchingNamespace
      ? ""
      : watchRoomResolution.hostDisplayName
      || activeWatchRoomFallback?.hostDisplayName
      || watchRoomResolution.hostHandle
      || activeWatchRoomFallback?.hostHandle
      || watchHandle
      || "";
  const watchHostHandle = watchingNamespace || watchingTestChannel
    ? ""
    : watchRoomResolution.hostHandle || activeWatchRoomFallback?.hostHandle || "";
  const watchHostUserId = watchingNamespace || watchingTestChannel
    ? ""
    : watchRoomResolution.hostUserId || activeWatchRoomFallback?.hostUserId || "";
  const watchHostAvatarUrl = watchingNamespace || watchingTestChannel
    ? ""
    : watchRoomResolution.hostAvatarUrl || activeWatchRoomFallback?.hostAvatarUrl || "";
  const watchHostLocationProvince = watchingNamespace || watchingTestChannel
    ? t("profile.locationUnknown")
    : chat.streamState.isLive
      ? chat.roomLocation.province || watchRoomResolution.lastLocationProvince || t("profile.locationUnknown")
      : watchRoomResolution.lastLocationProvince || t("profile.locationUnknown");
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
      : watchHostHandle || watchHandle || watchRoom;
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
  const watchRoomOffair = Boolean(
    !watchingTestChannel &&
    !watchingNamespace &&
    watchJoined &&
    resolvedWatchRoomId &&
    chat.roomStateReady &&
    !chat.streamState.isLive &&
    !effectivePlayerSession
  );
  const effectivePlayerOrientation = watchTestChannel?.orientation ?? player.playerOrientation;
  const effectivePlayerStatusKind = watchingTestChannel
    ? "live"
    : watchRoomOffair
      ? (watchStreamEnded ? "ended" : "offair")
      : player.playerStatusKind;
  const effectivePlayerStatus = watchTestChannel?.statusMessage
    ?? (watchRoomOffair ? "" : player.playerStatus);
  const playerBadge = describePlayerState(effectivePlayerStatusKind, t);
  const buildLabel = `Build ${__BUILD_HASH__}`;
  const watchPlayerShellActive = shouldUseWatchPlayerShell({
    page,
    watchJoined,
    optimisticShellActive: shortLandscapeViewport,
    playerSession: effectivePlayerSession,
    playerStatusKind: effectivePlayerStatusKind,
    playerOrientation: effectivePlayerOrientation,
  });
  const mobileWatchJoinedClass = watchPlayerShellActive ? " app-container-watch-joined" : "";
  const watchNavigationHidden = page === "watch" && watchJoined;
  const avatarLabel = getAvatarLabel(authState, t);
  const avatarStateClass = authState.loading
    ? " is-loading"
    : authState.user
      ? " is-authenticated"
      : !authState.available
        ? " is-unavailable"
        : "";
  const avatarTitle = authState.loading
    ? t("account.loading")
    : authState.user
      ? (authState.user.email || authState.user.displayName || t("account.signedIn"))
      : !authState.available
        ? t("account.authServiceUnavailable")
        : t("common.anonymousUser");
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

  useEffect(() => {
    if (!watchRouteCommitted) {
      setWatchRoomFallback(null);
    }
  }, [watchRouteCommitted]);

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

  function returnToWatchHomeNow() {
    if (liveRouteCloseTimerRef.current) {
      clearTimeout(liveRouteCloseTimerRef.current);
      liveRouteCloseTimerRef.current = null;
    }
    setLiveRouteClosing(false);
    autorunRef.current = false;
    setLoginPromptOpen(false);
    closeAuthMenu();
    setWatchRouteCommitted(false);
    setWatchRoomValue("");
    selectPagePreservingLiveBackdrop("watch", { updateAutorun: false });
    void player.stopPlayer();
  }

  function closeLiveRouteNow() {
    if (liveRouteCloseTimerRef.current) {
      clearTimeout(liveRouteCloseTimerRef.current);
      liveRouteCloseTimerRef.current = null;
    }
    setLiveRouteClosing(false);
    autorunRef.current = false;
    setLoginPromptOpen(false);
    closeAuthMenu();
    selectPagePreservingLiveBackdrop(liveBackdropPage, { updateAutorun: false });
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

  function closeLiveRoute() {
    if (pageRef.current !== "live") {
      closeLiveRouteNow();
      return;
    }

    if (liveRouteCloseTimerRef.current) {
      clearTimeout(liveRouteCloseTimerRef.current);
    }
    setLiveRouteClosing(true);
    liveRouteCloseTimerRef.current = window.setTimeout(() => {
      liveRouteCloseTimerRef.current = null;
      if (liveRouteHistoryPushedRef.current && window.history.length > 1) {
        liveRouteHistoryPushedRef.current = false;
        suppressNextLivePopAnimationRef.current = true;
        setLiveRouteClosing(false);
        window.history.back();
        return;
      }
      closeLiveRouteNow();
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
    selectPagePreservingLiveBackdrop(nextPage, options);
  }

  function beginWatch(nextWatchTarget = watchRoom, fallback = null) {
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
    setWatchRoomFallback(normalizeWatchRoomFallback(fallback, normalizedTarget));

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
        pushPrompt.setDismissChecked(false);
        pushPrompt.setError("");
        pushPrompt.setOpen(true);
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
        pushPrompt.setDismissChecked(false);
        pushPrompt.setError("");
        pushPrompt.setOpen(true);
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
    const routeWatchRoom = page === "watch" && watchRouteCommitted ? watchRoom.trim() : "";
    const previousRoute = previousRouteRef.current;
    const shouldPushLiveRoute = page === "live" && previousRoute.page !== "live";
    const shouldPushWatchRoute = page === "watch"
      && watchRouteCommitted
      && Boolean(routeWatchRoom)
      && (
        previousRoute.page !== "watch"
        || !previousRoute.watchRouteCommitted
        || !previousRoute.watchRoom
      );
    const historyMode = shouldPushLiveRoute || shouldPushWatchRoute
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

    if (shouldPushLiveRoute) {
      liveRouteHistoryPushedRef.current = true;
    } else if (page !== "live") {
      liveRouteHistoryPushedRef.current = false;
    }

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
          finalStatus: t("watch.ended"),
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
      })
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
          title={t("liveActivation.title")}
          message={t("liveActivation.message")}
          error={liveActivation.error}
          busy={liveActivation.creating}
          primaryLabel={t("liveActivation.primary")}
          secondaryLabel={t("liveActivation.secondary")}
          onPrimary={() => {
            void activateLiveRoom();
          }}
          onSecondary={closeLiveRoute}
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
  const liveRouteFrameActive = (page === "live" || liveRouteClosing) && (Boolean(liveActivationShellContent) || liveRouteCanRender);
  const appToastClassName = getAppToastClassName({
    liveRouteActive: liveRouteFrameActive,
    liveShellMode: liveRouteShellMode,
    settingsVisible: showSettingsPage,
  });

  return (
    <>
      <div className={`app-container${mobileWatchJoinedClass}`}>
        <AppTopbar
          authMenuOpen={authMenuOpen}
          authMenuRef={authMenuRef}
          authState={authState}
          avatarLabel={avatarLabel}
          avatarStateClass={avatarStateClass}
          avatarTitle={avatarTitle}
          onAuthMenuClose={closeAuthMenu}
          onAuthMenuOpen={openAuthMenu}
          onAuthMenuScheduleClose={scheduleCloseAuthMenu}
          onAuthMenuToggle={() => {
            setAuthMenuOpen((current) => !current);
          }}
          onBeginWatch={beginWatch}
          onLogout={() => {
            void logout();
          }}
          onOpenSettings={() => {
            selectPagePreservingLiveBackdrop("settings", { updateAutorun: false });
          }}
          onPreloadLive={preloadLiveRoute}
          onReturnHome={returnToWatchHome}
          onSelectPage={(nextPage) => selectPageWithGuard(nextPage)}
          onStartLogin={() => {
            setLoginPromptOpen(true);
          }}
          onTopbarWatchRoomChange={setTopbarWatchRoom}
          page={page}
          siteIconUrl={siteIconUrl}
          siteTitle={siteTitle}
          topbarWatchRoom={topbarWatchRoom}
        />

        <main className="page-shell">
          <AppWatchPageSection
            context={{
              authState,
              autorunRef,
              beginWatch,
              chat,
              cohostActive,
              cohostPlayers,
              effectivePlayerFreezeFrameUrl,
              effectivePlayerOrientation,
              effectivePlayerSession,
              effectivePlayerStarted,
              effectivePlayerStatus,
              effectivePlayerStatusKind,
              log,
              player,
              playerBadge,
              selectPageWithGuard,
              setLoginPromptOpen,
              setWatchRoomValue,
              setWatchRouteCommitted,
              showWatchPage,
              siteIconUrl,
              siteTitle,
              t,
              toggleWatchFollow,
              toggleWatchLiveNotification,
              watchChatRoom,
              watchChatRoomLabel,
              watchFollowState,
              watchHostAvatarUrl,
              watchHostDisplayName,
              watchHostDistanceAvailable,
              watchHostFollowerCount,
              watchHostFollowingCount,
              watchHostHandle,
              watchHostIcon,
              watchHostLocationAvailable,
              watchHostLocationProvince,
              watchHostLocationUpdatedAt,
              watchHostUserId,
              watchJoined,
              watchingTestChannel,
              watchPageLink,
              watchRoom,
              watchRoomCoverUrl,
              watchRoomLabel,
              watchRoomResolution,
              watchSessionKey: watchPlayerLayoutScopeKey,
              watchRoomTitle,
              watchStageLoading,
              watchStageMessage,
              watchTestChannel,
              watchWelcomeMessage,
            }}
          />

          {liveRouteFrameActive ? (
            <LiveRouteFrame closing={liveRouteClosing} shellMode={liveRouteShellMode}>
              {liveActivationShellContent ? (
                <LiveRouteActivationContent onClose={closeLiveRoute}>
                  {liveActivationShellContent}
                </LiveRouteActivationContent>
              ) : null}

              {liveRouteCanRender ? (
                <Suspense fallback={null}>
                  <LiveRoute
                    hidden={page !== "live" && !liveRouteClosing}
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
                    authState={authState}
                    log={log}
                    siteIconUrl={siteIconUrl}
                    siteTitle={siteTitle}
                    onRequireLogin={() => {
                      setLoginPromptOpen(true);
                    }}
                    onReturnHome={closeLiveRoute}
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
            authProviders={authState.authProviders}
            onLogin={(provider) => {
              setLoginPromptOpen(false);
              startLogin(provider);
            }}
            onLogout={() => {
              void logout();
            }}
            onUpdateDisplayName={(displayName) => updateDisplayName(displayName)}
            onUpdateHandle={(handle) => updateHandle(handle)}
            onUpdateBio={(bio) => updateBio(bio)}
            onUpdateGender={(gender) => updateGender(gender)}
            onUpdateBirthDate={(birthDate) => updateBirthDate(birthDate)}
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
            logText={logText}
            logRef={logRef}
          />
        </main>
      </div>

      {watchNavigationHidden ? null : (
        <MobileNavigation
          currentPage={page}
          onSelect={(nextPage) => selectPageWithGuard(nextPage)}
          onPreloadLive={preloadLiveRoute}
        />
      )}
      <ToastViewport className={appToastClassName} />
      {pushPrompt.open ? (
        <PushPermissionPrompt
          busy={pushPrompt.busy}
          dismissChecked={pushPrompt.dismissChecked}
          error={pushPrompt.error}
          onClose={pushPrompt.close}
          onDismissCheckedChange={pushPrompt.setDismissChecked}
          onEnable={pushPrompt.enable}
        />
      ) : null}

      {registrationPrompt ? (
        <RegistrationDisplayNameModal
          error={registrationDisplayName.error}
          inputValue={registrationDisplayName.input}
          onChange={registrationDisplayName.changeInput}
          onClose={registrationDisplayName.close}
          onSubmit={registrationDisplayName.submit}
          placeholder={registrationPrompt.oauthDisplayName}
          saving={registrationDisplayName.saving}
        />
      ) : null}
      <MobilePanelPresence open={loginPromptOpen}>
        {({ transitionClassName }) => (
          <LoginDrawer
            authAvailable={authState.available}
            authLoading={authState.loading}
            authProviders={authState.authProviders}
            onClose={() => {
              setLoginPromptOpen(false);
            }}
            onLogin={startLogin}
            transitionClassName={transitionClassName}
          />
        )}
      </MobilePanelPresence>
    </>
  );
}
