"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { clearAuth } from "@/lib/redux/features/auth/authSlice";

export function SiteHeader() {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  const { hydrated, user, profile } = useAppSelector((state) => state.auth);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    dispatch(clearAuth());
    setMenuOpen(false);
    setMobileOpen(false);
    router.push("/");
    router.refresh();
  }

  const isAuthenticated = !!user;
  const fullName = profile?.fullName ?? user?.email ?? "User";
  const role = profile?.role ?? null;
  const initials = fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-black/5">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">Z</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-black">Zakbis</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {["How It Works", "Trust & Safety", "FAQ"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, "-").replace("&", "and")}`}
              className="text-sm text-slate-600 hover:text-black transition-colors font-medium"
            >
              {item}
            </a>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-4" ref={dropdownRef}>
          {hydrated && isAuthenticated ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black hover:bg-slate-50 transition-colors"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="w-7 h-7 rounded-full bg-black text-white text-xs font-semibold flex items-center justify-center">
                  {initials}
                </span>
                <span className="max-w-32 truncate font-medium">{fullName}</span>
                <ChevronDown size={16} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-black/10 bg-white shadow-lg p-2 z-50">
                  <div className="px-3 py-2 border-b border-black/5 mb-1">
                    <p className="text-sm font-semibold text-black truncate">{fullName}</p>
                    {role && <p className="text-xs text-slate-500">{role}</p>}
                  </div>

                  <Link
                    href="/dashboard"
                    className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/profile"
                    className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <Link
                    href="/chat"
                    className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    Chats
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/auth/login" className="text-sm font-medium text-black hover:text-slate-600 transition-colors">
                Log in
              </Link>
              <Link href="/auth/signup" className="text-sm font-semibold bg-black text-white px-5 py-2.5 rounded-xl hover:bg-black/80 transition-colors">
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden p-2 -mr-2 text-black"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-black/5 px-6 py-4 space-y-4">
          {["How It Works", "Trust & Safety", "FAQ"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, "-").replace("&", "and")}`}
              className="block text-sm font-medium text-slate-800"
              onClick={() => setMobileOpen(false)}
            >
              {item}
            </a>
          ))}
          <div className="pt-4 border-t border-black/5 flex flex-col gap-3">
            {hydrated && isAuthenticated ? (
              <>
                <div className="px-3 py-2 rounded-xl bg-slate-50 border border-black/5">
                  <p className="text-sm font-semibold text-black truncate">{fullName}</p>
                  {role && <p className="text-xs text-slate-500">{role}</p>}
                </div>
                <Link href="/dashboard" className="text-sm font-medium text-black text-left" onClick={() => setMobileOpen(false)}>
                  Dashboard
                </Link>
                <Link href="/profile" className="text-sm font-medium text-black text-left" onClick={() => setMobileOpen(false)}>
                  Profile
                </Link>
                <Link href="/chat" className="text-sm font-medium text-black text-left" onClick={() => setMobileOpen(false)}>
                  Chats
                </Link>
                <button type="button" onClick={handleLogout} className="text-sm font-medium text-red-600 text-left">
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="text-sm font-medium text-black text-left" onClick={() => setMobileOpen(false)}>
                  Log in
                </Link>
                <Link href="/auth/signup" className="text-sm font-semibold bg-black text-white px-5 py-3 rounded-xl text-center" onClick={() => setMobileOpen(false)}>
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
