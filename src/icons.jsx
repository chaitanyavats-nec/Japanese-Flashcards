import React from 'react';

// One line-icon family for the whole app: 24px grid, round caps and joins,
// stroke in currentColor.
const Icon = ({ size = 20, strokeWidth = 2, children, ...props }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {children}
  </svg>
);

export const IconRefresh = (props) => (
  <Icon size={18} strokeWidth={2.2} {...props}>
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 4v5h-5" />
  </Icon>
);

export const IconSun = (props) => (
  <Icon size={18} strokeWidth={2.2} {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const IconSearch = (props) => (
  <Icon size={28} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>
);

export const IconFlip = (props) => (
  <Icon size={13} {...props}>
    <path d="M17 2l4 4-4 4" />
    <path d="M21 6H9a5 5 0 0 0-5 5v1" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M3 18h12a5 5 0 0 0 5-5v-1" />
  </Icon>
);

export const IconRoute = (props) => (
  <Icon {...props}>
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="5" r="2" />
    <path d="M8 19h8a4 4 0 0 0 4-4v-1a4 4 0 0 0-4-4H8a4 4 0 0 1-4-4V5" />
  </Icon>
);

export const IconHome = (props) => (
  <Icon {...props}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </Icon>
);

export const IconBook = (props) => (
  <Icon {...props}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Icon>
);

export const IconKana = (props) => (
  <Icon {...props}>
    <path d="M4 6h9" />
    <path d="M8.5 3.5v3c0 5-1.5 8-4.5 10.5" />
    <path d="M13 20.5c2-1 3.3-2.6 4-4.5" />
    <path d="M14.5 10.5h6" />
    <path d="M17.5 8v2.5c0 4-1 6.7-3 8.5" />
    <path d="M14.5 14h6" />
  </Icon>
);

export const IconRadical = (props) => (
  <Icon {...props}>
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="5" r="2.2" />
    <circle cx="18" cy="12" r="2.2" />
    <circle cx="18" cy="19" r="2.2" />
    <path d="M8.6 10.6L15.7 6M9 12h6.8M8.6 13.4L15.7 18" />
  </Icon>
);

export const IconCheckCircle = (props) => (
  <Icon size={40} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.3 2.3 4.7-5" />
  </Icon>
);

export const IconSpeaker = ({ size = 22, ...props }) => (
  <Icon size={size} strokeWidth={1.8} {...props}>
    <polygon points="4 8 8 8 12 4 12 20 8 16 4 16 4 8" />
    <path d="M16 8.5a4.5 4.5 0 0 1 0 7" />
    <path d="M18.5 6a8 8 0 0 1 0 12" />
  </Icon>
);

export const IconChevron = ({ dir = 'right', size = 14 }) => {
  const points = { right: '9 18 15 12 9 6', left: '15 18 9 12 15 6', down: '6 9 12 15 18 9', up: '18 15 12 9 6 15' }[dir];
  return (
    <Icon size={size}>
      <polyline points={points} />
    </Icon>
  );
};

export const IconCheck = (props) => (
  <Icon size={18} strokeWidth={2.2} {...props}>
    <polyline points="20 6 9 17 4 12" />
  </Icon>
);

export const IconX = (props) => (
  <Icon size={18} strokeWidth={2.2} {...props}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
);

export const IconFlame = (props) => (
  <Icon {...props}>
    <path d="M12 3c.5 3.2 4.5 5.3 4.5 10a4.5 4.5 0 0 1-9 0c0-2.2 1.2-3.6 2.3-4.8.3 1.5 1 2.5 2 3 .3-2.8-.6-5.6.2-8.2z" />
  </Icon>
);

export const IconChart = (props) => (
  <Icon {...props}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M22 20H2" />
  </Icon>
);

export const IconGear = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
);

export const IconProfile = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
);

export const IconMic =(props) => (
  <Icon {...props}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
    <path d="M12 18v4" />
  </Icon>
);

export const IconPlus = (props) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconUndo = (props) => (
  <Icon size={16} {...props}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </Icon>
);

export const IconClock = (props) => (
  <Icon size={16} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const IconSparkle = (props) => (
  <Icon size={16} {...props}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
  </Icon>
);

export const IconMedal = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="15" r="6" />
    <path d="M8.5 10.1L6 3h4l2 4 2-4h4l-2.5 7.1" />
    <path d="M12 12.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z" />
  </Icon>
);

export const IconDownload = (props) => (
  <Icon size={16} {...props}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </Icon>
);

export const IconUpload = (props) => (
  <Icon size={16} {...props}>
    <path d="M12 21V9" />
    <path d="M7 14l5-5 5 5" />
    <path d="M5 3h14" />
  </Icon>
);

export const IconBell = (props) => (
  <Icon size={16} {...props}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </Icon>
);

export const IconPencil = (props) => (
  <Icon size={16} {...props}>
    <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </Icon>
);

export const IconTrash = (props) => (
  <Icon size={16} {...props}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  </Icon>
);

export const IconBolt = (props) => (
  <Icon size={16} {...props}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
  </Icon>
);

export const IconLightbulb = (props) => (
  <Icon size={16} {...props}>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
  </Icon>
);
