"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { switchSide, useSide } from "@/components/auth/use-side";
import { createClient } from "@/lib/supabase/client";
import type { Side } from "@/lib/sides";

const verb = { traveler: "traveling", receiver: "receiving" } as const;

/** Shows children to signed-out visitors and to users on `side`; everyone else gets the switch instead of the form. */
export function SideGate({ side, children }: { side: Side; children: React.ReactNode }) {
  const { side: active } = useSide();
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  if (active === undefined) return null;
  if (active === null || active === side) return children;

  async function onSwitch() {
    if (side === "receiver") {
      // The receiver side needs a name first; Profile asks for it.
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("first_name").eq("id", data.user!.id).maybeSingle();
      if (!profile?.first_name) return router.push("/profile");
    }
    setFailed(!(await switchSide(side)));
  }

  return (
    <div className="mt-6 rounded-xl border bg-card p-4">
      <p className="text-base">Switch to {verb[side]} to do this</p>
      <Button className="mt-3 h-11 rounded-lg px-5 text-base font-bold" onClick={onSwitch}>
        Switch to {verb[side]}
      </Button>
      {failed && (
        <p role="alert" className="mt-2 text-base text-destructive">
          Couldn&apos;t switch. Please try again.
        </p>
      )}
    </div>
  );
}
