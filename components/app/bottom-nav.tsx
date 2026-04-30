"use client"

import Link from "next/link"
import { useAppSelector } from "@/lib/redux/hooks"
import { LayoutDashboard, Send, MessageCircle, User, Bell } from "lucide-react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useUnread } from "@/components/app/unread-provider"
import { useNotifications } from "@/components/app/notification-provider"

export function BottomNav() {
  const pathname = usePathname()
  const { total } = useUnread()
  const { unreadCount } = useNotifications()

  const { profile } = useAppSelector((state) => state.auth);

  const navItems = [
    {
      title: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Send",
      href: "/triangular/search",
      icon: Send,
    },
    {
      title: "Chat",
      href: "/chat",
      icon: MessageCircle,
      badge: total,
    },
    {
      title: "Alerts",
      href: "/notifications",
      icon: Bell,
      badge: unreadCount,
    },
    {
      title: "Profile",
      href: "/profile",
      icon: User,
    },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-black/5 bg-white/95 backdrop-blur-lg">
      <div className="flex items-center justify-between px-4 py-3 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-xl transition-colors relative",
                isActive ? "text-brand-green" : "text-slate-400 hover:text-brand-green"
              )}
            >
              <div className="relative">
                <item.icon
                  size={24}
                  className={cn("transition-all", isActive && "scale-110")}
                />
                {item.badge != null && item.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-brand-rose text-white text-[10px] font-bold px-1 shadow-sm animate-pulse-glow">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </div>
              <span className={cn("text-[10px] font-medium", isActive && "font-bold")}>{item.title}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}