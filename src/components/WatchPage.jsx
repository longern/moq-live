import { WatchIdlePage } from "./WatchIdlePage.jsx";
import { WatchSessionPage } from "./WatchSessionPage.jsx";

export function WatchPage(props) {
  if (props.playerSession) {
    return <WatchSessionPage {...props} />;
  }

  return <WatchIdlePage {...props} />;
}
