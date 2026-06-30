import { createContext, useContext } from "react";

const WatchPanelContext = createContext(null);

export function WatchPanelProvider({ children, value }) {
  return (
    <WatchPanelContext.Provider value={value}>
      {children}
    </WatchPanelContext.Provider>
  );
}

export function useOptionalWatchPanel() {
  return useContext(WatchPanelContext);
}
