"use client";

import { useEffect, useRef, useState } from "react";

const BOT = "ZakbisBot";
const HOST = "app.zakbis.com"; // BotFather only allows this domain

/** Official Telegram Login Widget. The script loads only when this renders. */
export function TelegramButton({ onAuth }: { onAuth: (user: Record<string, unknown>) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(onAuth);
  latest.current = onAuth;
  const [host, setHost] = useState<string>();

  useEffect(() => setHost(window.location.hostname), []);

  useEffect(() => {
    const el = box.current;
    if (host !== HOST || !el) return;
    const callback = `__zakbisTelegram_${Math.random().toString(36).slice(2)}`;
    (window as unknown as Record<string, unknown>)[callback] = (user: Record<string, unknown>) => latest.current(user);
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", BOT);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-onauth", `${callback}(user)`);
    el.appendChild(script);
    return () => {
      delete (window as unknown as Record<string, unknown>)[callback];
      el.replaceChildren();
    };
  }, [host]);

  if (host && host !== HOST) {
    return <p className="rounded-lg bg-muted px-3 py-2 text-center text-base text-muted-foreground">Telegram sign-in works on {HOST}</p>;
  }
  return <div ref={box} className="flex min-h-10 justify-center" />;
}
