"use client";

import React, { createContext, useContext, useCallback, useEffect, useState } from "react";

interface UnreadState {
  /** Total unread messages across all chats */
  total: number;
  /** Per-chat unread counts keyed by chat_id */
  chats: Record<string, number>;
  /** Mark a specific chat as read */
  markRead: (chatId: string) => Promise<void>;
  /** Force refresh from server */
  refresh: () => Promise<void>;
}

const UnreadContext = createContext<UnreadState>({
  total: 0,
  chats: {},
  markRead: async () => {},
  refresh: async () => {},
});

export function useUnread() {
  return useContext(UnreadContext);
}

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const [total, setTotal] = useState(0);
  const [chats, setChats] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/chats/unread", { method: "GET", cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      setTotal(payload?.data?.total ?? 0);
      setChats(payload?.data?.chats ?? {});
    } catch {
      // silently fail — user might not be authenticated
    }
  }, []);

  const markRead = useCallback(
    async (chatId: string) => {
      // Optimistically clear the count for this chat
      setChats((prev) => {
        const removed = prev[chatId] ?? 0;
        setTotal((t) => Math.max(0, t - removed));
        const next = { ...prev };
        delete next[chatId];
        return next;
      });

      try {
        await fetch("/api/chats/unread", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId }),
        });
      } catch {
        // If the server fails, refresh to get correct counts
        await refresh();
      }
    },
    [refresh],
  );

  // Poll every 30 seconds for new message counts
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <UnreadContext.Provider value={{ total, chats, markRead, refresh }}>
      {children}
    </UnreadContext.Provider>
  );
}
