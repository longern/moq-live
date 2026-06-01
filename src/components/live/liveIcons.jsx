import {
  Circle,
  Link,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  Pause,
  Share,
  SwitchCamera,
  Video,
  VideoOff,
} from "lucide-preact";

const iconProps = {
  "aria-hidden": "true",
  focusable: "false",
};

export function CameraIcon({ mode }) {
  if (mode === "off") {
    return <VideoOff {...iconProps} />;
  }

  if (mode === "rear") {
    return <SwitchCamera {...iconProps} />;
  }

  return <Video {...iconProps} />;
}

export function MicrophoneIcon({ enabled }) {
  return enabled ? <Mic {...iconProps} /> : <MicOff {...iconProps} />;
}

export function BroadcastIcon({ active }) {
  return active ? <Pause {...iconProps} /> : <Circle {...iconProps} />;
}

export function ShareIcon() {
  return <Share {...iconProps} />;
}

export function ScreenShareIcon() {
  return <MonitorUp {...iconProps} />;
}

export function LinkIcon() {
  return <Link {...iconProps} />;
}

export function MoreIcon() {
  return <MoreHorizontal {...iconProps} />;
}
