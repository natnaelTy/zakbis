"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Package, 
  ShoppingBag, 
  Plane, 
  ChevronRight,
  Search,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnread } from "@/components/app/unread-provider";

interface Chat {
  id: string;
  chatType: "GROUP" | "DIRECT";
  deliveryRequestId?: string;
  buyMeRequestId?: string;
  lastMessage?: {
    text: string;
    created_at: string;
  };
  participants?: {
    full_name: string;
    avatar_url?: string | null;
  }[];
  lastMessageText?: string;
  lastMessageTime?: string;
}

export default function ChatPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "triangular" | "buy_me">("all");
  const { chats: unreadChats, total: totalUnread } = useUnread();

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    setLoading(true);
    const response = await fetch("/api/chats", { method: "GET" });

    if (!response.ok) {
      setLoading(false);
      return;
    }

    const payload = await response.json();
    setChats((payload?.data as Chat[]) ?? []);
    setLoading(false);
  };

  const filteredChats = chats.filter((chat) => {
    const matchesSearch =
      searchQuery === "" ||
      chat.lastMessageText?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chat.participants?.some((p) =>
        p.full_name.toLowerCase().includes(searchQuery.toLowerCase())
      );

    if (!matchesSearch) return false;

    if (filter === "triangular" && chat.chatType !== "GROUP") return false;
    if (filter === "buy_me" && chat.chatType !== "DIRECT") return false;

    return true;
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur-lg border-b border-black/5 px-4 h-14 flex items-center gap-3 shadow-sm">
        <h1 className="text-base font-bold text-black flex-1">
          Chats ({chats.length})
          {totalUnread > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 rounded-full bg-brand-rose text-white text-[10px] font-bold px-1.5">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </h1>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Plus size={20} />
        </Button>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 py-4">
        {/* Search and Filters */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 h-10 rounded-xl border border-black/10 bg-slate-50 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black transition"
            />
          </div>
          <button
            onClick={() => setSearchQuery("")}
            className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${
              searchQuery ? "bg-brand-green text-white shadow-sm ring-1 ring-black/5" : "bg-slate-100 text-slate-400"
            }`}
          >
            {searchQuery ? <X size={16} /> : <Search size={16} />}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setFilter("all")}
            className={`
              px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors
              ${filter === "all" 
                ? "bg-brand-green text-white shadow-sm ring-1 ring-black/5" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }
            `}
          >
            All
          </button>
          <button
            onClick={() => setFilter("triangular")}
            className={`
              px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors
              ${filter === "triangular" 
                ? "bg-brand-green text-white shadow-sm ring-1 ring-black/5" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }
            `}
          >
            Triangular
          </button>
          <button
            onClick={() => setFilter("buy_me")}
            className={`
              px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors
              ${filter === "buy_me" 
                ? "bg-brand-green text-white shadow-sm ring-1 ring-black/5" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }
            `}
          >
            Buy Me
          </button>
        </div>

        {/* Chat List */}
        <div className="space-y-2">
          {!loading && filteredChats.length > 0 ? (
            <p className="text-xs text-slate-500 px-1">{filteredChats.length} chat{filteredChats.length === 1 ? "" : "s"}</p>
          ) : null}

          {loading ? (
            <div className="rounded-2xl border border-black/5 bg-white p-4 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Loading chats...
            </div>
          ) : null}

          {filteredChats.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                {filter === "all" || filter === "triangular" ? (
                  <Package size={32} className="text-slate-300" />
                ) : (
                  <ShoppingBag size={32} className="text-slate-300" />
                )}
              </div>
              <p className="text-sm font-medium text-slate-500">
                {filter === "all"
                  ? "No chats yet"
                  : filter === "triangular"
                  ? "No triangular delivery chats"
                  : "No buy me chats"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {filter === "all"
                  ? "Start a conversation by creating a delivery request"
                  : filter === "triangular"
                  ? "Find a traveler to start a delivery chat"
                  : "Post a buy me request to start shopping"}
              </p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <Link
                key={chat.id}
                href={`/chat/${chat.id}`}
                className="flex items-center gap-3 p-4 rounded-2xl border border-black/5 bg-slate-50 shadow-sm hover:shadow-md hover:border-brand-green/20 transition-colors relative"
              >
                {/* Avatar placeholder */}
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center shrink-0
                  ${chat.chatType === "GROUP" ? "bg-brand-green text-white shadow-sm ring-1 ring-black/5" : "bg-slate-200 text-black"}
                `}>
                  {chat.chatType === "GROUP" ? (
                    <Plane size={16} />
                  ) : (
                    <ShoppingBag size={16} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="text-sm font-semibold text-black truncate">
                      {chat.chatType === "GROUP" ? "Delivery Group" : "Shopping Chat"}
                    </h3>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {chat.lastMessageTime
                        ? new Date(chat.lastMessageTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>
                  {chat.participants?.length ? (
                    <div className="text-[10px] text-slate-400 mb-0.5 truncate">
                      {chat.participants.map((p) => p.full_name).join(" • ")}
                    </div>
                  ) : null}
                  <div className="text-xs text-slate-500 truncate">
                    {chat.lastMessageText}
                  </div>
                </div>

                <ChevronRight size={16} className="text-slate-300 shrink-0" />

                {/* Unread badge */}
                {(unreadChats[chat.id] ?? 0) > 0 && (
                  <span className="absolute top-3 right-3 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-brand-rose text-white text-[10px] font-bold px-1.5 shadow-sm">
                    {unreadChats[chat.id] > 99 ? "99+" : unreadChats[chat.id]}
                  </span>
                )}
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}