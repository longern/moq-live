import {
  ChevronRight,
  Check,
  Bell,
  Circle,
  Handshake,
  Image,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  Pause,
  Power,
  Share,
  SlidersHorizontal,
  SwitchCamera,
  Type,
  Users,
  Video,
  VideoOff,
  Volume2,
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

export function CheckIcon() {
  return <Check {...iconProps} />;
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

export function QualityIcon() {
  return <SlidersHorizontal {...iconProps} />;
}

export function AudioVideoSettingsIcon() {
  return <Video {...iconProps} />;
}

export function CameraIcon({ enabled }) {
  return enabled ? <Video {...iconProps} /> : <VideoOff {...iconProps} />;
}

export function CoverIcon() {
  return <Image {...iconProps} />;
}

export function TitleIcon() {
  return <Type {...iconProps} />;
}

export function MenuChevronIcon() {
  return <ChevronRight {...iconProps} />;
}

export function ScreenShareIcon() {
  return <MonitorUp {...iconProps} />;
}

export function ChatIcon() {
  return <MessageCircle {...iconProps} />;
}

export function CohostIcon() {
  return <Handshake {...iconProps} />;
}

export function AudienceIcon() {
  return <Users {...iconProps} />;
}

export function SpeakerIcon() {
  return <Volume2 {...iconProps} />;
}

export function NotificationIcon() {
  return <Bell {...iconProps} />;
}

export function LocationIcon() {
  return <MapPin {...iconProps} />;
}

export function MoreIcon() {
  return <MoreHorizontal {...iconProps} />;
}
