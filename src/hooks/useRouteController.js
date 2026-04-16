import { useEffect, useRef, useState } from "preact/hooks";
import {
  getOrCreateLiveRoom,
  getInitialViewState,
  persistLiveRoom,
} from "../lib/routeState.js";

export function useRouteController() {
  const initial = useRef(getInitialViewState()).current;

  const [page, setPage] = useState(initial.page);
  const [relayUrl, setRelayUrl] = useState(initial.relayUrl);
  const [watchRoom, setWatchRoom] = useState(initial.watchRoom);
  const [liveRoom, setLiveRoom] = useState(initial.liveRoom);

  const autorunRef = useRef(initial.autorun);
  const pageRef = useRef(initial.page);
  const relayUrlRef = useRef(initial.relayUrl);
  const watchRoomRef = useRef(initial.watchRoom);
  const liveRoomRef = useRef(initial.liveRoom);

  pageRef.current = page;
  relayUrlRef.current = relayUrl;
  watchRoomRef.current = watchRoom;
  liveRoomRef.current = liveRoom;

  function setWatchRoomValue(nextRoom) {
    watchRoomRef.current = nextRoom;
    setWatchRoom(nextRoom);
    return nextRoom;
  }

  function setLiveRoomValue(nextRoom) {
    const persistedRoom = persistLiveRoom(nextRoom);
    liveRoomRef.current = persistedRoom;
    setLiveRoom(persistedRoom);
    return persistedRoom;
  }

  function setRelayUrlValue(nextRelayUrl) {
    relayUrlRef.current = nextRelayUrl;
    setRelayUrl(nextRelayUrl);
    return nextRelayUrl;
  }

  function selectPage(nextPage, { updateAutorun = true } = {}) {
    pageRef.current = nextPage;
    if (nextPage === "live" && !liveRoomRef.current) {
      setLiveRoomValue(getOrCreateLiveRoom());
    }

    if (updateAutorun) {
      autorunRef.current = false;
    }

    setPage(nextPage);
  }

  useEffect(() => {
    const handlePopState = () => {
      const next = getInitialViewState();
      autorunRef.current = next.autorun;
      pageRef.current = next.page;
      relayUrlRef.current = next.relayUrl;
      watchRoomRef.current = next.watchRoom;
      liveRoomRef.current = next.liveRoom;
      setPage(next.page);
      setRelayUrl(next.relayUrl);
      setWatchRoom(next.watchRoom);
      setLiveRoom(next.liveRoom);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return {
    initialAutorun: initial.autorun,
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
    selectPage,
  };
}
