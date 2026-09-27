import {
  AwardIcon,
  BoxIcon,
  CartIcon,
  ChartIcon,
  ChatIcon,
  ClipboardIcon,
  HomeIcon,
  InboxIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SmsIcon,
  StoreIcon,
  TagIcon,
  UsersIcon,
} from "../components/icons.jsx";

// Sidebar (desktop) and bottom tabs (mobile, `mobile` label) per role.
// `badge` names a live counter provided by the shell.
export const NAV = {
  farmer: [
    { to: "dashboard", label: "Dashboard", icon: HomeIcon, mobile: "Home" },
    { to: "marketplace", label: "Marketplace", icon: CartIcon, mobile: "Market" },
    { to: "requests", label: "My Requests", icon: ClipboardIcon, mobile: "Requests" },
    { to: "orders", label: "Orders", icon: BoxIcon },
    { to: "suppliers", label: "Suppliers", icon: StoreIcon },
    { to: "messages", label: "Messages", icon: ChatIcon, mobile: "Messages", badge: "unread" },
    { to: "points", label: "AgriPoints", icon: AwardIcon },
    { to: "community", label: "Community", icon: UsersIcon },
    { to: "settings", label: "Settings", icon: SettingsIcon, mobile: "Profile" },
  ],
  supplier: [
    { to: "dashboard", label: "New Requests", icon: HomeIcon, mobile: "Home" },
    { to: "quotes", label: "My Quotes", icon: TagIcon, mobile: "Quotes" },
    { to: "orders", label: "Orders", icon: BoxIcon, mobile: "Orders" },
    { to: "products", label: "My Products", icon: CartIcon },
    { to: "pooled", label: "Pooled Demand", icon: UsersIcon },
    { to: "messages", label: "Messages", icon: ChatIcon, mobile: "Messages", badge: "unread" },
    { to: "community", label: "Community", icon: UsersIcon },
    { to: "settings", label: "Settings", icon: SettingsIcon, mobile: "Profile" },
  ],
  staff: [
    { to: "dashboard", label: "Dashboard", icon: HomeIcon, mobile: "Home" },
    { to: "inbox", label: "Incoming Messages", icon: InboxIcon, mobile: "Inbox", badge: "inbox" },
    { to: "verification", label: "Verification", icon: ShieldCheckIcon, mobile: "Verify", badge: "verification" },
    { to: "requests", label: "Structured Requests", icon: ClipboardIcon },
    { to: "orders", label: "Orders", icon: BoxIcon, mobile: "Orders" },
    { to: "suppliers", label: "Suppliers", icon: StoreIcon },
    { to: "reports", label: "Reports", icon: ChartIcon, mobile: "Reports" },
    { to: "simulator", label: "SMS & Messenger", icon: SmsIcon },
  ],
};

export const ROLE_LABEL = { farmer: "Farmer", supplier: "Supplier", staff: "Barangay / LGU / Coop" };
