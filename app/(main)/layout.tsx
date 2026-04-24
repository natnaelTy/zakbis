import { BottomNav } from "@/components/app/bottom-nav";
import { UnreadProvider } from "@/components/app/unread-provider";
import { NotificationProvider } from "@/components/app/notification-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UnreadProvider>
      <NotificationProvider>
        <div className="min-h-screen bg-white">
          <div className="pb-20">{children}</div>
          <BottomNav />
        </div>
      </NotificationProvider>
    </UnreadProvider>
  );
}
