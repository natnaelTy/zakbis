"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, Paperclip, Image as ImageIcon } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { useUnread } from "@/components/app/unread-provider";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/lib/redux/store";
import { fetchMessages, addMessage, setCurrentUser, clearChat, replaceTempMessage } from "@/lib/redux/features/chat/chatSlice";

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
  const [participants, setParticipants] = React.useState<null | { senderId?: string | null; travelerId?: string | null; receiverId?: string | null }>(null);
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

  useEffect(() => {
    // Fetch participants and currentUserId alongside messages so we can map roles
    (async () => {
      try {
        const res = await fetch(`/api/chats/${chatId}/messages`, { cache: "no-store" });
        if (res.ok) {
          const payload = await res.json();
          if (payload?.participants) setParticipants(payload.participants);
          if (payload?.currentUserId) dispatch(setCurrentUser(payload.currentUserId));
        }
      } catch (err) {
        // ignore
      }
    })();
  }, [chatId, dispatch]);

  // Note: `Conversation` handles sticky-to-bottom behavior. Keep ref available for
  // any imperative needs, but auto-scroll is handled by the conversation component.

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    // optimistic UI: add a temporary message immediately
    const tempId = `temp-${Date.now()}`;
    const currentSender = messages.find((m) => m.sender_id === currentUser)?.sender ?? { full_name: "You", avatar_url: null };
    const tempMessage: Message = {
      id: tempId,
      chat_id: chatId,
      sender_id: currentUser ?? "",
      text: newMessage,
      created_at: new Date().toISOString(),
      sender: currentSender,
    };

    dispatch(addMessage(tempMessage));
    setNewMessage("");

    try {
      const response = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: tempMessage.text }),
      });

      if (!response.ok) {
        // remove temp message and notify
        console.error("Error sending message");
        return;
      }

      const payload = await response.json();
      const serverData = payload?.data;
      if (serverData) {
        const serverMessage: Message = {
          id: serverData.id,
          chat_id: serverData.chat_id,
          sender_id: serverData.sender_id,
          text: serverData.text,
          created_at: serverData.created_at,
          sender: currentSender,
        };
        // replace the optimistic temp message with server message
        dispatch((replaceTempMessage as any)({ tempId, message: serverMessage }));
      }
    } catch (err) {
      console.error("Send error", err);
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
      <div className="flex-1 relative" ref={chatContainerRef}>
        <Conversation className="h-full">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="animate-spin text-slate-400" />
            </div>
          ) : messages.length === 0 ? (
            <ConversationEmptyState
              className="h-full"
              title="No messages yet"
              description="Start the conversation"
              icon={<Send size={24} />}
            />
          ) : (
            <ConversationContent>
              <div className="space-y-3">
                {messages.map((msg) => {
                  const isCurrent = msg.sender_id === currentUser;
                  const role = participants
                    ? msg.sender_id === participants.senderId
                      ? "sender"
                      : msg.sender_id === participants.travelerId
                        ? "traveler"
                        : msg.sender_id === participants.receiverId
                          ? "receiver"
                          : "other"
                    : "other";

                  const bubbleClass = isCurrent
                    ? "bg-black text-white rounded-br-none"
                    : role === "sender"
                      ? "bg-amber-50 text-black border border-amber-200"
                      : role === "traveler"
                        ? "bg-sky-50 text-black border border-sky-200"
                        : role === "receiver"
                          ? "bg-emerald-50 text-black border border-emerald-200"
                          : "bg-slate-100 text-black rounded-bl-none border border-black/5";

                  const avatar = (
                    <Avatar size={"sm"}>
                      {msg.sender?.avatar_url ? (
                        <AvatarImage src={msg.sender?.avatar_url} alt={msg.sender?.full_name ?? ""} />
                      ) : (
                        <AvatarFallback>
                          {(msg.sender?.full_name || "?").split(" ").map((n) => n[0]).slice(0,2).join("")}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  );

                  return (
                    <div key={msg.id} className={`flex items-start ${isCurrent ? "justify-end" : "justify-start"}`}>
                      {!isCurrent && (
                        <div className="mr-2">{avatar}</div>
                      )}

                      <div className={`flex flex-col ${isCurrent ? "items-end" : "items-start"}`}>
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

                        <div className={`max-w-[205%] px-4 py-2 rounded-2xl text-xs ${bubbleClass}`}>
                          {msg.text}
                        </div>
                      </div>

                      {isCurrent && (
                        <div className="ml-2">{avatar}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ConversationContent>
          )}

          <ConversationScrollButton />
        </Conversation>
      </div>

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
