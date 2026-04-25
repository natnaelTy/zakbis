"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";

interface MockMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: string;
  isSelf: boolean;
}

// Mock data for demonstration
const MOCK_MESSAGES: MockMessage[] = [
  {
    id: "1",
    text: "Hi there! I'm looking for someone to carry a package from Dubai to Addis Ababa.",
    senderId: "sender",
    senderName: "Sender User",
    timestamp: "10:30 AM",
    isSelf: false,
  },
  {
    id: "2",
    text: "Hello! I'll be flying from Dubai to Addis Ababa on March 15th. What's the package weight?",
    senderId: "traveler",
    senderName: "John Doe",
    timestamp: "10:35 AM",
    isSelf: false,
  },
  {
    id: "3",
    text: "It's about 5kg. I'll need it delivered by March 17th.",
    senderId: "sender",
    senderName: "Sender User",
    timestamp: "10:38 AM",
    isSelf: false,
  },
  {
    id: "4",
    text: "Sounds good! I can carry your package. What's the item description?",
    senderId: "traveler",
    senderName: "John Doe",
    timestamp: "10:40 AM",
    isSelf: false,
  },
  {
    id: "5",
    text: "It's some electronics accessories - phone cases and chargers. Everything is new and sealed.",
    senderId: "sender",
    senderName: "Sender User",
    timestamp: "10:42 AM",
    isSelf: false,
  },
];

export function MockChat({ 
  deliveryType = "triangular",
  className 
}: { 
  deliveryType?: "triangular" | "buy_me";
  className?: string;
}) {
  const [messages, setMessages] = useState<MockMessage[]>(MOCK_MESSAGES);
  const [newMessage, setNewMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (chatContainerRef.current) {
      const { scrollHeight, clientHeight } = chatContainerRef.current;
      chatContainerRef.current.scrollTop = scrollHeight - clientHeight;
    }
  }, [messages]);

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;

    const mockSelfMessage: MockMessage = {
      id: Date.now().toString(),
      text: newMessage,
      senderId: "self",
      senderName: "You",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isSelf: true,
    };

    setMessages((prev) => [...prev, mockSelfMessage]);
    setNewMessage("");
  };

  const handleFileUpload = () => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
    }, 1000);
  };

  return (
    <Card className={`flex flex-col h-[600px] ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-black/5 flex items-center justify-between bg-slate-50/50">
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
          {deliveryType === "buy_me" && (
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
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleFileUpload}
            multiple
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.onchange = handleFileUpload;
              input.click();
            }}
          >
            <Paperclip size={18} />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={chatContainerRef}>
        <div className="space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.isSelf ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                {!msg.isSelf && (
                  <span className="text-[10px] font-medium text-slate-600">
                    {msg.senderName}
                  </span>
                )}
                <span className="text-[10px] text-slate-400">
                  {msg.timestamp}
                </span>
              </div>
              <div
                className={`
                  max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed
                  ${msg.isSelf
                    ? "bg-black text-white rounded-br-none"
                    : "bg-slate-100 text-slate-900 rounded-bl-none border border-black/5"
                  }
                `}
              >
                {msg.text}
              </div>
            </div>
          ))}
          
          {deliveryType === "triangular" && (
            <div className="flex justify-center">
              <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                <p className="text-[10px] text-slate-500">You joined the chat</p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-black/5 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Input
            placeholder={deliveryType === "buy_me" ? "Message traveler..." : "Message in group..."}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="flex-1 h-10"
          />
          <Button
            onClick={handleSendMessage}
            disabled={uploading || !newMessage.trim()}
            className="h-10 min-w-10"
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send size={18} />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">
          {deliveryType === "buy_me" 
            ? "Send files directly to traveler" 
            : "Group chat for all participants"}
        </p>
      </div>
    </Card>
  );
}

// Buy Me Mock Chat with receipt upload
export function MockBuyMeChat({ 
  className 
}: { 
  className?: string; 
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      <Card className="p-4">
        <h4 className="text-sm font-bold text-black mb-2">Buy Me Status</h4>
        <p className="text-xs text-slate-500 mb-4">
          Status: <span className="font-semibold text-black">Open</span> - Waiting for a traveler to accept
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <div className="w-2 h-2 bg-black rounded-full" />
            Request Posted
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-2 h-2 bg-slate-200 rounded-full" />
            Traveler Accepted
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-2 h-2 bg-slate-200 rounded-full" />
            Purchased
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-2 h-2 bg-slate-200 rounded-full" />
            Delivered
          </div>
        </div>
      </Card>
      
      <Card className="p-4">
        <h4 className="text-sm font-bold text-black mb-2">Item Details</h4>
        <div className="bg-slate-50 rounded-lg p-3 mb-3">
          <div className="text-sm font-semibold text-black">
            iPhone 15 Pro Case - Space Black
          </div>
          <div className="text-xs text-slate-500 mt-1">
            From: https://amazon.com/iphone-case
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Once purchased, upload your receipt to confirm.
        </p>
        <Button className="w-full">
          <ImageIcon size={16} className="mr-2" />
          Upload Receipt
        </Button>
      </Card>
    </div>
  );
}

export default MockChat;