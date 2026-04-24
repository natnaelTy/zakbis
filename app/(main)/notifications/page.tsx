"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, BellDot, Loader2, Package, CheckCircle2, AlertCircle } from "lucide-react";
import { useNotifications, AppNotification } from "@/components/app/notification-provider";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export default function NotificationsPage() {
  const router = useRouter();
  const { notifications, unreadCount, markAsRead, refresh } = useNotifications();
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkAll = async () => {
    setMarking(true);
    await markAsRead();
    setMarking(false);
  };

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.read) {
      await markAsRead(n.id);
    }

    if (n.reference_id) {
      if (n.type === "BUY_ME_UPDATE") {
        router.push(`/buy-me`);
      } else if (n.type === "DELIVERY_UPDATE") {
        router.push(`/delivery/${n.reference_id}`);
      }
    }
  };

  const IconForType = ({ type, read }: { type: string; read: boolean }) => {
    const bgColor = read ? "bg-slate-100 text-slate-400" : "bg-brand-greenLight/10 text-brand-green";
    
    return (
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${bgColor}`}>
        {type === "DELIVERY_UPDATE" ? <Package size={18} /> : 
         type === "BUY_ME_UPDATE" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
            <ArrowLeft size={18} className="text-black" />
          </Link>
          <h1 className="text-base font-bold text-black flex items-center gap-2">
            Alerts
            {unreadCount > 0 && (
              <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-brand-rose text-white text-[10px] font-bold px-1.5 shadow-sm">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </h1>
        </div>
        {unreadCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleMarkAll}
            disabled={marking}
            className="text-brand-green hover:text-brand-greenLight font-semibold text-xs px-2"
          >
            {marking ? <Loader2 size={14} className="animate-spin" /> : "Mark all read"}
          </Button>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-slate-500">
            <Bell size={48} className="text-slate-200 mb-4" />
            <p className="text-base font-bold text-black mb-1">No notifications</p>
            <p className="text-sm text-slate-500">You're all caught up! We'll alert you here when there are updates.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`flex gap-3 p-4 rounded-2xl border transition-colors cursor-pointer ${
                  n.read 
                    ? "bg-white border-black/5 hover:bg-slate-50" 
                    : "bg-white border-brand-green/20 shadow-sm ring-1 ring-brand-green/10"
                }`}
              >
                <IconForType type={n.type} read={n.read} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h3 className={`text-sm truncate pr-2 ${n.read ? "font-semibold text-slate-700" : "font-bold text-black"}`}>
                      {n.title}
                    </h3>
                    <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap shrink-0">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className={`text-xs leading-relaxed ${n.read ? "text-slate-500" : "text-slate-600"}`}>
                    {n.message}
                  </p>
                </div>
                {!n.read && (
                  <div className="w-2 h-2 rounded-full bg-brand-green self-center shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
