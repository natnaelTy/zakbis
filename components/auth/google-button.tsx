"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type GoogleId = {
  initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; nonce: string; use_fedcm_for_prompt?: boolean }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT = "https://accounts.google.com/gsi/client";

function loadScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const s = existing ?? Object.assign(document.createElement("script"), { src: SCRIPT, async: true });
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("google script")));
    if (!existing) document.head.appendChild(s);
  });
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** First name and photo from the Google ID token, only to prefill the receiver profile (the server verifies the token itself). */
function profileHints(credential: string): { firstName: string; photoUrl?: string } {
  try {
    const payload = JSON.parse(atob(credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return {
      firstName: typeof payload.given_name === "string" ? payload.given_name : "",
      photoUrl: typeof payload.picture === "string" ? payload.picture : undefined,
    };
  } catch {
    return { firstName: "" };
  }
}

/**
 * Google's own button, in a popup so the form underneath survives.
 * Google gets the hashed nonce, Supabase the raw one, so a stolen ID token can't be replayed.
 */
export function GoogleButton({ onSignedIn, onError }: { onSignedIn: (firstName: string, photoUrl?: string) => void; onError: (message: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef({ onSignedIn, onError });
  latest.current = { onSignedIn, onError };

  useEffect(() => {
    let cancelled = false;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    (async () => {
      const nonce = crypto.randomUUID();
      const hashed = await sha256Hex(nonce);
      await loadScript();
      if (cancelled || !box.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce: hashed,
        use_fedcm_for_prompt: true,
        callback: async ({ credential }) => {
          const { error } = await createClient().auth.signInWithIdToken({ provider: "google", token: credential, nonce });
          if (error) latest.current.onError("Google sign-in failed. Please try again.");
          else {
            const { firstName, photoUrl } = profileHints(credential);
            latest.current.onSignedIn(firstName, photoUrl);
          }
        },
      });
      window.google.accounts.id.renderButton(box.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "center",
        width: Math.min(box.current.clientWidth || 320, 400),
      });
    })().catch(() => latest.current.onError("Couldn't load Google sign-in. Check your connection."));
    return () => {
      cancelled = true;
    };
  }, []);

  return <div ref={box} className="flex min-h-11 w-full justify-center" />;
}
