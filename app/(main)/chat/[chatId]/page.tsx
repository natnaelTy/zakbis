"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Package, ShoppingBag, Plane, User, MessageSquare } from "lucide-react";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { TrackingStepper } from "@/components/triangular/TrackingStepper";
import { BuyMeProgress } from "@/components/triangular/TrackingStepper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useUnread } from "@/components/app/unread-provider";

interface ChatDetails {
  id: string;
  chatType: "GROUP" | "DIRECT";
  deliveryRequestId?: string;
  buyMeRequestId?: string;
}

export default function ChatDetailPage({ 
  params 
}: { 
  params: Promise<{ chatId: string }> 
}) {
  const { chatId } = params as any;
  const [chatDetails, setChatDetails] = useState<ChatDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [deliveryStatus, setDeliveryStatus] = useState<string>("");
  const [buyMeStatus, setBuyMeStatus] = useState<string>("");
  const { markRead } = useUnread();

  useEffect(() => {
    loadChatDetails();
  }, [chatId]);

  const loadChatDetails = async () => {
    const response = await fetch(`/api/chats/${chatId}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      setLoading(false);
      return;
    }

    const payload = await response.json();
    const data = payload?.data as
      | {
          id: string;
          chatType: "GROUP" | "DIRECT";
          deliveryRequestId?: string;
          buyMeRequestId?: string;
          deliveryStatus?: string | null;
          buyMeStatus?: string | null;
        }
      | undefined;

    if (!data) {
      setLoading(false);
      return;
    }

    setChatDetails({
      id: data.id,
      chatType: data.chatType,
      deliveryRequestId: data.deliveryRequestId,
      buyMeRequestId: data.buyMeRequestId,
    });
    setDeliveryStatus(data.deliveryStatus ?? "");
    setBuyMeStatus(data.buyMeStatus ?? "");

    // Mark this chat as read
    markRead(data.id);

    setLoading(false);
  };

  const deliveryType = chatDetails?.chatType === "GROUP" ? "triangular" : "buy_me";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <div className="flex items-center gap-2 text-slate-500">
          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (!chatDetails) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white">
        <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mb-4">
          <MessageSquare size={32} className="text-slate-300" />
        </div>
        <p className="text-sm font-medium text-slate-500">Chat not found</p>
        <Link href="/chat" className="mt-4 text-sm text-black underline">
          Back to Chats
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center gap-3 shadow-sm">
        <Link 
          href="/chat" 
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={18} className="text-black" />
        </Link>
        <h1 className="text-base font-bold text-black flex-1">
          {chatDetails.chatType === "GROUP" ? "Delivery Group" : "Shopping Chat"}
        </h1>
        <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors">
          <User size={18} className="text-black" />
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-4 space-y-4">
        {/* Status Header */}
        <Card className="border border-black/5 p-4">
          <div className="flex items-center gap-3 mb-3">
            {chatDetails.chatType === "GROUP" ? (
              <div className="w-10 h-10 bg-gradient-to-r from-brand-green to-brand-greenLight rounded-xl flex items-center justify-center text-white shadow-sm">
                <Package size={20} className="text-white" />
              </div>
            ) : (
              <div className="w-10 h-10 bg-gradient-to-r from-brand-green to-brand-greenLight rounded-xl flex items-center justify-center text-white shadow-sm">
                <ShoppingBag size={20} className="text-white" />
              </div>
            )}
            <div>
              <h2 className="text-sm font-bold text-black">
                {chatDetails.chatType === "GROUP" 
                  ? "Delivery Request" 
                  : "Shopping Request"}
              </h2>
              <p className="text-xs text-slate-500">
                ID: {chatDetails.id.slice(0, 8)}
              </p>
            </div>
          </div>

          {chatDetails.chatType === "GROUP" && deliveryStatus ? (
            <TrackingStepper 
              status={deliveryStatus as any} 
              deliveryType="triangular"
            />
          ) : chatDetails.chatType === "DIRECT" && buyMeStatus ? (
            <BuyMeProgress status={buyMeStatus as any} />
          ) : (
            <p className="text-xs text-slate-500">No status available</p>
          )}
        </Card>

        {/* Chat Area */}
        <div className="space-y-4">
          <ChatRoom 
            chatId={chatId}
            deliveryRequestId={chatDetails.deliveryRequestId}
            buyMeRequestId={chatDetails.buyMeRequestId}
            deliveryType={deliveryType}
            className="h-[500px]"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 text-sm">
            <Plane size={16} className="mr-2" />
            Track
          </Button>
          <Button variant="outline" className="h-11 text-sm">
            <MessageSquare size={16} className="mr-2" />
            Details
          </Button>
        </div>
      </main>
    </div>
  );
}