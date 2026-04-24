"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePathname } from "next/navigation";

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  reference_id: string | null;
  read: boolean;
  created_at: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAsRead: (id?: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const pathname = usePathname();

  const loadNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const { data, meta } = await res.json();
        // Skip if table doesn't exist yet
        if (!meta?.missingTable) {
          setNotifications(data || []);
        }
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    }
  };

  const markAsRead = async (id?: string) => {
    try {
      const targetId = id || "MARK_ALL_READ";
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetId }),
      });
      
      if (targetId === "MARK_ALL_READ") {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      } else {
        setNotifications((prev) => prev.map((n) => n.id === targetId ? { ...n, read: true } : n));
      }
    } catch (err) {
      console.error("Failed to mark read:", err);
    }
  };

  useEffect(() => {
    loadNotifications();
    // Refresh periodically
    const interval = setInterval(loadNotifications, 30000); // 30s
    return () => clearInterval(interval);
  }, [pathname]); // Refresh on route changes

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, refresh: loadNotifications }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
