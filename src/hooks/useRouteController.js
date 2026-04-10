import { useEffect, useRef, useState } from "preact/hooks";
import {
  getOrCreateLiveRoom,
  getInitialViewState,
  persistLiveRoom,
  writeRoute
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
    writeRoute({ page, watchRoom, liveRoom });
  }, [page, watchRoom, liveRoom]);

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
    selectPage
  };
}
