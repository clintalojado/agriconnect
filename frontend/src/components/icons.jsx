// Small stroke icon set (20x20 grid, currentColor) used across the app.

function Svg({ children, ...props }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const SproutIcon = (p) => (
  <Svg {...p}>
    <path d="M10 18v-7" />
    <path d="M10 11C10 7 7.5 4.5 3.5 4.5c0 4 2.5 6.5 6.5 6.5Z" />
    <path d="M10 9c0-3.3 2.2-5.5 6.5-5.5 0 3.8-2.4 5.5-6.5 5.5Z" />
  </Svg>
);

export const HomeIcon = (p) => (
  <Svg {...p}>
    <path d="M3 9.5 10 3.5l7 6V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1V9.5Z" />
  </Svg>
);

export const StoreIcon = (p) => (
  <Svg {...p}>
    <path d="M3 8.5 4.2 3.5h11.6L17 8.5" />
    <path d="M3 8.5h14V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5Z" />
    <path d="M8 17v-4h4v4" />
  </Svg>
);

export const ChartIcon = (p) => (
  <Svg {...p}>
    <path d="M3 17h14" />
    <rect x="4" y="10" width="2.8" height="5" rx="0.6" />
    <rect x="8.6" y="6" width="2.8" height="9" rx="0.6" />
    <rect x="13.2" y="3" width="2.8" height="12" rx="0.6" />
  </Svg>
);

export const ChatIcon = (p) => (
  <Svg {...p}>
    <path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3H4A1.5 1.5 0 0 1 2.5 13V6A1.5 1.5 0 0 1 4 4.5Z" />
    <path d="M6.5 8.5h7M6.5 11h4" />
  </Svg>
);

export const PhoneIcon = (p) => (
  <Svg {...p}>
    <path d="M4.5 2.8h2.7l1.3 3.4-1.8 1.2a8.6 8.6 0 0 0 5.9 5.9l1.2-1.8 3.4 1.3v2.7a1.7 1.7 0 0 1-1.8 1.7C8.9 16.7 3.3 11.1 2.8 4.6a1.7 1.7 0 0 1 1.7-1.8Z" />
  </Svg>
);

export const PhoneOffIcon = (p) => (
  <Svg {...p}>
    <path d="M3 10.6c3.9-3.5 10.1-3.5 14 0l-1.6 2.5-3-1.1v-2a8.5 8.5 0 0 0-4.8 0v2l-3 1.1L3 10.6Z" />
  </Svg>
);

export const MicIcon = (p) => (
  <Svg {...p}>
    <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
    <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
  </Svg>
);

export const MicOffIcon = (p) => (
  <Svg {...p}>
    <path d="M12.5 8V5a2.5 2.5 0 0 0-4.8-1M7.5 7.5V9a2.5 2.5 0 0 0 4 2" />
    <path d="M4.5 9.5a5.5 5.5 0 0 0 9.2 4M15.5 9.5c0 .6-.1 1.2-.3 1.7M10 15v2.5M3 3l14 14" />
  </Svg>
);

export const SendIcon = (p) => (
  <Svg {...p}>
    <path d="M17.5 2.5 8.8 11.2M17.5 2.5l-5.5 15-3.2-6.3L2.5 8l15-5.5Z" />
  </Svg>
);

export const SparkleIcon = (p) => (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M8 1.5c.3 2.2 1 3.4 3.3 3.7-2.3.3-3 1.5-3.3 3.7-.3-2.2-1-3.4-3.3-3.7 2.3-.3 3-1.5 3.3-3.7ZM13 9c.2 1.3.6 1.9 1.9 2.1-1.3.2-1.7.8-1.9 2.1-.2-1.3-.6-1.9-1.9-2.1 1.3-.2 1.7-.8 1.9-2.1Z" />
  </svg>
);

export const CheckIcon = (p) => (
  <Svg {...p}>
    <path d="m4 10.5 4 4 8-9" />
  </Svg>
);

export const CheckDoubleIcon = (p) => (
  <Svg {...p}>
    <path d="m1.5 10.5 3.5 3.5 7-8M9 13.5l.5.5 7-8" />
  </Svg>
);

export const AlertIcon = (p) => (
  <Svg {...p}>
    <path d="M10 2.8 18 16.5H2L10 2.8Z" />
    <path d="M10 8v3.5M10 14v.1" />
  </Svg>
);

export const InfoIcon = (p) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 9v4.5M10 6.5v.1" />
  </Svg>
);

export const XIcon = (p) => (
  <Svg {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Svg>
);

export const ArrowLeftIcon = (p) => (
  <Svg {...p}>
    <path d="M16 10H4M9 5l-5 5 5 5" />
  </Svg>
);

export const SearchIcon = (p) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13 13 4 4" />
  </Svg>
);

export const TruckIcon = (p) => (
  <Svg {...p}>
    <path d="M1.5 5h10v8.5h-10zM11.5 8h3.5l3 3v2.5h-6.5" />
    <circle cx="5" cy="14.5" r="1.5" />
    <circle cx="14.5" cy="14.5" r="1.5" />
  </Svg>
);

export const UsersIcon = (p) => (
  <Svg {...p}>
    <circle cx="7.5" cy="6.5" r="3" />
    <path d="M2 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M13 3.8a3 3 0 0 1 0 5.4M15 12.3c1.8.6 3 2.3 3 4.7" />
  </Svg>
);

export const RouteIcon = (p) => (
  <Svg {...p}>
    <circle cx="4.5" cy="15.5" r="2" />
    <circle cx="15.5" cy="4.5" r="2" />
    <path d="M6.5 15.5h6a3 3 0 0 0 0-6h-5a3 3 0 0 1 0-6h6" />
  </Svg>
);

export const PesoIcon = (p) => (
  <Svg {...p}>
    <path d="M6 17V3h4.5a4 4 0 0 1 0 8H6M3.5 6.5h13M3.5 9h13" />
  </Svg>
);

export const ClockIcon = (p) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 5.5V10l3 2" />
  </Svg>
);

export const BoxIcon = (p) => (
  <Svg {...p}>
    <path d="M10 2.5 17 6v8l-7 3.5L3 14V6l7-3.5Z" />
    <path d="m3 6 7 3.5L17 6M10 9.5v8" />
  </Svg>
);

export const SmsIcon = (p) => (
  <Svg {...p}>
    <rect x="5" y="1.5" width="10" height="17" rx="2" />
    <path d="M8 15.5h4M7.5 5.5h5M7.5 8h3.5" />
  </Svg>
);

export const RefreshIcon = (p) => (
  <Svg {...p}>
    <path d="M16.5 10a6.5 6.5 0 1 1-2-4.7L16.5 7" />
    <path d="M16.5 3v4h-4" />
  </Svg>
);

export const ChevronDownIcon = (p) => (
  <Svg {...p}>
    <path d="m5 7.5 5 5 5-5" />
  </Svg>
);

export const EditIcon = (p) => (
  <Svg {...p}>
    <path d="M12.5 4 16 7.5 7 16.5H3.5V13L12.5 4Z" />
  </Svg>
);

export const GlobeIcon = (p) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M2.5 10h15M10 2.5c2 2 3 4.5 3 7.5s-1 5.5-3 7.5c-2-2-3-4.5-3-7.5s1-5.5 3-7.5Z" />
  </Svg>
);

export const BellIcon = (p) => (
  <Svg {...p}>
    <path d="M5 8a5 5 0 0 1 10 0c0 4.5 1.5 6 1.5 6h-13S5 12.5 5 8ZM8.3 16.5a1.8 1.8 0 0 0 3.4 0" />
  </Svg>
);

export const CartIcon = (p) => (
  <Svg {...p}>
    <path d="M2.5 3.5h2l1.8 9h9l1.7-6.5H5.4" />
    <circle cx="7.5" cy="16" r="1.2" />
    <circle cx="14" cy="16" r="1.2" />
  </Svg>
);

export const StarIcon = ({ filled, ...p }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...p}>
    <path
      d="m10 2.5 2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7L10 2.5Z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

export const SettingsIcon = (p) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="2.5" />
    <path d="M10 1.8v2.4M10 15.8v2.4M18.2 10h-2.4M4.2 10H1.8M15.8 4.2l-1.7 1.7M5.9 14.1l-1.7 1.7M15.8 15.8l-1.7-1.7M5.9 5.9 4.2 4.2" />
  </Svg>
);

export const AwardIcon = (p) => (
  <Svg {...p}>
    <circle cx="10" cy="7.5" r="5" />
    <path d="m7 11.5-1.5 6 4.5-2.3 4.5 2.3-1.5-6" />
    <path d="m10 5 .8 1.6 1.7.2-1.2 1.2.3 1.7L10 8.9l-1.6.8.3-1.7-1.2-1.2 1.7-.2L10 5Z" />
  </Svg>
);

export const PinIcon = (p) => (
  <Svg {...p}>
    <path d="M10 18s-5.5-5-5.5-9.5a5.5 5.5 0 0 1 11 0C15.5 13 10 18 10 18Z" />
    <circle cx="10" cy="8.5" r="2" />
  </Svg>
);

export const ShieldCheckIcon = (p) => (
  <Svg {...p}>
    <path d="M10 2.5 16 5v4.5c0 4-2.6 6.8-6 8-3.4-1.2-6-4-6-8V5l6-2.5Z" />
    <path d="m7.2 10 2 2 3.8-4" />
  </Svg>
);

export const InboxIcon = (p) => (
  <Svg {...p}>
    <path d="M3 11.5 5 4h10l2 7.5V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4.5Z" />
    <path d="M3 11.5h4.5l1 2h3l1-2H17" />
  </Svg>
);

export const ClipboardIcon = (p) => (
  <Svg {...p}>
    <rect x="4" y="3.5" width="12" height="14" rx="1.5" />
    <path d="M7.5 3.5V2.5h5v1M7 8h6M7 11h6M7 14h3.5" />
  </Svg>
);

export const PlusIcon = (p) => (
  <Svg {...p}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);

export const TrashIcon = (p) => (
  <Svg {...p}>
    <path d="M3.5 5.5h13M8 5.5V3.5h4v2M5 5.5l.8 11h8.4l.8-11" />
  </Svg>
);

export const LogOutIcon = (p) => (
  <Svg {...p}>
    <path d="M8 3.5H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H8M12.5 6.5 16 10l-3.5 3.5M16 10H7.5" />
  </Svg>
);

export const CalendarIcon = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="14" height="13" rx="1.5" />
    <path d="M3 8h14M7 2.5v3M13 2.5v3" />
  </Svg>
);

export const TagIcon = (p) => (
  <Svg {...p}>
    <path d="M2.5 10.3V3.5a1 1 0 0 1 1-1h6.8l7.2 7.2a1 1 0 0 1 0 1.4l-5.8 5.8a1 1 0 0 1-1.4 0l-7.8-6.6Z" />
    <circle cx="6.5" cy="6.5" r="1.2" />
  </Svg>
);

export const MessengerIcon = (p) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" {...p}>
    <path
      fill="currentColor"
      d="M10 1.8c-4.6 0-8.2 3.4-8.2 7.9 0 2.4 1 4.4 2.7 5.8v2.8l2.6-1.4c.9.2 1.9.4 2.9.4 4.6 0 8.2-3.4 8.2-7.6S14.6 1.8 10 1.8Zm.8 10.3-2.1-2.2-4.1 2.2 4.5-4.8 2.1 2.2 4.1-2.2-4.5 4.8Z"
    />
  </svg>
);

export function LeafMark(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 19c8 0 14-6 14-14 0 0-11-1-14 6-2 4.5 0 8 0 8Z" fill="currentColor" opacity="0.95" />
      <path d="M5 19c2-4 5-8 10-11" stroke="#14412e" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
