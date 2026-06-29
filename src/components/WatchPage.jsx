import { WatchIdlePage } from "./WatchIdlePage.jsx";
import { WatchSessionPage } from "./WatchSessionPage.jsx";

export function WatchPage(props) {
  if (props.watchJoined) {
    return <WatchSessionPage key={props.watchSessionKey || props.room || "watch-session"} {...props} />;
  }

  return <WatchIdlePage {...props} />;
}
