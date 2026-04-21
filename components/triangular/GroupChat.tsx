import React, { useEffect, useState, useRef } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Simple group chat UI for a triangular trip.
 * Expects a Supabase table `messages` with columns:
 *   - id (uuid)
 *   - chat_id (uuid)
 *   - user_id (uuid)
 *   - content (text)
 *   - created_at (timestamp)
 */
export default function GroupChat({ chatId }: { chatId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load initial messages
  useEffect(() => {
    let isMounted = true;

    async function load() {
      const response = await fetch(`/api/chats/${chatId}/messages`, {
        method: "GET",
        cache: "no-store",
      });

      if (!isMounted) return;

      if (response.ok) {
        const payload = await response.json();
        setMessages((payload?.data as any[]) ?? []);
      }
      setLoading(false);
    }

    load();
    const interval = window.setInterval(load, 3000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [chatId]);

  // Auto‑scroll to bottom on new messages
  useEffect(() => {
    if (chatContainerRef.current) {
      const { scrollHeight, clientHeight } = chatContainerRef.current;
      chatContainerRef.current.scrollTop = scrollHeight - clientHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    const response = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: newMessage }),
    });
    if (response.ok) setNewMessage("");
  };

  return (
    <div className="flex flex-col h-[400px] border border-black/5 rounded-lg">
      <ScrollArea className="flex-1 p-2" ref={chatContainerRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <Loader2 className="mr-2 animate-spin" /> Loading chat…
          </div>
        ) : (
          <ul className="space-y-2">
            {messages.map((msg) => (
              <li key={msg.id} className="text-sm">
                <span className="font-medium">{msg.sender?.full_name ?? "User"}:</span> {msg.text}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
      <div className="flex border-t border-black/5 p-2">
        <Input
          placeholder="Type a message…"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), sendMessage())}
          className="flex-1"
        />
        <Button onClick={sendMessage} className="ml-2" disabled={loading}>
          <Send className="h-4 w-4 mr-1" /> Send
        </Button>
      </div>
    </div>
  );
}
