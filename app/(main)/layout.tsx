"use client"
import { BottomNav } from "@/components/app/bottom-nav";
import { UnreadProvider } from "@/components/app/unread-provider";
import { NotificationProvider } from "@/components/app/notification-provider";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setPresence } from "@/lib/redux/presenceSlice";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    const supabase = createClient();
    // Subscribe to a broadcast channel that sends presence updates.
    const channel = supabase.channel("presence", {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "presence_update" }, (payload) => {
        // Expected payload: { userId: string, online: boolean, lastSeen: string }
        const { userId, online, lastSeen } = payload.payload as any;
        dispatch(
          setPresence({
            userId,
            info: { online, lastSeen },
          })
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dispatch]);
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
