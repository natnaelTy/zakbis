"use client";

import { useEffect } from "react";
import { Provider } from "react-redux";
import { clearAuth, setAuthState, setHydrated } from "@/lib/redux/features/auth/authSlice";
import { store } from "@/lib/redux/store";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const loadSession = async () => {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        store.dispatch(clearAuth());
        store.dispatch(setHydrated(true));
        return;
      }

      const payload = await response.json();
      const authData = payload?.data as
        | {
            user: { id: string; email: string | null };
            profile: { fullName: string; role: string | null };
          }
        | null;

      if (!authData?.user) {
        store.dispatch(clearAuth());
        store.dispatch(setHydrated(true));
        return;
      }

      store.dispatch(
        setAuthState({
          user: authData.user,
          profile: authData.profile,
        }),
      );
      store.dispatch(setHydrated(true));
    };

    loadSession();

    const onFocus = () => {
      loadSession();
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return <Provider store={store}>{children}</Provider>;
}