"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Paperclip, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { useUnread } from "@/components/app/unread-provider";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/lib/redux/store";
import { fetchMessages, addMessage, setCurrentUser, clearChat } from "@/lib/redux/features/chat/chatSlice";

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  sender?: {
    full_name: string;
    avatar_url?: string | null;
  };
}

interface ChatRoomProps {
  chatId: string;
  deliveryRequestId?: string;
  buyMeRequestId?: string;
  deliveryType: "triangular" | "buy_me";
  className?: string;
}

type RealtimeMessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  created_at: string;
};

export function ChatRoom({
  chatId,
  deliveryRequestId,
  buyMeRequestId,
  deliveryType,
  className,
}: ChatRoomProps) {
  const dispatch = useDispatch<AppDispatch>();
  const { messages, loading, currentUser } = useSelector((state: RootState) => state.chat);
  const [newMessage, setNewMessage] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { markRead } = useUnread();

  // Load initial messages once, then receive new messages through Supabase Realtime.
  useEffect(() => {
    const supabase = createClient();
    const senderCache = new Map<string, Message["sender"]>();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function attachSender(row: RealtimeMessageRow): Promise<Message> {
      let sender = senderCache.get(row.sender_id);
      if (!sender) {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", row.sender_id)
          .maybeSingle();
        sender = {
          full_name: data?.full_name ?? "Unknown",
          avatar_url: data?.avatar_url ?? null,
        };
        senderCache.set(row.sender_id, sender);
      }
      return { ...row, sender };
    }

    // Load initial messages via Redux thunk
    dispatch(fetchMessages(chatId)).then((action) => {
      if (fetchMessages.fulfilled.match(action)) {
        // after loading, set current user if provided by API
        const payload = (action.payload as any) ?? [];
        // API also returns currentUserId in a separate field; fetch it manually
        fetch(`/api/chats/${chatId}`)
          .then((res) => res.json())
          .then((p) => {
            dispatch(setCurrentUser(p?.currentUserId ?? null));
            markRead(chatId);
          })
          .catch(() => {});
      }
    });

    channel = supabase
      .channel(`chat-room:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        async (payload) => {
          const message = await attachSender(payload.new as RealtimeMessageRow);
          dispatch(addMessage(message));
          if (message.sender_id !== currentUser) {
            await markRead(chatId);
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`Realtime chat subscription failed: ${status}`);
        }
      });

    return () => {
      if (channel) supabase.removeChannel(channel);
      dispatch(clearChat());
    };
  }, [chatId, dispatch, markRead, currentUser]);

  // Auto-scroll to bottom on new messages
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

    if (response.ok) {
      setNewMessage("");
    } else {
      console.error("Error sending message");
    }
  };

  const handleFileUpload = async () => {
    if (fileInputRef.current && fileInputRef.current.files && fileInputRef.current.files[0]) {
      const file = fileInputRef.current.files[0];
      setUploading(true);

      if (buyMeRequestId && deliveryType === "buy_me") {
        // Upload receipt to Supabase Storage via API
        const formData = new FormData();
        formData.append("requestId", buyMeRequestId);
        formData.append("file", file);

        try {
          const response = await fetch("/api/buy-me-requests/receipt", {
            method: "POST",
            body: formData,
          });

          const payload = await response.json();

          if (!response.ok) {
            console.error("Upload failed:", payload?.error);
          } else {
            console.log("Receipt uploaded:", payload);
          }
        } catch (error) {
          console.error("Upload error:", error);
        }
      }

      setUploading(false);
      fileInputRef.current.value = "";
    }
  };

  return (
    <Card className={`border border-black/5 rounded-xl flex flex-col h-[600px] ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-black/5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-black">
            {deliveryType === "triangular" ? "Delivery Group" : "Shopping Chat"}
          </h3>
          <p className="text-[10px] text-slate-500">
            {deliveryType === "triangular"
              ? "Sender • Traveler • Receiver"
              : "Traveler • Receiver"}
          </p>
        </div>
        <div className="flex gap-2">
          {buyMeRequestId && deliveryType === "buy_me" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                console.log("Mark as purchased");
              }}
            >
              <ImageIcon size={14} />
              Upload Receipt
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleFileUpload}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={18} />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={chatContainerRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-slate-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
              <Send size={24} />
            </div>
            <p className="text-sm">Start the conversation</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender_id === currentUser ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-black">
                    {msg.sender?.full_name ?? "Unknown"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div
                  className={`
                    max-w-[75%] px-4 py-2 rounded-2xl text-sm
                    ${msg.sender_id === currentUser
                      ? "bg-black text-white rounded-br-none"
                      : "bg-slate-100 text-black rounded-bl-none border border-black/5"
                    }
                  `}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-black/5">
        <div className="flex items-center gap-2">
          <Input
            placeholder={deliveryType === "buy_me" ? "Message traveler..." : "Message in group..."}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendMessage();
              }
            }}
            className="flex-1 h-10"
            disabled={loading}
          />
          <Button
            onClick={sendMessage}
            disabled={loading || uploading || !newMessage.trim()}
            className="h-10 min-w-10"
          >
            {uploading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <Send size={18} />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 text-center">
          {deliveryType === "buy_me"
            ? "Send files directly to traveler"
            : "Group chat for all participants"}
        </p>
      </div>
    </Card>
  );
}

// Buy Me Chat Component with receipt upload feature
export function BuyMeChat({
  buyMeRequestId,
  className
}: {
  buyMeRequestId: string;
  className?: string;
}) {
  const [status, setStatus] = useState<"open" | "accepted" | "purchased" | "delivered">("open");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleMarkAsPurchased = () => {
    fileRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Basic client-side validation (server also validates)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File too large. Max 10MB.");
      e.currentTarget.value = "";
      return;
    }

    setUploading(true);

    const formData = new FormData();
    formData.append("requestId", buyMeRequestId);
    formData.append("file", file);

    try {
      const res = await fetch("/api/buy-me-requests/receipt", {
        method: "POST",
        body: formData,
      });

      const payload = await res.json();

      if (!res.ok) {
        toast.error(payload?.error ?? "Upload failed");
      } else {
        toast.success("Receipt uploaded. Request marked purchased.");
        setStatus("purchased");
      }
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.currentTarget.value = "";
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="bg-white border border-black/5 rounded-xl p-4">
        <h4 className="text-sm font-bold text-black mb-2">Receipt Upload</h4>
        <p className="text-xs text-slate-500 mb-3">
          Once you've purchased the item, upload the receipt to move to "Purchased" status.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          onClick={handleMarkAsPurchased}
          disabled={status === "purchased" || status === "delivered" || uploading}
          className="w-full"
        >
          {uploading ? "Uploading..." : status === "purchased" ? "Receipt Uploaded" : status === "delivered" ? "Delivered" : "Upload Receipt"}
        </Button>
      </div>
    </div>
  );
}
