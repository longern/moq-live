import {
  Circle,
  Link,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  Pause,
  Power,
  Share,
  SwitchCamera,
  X,
} from "lucide-react";

const iconProps = {
  "aria-hidden": "true",
  focusable: "false",
};

export function FlipCameraIcon() {
  return <SwitchCamera {...iconProps} />;
}

export function CloseIcon() {
  return <X {...iconProps} />;
}

export function EndBroadcastIcon() {
  return <Power {...iconProps} />;
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
