import { useState } from "react";
import { Card, PageHeader, Segmented } from "../components/ui.jsx";
import { BellIcon, ChatIcon } from "../components/icons.jsx";
import { NotificationList, useNotifications } from "../shell/NotificationBell.jsx";
import Messenger, { useUnreadCount } from "./Messenger.jsx";

export default function MessagesPage({ conversationId, query }) {
  const [tab, setTab] = useState(query.tab === "notifications" ? "notifications" : "chats");
  const unread = useUnreadCount();
  const notifications = useNotifications();

  return (
    <div>
      <PageHeader
        title="Messages"
        action={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "chats", label: "Chats", icon: ChatIcon, count: unread },
              { value: "notifications", label: "Notifications", icon: BellIcon, count: notifications.unread },
            ]}
          />
        }
      />
      {tab === "chats" ? (
        <Messenger initialConversationId={conversationId} />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <p className="font-bold text-stone-900">All notifications</p>
            {notifications.unread > 0 && (
              <button type="button" onClick={() => notifications.markRead()} className="text-xs font-semibold text-brand-700 hover:text-brand-800">
                Mark all read
              </button>
            )}
          </div>
          <NotificationList items={notifications.items} markRead={notifications.markRead} empty="No notifications yet." />
        </Card>
      )}
    </div>
  );
}
