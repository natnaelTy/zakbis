"use client";

import { clearAuth } from "@/lib/redux/features/auth/authSlice";
import { useAppDispatch } from "@/lib/redux/hooks";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function MenuLogoutItem() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    dispatch(clearAuth());
    router.push("/");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="w-full text-left text-sm px-1.5 py-1 cursor-pointer hover:bg-accent hover:text-accent-foreground"
    >
      <LogOut size={16} className="inline-block mr-2" />
      <span>Log out</span>
    </button>
  );
}
